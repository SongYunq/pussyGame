import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Room } from '../src/game/Room.js';
import { UserModel } from '../src/models/userModel.js';
import { AlgorithmModel } from '../src/models/algorithmModel.js';
import { defaultAlgorithmConfig } from '../src/shared/dealing.js';
import { getDb } from '../src/db/database.js';

const ids: number[] = [];
beforeAll(() => { for (let i = 0; i < 3; i++) ids.push(UserModel.createUser(`deal_${i}`, 'password', `发牌玩家${i}`, 'avatar', 1000).id); });
beforeEach(() => {
  vi.useFakeTimers();
  AlgorithmModel.saveConfig(defaultAlgorithmConfig());
  for (const id of ids) {
    const amount = 1000 - UserModel.findById(id)!.balance;
    if (amount) UserModel.changeBalance(id, amount, amount > 0 ? 'recharge' : 'deduct', '重置测试');
  }
});
afterEach(() => { vi.restoreAllMocks(); vi.clearAllTimers(); vi.useRealTimers(); });
function roomWithPlayers(count = 3) {
  const room = new Room({ roomId: 'deal', roomName: '发牌测试', baseAnte: 10, turnSeconds: 60 });
  ids.slice(0, count).forEach((id, i) => room.sit(id, i));
  return room;
}
function ready(room: Room, count = 3) { ids.slice(0, count).forEach(id => room.setReady(id, true)); }

describe('Room algorithm integration and atomic payouts', () => {
  it('loads saved settings at the next round and exposes only the deck kind', () => {
    const config = defaultAlgorithmConfig();
    config.deckProbabilities = { standard: 100, short: 0 };
    config.standardModes = { random: 0, rival: 0, guarantee: 100 };
    AlgorithmModel.saveConfig(config);
    const room = roomWithPlayers(); ready(room);
    expect(room.deckKind).toBe('standard');
    config.deckProbabilities = { standard: 0, short: 100 };
    AlgorithmModel.saveConfig(config);
    expect(room.deckKind).toBe('standard');
    const state = room.getMaskedState(ids[0]);
    expect(state.deckKind).toBe('standard');
    expect(state.seats[1]!.cards).toBeNull();
    expect(state).not.toHaveProperty('mode');
    expect(state).not.toHaveProperty('rivalCombo');
    const next = roomWithPlayers(); ready(next);
    expect(next.deckKind).toBe('short');
    expect(next.seats.flatMap(seat => seat?.cards ?? []).every(card => card.rank >= 8)).toBe(true);
  });

  it('does not charge a remaining player if fewer than two can pay the ante', () => {
    const room = roomWithPlayers(2);
    UserModel.changeBalance(ids[1], -1000, 'deduct', '模拟入座后余额变化');
    ready(room, 2);
    expect(room.gameStatus).toBe('waiting');
    expect(UserModel.findById(ids[0])!.balance).toBe(1000);
    expect(room.totalPot).toBe(0);
    expect(room.seats[1]!.isReady).toBe(false);
  });

  it('rolls back all ante payments on a later debit failure', () => {
    const room = roomWithPlayers();
    const ledgerCount = getDb().prepare("SELECT COUNT(*) AS count FROM ledgers WHERE type = 'ante'").get();
    const original = UserModel.changeBalance.bind(UserModel);
    vi.spyOn(UserModel, 'changeBalance').mockImplementation((...args) => {
      if (args[0] === ids[1] && args[2] === 'ante') throw new Error('模拟扣款失败');
      return original(...args);
    });
    expect(() => ready(room)).toThrow('模拟扣款失败');
    ids.forEach(id => expect(UserModel.findById(id)!.balance).toBe(1000));
    expect(room.gameStatus).toBe('waiting');
    expect(getDb().prepare("SELECT COUNT(*) AS count FROM ledgers WHERE type = 'ante'").get()).toEqual(ledgerCount);
  });

  it.each([false, true])('shares a cyclic showdown pot atomically, including fractional thirds, seen=%s', (seen) => {
    const config = defaultAlgorithmConfig(); config.deckProbabilities = { standard: 100, short: 0 }; config.standardModes = { random: 100, rival: 0, guarantee: 0 };
    AlgorithmModel.saveConfig(config);
    const room = roomWithPlayers(); ready(room);
    room.seats[0]!.cards = [{ rank: 14, suit: 'spades' }, { rank: 14, suit: 'hearts' }, { rank: 14, suit: 'clubs' }];
    room.seats[1]!.cards = [{ rank: 2, suit: 'spades' }, { rank: 3, suit: 'clubs' }, { rank: 5, suit: 'hearts' }];
    room.seats[2]!.cards = [{ rank: 6, suit: 'diamonds' }, { rank: 9, suit: 'diamonds' }, { rank: 13, suit: 'diamonds' }];
    if (seen) room.lookCards(ids[0]);
    const marker = (getDb().prepare('SELECT MAX(id) AS id FROM ledgers').get() as { id: number }).id;
    room.currentRound = 20;
    room.bet(room.currentTurnPlayerId!, 'call', 10);
    expect(room.gameStatus).toBe('playing');
    room.bet(room.currentTurnPlayerId!, 'call', 10);
    expect(room.gameStatus).toBe('playing');
    room.bet(room.currentTurnPlayerId!, 'call', 10);
    expect(room.gameStatus).toBe('settling');
    const pot = seen ? 50 : 45;
    ids.forEach((id, index) => {
      const payment = seen && index === 0 ? 10 : 5;
      expect(UserModel.findById(id)!.balance).toBeCloseTo(990 - payment + pot / 3, 8);
    });
    const debits = getDb().prepare("SELECT user_id, amount FROM ledgers WHERE id > ? AND type = 'bet' ORDER BY id").all(marker);
    expect(debits).toEqual([
      { user_id: ids[1], amount: -5 },
      { user_id: ids[2], amount: -5 },
      { user_id: ids[0], amount: seen ? -10 : -5 },
    ]);
    const rows = getDb().prepare("SELECT amount FROM ledgers WHERE id > ? AND type = 'game_win' ORDER BY id").all(marker) as { amount: number }[];
    expect(rows).toHaveLength(3);
    rows.forEach(row => expect(row.amount).toBeCloseTo(pot / 3, 8));
    expect(rows.reduce((sum, row) => sum + row.amount, 0)).toBe(pot);
  });
});
