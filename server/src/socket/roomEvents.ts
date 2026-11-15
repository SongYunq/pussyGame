import { Socket, Server } from 'socket.io';
import { RoomManager } from '../game/RoomManager.js';
import { UserModel } from '../models/userModel.js';
import { Room } from '../game/Room.js';
import { onAction, SocketActionError } from './ack.js';

export function registerRoomEvents(io: Server, socket: Socket): void {
  const userId = (socket as any).userId as number;

  /** 遍历当前账号的全部在线连接（同账号多窗口共享房间归属）。 */
  function forEachOwnSocket(visit: (peer: Socket) => void): void {
    for (const peer of io.sockets.sockets.values()) {
      if ((peer as any).userId === userId) visit(peer);
    }
  }

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
    forEachOwnSocket(peer => {
      for (const channel of peer.rooms) {
        if (channel.startsWith('room:') && channel !== `room:${room.roomId}`) peer.leave(channel);
      }
      peer.join(`room:${room.roomId}`);
    });
  }

  const requireRoom = (message: string) => {
    const room = RoomManager.findRoomByUserId(userId);
    if (!room) throw new Error(message);
    return room;
  };

  // 1. 创建房间
  onAction(socket, 'room:create', '创建房间失败', (data, afterAck) => {
    const room = RoomManager.createRoom(
      data.roomName as string, data.baseAnte as number, data.turnSeconds as number | undefined, io, data.playerCount as number | undefined,
    );
    try { joinRoom(room); }
    catch (err) { RoomManager.removeEmptyRoom(room.roomId); throw err; }
    afterAck(() => room.broadcastState());
    return { code: 200, roomId: room.roomId };
  });

  // 2. 加入房间 (默认进入观战席)
  onAction(socket, 'room:join', '加入房间失败', (data, afterAck) => {
    if (typeof data.roomId !== 'string' || !/^\d{4,6}$/.test(data.roomId)) {
      throw new Error('房间号必须为 4～6 位数字');
    }
    const room = RoomManager.getRoom(data.roomId);
    if (!room) throw new SocketActionError('房间不存在', 404);
    joinRoom(room);
    afterAck(() => {
      // 给当前连入玩家立即定向推送最新的个人状态快照
      socket.emit('room:state', room.getMaskedState(userId));
      room.broadcastState();
    });
    return { code: 200, roomId: room.roomId };
  });

  onAction(socket, 'room:leave', '退出失败', () => {
    const room = RoomManager.findRoomByUserId(userId);
    if (room) {
      const roomId = room.roomId;
      room.stand(userId, false);
      room.removeSpectator(userId);
      forEachOwnSocket(peer => {
        peer.leave(`room:${roomId}`);
        peer.emit('room:left', { roomId });
      });
      room.broadcastState();
      RoomManager.removeEmptyRoom(roomId);
    }
    return { code: 200, message: '已退出房间' };
  });

  // 3. 选座坐下
  onAction(socket, 'room:sit', '入座失败', (data, afterAck) => {
    const room = requireRoom('您当前未加入任何房间');
    room.sit(userId, data.seatIndex as number);
    afterAck(() => room.broadcastState());
    return { code: 200, message: '入座成功' };
  });

  // 4. 离座 (起立成为观战)
  onAction(socket, 'room:stand', '离座失败', (_data, afterAck) => {
    const room = RoomManager.findRoomByUserId(userId);
    if (room) {
      room.stand(userId, true);
      afterAck(() => room.broadcastState());
    }
    return { code: 200, message: '已离座' };
  });

  // 5. 准备 / 取消准备
  onAction(socket, 'room:ready', '准备操作失败', (data, afterAck) => {
    const room = requireRoom('未在房间中');
    room.setReady(userId, data.isReady as boolean);
    afterAck(() => room.broadcastState());
    return { code: 200, message: '操作成功' };
  });
}
