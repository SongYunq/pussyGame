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
    assert.equal(start.handCards, null, '开局不下发底牌，防止闷牌偷看');
    const state = await stateB;
    const mine = state.seats.find((s: any) => s?.user?.id === b);
    const theirs = state.seats.find((s: any) => s?.user?.id === a);
    assert.equal(mine.cards, null, '未看牌时本人快照也不含底牌');
    assert.equal(theirs.cards, null);
    const lookedState = nextEvent(sb, 'room:state', (s: any) => s.seats.some((seat: any) => seat?.user?.id === b && seat.hasLooked));
    const look = await request(sb, 'game:look');
    assert.equal(look.code, 200);
    assert.equal(look.cards.length, 3);
    const after = await lookedState;
    assert.deepEqual(after.seats.find((s: any) => s?.user?.id === b).cards, look.cards);
    assert.equal(after.seats.find((s: any) => s?.user?.id === a).cards, null);
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

test('E2E：同账号多窗口都收到快照，onlinePlayerIds 反映在线状态', async () => {
  const [a, b] = [createPlayer(), createPlayer()];
  const a1 = await connectAs(harness, a);
  const a2 = await connectAs(harness, a);
  const sb = await connectAs(harness, b);
  try {
    const created = await request(a1, 'room:create', { roomName: '多窗', baseAnte: 10, turnSeconds: 20, playerCount: 2 });
    const joined = (s: any) => s.onlinePlayerIds.includes(b);
    const both = Promise.all([nextEvent(a1, 'room:state', joined), nextEvent(a2, 'room:state', joined)]);
    await request(sb, 'room:join', { roomId: created.roomId });
    const [s1, s2] = await both;
    assert.deepEqual(s1, s2);
    assert.deepEqual([...s1.onlinePlayerIds].sort(), [a, b].sort());
    const left = nextEvent(a1, 'room:state', (s: any) => !s.onlinePlayerIds.includes(b));
    sb.close();
    await left;
  } finally { a1.close(); a2.close(); sb.close(); }
});

test('E2E：同一动作链中的多次广播被合并为一次快照', async () => {
  const [a, b] = [createPlayer(), createPlayer()];
  const sa = await connectAs(harness, a);
  const sb = await connectAs(harness, b);
  try {
    const created = await request(sa, 'room:create', { roomName: '合并', baseAnte: 10, turnSeconds: 0, playerCount: 2 });
    await request(sb, 'room:join', { roomId: created.roomId });
    await request(sa, 'room:sit', { seatIndex: 0 });
    await request(sb, 'room:sit', { seatIndex: 1 });
    await request(sa, 'room:ready', { isReady: true });
    await new Promise(resolve => setTimeout(resolve, 50));
    let snapshots = 0;
    sa.on('room:state', () => { snapshots++; });
    const started = nextEvent(sa, 'room:state', (s: any) => s.gameStatus === 'playing');
    await request(sb, 'room:ready', { isReady: true }); // 触发自动开局
    await started;
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(snapshots, 1, '准备→开局→回调后广播只推送一份快照');
  } finally { sa.close(); sb.close(); }
});

test('E2E：不在任何房间的连接会收到 room:left(null)；在房间中重连收到快照', async () => {
  const { io: connect } = await import('socket.io-client');
  const { signToken } = await import('../src/utils/jwt.js');
  const { UserModel } = await import('../src/models/userModel.js');
  const id = createPlayer();
  const user = UserModel.findById(id)!;
  const token = signToken({ userId: id, username: user.username, role: user.role });
  const open = () => {
    const socket = connect(harness.url, { auth: { token }, transports: ['websocket'], forceNew: true, reconnection: false, autoConnect: false });
    const first = new Promise<[string, any]>(resolve => {
      socket.once('room:left', (payload: any) => resolve(['room:left', payload]));
      socket.once('room:state', (payload: any) => resolve(['room:state', payload]));
    });
    socket.connect();
    return { socket, first };
  };
  const a = open();
  try {
    assert.deepEqual(await a.first, ['room:left', { roomId: null }]);
    const created = await request(a.socket, 'room:create', { roomName: '重连', baseAnte: 10, turnSeconds: 20, playerCount: 2 });
    const b = open();
    try {
      const [event, state] = await b.first;
      assert.equal(event, 'room:state');
      assert.equal(state.roomId, created.roomId);
    } finally { b.socket.close(); }
  } finally { a.socket.close(); }
});
