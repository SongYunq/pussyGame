import { Server } from 'socket.io';
import { Room } from './Room.js';

export class RoomManager {
  private static rooms: Map<string, Room> = new Map();
  // 记录在线用户的 Socket 映射：userId -> Set<socketId>
  private static userSockets: Map<number, Set<string>> = new Map();

  static createRoom(roomName: string, baseAnte: number = 10, turnSeconds: number = 20, io?: Server): Room {
    let roomId = Math.floor(1000 + Math.random() * 9000).toString();
    // 保证唯一
    while (this.rooms.has(roomId)) {
      roomId = Math.floor(1000 + Math.random() * 9000).toString();
    }

    const room = new Room({
      roomId,
      roomName: roomName || `${roomId} 房间`,
      baseAnte: Math.max(1, baseAnte),
      turnSeconds: Math.max(10, Math.min(60, turnSeconds)),
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

  static recordUserOnline(userId: number, socketId: string): void {
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(socketId);
  }

  static recordUserOffline(userId: number, socketId: string): void {
    const set = this.userSockets.get(userId);
    if (set) {
      set.delete(socketId);
      if (set.size === 0) {
        this.userSockets.delete(userId);
      }
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

  static getAllRooms(): Room[] {
    return Array.from(this.rooms.values());
  }
}
