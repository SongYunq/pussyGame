import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as connect, Socket as ClientSocket } from 'socket.io-client';
import { setupSocketHandler } from '../src/socket/socketHandler.js';
import { signToken } from '../src/utils/jwt.js';
import { UserModel } from '../src/models/userModel.js';

export interface Harness {
  url: string;
  io: Server;
  close(): Promise<void>;
}

export async function startHarness(): Promise<Harness> {
  const server = http.createServer();
  const io = new Server(server);
  setupSocketHandler(io);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    io,
    close: () => new Promise<void>(resolve => { io.close(); server.close(() => resolve()); }),
  };
}

export async function connectAs(harness: Harness, userId: number): Promise<ClientSocket> {
  const user = UserModel.findById(userId)!;
  const token = signToken({ userId, username: user.username, role: user.role });
  const socket = connect(harness.url, { auth: { token }, transports: ['websocket'], forceNew: true, reconnection: false });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
  return socket;
}

export function request<T = any>(socket: ClientSocket, event: string, data?: unknown): Promise<T> {
  return new Promise(resolve => {
    if (data === undefined) socket.emit(event, resolve);
    else socket.emit(event, data, resolve);
  });
}

export function nextEvent<T = any>(socket: ClientSocket, event: string, predicate: (payload: T) => boolean = () => true, timeoutMs = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const listener = (payload: T) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, listener);
      resolve(payload);
    };
    const timer = setTimeout(() => { socket.off(event, listener); reject(new Error(`等待 ${event} 超时`)); }, timeoutMs);
    socket.on(event, listener);
  });
}
