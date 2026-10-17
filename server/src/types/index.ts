import type { DeckKind } from '../shared/poker.js';
export type { CardSuit, Card, HandRankType, EvaluatedHand as HandEvaluation } from '../shared/poker.js';
import type { Card } from '../shared/poker.js';

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
  deckKind: DeckKind;
  baseAnte: number;
  turnSeconds: number; // 0 表示思考时间无限制
  gameStatus: 'waiting' | 'playing' | 'settling';
  currentRound: number;
  currentTurnPlayerId: number | null;
  turnDeadline: number | null;
  currentBet: number;       // 明牌单注基准，闷牌下注为其一半；不影响开局底注
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
