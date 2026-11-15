import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer } from './helpers.js';
import { connectAs, Harness, nextEvent, request, startHarness } from './socketHarness.js';
import { RoomManager } from '../src/game/RoomManager.js';

let harness: Harness;
before(async () => { harness = await startHarness(); });
after(async () => {
  for (const room of RoomManager.getAllRooms()) { room.resetToWaiting(); room.dispose(); }
  await harness.close();
});

test('E2E：建房、入座、准备、开局，只下发自己的手牌', async () => {
  const [a, b] = [createPlayer(), createPlayer()];
  const sa = await connectAs(harness, a);
  const sb = await connectAs(harness, b);
  try {
    const created = await request(sa, 'room:create', { roomName: 'E2E', baseAnte: 10, turnSeconds: 0, playerCount: 2 });
    assert.equal(created.code, 200);
    assert.equal((await request(sb, 'room:join', { roomId: created.roomId })).code, 200);
    assert.equal((await request(sa, 'room:sit', { seatIndex: 0 })).code, 200);
    assert.equal((await request(sb, 'room:sit', { seatIndex: 1 })).code, 200);
    await request(sa, 'room:ready', { isReady: true });
    const startA = nextEvent(sa, 'game:start');
    const stateB = nextEvent(sb, 'room:state', (s: any) => s.gameStatus === 'playing');
    await request(sb, 'room:ready', { isReady: true });
    const start = await startA;
    assert.equal(start.handCards.length, 3);
    const state = await stateB;
    const mine = state.seats.find((s: any) => s?.user?.id === b);
    const theirs = state.seats.find((s: any) => s?.user?.id === a);
    assert.equal(mine.cards.length, 3);
    assert.equal(theirs.cards, null);
  } finally { sa.close(); sb.close(); }
});

test('E2E：畸形负载不会泄露内部异常文案', async () => {
  const a = createPlayer();
  const sa = await connectAs(harness, a);
  try {
    for (const [event, payload] of [['room:join', null], ['room:sit', null], ['game:bet', null], ['game:compare', 'x']] as const) {
      const reply = await request(sa, event, payload);
      assert.notEqual(reply.code, 200);
      assert.doesNotMatch(reply.message, /Cannot read|undefined|null/);
    }
  } finally { sa.close(); }
});

test('E2E：不存在的房间返回 404', async () => {
  const sa = await connectAs(harness, createPlayer());
  try {
    const reply = await request(sa, 'room:join', { roomId: '99999' });
    assert.equal(reply.code, 404);
  } finally { sa.close(); }
});
