import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Room } from '../src/game/Room.js';
import { UserModel } from '../src/models/userModel.js';
import { getDb } from '../src/db/database.js';

const playerIds: number[] = [];

beforeAll(() => {
  for (let i = 0; i < 3; i++) {
    playerIds.push(UserModel.createUser(`betting_p${i}`, 'pass123', `下注玩家${i}`, 'avatar_1.png', 1000).id);
  }
});

beforeEach(() => {
  vi.useFakeTimers();
  for (const id of playerIds) {
    const difference = 1000 - UserModel.findById(id)!.balance;
    if (difference !== 0) {
      UserModel.changeBalance(id, difference, difference > 0 ? 'recharge' : 'deduct', '重置测试余额');
    }
  }
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

function startRoom(baseAnte = 10): Room {
  const room = new Room({ roomId: 'betting', roomName: '下注规则测试', baseAnte, turnSeconds: 20 });
  playerIds.forEach((id, index) => room.sit(id, index));
  playerIds.forEach((id) => room.setReady(id, true));
  return room;
}

function lastLedger(userId: number) {
  return getDb().prepare('SELECT type, amount, balance_after FROM ledgers WHERE user_id = ? ORDER BY id DESC LIMIT 1')
    .get(userId) as { type: string; amount: number; balance_after: number };
}

describe('Betting: seen 1x, blind 0.5x', () => {
  it.each([10, 20, 50, 100])('keeps the full %i ante for every player', (baseAnte) => {
    const room = startRoom(baseAnte);
    expect(room.currentBet).toBe(baseAnte);
    expect(room.totalPot).toBe(baseAnte * 3);
    for (const seat of room.getActiveSeats()) {
      expect(seat.currentInvested).toBe(baseAnte);
      expect(seat.user!.balance).toBe(1000 - baseAnte);
      expect(lastLedger(seat.user!.id)).toEqual({ type: 'ante', amount: -baseAnte, balance_after: 1000 - baseAnte });
    }
  });

  it.each([
    { baseAnte: 10, seen: false, payment: 5 },
    { baseAnte: 10, seen: true, payment: 10 },
    { baseAnte: 20, seen: false, payment: 10 },
    { baseAnte: 20, seen: true, payment: 20 },
    { baseAnte: 50, seen: false, payment: 25 },
    { baseAnte: 50, seen: true, payment: 50 },
    { baseAnte: 100, seen: false, payment: 50 },
    { baseAnte: 100, seen: true, payment: 100 },
    { baseAnte: 5, seen: false, payment: 2.5 },
  ])('charges $payment when calling a $baseAnte base with seen=$seen', ({ baseAnte, seen, payment }) => {
    const room = startRoom(baseAnte);
    const id = room.currentTurnPlayerId!;
    if (seen) room.lookCards(id);
    const seat = room.seats[room.findSeatIndexByUserId(id)]!;

    // 客户端提交的金额不影响服务端按当前单注与明暗牌状态计算。
    room.bet(id, 'call', 9999, 9999);

    const balance = 1000 - baseAnte - payment;
    expect(seat.user!.balance).toBe(balance);
    expect(UserModel.findById(id)!.balance).toBe(balance);
    expect(seat.currentInvested).toBe(baseAnte + payment);
    expect(room.totalPot).toBe(baseAnte * 3 + payment);
    expect(room.currentBet).toBe(baseAnte);
    expect(lastLedger(id)).toEqual({ type: 'bet', amount: -payment, balance_after: balance });
  });

  it.each([
    { seen: false, nextSeen: false, payment: 25, nextPayment: 25 },
    { seen: false, nextSeen: true, payment: 25, nextPayment: 50 },
    { seen: true, nextSeen: false, payment: 50, nextPayment: 25 },
    { seen: true, nextSeen: true, payment: 50, nextPayment: 50 },
  ])('raises to 50 with seen=$seen then calls with seen=$nextSeen', ({ seen, nextSeen, payment, nextPayment }) => {
    const room = startRoom();
    const raiserId = room.currentTurnPlayerId!;
    if (seen) room.lookCards(raiserId);
    room.bet(raiserId, 'raise', 50);

    expect(room.currentBet).toBe(50);
    expect(UserModel.findById(raiserId)!.balance).toBe(990 - payment);
    expect(lastLedger(raiserId).amount).toBe(-payment);

    const callerId = room.currentTurnPlayerId!;
    if (nextSeen) room.lookCards(callerId);
    room.bet(callerId, 'call', 50);
    expect(UserModel.findById(callerId)!.balance).toBe(990 - nextPayment);
    expect(lastLedger(callerId).amount).toBe(-nextPayment);
    expect(room.totalPot).toBe(30 + payment + nextPayment);
  });

  it('uses the new amounts through successive raises and looking at cards', () => {
    const room = startRoom();
    room.bet(room.currentTurnPlayerId!, 'raise', 20); // 闷牌付 10
    room.lookCards(room.currentTurnPlayerId!);
    room.bet(room.currentTurnPlayerId!, 'raise', 50); // 明牌付 50
    room.bet(room.currentTurnPlayerId!, 'call', 50); // 闷牌付 25
    room.lookCards(room.currentTurnPlayerId!);
    room.bet(room.currentTurnPlayerId!, 'raise', 100); // 明牌付 100
    expect(room.currentBet).toBe(100);
    expect(room.totalPot).toBe(215);
  });

  it.each([
    { seen: false, expectedBase: 1980, nextPayment: 990 },
    { seen: true, expectedBase: 990, nextPayment: 495 },
  ])('converts all-in to base $expectedBase with seen=$seen', ({ seen, expectedBase, nextPayment }) => {
    const room = startRoom();
    const id = room.currentTurnPlayerId!;
    if (seen) room.lookCards(id);
    room.bet(id, 'allin', 'allin');
    expect(room.currentBet).toBe(expectedBase);
    expect(room.totalPot).toBe(1020);
    expect(UserModel.findById(id)!.balance).toBe(0);
    expect(lastLedger(id)).toEqual({ type: 'bet', amount: -990, balance_after: 0 });

    const nextId = room.currentTurnPlayerId!;
    room.bet(nextId, 'call', expectedBase);
    expect(UserModel.findById(nextId)!.balance).toBe(990 - nextPayment);
    expect(room.totalPot).toBe(1020 + nextPayment);
  });

  it.each([false, true])('never lowers the current base for a short all-in, seen=%s', (seen) => {
    const room = startRoom();
    room.currentBet = 2000;
    const id = room.currentTurnPlayerId!;
    if (seen) room.lookCards(id);
    room.bet(id, 'allin', 'allin');
    expect(room.currentBet).toBe(2000);
    expect(UserModel.findById(id)!.balance).toBe(0);
  });

  it('preserves fractional amounts when a seen player goes all-in', () => {
    const room = startRoom(5);
    const id = room.currentTurnPlayerId!;
    room.bet(id, 'call', 5);
    room.bet(room.currentTurnPlayerId!, 'call', 5);
    room.bet(room.currentTurnPlayerId!, 'call', 5);
    room.lookCards(id);
    room.bet(id, 'allin', 'allin');
    expect(room.currentBet).toBe(992.5);
    const nextId = room.currentTurnPlayerId!;
    room.bet(nextId, 'call', 992.5);
    expect(lastLedger(nextId).amount).toBe(-496.25);
  });

  it.each([
    { seen: false, currentBet: 10, cost: 10 },
    { seen: true, currentBet: 10, cost: 20 },
    { seen: false, currentBet: 50, cost: 50 },
    { seen: true, currentBet: 50, cost: 100 },
  ])('charges $cost for comparing at base $currentBet with seen=$seen', ({ seen, currentBet, cost }) => {
    const room = startRoom();
    room.currentRound = 2;
    room.currentBet = currentBet;
    const id = room.currentTurnPlayerId!;
    const targetId = playerIds.find((playerId) => playerId !== id)!;
    if (seen) room.lookCards(id);
    room.compare(id, targetId);

    expect(room.gameStatus).toBe('playing'); // 三人对局比牌后仍有两人，避免派奖影响余额断言。
    expect(room.totalPot).toBe(30 + cost);
    expect(UserModel.findById(id)!.balance).toBe(990 - cost);
    expect(room.seats[room.findSeatIndexByUserId(id)]!.currentInvested).toBe(10 + cost);
    expect(lastLedger(id)).toEqual({ type: 'bet', amount: -cost, balance_after: 990 - cost });
  });

  it.each([false, true])('leaves the pot and base unchanged if a raise is unaffordable, seen=%s', (seen) => {
    const room = startRoom();
    const id = room.currentTurnPlayerId!;
    if (seen) room.lookCards(id);
    expect(() => room.bet(id, 'raise', 4000)).toThrow('筹码余额不足');
    expect(room.currentBet).toBe(10);
    expect(room.totalPot).toBe(30);
    expect(room.currentTurnPlayerId).toBe(id);
    expect(UserModel.findById(id)!.balance).toBe(990);
    expect(lastLedger(id).type).toBe('ante');
  });

  it.each([10, 5, 'invalid', Infinity])('rejects invalid raise %s without changing chips', (target) => {
    const room = startRoom();
    const id = room.currentTurnPlayerId!;
    expect(() => room.bet(id, 'raise', target)).toThrow('加注档位必须大于当前单注');
    expect(room.currentBet).toBe(10);
    expect(room.totalPot).toBe(30);
    expect(lastLedger(id).type).toBe('ante');
  });
});
