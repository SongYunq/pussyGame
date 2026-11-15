import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../src/game/RoomManager.js';

test('底注必须为正整数', () => {
  for (const bad of [0, -10, 10.5, NaN, '10']) {
    assert.throws(() => RoomManager.createRoom('x', bad as any, 20), /底注/);
  }
  const room = RoomManager.createRoom('ok', 10, 20);
  RoomManager.deleteRoom(room.roomId);
});
