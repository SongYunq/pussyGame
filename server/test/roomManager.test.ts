import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../src/game/RoomManager.js';
import { createPlayer } from './helpers.js';

test('底注必须为正整数', () => {
  for (const bad of [0, -10, 10.5, NaN, '10']) {
    assert.throws(() => RoomManager.createRoom('x', bad as any, 20), /底注/);
  }
  const room = RoomManager.createRoom('ok', 10, 20);
  RoomManager.deleteRoom(room.roomId);
});

test('等待阶段离线超过宽限期的座位被释放，空房回收', () => {
  const [a, b] = [createPlayer(), createPlayer()];
  const room = RoomManager.createRoom('离线', 10, 20, undefined, 2);
  room.addSpectator({ id: a, nickname: 'a', avatar: 'x' });
  room.sit(a, 0);
  room.sit(b, 1);
  RoomManager.recordUserOnline(a, 'sa');
  RoomManager.recordUserOnline(b, 'sb');
  RoomManager.recordUserOffline(a, 'sa');
  const now = Date.now();
  assert.equal(RoomManager.releaseOfflineSeats(60_000, now), 0, '宽限期内保留');
  assert.equal(RoomManager.releaseOfflineSeats(60_000, now + 61_000), 1);
  assert.equal(room.findSeatIndexByUserId(a), -1);
  assert.equal(room.spectators.has(a), false);
  assert.notEqual(room.findSeatIndexByUserId(b), -1, '在线玩家不受影响');
  RoomManager.recordUserOffline(b, 'sb');
  RoomManager.releaseOfflineSeats(60_000, Date.now() + 61_000);
  assert.equal(RoomManager.getRoom(room.roomId), null, '空房被回收');
});

test('重新上线后不会被释放；进行中的牌局不释放', () => {
  const [a, b] = [createPlayer(), createPlayer()];
  const room = RoomManager.createRoom('对局', 10, 0, undefined, 2);
  room.sit(a, 0);
  room.sit(b, 1);
  RoomManager.recordUserOnline(a, 'sa2');
  RoomManager.recordUserOffline(a, 'sa2');
  RoomManager.recordUserOnline(a, 'sa3');
  assert.equal(RoomManager.releaseOfflineSeats(0, Date.now() + 1), 0);
  room.setReady(a, true);
  room.setReady(b, true);
  assert.equal(room.gameStatus, 'playing');
  RoomManager.recordUserOffline(a, 'sa3');
  assert.equal(RoomManager.releaseOfflineSeats(0, Date.now() + 1), 0);
  room.fold(a);
  room.resetToWaiting();
  assert.equal(RoomManager.releaseOfflineSeats(0, Date.now() + 1), 1, '回到等待阶段后释放');
  room.dispose();
  RoomManager.removeEmptyRoom(room.roomId);
});
