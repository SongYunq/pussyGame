import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../src/game/Room.js';
import { balanceOf, createPlayer, ledgerSum } from './helpers.js';

function startedRoom(players: number[], baseAnte = 10) {
  const room = new Room({ roomId: String(1000 + Math.floor(Math.random() * 8999)), roomName: '测试', baseAnte, turnSeconds: 0, playerCount: players.length });
  players.forEach((id, seat) => room.sit(id, seat));
  players.forEach(id => room.setReady(id, true));
  return room;
}

test('满员全部准备后自动开局并扣除底注', () => {
  const [a, b] = [createPlayer(), createPlayer()];
  const room = startedRoom([a, b]);
  try {
    assert.equal(room.gameStatus, 'playing');
    assert.equal(room.totalPot, 20);
    assert.equal(balanceOf(a), 9_990);
    assert.equal(balanceOf(b), 9_990);
    for (const seat of room.getActiveSeats()) assert.equal(seat.cards?.length, 3);
  } finally { room.dispose(); }
});

test('非当前回合玩家不可下注', () => {
  const [a, b] = [createPlayer(), createPlayer()];
  const room = startedRoom([a, b]);
  try {
    const other = room.currentTurnPlayerId === a ? b : a;
    assert.throws(() => room.bet(other, 'call', 10), /还没轮到/);
  } finally { room.dispose(); }
});

test('闷牌跟注减半，看牌后全额', () => {
  const [a, b] = [createPlayer(), createPlayer()];
  const room = startedRoom([a, b]);
  try {
    const first = room.currentTurnPlayerId!;
    room.bet(first, 'call', 10);
    assert.equal(room.totalPot, 25);
    const second = room.currentTurnPlayerId!;
    room.lookCards(second);
    room.bet(second, 'call', 10);
    assert.equal(room.totalPot, 35);
  } finally { room.dispose(); }
});

test('弃牌后唯一存活者赢得底池，账本与余额一致', () => {
  const [a, b] = [createPlayer(), createPlayer()];
  const room = startedRoom([a, b]);
  try {
    const first = room.currentTurnPlayerId!;
    const winner = first === a ? b : a;
    room.fold(first, 'manual');
    assert.equal(room.gameStatus, 'settling');
    assert.equal(balanceOf(winner), 10_010);
    assert.equal(balanceOf(first), 9_990);
    for (const id of [a, b]) assert.equal(ledgerSum(id), balanceOf(id));
  } finally { room.dispose(); }
});

test('首轮禁止比牌，第二轮可比牌且输家出局', () => {
  const [a, b, c] = [createPlayer(), createPlayer(), createPlayer()];
  const room = startedRoom([a, b, c]);
  try {
    assert.throws(() => room.compare(room.currentTurnPlayerId!, a === room.currentTurnPlayerId ? b : a), /第 2 轮/);
    for (let i = 0; i < 3; i++) room.bet(room.currentTurnPlayerId!, 'call', 10);
    assert.equal(room.currentRound, 2);
    const initiator = room.currentTurnPlayerId!;
    const target = [a, b, c].find(id => id !== initiator)!;
    room.compare(initiator, target);
    const lost = room.seats.filter(s => s?.status === 'lost');
    assert.equal(lost.length, 1);
    assert.equal(room.gameStatus, 'playing');
  } finally { room.dispose(); }
});

test('重复弃牌不会重复派奖', () => {
  const [a, b] = [createPlayer(), createPlayer()];
  const room = startedRoom([a, b]);
  try {
    const first = room.currentTurnPlayerId!;
    room.fold(first);
    room.fold(first);
    const winner = first === a ? b : a;
    assert.equal(balanceOf(winner), 10_010);
  } finally { room.dispose(); }
});

test('扣款失败时奖池与个人投入保持不变', () => {
  const [a, b] = [createPlayer(100), createPlayer(100)];
  const room = startedRoom([a, b]);
  try {
    const first = room.currentTurnPlayerId!;
    const potBefore = room.totalPot;
    assert.throws(() => room.bet(first, 'raise', 10_000), /余额不足/);
    assert.equal(room.totalPot, potBefore);
    assert.equal(room.seats.find(s => s?.user?.id === first)!.currentInvested, 10);
    assert.equal(room.currentTurnPlayerId, first);
  } finally { room.dispose(); }
});

test('庄位落在空座位时，开局后庄家归属到实际参与者且首位出牌人不变', () => {
  const [a, b] = [createPlayer(), createPlayer()];
  const room = new Room({ roomId: '4321', roomName: '庄位', baseAnte: 10, turnSeconds: 0, playerCount: 2 });
  try {
    room.dealerSeatIndex = 3; // 模拟上局庄家已离开
    room.sit(a, 1);
    room.sit(b, 5);
    room.setReady(a, true);
    room.setReady(b, true);
    assert.equal(room.currentTurnPlayerId, b, '首位出牌人仍为原庄位顺时针下一位');
    assert.equal(room.dealerSeatIndex, 1);
    assert.equal(room.seats[room.dealerSeatIndex]?.user?.id, a);
  } finally { room.dispose(); }
});
