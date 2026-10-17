import { Socket, Server } from 'socket.io';
import { RoomManager } from '../game/RoomManager.js';
import { UserModel } from '../models/userModel.js';

export function registerRoomEvents(io: Server, socket: Socket): void {
  const userId = (socket as any).userId as number;

  // 1. 创建房间
  socket.on('room:create', (data: { roomName: string; baseAnte: number; turnSeconds?: number }, callback) => {
    try {
      const room = RoomManager.createRoom(data.roomName, data.baseAnte, data.turnSeconds, io);
      socket.join(`room:${room.roomId}`);

      const user = UserModel.findById(userId);
      if (user) {
        room.addSpectator({
          id: user.id,
          nickname: user.nickname,
          avatar: user.avatar,
        });
      }

      if (typeof callback === 'function') {
        callback({ code: 200, roomId: room.roomId });
      }

      room.broadcastState();
    } catch (err: any) {
      if (typeof callback === 'function') {
        callback({ code: 400, message: err.message || '创建房间失败' });
      }
    }
  });

  // 2. 加入房间 (默认进入观战席)
  socket.on('room:join', (data: { roomId: string }, callback) => {
    try {
      const room = RoomManager.getRoom(data.roomId);
      if (!room) {
        if (typeof callback === 'function') {
          callback({ code: 404, message: '房间不存在' });
        } else {
          socket.emit('error', { code: 404, message: '房间不存在' });
        }
        return;
      }

      room.setIo(io);
      socket.join(`room:${room.roomId}`);

      const user = UserModel.findById(userId);
      if (user) {
        // 检查是否已经在座位上（断线重连）
        const seatIdx = room.findSeatIndexByUserId(userId);
        if (seatIdx === -1) {
          room.addSpectator({
            id: user.id,
            nickname: user.nickname,
            avatar: user.avatar,
          });
        }
      }

      if (typeof callback === 'function') {
        callback({ code: 200, roomId: room.roomId });
      }

      // 给当前连入玩家立即定向推送最新的个人状态快照
      socket.emit('room:state', room.getMaskedState(userId));
      room.broadcastState();
    } catch (err: any) {
      if (typeof callback === 'function') {
        callback({ code: 400, message: err.message || '加入房间失败' });
      }
    }
  });

  // 3. 选座坐下
  socket.on('room:sit', (data: { seatIndex: number }, callback) => {
    try {
      const room = RoomManager.findRoomByUserId(userId) || findRoomBySocket(socket);
      if (!room) {
        throw new Error('您当前未加入任何房间');
      }

      room.sit(userId, data.seatIndex);

      if (typeof callback === 'function') {
        callback({ code: 200, message: '入座成功' });
      }

      room.broadcastState();
    } catch (err: any) {
      if (typeof callback === 'function') {
        callback({ code: 400, message: err.message || '入座失败' });
      } else {
        socket.emit('error', { code: 400, message: err.message || '入座失败' });
      }
    }
  });

  // 4. 离座 (起立成为观战)
  socket.on('room:stand', (callback) => {
    try {
      const room = RoomManager.findRoomByUserId(userId);
      if (room) {
        room.stand(userId, true);
        room.broadcastState();
      }
      if (typeof callback === 'function') {
        callback({ code: 200, message: '已离座' });
      }
    } catch (err: any) {
      if (typeof callback === 'function') {
        callback({ code: 400, message: err.message || '离座失败' });
      }
    }
  });

  // 5. 准备 / 取消准备
  socket.on('room:ready', (data: { isReady: boolean }, callback) => {
    try {
      const room = RoomManager.findRoomByUserId(userId);
      if (!room) {
        throw new Error('未在房间中');
      }

      room.setReady(userId, data.isReady);

      if (typeof callback === 'function') {
        callback({ code: 200, message: '操作成功' });
      }

      room.broadcastState();
    } catch (err: any) {
      if (typeof callback === 'function') {
        callback({ code: 400, message: err.message || '准备操作失败' });
      } else {
        socket.emit('error', { code: 400, message: err.message || '准备操作失败' });
      }
    }
  });
}

function findRoomBySocket(socket: Socket) {
  for (const r of socket.rooms) {
    if (r.startsWith('room:')) {
      const roomId = r.replace('room:', '');
      return RoomManager.getRoom(roomId);
    }
  }
  return null;
}
