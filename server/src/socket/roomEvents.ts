import { Socket, Server } from 'socket.io';
import { RoomManager } from '../game/RoomManager.js';
import { UserModel } from '../models/userModel.js';
import { Room } from '../game/Room.js';

export function registerRoomEvents(io: Server, socket: Socket): void {
  const userId = (socket as any).userId as number;

  function joinRoom(room: Room): void {
    const user = UserModel.findById(userId);
    if (!user) throw new Error('用户不存在');

    // 用户归属与其全部在线连接一起切换，防止同时操作多个房间。
    for (const oldRoom of RoomManager.getAllRooms()) {
      if (oldRoom.roomId === room.roomId) continue;
      if (oldRoom.findSeatIndexByUserId(userId) !== -1 || oldRoom.spectators.has(userId)) {
        oldRoom.stand(userId, false);
        oldRoom.removeSpectator(userId);
        oldRoom.broadcastState();
        RoomManager.removeEmptyRoom(oldRoom.roomId);
      }
    }
    room.setIo(io);
    if (room.findSeatIndexByUserId(userId) === -1) room.addSpectator(user);
    for (const peer of io.sockets.sockets.values()) {
      if ((peer as any).userId !== userId) continue;
      for (const channel of peer.rooms) {
        if (channel.startsWith('room:') && channel !== `room:${room.roomId}`) peer.leave(channel);
      }
      peer.join(`room:${room.roomId}`);
    }
  }

  // 1. 创建房间
  socket.on('room:create', (data: { roomName: string; baseAnte: number; turnSeconds?: number; playerCount?: number }, callback) => {
    try {
      const room = RoomManager.createRoom(data.roomName, data.baseAnte, data.turnSeconds, io, data.playerCount);
      try { joinRoom(room); }
      catch (err) { RoomManager.removeEmptyRoom(room.roomId); throw err; }

      if (typeof callback === 'function') {
        callback({ code: 200, roomId: room.roomId });
      }

      room.broadcastState();
    } catch (err: any) {
      if (typeof callback === 'function') {
        callback({ code: 400, message: err.message || '创建房间失败' });
      } else {
        socket.emit('error', { code: 400, message: err.message || '创建房间失败' });
      }
    }
  });

  // 2. 加入房间 (默认进入观战席)
  socket.on('room:join', (data: { roomId: string }, callback) => {
    try {
      if (!data || typeof data.roomId !== 'string' || !/^\d{4,6}$/.test(data.roomId)) {
        throw new Error('房间号必须为 4～6 位数字');
      }
      const room = RoomManager.getRoom(data.roomId);
      if (!room) {
        if (typeof callback === 'function') {
          callback({ code: 404, message: '房间不存在' });
        } else {
          socket.emit('error', { code: 404, message: '房间不存在' });
        }
        return;
      }

      joinRoom(room);

      if (typeof callback === 'function') {
        callback({ code: 200, roomId: room.roomId });
      }

      // 给当前连入玩家立即定向推送最新的个人状态快照
      socket.emit('room:state', room.getMaskedState(userId));
      room.broadcastState();
    } catch (err: any) {
      if (typeof callback === 'function') {
        callback({ code: 400, message: err.message || '加入房间失败' });
      } else {
        socket.emit('error', { code: 400, message: err.message || '加入房间失败' });
      }
    }
  });

  socket.on('room:leave', (_data, callback) => {
    try {
      const room = RoomManager.findRoomByUserId(userId);
      const roomId = room?.roomId ?? null;
      if (room) {
        room.stand(userId, false);
        room.removeSpectator(userId);
        for (const peer of io.sockets.sockets.values()) {
          if ((peer as any).userId === userId) {
            peer.leave(`room:${roomId}`);
            peer.emit('room:left', { roomId });
          }
        }
        room.broadcastState();
        RoomManager.removeEmptyRoom(room.roomId);
      }
      if (typeof callback === 'function') callback({ code: 200, message: '已退出房间' });
    } catch (err) {
      if (typeof callback === 'function') callback({ code: 400, message: err instanceof Error ? err.message : '退出失败' });
    }
  });

  // 3. 选座坐下
  socket.on('room:sit', (data: { seatIndex: number }, callback) => {
    try {
      const room = RoomManager.findRoomByUserId(userId);
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
  socket.on('room:stand', (dataOrCallback, ack) => {
    const callback = typeof dataOrCallback === 'function' ? dataOrCallback : ack;
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
      } else {
        socket.emit('error', { code: 400, message: err.message || '离座失败' });
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
