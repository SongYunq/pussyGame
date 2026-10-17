import { Server } from 'socket.io';
import { Room } from './Room.js';
import { UserModel } from '../models/userModel.js';

export class RoomManager {
  private static rooms: Map<string, Room> = new Map();
  // 记录在线用户的 Socket 映射：userId -> Set<socketId>
  private static userSockets: Map<number, Set<string>> = new Map();
  private static socketDisconnectors: Map<string, () => void> = new Map();

  static createRoom(roomName: string, baseAnte: number = 10, turnSeconds: number = 20, io?: Server): Room {
    if (typeof roomName !== 'string') throw new Error('房间名称必须为文本');
    if (typeof baseAnte !== 'number' || !Number.isFinite(baseAnte) || baseAnte <= 0
      || baseAnte * 10 > Number.MAX_SAFE_INTEGER) {
      throw new Error('底注必须为有效的正数');
    }
    if (!Number.isInteger(turnSeconds)) throw new Error('思考时间必须为整数秒');
    if (this.rooms.size >= 9000) throw new Error('可用房间号已用尽');

    const start = Math.floor(Math.random() * 9000);
    let roomId = '';
    for (let offset = 0; offset < 9000; offset++) {
      const candidate = (1000 + (start + offset) % 9000).toString();
      if (!this.rooms.has(candidate)) { roomId = candidate; break; }
    }

    const room = new Room({
      roomId,
      roomName: roomName.trim() || `${roomId} 房间`,
      baseAnte: Math.max(1, baseAnte),
      turnSeconds: turnSeconds === 0 ? 0 : Math.max(10, Math.min(60, turnSeconds)),
      io,
    });

    this.rooms.set(roomId, room);
    return room;
  }

  static getRoom(roomId: string): Room | null {
    return this.rooms.get(roomId) || null;
  }

  static deleteRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      if (room.gameStatus === 'playing') throw new Error('进行中的房间不可删除');
      room.dispose();
      this.rooms.delete(roomId);
    }
  }

  static findRoomByUserId(userId: number): Room | null {
    for (const room of this.rooms.values()) {
      if (room.findSeatIndexByUserId(userId) !== -1 || room.spectators.has(userId)) {
        return room;
      }
    }
    return null;
  }

  static recordUserOnline(userId: number, socketId: string, disconnect?: () => void): void {
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(socketId);
    if (disconnect) this.socketDisconnectors.set(socketId, disconnect);
  }

  static recordUserOffline(userId: number, socketId: string): void {
    this.socketDisconnectors.delete(socketId);
    const set = this.userSockets.get(userId);
    if (set) {
      set.delete(socketId);
      if (set.size === 0) {
        this.userSockets.delete(userId);
      }
    }
  }

  static disconnectUser(userId: number): void {
    for (const socketId of Array.from(this.userSockets.get(userId) ?? [])) {
      this.socketDisconnectors.get(socketId)?.();
    }
  }

  static getUserOnlineStatus(userId: number): { isOnline: boolean; currentRoomId: string | null } {
    const isOnline = this.userSockets.has(userId) && this.userSockets.get(userId)!.size > 0;
    const room = this.findRoomByUserId(userId);
    return {
      isOnline,
      currentRoomId: room ? room.roomId : null,
    };
  }

  static refreshUser(userId: number): void {
    const user = UserModel.findById(userId);
    if (!user) return;
    for (const room of this.rooms.values()) {
      const seatIndex = room.findSeatIndexByUserId(userId);
      if (seatIndex !== -1) {
        room.seats[seatIndex]!.user = { id: user.id, nickname: user.nickname, avatar: user.avatar, balance: user.balance };
      }
      if (room.spectators.has(userId)) room.addSpectator(user);
      if (seatIndex !== -1 || room.spectators.has(userId)) room.broadcastState();
    }
  }

  static removeEmptyRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room && room.gameStatus !== 'playing' && room.seats.every(seat => seat === null) && room.spectators.size === 0) {
      this.deleteRoom(roomId);
    }
  }

  static getAllRooms(): Room[] {
    return Array.from(this.rooms.values());
  }
}
