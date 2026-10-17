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

let server: HttpServer;
let sockets: Server;
const clients: Socket[] = [];
let url: string;
let roomId = '';
beforeAll(async () => {
  server = createServer(createApp());
  sockets = new Server(server);
  setupSocketHandler(sockets);
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => {
  if (roomId) { RoomManager.getRoom(roomId)?.resetToWaiting(); RoomManager.deleteRoom(roomId); }
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
function nextEvent(client: Socket, event: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${event} 超时`)), 3000);
    client.once(event, data => { clearTimeout(timeout); resolve(data); });
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
