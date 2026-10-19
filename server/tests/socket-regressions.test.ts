import { createServer, Server as HttpServer } from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Server } from 'socket.io';
import { io, Socket } from 'socket.io-client';
import { createApp } from '../src/index.js';
import { setupSocketHandler } from '../src/socket/socketHandler.js';
import { RoomManager } from '../src/game/RoomManager.js';
import { UserModel } from '../src/models/userModel.js';
import { signToken } from '../src/utils/jwt.js';
import { config } from '../src/config/index.js';

let server: HttpServer;
let sockets: Server;
let url: string;
let adminToken: string;
let sequence = 0;
const clients: Socket[] = [];

beforeAll(async () => {
  expect(config.dbPath).toBe(':memory:');
  server = createServer(createApp());
  sockets = new Server(server);
  setupSocketHandler(sockets);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const admin = UserModel.findByUsername(config.defaultAdmin.username)!;
  adminToken = signToken({ userId: admin.id, username: admin.username, role: 'admin' });
});
afterEach(async () => {
  clients.splice(0).forEach(client => client.disconnect());
  sockets.disconnectSockets(true);
  for (const room of RoomManager.getAllRooms()) {
    room.resetToWaiting();
    RoomManager.deleteRoom(room.roomId);
  }
});
afterAll(async () => {
  if (sockets) await new Promise<void>(resolve => sockets.close(() => resolve()));
});

function nextEvent(client: Socket, event: string, matches: (data: any) => boolean = () => true): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off(event, listener);
      reject(new Error(`${event} 未在 3 秒内收到`));
    }, 3000);
    const listener = (data: any) => {
      if (!matches(data)) return;
      clearTimeout(timer);
      client.off(event, listener);
      resolve(data);
    };
    client.on(event, listener);
  });
}

function ack(client: Socket, event: string, data?: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    const callback = (error: Error | null, response: unknown) => error ? reject(error) : resolve(response);
    if (data === undefined) client.timeout(3000).emit(event, callback);
    else client.timeout(3000).emit(event, data, callback);
  });
}

async function connect(token: string): Promise<Socket> {
  const client = io(url, { auth: { token }, transports: ['websocket'], autoConnect: false, reconnection: false });
  clients.push(client);
  const connected = nextEvent(client, 'connect');
  client.connect();
  await connected;
  return client;
}

async function player() {
  const user = UserModel.createUser(`socket_regression_${sequence++}`, 'password123', '联机回归', 'avatar.png', 1000);
  const token = signToken({ userId: user.id, username: user.username, role: 'player' });
  return { ...user, token, client: await connect(token) };
}

async function createRoom(client: Socket, turnSeconds = 0): Promise<string> {
  const result = await ack(client, 'room:create', { roomName: '联机回归', baseAnte: 10, turnSeconds });
  expect(result.code).toBe(200);
  return result.roomId;
}

describe('Socket room ownership and lifecycle regressions', () => {
  it('moves every tab of an account to one room and reclaims the empty old room', async () => {
    const owner = await player();
    const tab = await connect(owner.token);
    const first = await createRoom(owner.client);
    expect(RoomManager.findRoomByUserId(owner.id)?.roomId).toBe(first);
    const tabState = nextEvent(tab, 'room:state', state => state.roomId !== first);
    const second = await createRoom(owner.client);
    expect((await tabState).roomId).toBe(second);
    expect(RoomManager.getRoom(first)).toBeNull();
    expect(RoomManager.findRoomByUserId(owner.id)?.roomId).toBe(second);
    for (const client of [owner.client, tab]) {
      const peer = sockets.sockets.sockets.get(client.id!)!;
      expect([...peer.rooms].filter(room => room.startsWith('room:'))).toEqual([`room:${second}`]);
    }
    expect((await ack(tab, 'room:sit', { seatIndex: 3 })).code).toBe(200);
    expect(RoomManager.getRoom(second)!.seats[3]!.user!.id).toBe(owner.id);
  });

  it('folds and settles the previous game when an active player switches rooms', async () => {
    const first = await player();
    const second = await player();
    const oldId = await createRoom(first.client);
    await ack(second.client, 'room:join', { roomId: oldId });
    await ack(first.client, 'room:sit', { seatIndex: 0 });
    await ack(second.client, 'room:sit', { seatIndex: 1 });
    await ack(first.client, 'room:ready', { isReady: true });
    await ack(second.client, 'room:ready', { isReady: true });
    const over = nextEvent(second.client, 'game:over');
    const newId = await createRoom(first.client);
    const settled = await over;
    expect(settled.winnerId).toBe(second.id);
    expect(settled.winAmount).toBe(20);
    expect(UserModel.findById(second.id)!.balance).toBe(1010);
    expect(UserModel.findById(first.id)!.balance).toBe(990);
    expect(RoomManager.getRoom(oldId)!.findSeatIndexByUserId(first.id)).toBe(-1);
    expect(RoomManager.getRoom(oldId)!.spectators.has(first.id)).toBe(false);
    expect(RoomManager.findRoomByUserId(first.id)?.roomId).toBe(newId);
  });

  it('keeps a spectator while another tab is online and removes it only after the last disconnect', async () => {
    const owner = await player();
    const tab = await connect(owner.token);
    const roomId = await createRoom(owner.client);
    const firstPeer = sockets.sockets.sockets.get(owner.client.id!)!;
    const serverDisconnected = new Promise<void>(resolve => firstPeer.once('disconnect', () => resolve()));
    owner.client.disconnect();
    await serverDisconnected;
    expect(RoomManager.getUserOnlineStatus(owner.id).isOnline).toBe(true);
    expect(RoomManager.getRoom(roomId)!.spectators.has(owner.id)).toBe(true);
    const lastPeer = sockets.sockets.sockets.get(tab.id!)!;
    const lastDisconnected = new Promise<void>(resolve => lastPeer.once('disconnect', () => resolve()));
    tab.disconnect();
    await lastDisconnected;
    expect(RoomManager.getUserOnlineStatus(owner.id).isOnline).toBe(false);
    expect(RoomManager.getRoom(roomId)).toBeNull();
  });

  it('sends each hand to every owner tab while keeping other hands and spectator starts private', async () => {
    const first = await player();
    const second = await player();
    const spectator = await player();
    const tab = await connect(first.token);
    const roomId = await createRoom(first.client);
    await ack(second.client, 'room:join', { roomId });
    await ack(spectator.client, 'room:join', { roomId });
    await ack(first.client, 'room:sit', { seatIndex: 0 });
    await ack(second.client, 'room:sit', { seatIndex: 1 });
    const spectatorStarts: unknown[] = [];
    spectator.client.on('game:start', data => spectatorStarts.push(data));
    const starts = [first.client, tab, second.client].map(client => nextEvent(client, 'game:start'));
    const firstState = nextEvent(first.client, 'room:state', state => state.gameStatus === 'playing');
    const tabState = nextEvent(tab, 'room:state', state => state.gameStatus === 'playing');
    const publicState = nextEvent(spectator.client, 'room:state', state => state.gameStatus === 'playing');
    await ack(first.client, 'room:ready', { isReady: true });
    await ack(second.client, 'room:ready', { isReady: true });
    const [firstStart, tabStart, secondStart] = await Promise.all(starts);
    expect(firstStart.handCards).toHaveLength(3);
    expect(tabStart.handCards).toEqual(firstStart.handCards);
    expect(new Set([...firstStart.handCards, ...secondStart.handCards].map(card => `${card.suit}-${card.rank}`)).size).toBe(6);
    for (const state of await Promise.all([firstState, tabState])) {
      expect(state.seats[0].cards).toEqual(firstStart.handCards);
      expect(state.seats[1].cards).toBeNull();
      expect(state).not.toHaveProperty('mode');
      expect(state).not.toHaveProperty('rivalCombo');
    }
    expect((await publicState).seats.filter(Boolean).every((seat: any) => seat.cards === null)).toBe(true);
    expect(spectatorStarts).toEqual([]);
  });

  it('retains seats, hand privacy and an unlimited turn on reconnect', async () => {
    const first = await player();
    const second = await player();
    const roomId = await createRoom(first.client);
    await ack(second.client, 'room:join', { roomId });
    await ack(first.client, 'room:sit', { seatIndex: 0 });
    await ack(second.client, 'room:sit', { seatIndex: 1 });
    await ack(first.client, 'room:ready', { isReady: true });
    await ack(second.client, 'room:ready', { isReady: true });
    const room = RoomManager.getRoom(roomId)!;
    const hand = room.getMaskedState(first.id).seats[0]!.cards;
    const peer = sockets.sockets.sockets.get(first.client.id!)!;
    const disconnected = new Promise<void>(resolve => peer.once('disconnect', () => resolve()));
    first.client.disconnect();
    await disconnected;
    const resumed = io(url, { auth: { token: first.token }, transports: ['websocket'], autoConnect: false, reconnection: false });
    clients.push(resumed);
    const stateEvent = nextEvent(resumed, 'room:state');
    resumed.connect();
    const state = await stateEvent;
    expect(state.roomId).toBe(roomId);
    expect(state.turnSeconds).toBe(0);
    expect(state.turnDeadline).toBeNull();
    expect(state.seats[0].cards).toEqual(hand);
    expect(state.seats[1].cards).toBeNull();
    expect(state.currentTurnPlayerId).toBe(room.currentTurnPlayerId);
    expect(state.totalPot).toBe(20);
  });
});

describe('Socket authentication and malformed message regressions', () => {
  it('disconnects every old tab immediately after an administrator resets the password', async () => {
    const owner = await player();
    const tab = await connect(owner.token);
    await createRoom(owner.client);
    const disconnected = [owner.client, tab].map(client => nextEvent(client, 'disconnect'));
    const response = await request(server).post(`/api/admin/users/${owner.id}/reset-password`)
      .set('Authorization', `Bearer ${adminToken}`).send({ newPassword: 'updatedPassword123' });
    expect(response.status).toBe(200);
    await Promise.all(disconnected);
    expect(RoomManager.getUserOnlineStatus(owner.id).isOnline).toBe(false);
    const revoked = io(url, { auth: { token: owner.token }, transports: ['websocket'], autoConnect: false, reconnection: false });
    clients.push(revoked);
    const rejected = nextEvent(revoked, 'connect_error');
    revoked.connect();
    expect((await rejected).message).toContain('凭据无效');
    const login = await request(server).post('/api/auth/login')
      .send({ username: owner.username, password: 'updatedPassword123' });
    expect(login.status).toBe(200);
    const fresh = await connect(login.body.data.token);
    expect(fresh.connected).toBe(true);
  });

  it('rechecks the credential version for actions even if a token was revoked outside the controller', async () => {
    const owner = await player();
    const roomId = await createRoom(owner.client);
    UserModel.resetPassword(owner.id, 'updatedPassword123');
    const disconnected = nextEvent(owner.client, 'disconnect');
    const result = await ack(owner.client, 'room:sit', { seatIndex: 0 });
    expect(result.code).toBe(401);
    await disconnected;
    expect(RoomManager.getRoom(roomId)).toBeNull();
    expect(RoomManager.getUserOnlineStatus(owner.id).isOnline).toBe(false);
  });

  it('rejects malformed creation, seat and ready data without corrupting membership', async () => {
    const owner = await player();
    for (const payload of [null, {}, { roomName: {}, baseAnte: 10 }, { roomName: '房间', baseAnte: '10' },
      { roomName: '房间', baseAnte: -1 }, { roomName: '房间', baseAnte: 10, turnSeconds: 1.5 }]) {
      expect((await ack(owner.client, 'room:create', payload)).code).toBe(400);
      expect(RoomManager.findRoomByUserId(owner.id)).toBeNull();
    }
    expect(RoomManager.getAllRooms()).toHaveLength(0);
    const roomId = await createRoom(owner.client);
    for (const payload of [null, { seatIndex: '0' }, { seatIndex: 1.5 }, { seatIndex: 8 }]) {
      expect((await ack(owner.client, 'room:sit', payload)).code).toBe(400);
    }
    expect((await ack(owner.client, 'room:sit', { seatIndex: 0 })).code).toBe(200);
    expect((await ack(owner.client, 'room:ready', { isReady: 'true' })).code).toBe(400);
    expect(RoomManager.getRoom(roomId)!.seats[0]!.isReady).toBe(false);
    expect((await ack(owner.client, 'room:stand', {})).code).toBe(200);
    expect(RoomManager.getRoom(roomId)!.findSeatIndexByUserId(owner.id)).toBe(-1);
  });

  it('ignores malformed chat payloads and continues broadcasting valid messages', async () => {
    const sender = await player();
    const observer = await player();
    const roomId = await createRoom(sender.client);
    await ack(observer.client, 'room:join', { roomId });
    const emojis: unknown[] = [];
    const phrases: unknown[] = [];
    observer.client.on('chat:emoji_broadcast', data => emojis.push(data));
    observer.client.on('chat:phrase_broadcast', data => phrases.push(data));
    for (const payload of [null, {}, { emojiId: {} }, { emojiId: '' }, { emojiId: 'x'.repeat(65) }]) sender.client.emit('chat:emoji', payload);
    for (const payload of [null, {}, { phraseId: -1, text: 'hello' }, { phraseId: 1, text: {} },
      { phraseId: 1, text: 'x'.repeat(201) }]) sender.client.emit('chat:phrase', payload);
    const emoji = nextEvent(observer.client, 'chat:emoji_broadcast');
    const phrase = nextEvent(observer.client, 'chat:phrase_broadcast');
    sender.client.emit('chat:emoji', { emojiId: 'fire' });
    sender.client.emit('chat:phrase', { phraseId: 3, text: '快点吧' });
    expect(await emoji).toEqual({ playerId: sender.id, emojiId: 'fire' });
    expect(await phrase).toEqual({ playerId: sender.id, phraseId: 3, text: '快点吧' });
    expect(emojis).toHaveLength(1);
    expect(phrases).toHaveLength(1);
    expect((await ack(sender.client, 'room:sit', { seatIndex: 0 })).code).toBe(200);
  });
});
