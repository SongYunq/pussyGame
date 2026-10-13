import { Server, Socket } from 'socket.io';
import { verifyToken } from '../utils/jwt.js';
import { RoomManager } from '../game/RoomManager.js';
import { registerRoomEvents } from './roomEvents.js';
import { registerGameEvents } from './gameEvents.js';
import { registerChatEvents } from './chatEvents.js';

export function setupSocketHandler(io: Server): void {
  // 1. Socket.io 连接鉴权中间件
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('未提供身份验证凭据 (Token)'));
    }

    const payload = verifyToken(token);
    if (!payload) {
      return next(new Error('身份凭据无效或已过期，请重新登录'));
    }

    (socket as any).userId = payload.userId;
    (socket as any).username = payload.username;
    (socket as any).role = payload.role;
    next();
  });

  // 2. 连接生命周期与事件注册
  io.on('connection', (socket: Socket) => {
    const userId = (socket as any).userId as number;
    const username = (socket as any).username as string;

    RoomManager.recordUserOnline(userId, socket.id);

    // 检查是否有未退出的房间（断线重连恢复）
    const existingRoom = RoomManager.findRoomByUserId(userId);
    if (existingRoom) {
      socket.join(`room:${existingRoom.roomId}`);
      existingRoom.setIo(io);
      socket.emit('room:state', existingRoom.getMaskedState(userId));
    }

    // 注册各类事件
    registerRoomEvents(io, socket);
    registerGameEvents(io, socket);
    registerChatEvents(io, socket);

    // 断开连接处理
    socket.on('disconnect', () => {
      RoomManager.recordUserOffline(userId, socket.id);

      const room = RoomManager.findRoomByUserId(userId);
      if (room) {
        // 若仅在观战席，离开房间并清除
        if (room.spectators.has(userId)) {
          room.removeSpectator(userId);
          room.broadcastState();
        }
        // 若在桌位上，保留桌位与牌面，等待重连；超时由倒计时自动判负/弃牌
      }
    });
  });
}
