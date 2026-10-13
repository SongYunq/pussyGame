import { Card, CardSuit, RoomState, TableSeat, UserProfile } from '../../types/game';
import { compareHands } from '../../utils/pokerEvaluator';
import { sound } from '../../audio/SoundManager';

const SUITS: CardSuit[] = ['spades', 'hearts', 'clubs', 'diamonds'];

/**
 * 生成洗乱的 52 张标准扑克牌 (Fisher-Yates 算法)
 */
export function generateShuffledDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 2; rank <= 14; rank++) {
      deck.push({ suit, rank });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export const MOCK_ME: UserProfile = {
  id: 1,
  username: 'zhangsan',
  nickname: '绝世赌神张三',
  avatar: '👑',
  balance: 10000,
  role: 'admin',
};

const BOT_USERS = [
  { id: 2, nickname: '狂暴牌手小李', avatar: '🦁', balance: 8500 },
  { id: 3, nickname: '沉稳老王', avatar: '🦊', balance: 12000 },
  { id: 4, nickname: '梭哈大师阿强', avatar: '🐯', balance: 6400 },
  { id: 5, nickname: '幸运女神小美', avatar: '🌸', balance: 9300 },
  { id: 6, nickname: '赌王陈小刀', avatar: '⚡', balance: 15000 },
  { id: 7, nickname: '老友张三丰', avatar: '☯️', balance: 7700 },
  { id: 8, nickname: '暗夜刺客夜神', avatar: '🥷', balance: 5000 },
];

/**
 * 创建预设的 Mock 房间状态 (默认 4 人在桌)
 */
export function createInitialMockRoom(seatCount = 4): RoomState {
  const seats: (TableSeat | null)[] = Array(8).fill(null);

  // 座位 0 永远是当前玩家
  seats[0] = {
    seatIndex: 0,
    user: {
      id: MOCK_ME.id,
      nickname: MOCK_ME.nickname,
      avatar: MOCK_ME.avatar,
      balance: MOCK_ME.balance,
    },
    status: 'ready',
    hasLooked: false,
    cards: null,
    currentInvested: 0,
    isReady: true,
  };

  // 其余座位填充模拟对手
  for (let i = 1; i < seatCount && i < 8; i++) {
    const bot = BOT_USERS[i - 1];
    seats[i] = {
      seatIndex: i,
      user: {
        id: bot.id,
        nickname: bot.nickname,
        avatar: bot.avatar,
        balance: bot.balance,
      },
      status: 'ready',
      hasLooked: false,
      cards: null,
      currentInvested: 0,
      isReady: true,
    };
  }

  return {
    roomId: '8888',
    roomName: '老友至尊局',
    baseAnte: 10,
    turnSeconds: 20,
    gameStatus: 'waiting',
    currentRound: 1,
    currentTurnPlayerId: 1,
    turnDeadline: null,
    currentBet: 10,
    totalPot: 0,
    dealerSeatIndex: 0,
    seats,
    spectators: [
      { id: 99, nickname: '围观群众吃瓜仔', avatar: '🍉' },
    ],
  };
}

/**
 * 纯前端 Mock 游戏控制器
 */
export class MockGameController {
  private state: RoomState;
  private secretCards: Map<number, Card[]> = new Map();
  private onStateChange: (state: RoomState) => void;

  constructor(onStateChange: (state: RoomState) => void, initialSeatCount = 4) {
    this.state = createInitialMockRoom(initialSeatCount);
    this.onStateChange = onStateChange;
  }

  public getState(): RoomState {
    return this.state;
  }

  private update(updater: (draft: RoomState) => void) {
    const next = JSON.parse(JSON.stringify(this.state)) as RoomState;
    updater(next);
    this.state = next;
    this.onStateChange(this.state);
  }

  /**
   * 重设在座人数 (2~8 人) 测试自适应桌位排布
   */
  public setSeatCount(count: number) {
    this.state = createInitialMockRoom(count);
    this.secretCards.clear();
    this.onStateChange(this.state);
  }

  /**
   * 一键发牌开局
   */
  public startDeal() {
    const deck = generateShuffledDeck();
    let cardIdx = 0;
    this.secretCards.clear();

    sound.playDealCard();

    this.update((draft) => {
      draft.gameStatus = 'playing';
      draft.currentRound = 1;
      draft.currentBet = draft.baseAnte;
      draft.totalPot = 0;
      draft.currentTurnPlayerId = MOCK_ME.id;
      draft.turnDeadline = Date.now() + draft.turnSeconds * 1000;

      draft.seats.forEach((seat) => {
        if (seat && seat.user) {
          seat.status = 'active';
          seat.hasLooked = false;
          seat.currentInvested = draft.baseAnte;
          seat.user.balance -= draft.baseAnte;
          draft.totalPot += draft.baseAnte;

          const cards = [deck[cardIdx++], deck[cardIdx++], deck[cardIdx++]];
          this.secretCards.set(seat.user.id, cards);

          // 仅本人在发牌后持有自己的手牌
          if (seat.user.id === MOCK_ME.id) {
            seat.cards = cards;
          } else {
            seat.cards = null;
          }
        }
      });
    });
  }

  /**
   * 看牌
   */
  public lookCards(playerId: number) {
    sound.playFlipCard();
    this.update((draft) => {
      const seat = draft.seats.find((s) => s?.user?.id === playerId);
      if (seat) {
        seat.hasLooked = true;
        if (playerId === MOCK_ME.id) {
          seat.cards = this.secretCards.get(playerId) || null;
        }
      }
    });
  }

  /**
   * 下注 / 加注 / All-in
   */
  public bet(playerId: number, actionType: 'call' | 'raise' | 'allin', chipValue: number) {
    sound.playChip();
    if (actionType === 'allin' || chipValue >= 5000) {
      if (actionType === 'allin') sound.playAllIn();
    }

    this.update((draft) => {
      const seat = draft.seats.find((s) => s?.user?.id === playerId);
      if (!seat || !seat.user) return;

      let betAmount = chipValue;
      if (actionType === 'call') {
        betAmount = seat.hasLooked ? draft.currentBet * 2 : draft.currentBet;
      } else if (actionType === 'raise') {
        draft.currentBet = chipValue;
        betAmount = seat.hasLooked ? draft.currentBet * 2 : draft.currentBet;
      } else if (actionType === 'allin') {
        betAmount = seat.user.balance;
      }

      betAmount = Math.min(betAmount, seat.user.balance);
      seat.user.balance -= betAmount;
      seat.currentInvested += betAmount;
      draft.totalPot += betAmount;

      this.advanceTurn(draft);
    });
  }

  /**
   * 弃牌
   */
  public fold(playerId: number) {
    this.update((draft) => {
      const seat = draft.seats.find((s) => s?.user?.id === playerId);
      if (seat) {
        seat.status = 'folded';
      }
      this.checkWinnerOrAdvance(draft);
    });
  }

  /**
   * 发起比牌 PK
   */
  public compare(initiatorId: number, targetId: number): { winnerId: number; loserId: number } {
    sound.playPKClash();

    const cardsA = this.secretCards.get(initiatorId);
    const cardsB = this.secretCards.get(targetId);
    let winnerId = initiatorId;
    let loserId = targetId;

    if (cardsA && cardsB) {
      const res = compareHands(cardsA, cardsB, true);
      if (res < 0) {
        winnerId = targetId;
        loserId = initiatorId;
      }
    }

    this.update((draft) => {
      const seat = draft.seats.find((s) => s?.user?.id === initiatorId);
      if (seat && seat.user) {
        const cost = seat.hasLooked ? draft.currentBet * 4 : draft.currentBet * 2;
        seat.user.balance = Math.max(0, seat.user.balance - cost);
        seat.currentInvested += cost;
        draft.totalPot += cost;
      }

      const loserSeat = draft.seats.find((s) => s?.user?.id === loserId);
      if (loserSeat) {
        loserSeat.status = 'lost';
      }

      this.checkWinnerOrAdvance(draft);
    });

    return { winnerId, loserId };
  }

  /**
   * 终局胜出结算
   */
  public triggerSettlement(winnerId: number) {
    sound.playWin();
    this.update((draft) => {
      draft.gameStatus = 'settling';
      const winnerSeat = draft.seats.find((s) => s?.user?.id === winnerId);
      if (winnerSeat && winnerSeat.user) {
        winnerSeat.user.balance += draft.totalPot;
      }
    });
  }

  private advanceTurn(draft: RoomState) {
    const activeSeats = draft.seats.filter((s) => s && s.user && s.status === 'active');
    if (activeSeats.length <= 1) {
      this.checkWinnerOrAdvance(draft);
      return;
    }

    const currentSeatIndex = draft.seats.findIndex((s) => s?.user?.id === draft.currentTurnPlayerId);
    let nextIndex = (currentSeatIndex + 1) % 8;
    while (!draft.seats[nextIndex] || draft.seats[nextIndex]?.status !== 'active') {
      nextIndex = (nextIndex + 1) % 8;
    }

    draft.currentTurnPlayerId = draft.seats[nextIndex]!.user!.id;
    draft.turnDeadline = Date.now() + draft.turnSeconds * 1000;
  }

  private checkWinnerOrAdvance(draft: RoomState) {
    const activeSeats = draft.seats.filter((s) => s && s.user && s.status === 'active');
    if (activeSeats.length === 1 && activeSeats[0]?.user) {
      this.triggerSettlement(activeSeats[0].user.id);
    } else {
      this.advanceTurn(draft);
    }
  }

  public getSecretHand(playerId: number): Card[] | undefined {
    return this.secretCards.get(playerId);
  }
}
