import { createServer, Server as HttpServer } from 'node:http';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { Server } from 'socket.io';
import { io, Socket } from 'socket.io-client';
import { createApp } from '../src/index.js';
import { setupSocketHandler } from '../src/socket/socketHandler.js';
import { UserModel } from '../src/models/userModel.js';
import { AlgorithmModel } from '../src/models/algorithmModel.js';
import { defaultAlgorithmConfig } from '../src/shared/dealing.js';
import { evaluateHand } from '../src/shared/poker.js';
import { signToken } from '../src/utils/jwt.js';
import { RoomManager } from '../src/game/RoomManager.js';
import type { Card } from '../src/types/index.js';

let server: HttpServer;
let sockets: Server;
const clients: Socket[] = [];
let url: string;
let roomId = '';
const roomIds = new Set<string>();
beforeAll(async () => {
  server = createServer(createApp());
  sockets = new Server(server);
  setupSocketHandler(sockets);
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => {
  for (const id of roomIds) { RoomManager.getRoom(id)?.resetToWaiting(); RoomManager.deleteRoom(id); }
  clients.forEach(client => client.disconnect());
  if (sockets) await new Promise<void>(resolve => sockets.close(() => resolve()));
});

function ack(client: Socket, event: string, data?: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    const callback = (error: Error | null, result: unknown) => error ? reject(error) : resolve(result);
    if (data === undefined) client.timeout(3000).emit(event, callback);
    else client.timeout(3000).emit(event, data, callback);
  });
}
function nextEvent(client: Socket, event: string, matches: (data: any) => boolean = () => true): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { client.off(event, listener); reject(new Error(`${event} 超时`)); }, 3000);
    const listener = (data: any) => {
      if (!matches(data)) return;
      clearTimeout(timeout);
      client.off(event, listener);
      resolve(data);
    };
    client.on(event, listener);
  });
}

it('deals server-configured guarantees to two authenticated clients and broadcasts payout details', async () => {
  const config = defaultAlgorithmConfig(); config.deckProbabilities = { standard: 100, short: 0 }; config.standardModes = { random: 0, rival: 0, guarantee: 100 };
  AlgorithmModel.saveConfig(config);
  for (let i = 0; i < 2; i++) {
    const user = UserModel.createUser(`socket_deal_${i}`, 'pass', `联机${i}`, 'avatar', 1000);
    const token = signToken({ userId: user.id, username: user.username, role: 'player' });
    const client = io(url, { auth: { token }, transports: ['websocket'], autoConnect: false });
    clients.push(client);
    const connected = nextEvent(client, 'connect'); client.connect(); await connected;
  }
  const created = await ack(clients[0], 'room:create', { roomName: '联机发牌测试', baseAnte: 10, turnSeconds: 60 });
  roomId = created.roomId;
  roomIds.add(roomId);
  await ack(clients[1], 'room:join', { roomId });
  await ack(clients[0], 'room:sit', { seatIndex: 0 }); await ack(clients[1], 'room:sit', { seatIndex: 1 });
  const starts = clients.map(client => nextEvent(client, 'game:start'));
  await ack(clients[0], 'room:ready', { isReady: true }); await ack(clients[1], 'room:ready', { isReady: true });
  const dealt = await Promise.all(starts);
  expect(dealt.every(data => data.deckKind === 'standard' && evaluateHand(data.handCards).type === 'pair')).toBe(true);
  expect(new Set(dealt.flatMap(data => data.handCards.map((card: any) => `${card.suit}-${card.rank}`))).size).toBe(6);
  const room = RoomManager.getRoom(roomId)!;
  room.currentRound = 2;
  const turnSeat = room.seats.findIndex(seat => seat?.user?.id === room.currentTurnPlayerId);
  const otherId = room.seats[1 - turnSeat]!.user!.id;
  const over = nextEvent(clients[0], 'game:over');
  expect((await ack(clients[turnSeat], 'game:compare', { targetPlayerId: otherId })).code).toBe(200);
  const settled = await over;
  expect(settled.winnerIds).toEqual([settled.winnerId]);
  expect(settled.payouts).toEqual([{ playerId: settled.winnerId, amount: 30 }]);
  expect(settled.splitPot).toBe(false);
}, 10000);

it('sends loser cards only to the direct winner, including other tabs and reconnects', async () => {
  const players: Array<{ client: Socket; token: string; id: number }> = [];
  for (let i = 0; i < 5; i++) {
    const user = UserModel.createUser(`socket_private_${i}`, 'pass', `私密比牌${i}`, 'avatar', 1000);
    const token = signToken({ userId: user.id, username: user.username, role: 'player' });
    const client = io(url, { auth: { token }, transports: ['websocket'], autoConnect: false });
    clients.push(client);
    players.push({ client, token, id: user.id });
    const connected = nextEvent(client, 'connect'); client.connect(); await connected;
  }
  const created = await ack(players[0].client, 'room:create', { roomName: '私密比牌测试', baseAnte: 10, turnSeconds: 0 });
  roomIds.add(created.roomId);
  for (let i = 1; i < players.length; i++) await ack(players[i].client, 'room:join', { roomId: created.roomId });
  for (let i = 0; i < 4; i++) await ack(players[i].client, 'room:sit', { seatIndex: i });
  for (let i = 0; i < 4; i++) await ack(players[i].client, 'room:ready', { isReady: true });
  const room = RoomManager.getRoom(created.roomId)!;
  const hands: Card[][] = [
    [{ rank: 8, suit: 'spades' }, { rank: 8, suit: 'hearts' }, { rank: 9, suit: 'clubs' }],
    [{ rank: 10, suit: 'diamonds' }, { rank: 11, suit: 'spades' }, { rank: 13, suit: 'hearts' }],
    [{ rank: 14, suit: 'spades' }, { rank: 14, suit: 'hearts' }, { rank: 12, suit: 'clubs' }],
    [{ rank: 10, suit: 'spades' }, { rank: 10, suit: 'hearts' }, { rank: 11, suit: 'clubs' }],
  ];
  room.seats.forEach((seat, index) => { if (seat) seat.cards = hands[index]; });
  room.currentRound = 2;

  const extraTab = io(url, { auth: { token: players[0].token }, transports: ['websocket'], autoConnect: false });
  clients.push(extraTab);
  const initialTabState = nextEvent(extraTab, 'room:state'); extraTab.connect(); await initialTabState;
  const recipients = [...players.map(player => player.client), extraTab];
  const results = recipients.map(client => nextEvent(client, 'game:compare_result'));
  const snapshots = recipients.map(client => nextEvent(client, 'room:state', state => state.seats[1]?.status === 'lost'));
  expect((await ack(players[1].client, 'game:compare', { targetPlayerId: players[0].id })).code).toBe(200);
  const firstResults = await Promise.all(results);
  firstResults.forEach((event, index) => {
    expect(event.winnerId).toBe(players[0].id); // 被挑战方获胜。
    if (index === 0 || index === 5) expect(event.loserCards).toEqual(hands[1]);
    else expect(event).not.toHaveProperty('loserCards');
  });
  (await Promise.all(snapshots)).forEach((state, index) => {
    if (index === 0 || index === 5) expect(state.seats[1].cards).toEqual(hands[1]);
    else if (index !== 1) expect(state.seats[1].cards).toBeNull();
    if (index === 1) expect(state.seats[0].cards).toBeNull();
    if (index === 4) expect(state.seats.every((seat: any) => !seat || seat.cards === null)).toBe(true);
  });
  expect(room.getMaskedState(players[0].id).seats[1]!.cards).toEqual(hands[1]);
  expect(room.getMaskedState(players[4].id).seats.every(seat => !seat || seat.cards === null)).toBe(true);

  const secondResults = recipients.map(client => nextEvent(client, 'game:compare_result'));
  expect((await ack(players[2].client, 'game:compare', { targetPlayerId: players[0].id })).code).toBe(200);
  (await Promise.all(secondResults)).forEach((event, index) => {
    expect(event.winnerId).toBe(players[2].id); // 发起方获胜。
    if (index === 2) expect(event.loserCards).toEqual(hands[0]);
    else expect(event).not.toHaveProperty('loserCards');
  });

  players[2].client.disconnect();
  const reconnected = io(url, { auth: { token: players[2].token }, transports: ['websocket'], autoConnect: false });
  clients.push(reconnected);
  const restored = nextEvent(reconnected, 'room:state'); reconnected.connect();
  const state = await restored;
  expect(state.seats[0].cards).toEqual(hands[0]);
  expect(state.seats[1].cards).toBeNull(); // 不继承被击败者之前取得的查看权限。
  expect(state.seats[3].cards).toBeNull();

  const over = nextEvent(players[4].client, 'game:over');
  expect((await ack(players[3].client, 'game:fold')).code).toBe(200);
  expect((await over).revealedCards.map((hand: any) => hand.playerId)).toEqual([players[2].id]);
}, 15000);

it('preserves unlimited thinking time through real room creation, turns and reconnection', async () => {
  const players: Array<{ client: Socket; token: string; id: number }> = [];
  for (let i = 0; i < 2; i++) {
    const user = UserModel.createUser(`socket_unlimited_${i}`, 'pass', `不限时玩家${i}`, 'avatar', 1000);
    const token = signToken({ userId: user.id, username: user.username, role: 'player' });
    const client = io(url, { auth: { token }, transports: ['websocket'], autoConnect: false });
    clients.push(client);
    players.push({ client, token, id: user.id });
    const connected = nextEvent(client, 'connect');
    client.connect();
    await connected;
  }

  const createdState = nextEvent(players[0].client, 'room:state');
  const created = await ack(players[0].client, 'room:create', { roomName: '朋友不限时', baseAnte: 10, turnSeconds: 0 });
  expect(created.code).toBe(200);
  roomIds.add(created.roomId);
  expect(await createdState).toMatchObject({ roomId: created.roomId, turnSeconds: 0, turnDeadline: null });
  await ack(players[1].client, 'room:join', { roomId: created.roomId });
  await ack(players[0].client, 'room:sit', { seatIndex: 0 });
  await ack(players[1].client, 'room:sit', { seatIndex: 1 });
  const started = nextEvent(players[0].client, 'room:state', state => state.gameStatus === 'playing');
  await ack(players[0].client, 'room:ready', { isReady: true });
  await ack(players[1].client, 'room:ready', { isReady: true });
  expect(await started).toMatchObject({ turnSeconds: 0, turnDeadline: null });

  const room = RoomManager.getRoom(created.roomId)!;
  const actor = players.find(player => player.id === room.currentTurnPlayerId)!;
  const nextActor = players.find(player => player.id !== actor.id)!;
  const nextTurn = nextEvent(nextActor.client, 'room:state', state => state.currentTurnPlayerId === nextActor.id);
  expect((await ack(actor.client, 'game:bet', { actionType: 'call', chipOption: 10 })).code).toBe(200);
  expect(await nextTurn).toMatchObject({ turnSeconds: 0, turnDeadline: null });

  nextActor.client.disconnect();
  const reconnected = io(url, { auth: { token: nextActor.token }, transports: ['websocket'], autoConnect: false });
  clients.push(reconnected);
  const restored = nextEvent(reconnected, 'room:state');
  reconnected.connect();
  const state = await restored;
  expect(state).toMatchObject({ currentTurnPlayerId: nextActor.id, gameStatus: 'playing', turnSeconds: 0, turnDeadline: null });
  expect(state.seats.filter((seat: any) => seat?.status === 'active')).toHaveLength(2);
  expect((await ack(reconnected, 'game:bet', { actionType: 'call', chipOption: 10 })).code).toBe(200);
  expect(room.turnDeadline).toBeNull();
  expect(room.currentTurnPlayerId).toBe(actor.id);
}, 10000);
