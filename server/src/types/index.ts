// 卡牌花色
export type CardSuit = 'spades' | 'hearts' | 'clubs' | 'diamonds'; // 黑桃, 红桃, 梅花, 方块

// 卡牌定义 (rank: 2~14，14 代表 A)
export interface Card {
  suit: CardSuit;
  rank: number;
}

// 牌型等级定义
export type HandRankType =
  | 'special_235'      // 特殊 235 (不同花色 235 遇豹子逆袭)
  | 'high_card'        // 单张 (散牌)
  | 'pair'             // 对子
  | 'straight'         // 顺子
  | 'flush'            // 金花 (同花)
  | 'straight_flush'   // 同花顺 (顺金)
  | 'leopard';         // 豹子 (三张相同)

// 牌型评估结果
export interface HandEvaluation {
  type: HandRankType;
  typeName: string;
  weight: number;       // 基础等级权重 (1: high_card, 2: pair, 3: straight, 4: flush, 5: straight_flush, 6: leopard, 7: special_235)
  ranks: number[];      // 用于同牌型比对的大小序列，从高到低
  cards: Card[];
}

// 玩家在桌状态
export type PlayerTableStatus =
  | 'empty'
  | 'sitting'
  | 'ready'
  | 'active'
  | 'folded'
  | 'lost';

// 玩家桌位信息
export interface TableSeat {
  seatIndex: number;
  user: {
    id: number;
    nickname: string;
    avatar: string;
    balance: number;
  } | null;
  status: PlayerTableStatus;
  hasLooked: boolean;
  cards: Card[] | null;     // 仅本人可见具体牌面，他人为 null
  currentInvested: number;  // 本局已下注金额
  isReady: boolean;
}

// 房间全量状态
export interface RoomState {
  roomId: string;
  roomName: string;
  baseAnte: number;
  turnSeconds: number;
  gameStatus: 'waiting' | 'playing' | 'settling';
  currentRound: number;
  currentTurnPlayerId: number | null;
  turnDeadline: number | null;
  currentBet: number;
  totalPot: number;
  dealerSeatIndex: number;
  seats: (TableSeat | null)[];
  spectators: Array<{ id: number; nickname: string; avatar: string }>;
}

// 数据库用户记录
export interface UserRecord {
  id: number;
  username: string;
  password_hash: string;
  nickname: string;
  avatar: string;
  balance: number;
  role: 'player' | 'admin';
  created_at: string;
  updated_at: string;
}

// 筹码流水记录
export interface LedgerRecord {
  id: number;
  user_id: number;
  type: 'recharge' | 'deduct' | 'ante' | 'bet' | 'game_win';
  amount: number;
  balance_after: number;
  description: string | null;
  created_at: string;
}

// 统一 API 响应
export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
}

// JWT 载荷
export interface JwtPayload {
  userId: number;
  username: string;
  role: 'player' | 'admin';
}
