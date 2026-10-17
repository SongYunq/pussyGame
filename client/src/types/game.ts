import type { DeckKind } from '../../../server/src/shared/poker';
// 卡牌花色定义 (黑桃, 红桃, 梅花, 方块)
export type CardSuit = 'spades' | 'hearts' | 'clubs' | 'diamonds';

// 卡牌结构 (rank: 2~14，14 代表 A)
export interface Card {
  suit: CardSuit;
  rank: number;
}

// 牌型等级定义
export type HandRankType =
  | 'special_235'      // 特殊 235 (花色不全相同 235 遇豹子逆袭)
  | 'high_card'        // 单张 (散牌)
  | 'pair'             // 对子
  | 'straight'         // 顺子
  | 'flush'            // 金花
  | 'straight_flush'   // 顺金
  | 'leopard';         // 豹子 (三张相同)

export interface HandEvaluation {
  type: HandRankType;
  name: string;
  score: number;
}

// 玩家在桌状态
export type PlayerTableStatus =
  | 'empty'
  | 'sitting'
  | 'ready'
  | 'active'
  | 'folded'
  | 'lost';

// 玩家基础信息
export interface UserProfile {
  id: number;
  username: string;
  nickname: string;
  avatar: string;
  balance: number;
  role: 'player' | 'admin';
}

// 桌位信息
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

// 房间全量状态快照
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

// 个人流水账单明细
export interface LedgerItem {
  id: number;
  type: 'recharge' | 'deduct' | 'ante' | 'bet' | 'game_win';
  amount: number;
  balanceAfter: number;
  description: string;
  createdAt: string;
}

// 1v1 比牌对决事件广播数据
export interface CompareResultEvent {
  initiatorId: number;
  targetId: number;
  winnerId: number;
  loserId: number;
  cost: number;
  totalPot: number;
}

// 终局亮牌手牌
export interface RevealedHand {
  playerId: number;
  cards: Card[];
  handType: HandRankType;
  handTypeName: string;
}

// 终局结算事件广播数据
export interface GameOverEvent {
  winnerId: number | null;
  winnerIds: number[];
  payouts: Array<{ playerId: number; amount: number }>;
  splitPot: boolean;
  winAmount: number;
  reason: 'last_survivor' | 'max_round_showdown';
  revealedCards: RevealedHand[];
}

// 下注操作类型
export type BetActionType = 'call' | 'raise' | 'allin';
