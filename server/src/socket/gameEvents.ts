import { Socket, Server } from 'socket.io';
import { RoomManager } from '../game/RoomManager.js';

export function registerGameEvents(io: Server, socket: Socket): void {
  const userId = (socket as any).userId as number;

  // 1. 看牌
  socket.on('game:look', (callback) => {
    try {
      const room = RoomManager.findRoomByUserId(userId);
      if (!room) {
        throw new Error('未在房间中');
      }

      const cards = room.lookCards(userId);
      if (typeof callback === 'function') {
        callback({ code: 200, cards });
      }
    } catch (err: any) {
      if (typeof callback === 'function') {
        callback({ code: 400, message: err.message || '看牌失败' });
      } else {
        socket.emit('error', { code: 400, message: err.message || '看牌失败' });
      }
    }
  });

  // 2. 下注 / 加注 / All-in
  socket.on(
    'game:bet',
    (data: { actionType: 'call' | 'raise' | 'allin'; chipOption: number | string; amount?: number }, callback) => {
      try {
        const room = RoomManager.findRoomByUserId(userId);
        if (!room) {
          throw new Error('未在房间中');
        }

        room.bet(userId, data.actionType, data.chipOption, data.amount);

        if (typeof callback === 'function') {
          callback({ code: 200, message: '下注成功' });
        }
      } catch (err: any) {
        if (typeof callback === 'function') {
          callback({ code: 400, message: err.message || '下注失败' });
        } else {
          socket.emit('error', { code: 400, message: err.message || '下注失败' });
        }
      }
    }
  );

  // 3. 弃牌
  socket.on('game:fold', (callback) => {
    try {
      const room = RoomManager.findRoomByUserId(userId);
      if (!room) {
        throw new Error('未在房间中');
      }

      room.fold(userId, 'manual');

      if (typeof callback === 'function') {
        callback({ code: 200, message: '已弃牌' });
      }
    } catch (err: any) {
      if (typeof callback === 'function') {
        callback({ code: 400, message: err.message || '弃牌失败' });
      }
    }
  });

  // 4. 双人比牌
  socket.on('game:compare', (data: { targetPlayerId: number }, callback) => {
    try {
      const room = RoomManager.findRoomByUserId(userId);
      if (!room) {
        throw new Error('未在房间中');
      }

      room.compare(userId, data.targetPlayerId);

      if (typeof callback === 'function') {
        callback({ code: 200, message: '比牌成功' });
      }
    } catch (err: any) {
      if (typeof callback === 'function') {
        callback({ code: 400, message: err.message || '比牌失败' });
      } else {
        socket.emit('error', { code: 400, message: err.message || '比牌失败' });
      }
    }
  });
}
