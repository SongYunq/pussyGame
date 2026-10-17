import { Card, GameOverEvent, RoomState, TableSeat, UserProfile } from '../../types/game';
import { compareHands } from '../../utils/pokerEvaluator';
import { sound } from '../../audio/SoundManager';

import { createDeck, shuffle, showdownMultiple, splitPot, evaluateHand } from '../../../../server/src/shared/poker';
import { dealHands } from '../../../../server/src/shared/dealing';
import { readLocalAlgorithmConfig } from '../../services/algorithmConfig';

export function generateShuffledDeck(): Card[] { return shuffle(createDeck()); }

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
    deckKind: 'standard',
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

export interface MockBetNotification {
  seatIndex: number;
  playerId: number;
  actionType: 'call' | 'raise' | 'allin';
  chipValue: number;
  actualAmount: number;
  isDevTool?: boolean;
}

/**
 * 纯前端 Mock 游戏控制器
 */
export class MockGameController {
  private state: RoomState;
  private secretCards: Map<number, Card[]> = new Map();
  private onStateChange: (state: RoomState) => void;
  private onPlayerBet?: (event: MockBetNotification) => void;
  private lastSettlement: GameOverEvent | null = null;
  private botTimer: ReturnType<typeof setTimeout> | null = null;
  private hasTriggeredGoldInHand: boolean = false;

  constructor(
    onStateChange: (state: RoomState) => void,
    initialSeatCount = 4,
    onPlayerBet?: (event: MockBetNotification) => void
  ) {
    this.state = createInitialMockRoom(initialSeatCount);
    this.onStateChange = onStateChange;
    this.onPlayerBet = onPlayerBet;
  }

  public getState(): RoomState {
    return this.state;
  }

  private clearBotTimer() {
    if (this.botTimer) {
      clearTimeout(this.botTimer);
      this.botTimer = null;
    }
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
    this.clearBotTimer();
    this.state = createInitialMockRoom(count);
    this.secretCards.clear();
    this.hasTriggeredGoldInHand = false;
    this.onStateChange(this.state);
  }

  /**
   * 一键发牌开局
   */
  public startDeal() {
    this.clearBotTimer();
    const participating = this.state.seats.filter(seat => seat?.user);
    const deal = dealHands(participating.length, readLocalAlgorithmConfig());
    let handIndex = 0;
    this.lastSettlement = null;
    this.secretCards.clear();
    this.hasTriggeredGoldInHand = false;

    sound.playDealCard();

    this.update((draft) => {
      draft.gameStatus = 'playing';
      draft.deckKind = deal.deckKind;
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

          const cards = deal.hands[handIndex++].cards;
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
    this.clearBotTimer();
    let notification: MockBetNotification | null = null;

    this.update((draft) => {
      const seat = draft.seats.find((s) => s?.user?.id === playerId);
      if (!seat || !seat.user) return;

      const betMultiplier = seat.hasLooked ? 1 : 0.5;
      let betAmount = chipValue;
      if (actionType === 'call') {
        betAmount = draft.currentBet * betMultiplier;
      } else if (actionType === 'raise') {
        draft.currentBet = Math.max(draft.currentBet, chipValue);
        betAmount = chipValue * betMultiplier;
      } else if (actionType === 'allin') {
        betAmount = seat.user.balance;
        draft.currentBet = Math.max(draft.currentBet, betAmount / betMultiplier);
      }

      betAmount = Math.min(betAmount, seat.user.balance);
      seat.user.balance -= betAmount;
      seat.currentInvested += betAmount;
      draft.totalPot += betAmount;

      notification = {
        seatIndex: seat.seatIndex,
        playerId,
        actionType,
        chipValue,
        actualAmount: betAmount,
      };

      if (draft.gameStatus === 'playing') {
        this.advanceTurn(draft);
      }
    });

    let isFirstGold = false;
    if (notification) {
      const betInfo = notification as MockBetNotification;
      if (betInfo.actionType !== 'allin' && betInfo.actualAmount >= 5000 && !this.hasTriggeredGoldInHand) {
        this.hasTriggeredGoldInHand = true;
        isFirstGold = true;
      }
      if (this.onPlayerBet) {
        this.onPlayerBet(betInfo);
      }
    }

    this.scheduleBotTurnIfNeeded(isFirstGold ? 4300 : 1150);
  }

  /**
   * 仅供 DevTool 调测台使用的独立筹码动画测试方法（不影响主流程出牌轮转与真实余额限制）
   */
  public devToolBet(
    actionType: 'call' | 'raise' | 'allin',
    chipValue: number,
    fromOpponent = false
  ) {
    this.clearBotTimer();
    let notification: MockBetNotification | null = null;

    this.update((draft) => {
      let targetSeat: TableSeat | undefined;

      if (fromOpponent) {
        const opponents = draft.seats.filter(
          (s): s is TableSeat => Boolean(s && s.user && s.user.id !== MOCK_ME.id)
        );
        if (opponents.length > 0) {
          targetSeat = opponents[Math.floor(Math.random() * opponents.length)];
        }
      } else {
        targetSeat = draft.seats.find((s) => s?.user?.id === MOCK_ME.id) || undefined;
      }

      if (!targetSeat || !targetSeat.user) return;

      // 调测台模式下自动保持充足测试余额，避免狂点耗尽余额导致主流程或动画异常
      if (targetSeat.user.balance < chipValue) {
        targetSeat.user.balance = Math.max(10000, chipValue * 2);
      }

      const displayAmount =
        actionType === 'allin'
          ? 5000
          : chipValue >= 5000 || targetSeat.hasLooked
            ? chipValue
            : chipValue * 0.5;

      draft.totalPot += displayAmount;

      notification = {
        seatIndex: targetSeat.seatIndex,
        playerId: targetSeat.user.id,
        actionType,
        chipValue,
        actualAmount: displayAmount,
        isDevTool: true,
      };
    });

    if (notification && this.onPlayerBet) {
      this.onPlayerBet(notification);
    }
  }

  /**
   * 弃牌
   */
  public fold(playerId: number) {
    this.clearBotTimer();
    this.update((draft) => {
      const seat = draft.seats.find((s) => s?.user?.id === playerId);
      if (seat) {
        seat.status = 'folded';
      }
      this.checkWinnerOrAdvance(draft);
    });
    this.scheduleBotTurnIfNeeded();
  }

  /**
   * 发起比牌 PK
   */
  public compare(initiatorId: number, targetId: number): { winnerId: number; loserId: number } {
    this.clearBotTimer();
    sound.playPKClash();

    const cardsA = this.secretCards.get(initiatorId);
    const cardsB = this.secretCards.get(targetId);
    let winnerId = initiatorId;
    let loserId = targetId;

    if (cardsA && cardsB) {
      const res = compareHands(cardsA, cardsB, true, this.state.deckKind);
      if (res < 0) {
        winnerId = targetId;
        loserId = initiatorId;
      }
    }

    this.update((draft) => {
      const seat = draft.seats.find((s) => s?.user?.id === initiatorId);
      if (seat && seat.user) {
        const cost = draft.currentBet * 2 * (seat.hasLooked ? 1 : 0.5);
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

    this.scheduleBotTurnIfNeeded();
    return { winnerId, loserId };
  }

  /**
   * 终局胜出结算
   */
  public triggerSettlement(winnerId: number) {
    this.clearBotTimer();
    this.update(draft => this.settleDraft(draft, [winnerId], 'last_survivor'));
  }

  public getLastSettlement(): GameOverEvent | null { return this.lastSettlement; }

  private settleDraft(draft: RoomState, winnerIds: number[], reason: GameOverEvent['reason']) {
    if (draft.gameStatus === 'settling') return;
    sound.playWin();
    draft.gameStatus = 'settling';
    draft.currentTurnPlayerId = null;
    draft.turnDeadline = null;
    const payouts = splitPot(draft.totalPot, winnerIds);
    for (const payout of payouts) {
      const seat = draft.seats.find(s => s?.user?.id === payout.playerId);
      if (seat?.user) seat.user.balance += payout.amount;
    }
    const revealedCards = draft.seats.filter(s => s?.user && (reason === 'max_round_showdown' ? s.status === 'active' : winnerIds.includes(s.user.id))).flatMap(seat => {
      const cards = this.secretCards.get(seat!.user!.id);
      if (!cards) return [];
      const evaluation = evaluateHand(cards, draft.deckKind);
      return [{ playerId: seat!.user!.id, cards, handType: evaluation.type, handTypeName: evaluation.typeName }];
    });
    this.lastSettlement = { winnerId: winnerIds.length === 1 ? winnerIds[0] : null, winnerIds, payouts, splitPot: winnerIds.length > 1, winAmount: draft.totalPot, reason, revealedCards };
  }

  private advanceTurn(draft: RoomState) {
    const activeSeats = draft.seats.filter((s) => s && s.user && s.status === 'active');
    if (activeSeats.length <= 1) {
      this.checkWinnerOrAdvance(draft);
      return;
    }

    const currentSeatIndex = draft.seats.findIndex((s) => s?.user?.id === draft.currentTurnPlayerId);
    const startIdx = currentSeatIndex >= 0 ? currentSeatIndex : 0;
    let nextIndex = (startIdx + 1) % 8;
    while (!draft.seats[nextIndex] || draft.seats[nextIndex]?.status !== 'active') {
      nextIndex = (nextIndex + 1) % 8;
    }

    if (nextIndex <= startIdx) {
      draft.currentRound++;
      if (draft.currentRound > 20) {
        const result = showdownMultiple(activeSeats.map(seat => ({ id: seat!.user!.id, cards: this.secretCards.get(seat!.user!.id)! })), draft.deckKind);
        this.settleDraft(draft, result.winnerIds, 'max_round_showdown');
        return;
      }
    }

    draft.currentTurnPlayerId = draft.seats[nextIndex]!.user!.id;
    draft.turnDeadline = Date.now() + draft.turnSeconds * 1000;
  }

  private scheduleBotTurnIfNeeded(delayMs = 1150) {
    this.clearBotTimer();
    if (this.state.gameStatus !== 'playing') return;

    const turnPlayerId = this.state.currentTurnPlayerId;
    if (!turnPlayerId || turnPlayerId === MOCK_ME.id) return;

    this.botTimer = setTimeout(() => {
      if (this.state.gameStatus !== 'playing') return;
      const botId = this.state.currentTurnPlayerId;
      if (!botId || botId === MOCK_ME.id) return;

      const seat = this.state.seats.find((s) => s?.user?.id === botId);
      if (!seat || !seat.user || seat.status !== 'active') return;

      // 机器人有一定概率先看牌
      if (!seat.hasLooked && Math.random() < 0.3) {
        this.lookCards(botId);
      }

      // 机器人决策：约 35% 概率加注到更高一档，其余跟注
      const raiseTiers = [20, 50, 100, 500, 1000];
      const nextTier = raiseTiers.find((t) => t > this.state.currentBet);
      const hasLooked = this.state.seats.find((s) => s?.user?.id === botId)?.hasLooked;
      const shouldRaise = nextTier !== undefined && Math.random() < 0.35 && seat.user.balance >= nextTier * (hasLooked ? 1 : 0.5);

      if (shouldRaise && nextTier) {
        this.bet(botId, 'raise', nextTier);
      } else {
        this.bet(botId, 'call', this.state.currentBet);
      }
    }, delayMs);
  }

  private checkWinnerOrAdvance(draft: RoomState) {
    const activeSeats = draft.seats.filter((s) => s && s.user && s.status === 'active');
    if (activeSeats.length === 1 && activeSeats[0]?.user) {
      this.settleDraft(draft, [activeSeats[0].user.id], 'last_survivor');
    } else {
      this.advanceTurn(draft);
    }
  }

  public getSecretHand(playerId: number): Card[] | undefined {
    return this.secretCards.get(playerId);
  }
}
