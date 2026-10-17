import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Room } from '../src/game/Room.js';
import { RoomManager } from '../src/game/RoomManager.js';
import { UserModel } from '../src/models/userModel.js';
import { AlgorithmModel } from '../src/models/algorithmModel.js';
import { defaultAlgorithmConfig } from '../src/shared/dealing.js';
import { getDb } from '../src/db/database.js';
import { config } from '../src/config/index.js';
import type { Card } from '../src/types/index.js';

const ids: number[] = [];
const rooms: Room[] = [];
const managedIds = new Set<string>();
const cyclicHands: Card[][] = [
  [{ rank: 14, suit: 'spades' }, { rank: 14, suit: 'hearts' }, { rank: 14, suit: 'clubs' }],
  [{ rank: 2, suit: 'spades' }, { rank: 3, suit: 'clubs' }, { rank: 5, suit: 'hearts' }],
  [{ rank: 6, suit: 'diamonds' }, { rank: 9, suit: 'diamonds' }, { rank: 13, suit: 'diamonds' }],
];

beforeAll(() => {
  expect(config.dbPath).toBe(':memory:');
  for (let index = 0; index < 4; index++) {
    ids.push(UserModel.createUser(`room_regression_${index}`, 'password123', `回归玩家${index}`, 'avatar.png', 10000).id);
  }
});
beforeEach(() => {
  vi.useFakeTimers();
  const algorithm = defaultAlgorithmConfig();
  algorithm.deckProbabilities = { standard: 100, short: 0 };
  algorithm.standardModes = { random: 100, rival: 0, guarantee: 0 };
  AlgorithmModel.saveConfig(algorithm);
  for (const id of ids) {
    const change = 10000 - UserModel.findById(id)!.balance;
    if (change) UserModel.changeBalance(id, change, change > 0 ? 'recharge' : 'deduct', '重置隔离测试余额');
  }
});
afterEach(() => {
  getDb().exec('DROP TRIGGER IF EXISTS fail_room_ante');
  rooms.splice(0).forEach(room => room.dispose());
  for (const id of managedIds) {
    RoomManager.getRoom(id)?.resetToWaiting();
    RoomManager.deleteRoom(id);
  }
  managedIds.clear();
  vi.restoreAllMocks();
  vi.clearAllTimers();
  vi.useRealTimers();
});

function createRoom(seatIndices = [0, 1, 2], ready = true): Room {
  const room = new Room({ roomId: 'room-regression', roomName: '房间回归', baseAnte: 10, turnSeconds: 0 });
  rooms.push(room);
  seatIndices.forEach((seat, index) => room.sit(ids[index], seat));
  if (ready) seatIndices.forEach((_seat, index) => room.setReady(ids[index], true));
  return room;
}

function ledgerCount(type?: string): number {
  const row = (type
    ? getDb().prepare('SELECT COUNT(*) AS count FROM ledgers WHERE type = ?').get(type)
    : getDb().prepare('SELECT COUNT(*) AS count FROM ledgers').get()) as { count: number };
  return row.count;
}

describe('Room financial and lifecycle regressions', () => {
  it('finishes each round only after every remaining player acts, regardless of seat zero', () => {
    const room = createRoom([0, 2, 5]);
    expect(room.currentTurnPlayerId).toBe(ids[1]);
    for (const [index, expectedId] of [ids[1], ids[2], ids[0]].entries()) {
      expect(room.currentTurnPlayerId).toBe(expectedId);
      room.bet(expectedId, 'call', 10);
      expect(room.currentRound).toBe(index === 2 ? 2 : 1);
    }
    expect(room.currentTurnPlayerId).toBe(ids[1]);
  });

  it('rejects a repeated action without a second debit or advancing another player', () => {
    const room = createRoom();
    const id = room.currentTurnPlayerId!;
    room.bet(id, 'call', 10);
    const state = room.getMaskedState(id);
    const count = ledgerCount();
    const balance = UserModel.findById(id)!.balance;
    expect(() => room.bet(id, 'call', 10)).toThrow('还没轮到');
    expect(room.getMaskedState(id)).toEqual(state);
    expect(UserModel.findById(id)!.balance).toBe(balance);
    expect(ledgerCount()).toBe(count);
  });

  it('does not require an out-of-turn folded player to act before the next round', () => {
    const room = createRoom();
    room.fold(ids[0]);
    expect(room.currentTurnPlayerId).toBe(ids[1]);
    room.bet(ids[1], 'call', 10);
    expect(room.currentRound).toBe(1);
    room.bet(ids[2], 'call', 10);
    expect(room.currentRound).toBe(2);
    expect(room.currentTurnPlayerId).toBe(ids[1]);
  });

  it('allows exactly 20 complete rounds and never pays the settled pot again', () => {
    const room = createRoom();
    ids.slice(0, 3).forEach((id, index) => {
      room.seats[room.findSeatIndexByUserId(id)]!.cards = cyclicHands[index];
    });
    const payoutsBefore = ledgerCount('game_win');
    for (let action = 0; action < 60; action++) {
      room.bet(room.currentTurnPlayerId!, 'call', 10);
      expect(room.gameStatus).toBe(action === 59 ? 'settling' : 'playing');
    }
    expect(room.totalPot).toBe(330);
    expect(ledgerCount('game_win') - payoutsBefore).toBe(3);
    const balances = ids.slice(0, 3).map(id => UserModel.findById(id)!.balance);
    expect(balances).toEqual([10000, 10000, 10000]);
    const count = ledgerCount();
    ids.slice(0, 3).forEach(id => room.fold(id));
    room.startGame();
    expect(() => room.lookCards(ids[0])).toThrow('游戏未在进行中');
    expect(() => room.setReady(ids[0], true)).toThrow('游戏进行中');
    expect(ledgerCount()).toBe(count);
    expect(ids.slice(0, 3).map(id => UserModel.findById(id)!.balance)).toEqual(balances);
    vi.advanceTimersByTime(4000);
    expect(room.gameStatus).toBe('waiting');
    expect(room.totalPot).toBe(0);
    expect(room.seats.filter(Boolean).every(seat => seat!.cards === null && !seat!.isReady)).toBe(true);
  });

  it.each(['invalid', '', null, 1])('rejects unknown action %s without creating a zero debit', (action) => {
    const room = createRoom();
    const id = room.currentTurnPlayerId!;
    const count = ledgerCount();
    expect(() => room.bet(id, action as 'call', 10)).toThrow('无效的下注类型');
    expect(room.currentTurnPlayerId).toBe(id);
    expect(room.totalPot).toBe(30);
    expect(UserModel.findById(id)!.balance).toBe(9990);
    expect(ledgerCount()).toBe(count);
  });

  it('uses the wallet balance after an administrative adjustment for all-in', () => {
    const room = createRoom();
    const id = room.currentTurnPlayerId!;
    UserModel.changeBalance(id, -9950, 'deduct', '入座后管理员扣减');
    expect(room.seats[room.findSeatIndexByUserId(id)]!.user!.balance).toBe(9990);
    room.bet(id, 'allin', 'allin');
    expect(UserModel.findById(id)!.balance).toBe(0);
    expect(room.currentBet).toBe(80);
    expect(room.totalPot).toBe(70);
    const last = getDb().prepare('SELECT amount, room_id FROM ledgers WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(id);
    expect(last).toEqual({ amount: -40, room_id: room.roomId });
  });

  it('rejects an unaffordable call after a wallet adjustment without changing the turn or pot', () => {
    const room = createRoom();
    const id = room.currentTurnPlayerId!;
    UserModel.changeBalance(id, -9989, 'deduct', '管理员扣至不足跟注');
    const count = ledgerCount();
    expect(() => room.bet(id, 'call', 10)).toThrow('筹码余额不足');
    expect(room.currentTurnPlayerId).toBe(id);
    expect(room.currentBet).toBe(10);
    expect(room.totalPot).toBe(30);
    expect(ledgerCount()).toBe(count);
  });

  it.each(['pot', 'investment'])('rejects unsafe cumulative %s values before charging', (field) => {
    const room = createRoom();
    const id = room.currentTurnPlayerId!;
    if (field === 'pot') room.totalPot = Number.MAX_SAFE_INTEGER - 1;
    else room.seats[room.findSeatIndexByUserId(id)]!.currentInvested = Number.MAX_SAFE_INTEGER - 1;
    const count = ledgerCount();
    expect(() => room.bet(id, 'call', 10)).toThrow('下注金额超出有效范围');
    expect(UserModel.findById(id)!.balance).toBe(9990);
    expect(room.currentTurnPlayerId).toBe(id);
    expect(ledgerCount()).toBe(count);
  });

  it('rolls back earlier ante debits when the last ledger insert fails', () => {
    const room = createRoom([0, 1, 2], false);
    const count = ledgerCount('ante');
    getDb().exec(`CREATE TRIGGER fail_room_ante BEFORE INSERT ON ledgers
      WHEN NEW.type = 'ante' AND NEW.user_id = ${ids[2]}
      BEGIN SELECT RAISE(ABORT, '模拟最后一笔底注流水失败'); END;`);
    room.setReady(ids[0], true);
    room.setReady(ids[1], true);
    expect(() => room.setReady(ids[2], true)).toThrow('模拟最后一笔底注流水失败');
    expect(ids.slice(0, 3).map(id => UserModel.findById(id)!.balance)).toEqual([10000, 10000, 10000]);
    expect(ledgerCount('ante')).toBe(count);
    expect(room.gameStatus).toBe('waiting');
    expect(room.totalPot).toBe(0);
    expect(room.seats.filter(Boolean).every(seat => seat!.cards === null)).toBe(true);
  });
});

describe('Room parameter and public projection regressions', () => {
  it.each([
    ['negative ante', '房间', -1, 20], ['zero ante', '房间', 0, 20],
    ['NaN ante', '房间', NaN, 20], ['infinite ante', '房间', Infinity, 20],
    ['unsafe ante', '房间', Number.MAX_SAFE_INTEGER, 20], ['string ante', '房间', '10', 20],
    ['object name', {}, 10, 20], ['fractional seconds', '房间', 10, 10.5],
    ['NaN seconds', '房间', 10, NaN], ['string seconds', '房间', 10, '20'],
  ])('rejects %s without registering a room', (_label, name, ante, seconds) => {
    const count = RoomManager.getAllRooms().length;
    expect(() => RoomManager.createRoom(name as string, ante as number, seconds as number)).toThrow();
    expect(RoomManager.getAllRooms()).toHaveLength(count);
  });

  it.each([0, 5, 15, 100])('preserves unlimited time and clamps finite setting %s', (seconds) => {
    const room = RoomManager.createRoom('  时间设置  ', 10, seconds);
    managedIds.add(room.roomId);
    expect(room.roomName).toBe('时间设置');
    expect(room.turnSeconds).toBe(seconds === 0 ? 0 : Math.max(10, Math.min(60, seconds)));
    RoomManager.removeEmptyRoom(room.roomId);
    expect(RoomManager.getRoom(room.roomId)).toBeNull();
  });

  it.each([1.5, '1', NaN, -1, 8])('rejects invalid physical seat %s', (seat) => {
    const room = createRoom([], false);
    expect(() => room.sit(ids[0], seat as number)).toThrow('无效的座位号');
    expect(room.findSeatIndexByUserId(ids[0])).toBe(-1);
  });

  it('refreshes profiles and balances while exposing only public spectator fields', () => {
    const room = RoomManager.createRoom('资料刷新', 10, 0);
    managedIds.add(room.roomId);
    room.sit(ids[0], 0);
    room.addSpectator(UserModel.findById(ids[1])!);
    UserModel.updateProfile(ids[0], '更新后的昵称');
    UserModel.changeBalance(ids[0], 50, 'recharge', '管理员充值');
    RoomManager.refreshUser(ids[0]);
    RoomManager.refreshUser(ids[1]);
    expect(room.seats[0]!.user).toMatchObject({ nickname: '更新后的昵称', balance: 10050 });
    const spectator = room.getMaskedState().spectators[0];
    expect(Object.keys(spectator).sort()).toEqual(['avatar', 'id', 'nickname']);
    room.stand(ids[0]);
    expect(room.getMaskedState().spectators.every(user => Object.keys(user).length === 3)).toBe(true);
  });

  it('refuses to delete an active room with a live pot', () => {
    const room = RoomManager.createRoom('删除保护', 10, 0);
    managedIds.add(room.roomId);
    ids.slice(0, 2).forEach((id, index) => room.sit(id, index));
    ids.slice(0, 2).forEach(id => room.setReady(id, true));
    expect(() => RoomManager.deleteRoom(room.roomId)).toThrow('进行中的房间不可删除');
    expect(RoomManager.getRoom(room.roomId)).toBe(room);
    expect(room.totalPot).toBe(20);
  });
});
