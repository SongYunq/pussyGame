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
    socket.data.authToken = token;
    next();
  });

  // 2. 连接生命周期与事件注册
  io.on('connection', (socket: Socket) => {
    const userId = (socket as any).userId as number;
    RoomManager.recordUserOnline(userId, socket.id, () => { socket.disconnect(true); });

    // 长连接不能在握手后永久沿用旧权限；每次动作重新核对凭据与账号版本。
    socket.use((packet, next) => {
      const payload = verifyToken(socket.data.authToken);
      if (!payload || payload.userId !== userId) {
        const callback = packet[packet.length - 1];
        const error = { code: 401, message: '身份凭据无效或已过期，请重新登录' };
        if (typeof callback === 'function') callback(error);
        else socket.emit('error', error);
        socket.disconnect(true);
        return;
      }
      (socket as any).role = payload.role;
      next();
    });

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
        if (room.spectators.has(userId) && !RoomManager.getUserOnlineStatus(userId).isOnline) {
          room.removeSpectator(userId);
          room.broadcastState();
          RoomManager.removeEmptyRoom(room.roomId);
        }
        // 保留座位与牌面等待重连；限时房间继续倒计时，无限制房间等待手动操作
      }
    });
  });
}
