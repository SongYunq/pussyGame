import { describe, it, expect, beforeAll } from 'vitest';
import { Room } from '../src/game/Room.js';
import { RoomManager } from '../src/game/RoomManager.js';
import { UserModel } from '../src/models/userModel.js';
import { getDb } from '../src/db/database.js';

let p1Id: number;
let p2Id: number;
let p3Id: number;

beforeAll(() => {
  getDb();
  // 创建测试玩家
  const u1 = UserModel.createUser('room_p1', 'pass123', '玩家一', 'avatar_1.png', 10000);
  const u2 = UserModel.createUser('room_p2', 'pass123', '玩家二', 'avatar_2.png', 10000);
  const u3 = UserModel.createUser('room_p3', 'pass123', '玩家三', 'avatar_3.png', 10000);
  p1Id = u1.id;
  p2Id = u2.id;
  p3Id = u3.id;
});

describe('Room State Machine & Game Flow', () => {
  it('should create room with custom ante and turn seconds', () => {
    const room = RoomManager.createRoom('老友聚会测试房', 20, 15);
    expect(room.roomId).toBeDefined();
    expect(room.roomName).toBe('老友聚会测试房');
    expect(room.baseAnte).toBe(20);
    expect(room.turnSeconds).toBe(15);
    expect(room.gameStatus).toBe('waiting');
  });

  it('players should sit down on available seats (0~7)', () => {
    const room = RoomManager.createRoom('入座测试房', 10, 20);

    room.sit(p1Id, 0);
    room.sit(p2Id, 1);

    expect(room.seats[0]).not.toBeNull();
    expect(room.seats[0]?.user?.id).toBe(p1Id);
    expect(room.seats[1]?.user?.id).toBe(p2Id);

    // 尝试坐已占用的座位应抛错
    expect(() => room.sit(p3Id, 0)).toThrow('该座位已被占用');

    // 尝试坐越界座位
    expect(() => room.sit(p3Id, 8)).toThrow('无效的座位号');
  });

  it('anti-cheat: masked state only exposes player own cards', () => {
    const room = RoomManager.createRoom('防作弊测试房', 10, 20);
    room.sit(p1Id, 0);
    room.sit(p2Id, 1);

    // 准备并触发开局
    room.setReady(p1Id, true);
    room.setReady(p2Id, true);

    expect(room.gameStatus).toBe('playing');

    // 获取 P1 视角的脱敏状态
    const p1State = room.getMaskedState(p1Id);
    expect(p1State.seats[0]?.cards).not.toBeNull();
    expect(p1State.seats[0]?.cards?.length).toBe(3);
    // P1 视角下看 P2 的手牌必须为 null！
    expect(p1State.seats[1]?.cards).toBeNull();

    // 获取 P2 视角的脱敏状态
    const p2State = room.getMaskedState(p2Id);
    expect(p2State.seats[1]?.cards).not.toBeNull();
    // P2 视角下看 P1 的手牌必须为 null！
    expect(p2State.seats[0]?.cards).toBeNull();
  });

  it('gameplay flow: look cards, call bet, raise bet', () => {
    const room = RoomManager.createRoom('对局流程测试房', 10, 20);
    room.sit(p1Id, 0);
    room.sit(p2Id, 1);
    room.setReady(p1Id, true);
    room.setReady(p2Id, true);

    expect(room.totalPot).toBe(20); // 底注 10 * 2 = 20

    const currentTurn = room.currentTurnPlayerId!;
    expect(currentTurn).toBeDefined();

    // 当前玩家看牌
    const cards = room.lookCards(currentTurn);
    expect(cards.length).toBe(3);
    const turnSeat = room.seats[room.findSeatIndexByUserId(currentTurn)]!;
    expect(turnSeat.hasLooked).toBe(true);

    // 看牌后按正常基准下注 (明注：10 * 1 = 10)
    const initialBalance = turnSeat.user!.balance;
    room.bet(currentTurn, 'call', 10);

    expect(turnSeat.user!.balance).toBe(initialBalance - 10);
    expect(room.totalPot).toBe(30);
  });

  it('fold mechanic: when one player folds, the other wins', () => {
    const room = RoomManager.createRoom('弃牌测试房', 10, 20);
    room.sit(p1Id, 0);
    room.sit(p2Id, 1);
    room.setReady(p1Id, true);
    room.setReady(p2Id, true);

    const initialPot = room.totalPot;
    const currentTurn = room.currentTurnPlayerId!;
    const otherPlayer = currentTurn === p1Id ? p2Id : p1Id;
    const otherSeat = room.seats[room.findSeatIndexByUserId(otherPlayer)]!;
    const prevBalance = otherSeat.user!.balance;

    // 当前操作玩家认输弃牌
    room.fold(currentTurn, 'manual');

    // 游戏应进入结算阶段
    expect(room.gameStatus).toBe('settling');
    // 剩下的唯一存活者获得奖池
    expect(otherSeat.user!.balance).toBe(prevBalance + initialPot);
  });

  it('compare mechanic in round 2: winner stays active, loser eliminated', () => {
    const room = RoomManager.createRoom('比牌PK测试房', 10, 20);
    room.sit(p1Id, 0);
    room.sit(p2Id, 1);
    room.setReady(p1Id, true);
    room.setReady(p2Id, true);

    // 第 1 轮不能比牌，尝试比牌应报错
    const turn1 = room.currentTurnPlayerId!;
    const target1 = turn1 === p1Id ? p2Id : p1Id;
    expect(() => room.compare(turn1, target1)).toThrow('第 2 轮起方可发起比牌');

    // 两位玩家依次跟注，进入第 2 轮
    room.bet(turn1, 'call', 10);
    const turn2 = room.currentTurnPlayerId!;
    room.bet(turn2, 'call', 10);

    expect(room.currentRound).toBeGreaterThanOrEqual(2);

    // 第 2 轮发起比牌
    const turn3 = room.currentTurnPlayerId!;
    const target3 = turn3 === p1Id ? p2Id : p1Id;
    room.compare(turn3, target3);

    // 比牌后应立即决出胜者并进入 settling
    expect(room.gameStatus).toBe('settling');
  });
});
