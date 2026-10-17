import { create } from 'zustand';
import { CompareResultEvent, GameOverEvent, RoomState, UserProfile } from '../types/game';
import { MockGameController, MOCK_ME, MockRoomOptions } from './mock/mockGameService';
import { sound } from '../audio/SoundManager';
import { getChipStackCount } from '../components/table/FlyingChipStack';

export interface FloatingBubble {
  id: string;
  playerId: number;
  type: 'emoji' | 'phrase';
  content: string;
  timestamp: number;
}

export interface FlyingChip {
  id: string;
  fromSeatIndex: number;
  seatStackIndex: number; // 当前玩家在本局已摆放的第几摞筹码 (0, 1, 2...)
  toPot: boolean; // true: from player to pot, false: from pot to winner
  chipValue: number;
  actualAmount?: number;
  actionType?: 'call' | 'raise' | 'allin';
  timestamp: number;
}

export interface AllInEffectInfo {
  playerId?: number;
  nickname?: string;
  amount?: number;
}

// 桌面筹码摆放上限阈值：超过后停止新增摆放动画
const MAX_STACKS_PER_SEAT = 15; // 单人面前最多摆放 15 摞筹码（3排×5列筹码墙）
const MAX_PERSONAL_BET_FOR_STACKS = 60000; // 单人累计桌面筹码金额上限
const MAX_TOTAL_TABLE_STACKS = 75; // 全桌总筹码摞数上限
const MAX_POT_FOR_STACKS = 250000; // 底池总额过大上限

let allInTimer: ReturnType<typeof setTimeout> | null = null;
let goldStreamTimer: ReturnType<typeof setTimeout> | null = null;

interface GameStore {
  // 运行模式与基础数据
  isMockMode: boolean;
  currentUser: UserProfile;
  roomState: RoomState;
  mockController: MockGameController | null;

  // 交互与动效状态
  isPKSelecting: boolean; // 是否处于点击对手比牌的选择模式
  activePKClash: CompareResultEvent | null; // 1v1 对撞动画数据
  activeSettlement: GameOverEvent | null; // 终局结算战报
  isAllInTriggered: boolean; // All-in 边缘流光与顶部战报横幅
  allInInfo: AllInEffectInfo | null; // 当前触发全押的玩家与金额信息
  isGoldStreamTriggered: boolean; // 首次 5000+ 全屏大金盛典与锁屏状态
  goldStreamInfo: AllInEffectInfo | null; // 当前触发首次 5000+ 大额加注的玩家与金额信息
  hasTriggeredFirstGold: boolean; // 本局是否已触发过首次 5000+ 大金播报
  floatingBubbles: FloatingBubble[]; // 浮动表情气泡
  flyingChips: FlyingChip[]; // 留在桌面上的玩家下注/加注筹码堆实体
  isMuted: boolean;

  // 动作分发
  toggleMute: () => void;
  createMockRoom: (options: MockRoomOptions) => string;
  setMockSeatCount: (count: number) => void;
  dealCards: () => void;
  lookCards: () => void;
  bet: (actionType: 'call' | 'raise' | 'allin', chipValue: number) => void;
  devToolBet: (actionType: 'call' | 'raise' | 'allin', chipValue: number, fromOpponent?: boolean) => void;
  fold: () => void;
  setPKSelecting: (selecting: boolean) => void;
  compareWithPlayer: (targetPlayerId: number) => void;
  closePKClash: () => void;
  closeSettlement: () => void;
  triggerAllInEffect: (info?: AllInEffectInfo) => void;
  triggerGoldStreamEffect: (info?: AllInEffectInfo) => void;
  sendEmoji: (emoji: string) => void;
  sendPhrase: (phrase: string) => void;
  addFlyingChip: (
    fromSeatIndex: number,
    chipValue: number,
    toPot?: boolean,
    actualAmount?: number,
    actionType?: 'call' | 'raise' | 'allin'
  ) => void;
  updateRoomState: (state: RoomState) => void;
  setCurrentUser: (user: UserProfile) => void;
}

export const useGameStore = create<GameStore>((set, get) => {
  // 初始化 Mock 控制器
  const controller = new MockGameController(
    (updatedState) => {
      const meSeat = updatedState.seats.find((s) => s?.user?.id === get().currentUser.id);
      set((state) => {
        const isNewHandReset =
          updatedState.gameStatus === 'waiting' ||
          updatedState.totalPot === 0 ||
          (updatedState.currentRound === 1 && state.roomState.currentRound > 1);
        return {
          roomState: updatedState,
          activeSettlement: updatedState.gameStatus === 'settling' ? state.mockController?.getLastSettlement() ?? null : null,
          flyingChips: isNewHandReset ? [] : state.flyingChips,
          hasTriggeredFirstGold: isNewHandReset ? false : state.hasTriggeredFirstGold,
          currentUser: meSeat?.user
            ? { ...state.currentUser, balance: meSeat.user.balance }
            : state.currentUser,
        };
      });
    },
    4,
    (betEvent) => {
      get().addFlyingChip(
        betEvent.seatIndex,
        betEvent.chipValue,
        true,
        betEvent.actualAmount,
        betEvent.actionType
      );
      if (betEvent.actionType === 'allin') {
        get().triggerAllInEffect({
          playerId: betEvent.playerId,
          amount: betEvent.actualAmount,
        });
      } else if (
        betEvent.actualAmount >= 5000 &&
        (!get().hasTriggeredFirstGold || betEvent.isDevTool)
      ) {
        set({ hasTriggeredFirstGold: true });
        get().triggerGoldStreamEffect({
          playerId: betEvent.playerId,
          amount: betEvent.actualAmount,
        });
      }
    }
  );

  return {
    isMockMode: true,
    currentUser: MOCK_ME,
    roomState: controller.getState(),
    mockController: controller,

    isPKSelecting: false,
    activePKClash: null,
    activeSettlement: null,
    isAllInTriggered: false,
    allInInfo: null,
    isGoldStreamTriggered: false,
    goldStreamInfo: null,
    hasTriggeredFirstGold: false,
    floatingBubbles: [],
    flyingChips: [],
    isMuted: sound.getMuted(),

    toggleMute: () => {
      const muted = sound.toggleMute();
      set({ isMuted: muted });
    },

    createMockRoom: (options) => controller.createRoom(options),

    setMockSeatCount: (count: number) => {
      const { mockController } = get();
      set({ flyingChips: [], hasTriggeredFirstGold: false });
      if (mockController) {
        mockController.setSeatCount(count);
      }
    },

    dealCards: () => {
      const { mockController } = get();
      set({ flyingChips: [], hasTriggeredFirstGold: false });
      if (mockController) {
        mockController.startDeal();
      }
    },

    lookCards: () => {
      const { mockController, currentUser } = get();
      if (mockController) {
        mockController.lookCards(currentUser.id);
      }
    },

    bet: (actionType, chipValue) => {
      const { mockController, currentUser } = get();
      if (mockController) {
        mockController.bet(currentUser.id, actionType, chipValue);
      }
    },

    devToolBet: (actionType, chipValue, fromOpponent = false) => {
      const { mockController } = get();
      if (mockController) {
        mockController.devToolBet(actionType, chipValue, fromOpponent);
      }
    },

    fold: () => {
      const { mockController, currentUser } = get();
      if (mockController) {
        mockController.fold(currentUser.id);
      }
    },

    setPKSelecting: (selecting) => {
      set({ isPKSelecting: selecting });
    },

    compareWithPlayer: (targetPlayerId) => {
      const { mockController, currentUser, roomState } = get();
      set({ isPKSelecting: false });

      if (mockController) {
        const { winnerId, loserId } = mockController.compare(currentUser.id, targetPlayerId);
        const mySeat = roomState.seats.find((s) => s?.user?.id === currentUser.id);
        const cost = roomState.currentBet * 2 * (mySeat?.hasLooked ? 1 : 0.5);
        const clashEvent: CompareResultEvent = {
          initiatorId: currentUser.id,
          targetId: targetPlayerId,
          winnerId,
          loserId,
          cost,
          totalPot: roomState.totalPot + cost,
        };

        // 弹出 1v1 绝密对撞动画
        set({ activePKClash: clashEvent });
      }
    },

    closePKClash: () => {
      set({ activePKClash: null });
    },

    closeSettlement: () => {
      set({ activeSettlement: null });
    },

    triggerAllInEffect: (info) => {
      sound.playAllIn();
      if (allInTimer) {
        clearTimeout(allInTimer);
      }
      const { roomState } = get();
      const seat =
        info?.playerId !== undefined
          ? roomState.seats.find((s) => s?.user?.id === info.playerId)
          : undefined;
      const resolvedInfo: AllInEffectInfo = {
        playerId: info?.playerId,
        nickname: info?.nickname ?? seat?.user?.nickname,
        amount: info?.amount,
      };
      set({ isAllInTriggered: true, allInInfo: resolvedInfo });
      allInTimer = setTimeout(() => {
        set({ isAllInTriggered: false, allInInfo: null });
        allInTimer = null;
      }, 2000);
    },

    triggerGoldStreamEffect: (info) => {
      if (goldStreamTimer) {
        clearTimeout(goldStreamTimer);
      }
      const { roomState, currentUser } = get();
      const seat =
        info?.playerId !== undefined
          ? roomState.seats.find((s) => s?.user?.id === info.playerId)
          : undefined;
      const resolvedNickname =
        info?.nickname ?? seat?.user?.nickname ?? currentUser.nickname ?? '贵宾玩家';
      const resolvedAmount =
        typeof info?.amount === 'number' && info.amount > 0 ? info.amount : 5000;

      const resolvedInfo: AllInEffectInfo = {
        playerId: info?.playerId,
        nickname: resolvedNickname,
        amount: resolvedAmount,
      };

      // 触发皇家金锣和弦与中文女声播报：“恭喜大金，XXX首次下注XXXX码”
      sound.playFirstGoldAnnouncement(resolvedNickname, resolvedAmount);

      set({ isGoldStreamTriggered: true, goldStreamInfo: resolvedInfo });
      goldStreamTimer = setTimeout(() => {
        set({ isGoldStreamTriggered: false, goldStreamInfo: null });
        goldStreamTimer = null;
      }, 4200);
    },

    sendEmoji: (emoji) => {
      const { currentUser } = get();
      const bubble: FloatingBubble = {
        id: Math.random().toString(36).substring(2, 9),
        playerId: currentUser.id,
        type: 'emoji',
        content: emoji,
        timestamp: Date.now(),
      };
      set((state) => ({
        floatingBubbles: [...state.floatingBubbles, bubble],
      }));
      setTimeout(() => {
        set((state) => ({
          floatingBubbles: state.floatingBubbles.filter((b) => b.id !== bubble.id),
        }));
      }, 2500);
    },

    sendPhrase: (phrase) => {
      const { currentUser } = get();
      const bubble: FloatingBubble = {
        id: Math.random().toString(36).substring(2, 9),
        playerId: currentUser.id,
        type: 'phrase',
        content: phrase,
        timestamp: Date.now(),
      };
      set((state) => ({
        floatingBubbles: [...state.floatingBubbles, bubble],
      }));
      setTimeout(() => {
        set((state) => ({
          floatingBubbles: state.floatingBubbles.filter((b) => b.id !== bubble.id),
        }));
      }, 3500);
    },

    addFlyingChip: (fromSeatIndex, chipValue, toPot = true, actualAmount, actionType) => {
      const effectiveAmount = actualAmount ?? chipValue;
      const { flyingChips, roomState } = get();

      // 统计该座位已摆放的筹码摞数与累计金额
      const seatChips = flyingChips.filter((c) => c.fromSeatIndex === fromSeatIndex);
      const seatAccumulatedAmount = seatChips.reduce(
        (sum, c) => sum + (c.actualAmount ?? c.chipValue),
        0
      );

      // 如果底池总额实在太大，或该加注人面前筹码已经摆满/金额实在太多，则停止继续摆放动画
      if (
        seatChips.length >= MAX_STACKS_PER_SEAT ||
        seatAccumulatedAmount >= MAX_PERSONAL_BET_FOR_STACKS ||
        flyingChips.length >= MAX_TOTAL_TABLE_STACKS ||
        roomState.totalPot >= MAX_POT_FOR_STACKS
      ) {
        return;
      }

      const stackCount = getChipStackCount(effectiveAmount, actionType);
      sound.playChipStack(stackCount);

      const chip: FlyingChip = {
        id: Math.random().toString(36).substring(2, 9),
        fromSeatIndex,
        seatStackIndex: seatChips.length,
        chipValue,
        actualAmount: effectiveAmount,
        actionType,
        toPot,
        timestamp: Date.now(),
      };
      set((state) => ({
        flyingChips: [...state.flyingChips, chip],
      }));
    },

    updateRoomState: (newState) => {
      set((state) => {
        const isNewHandReset =
          newState.gameStatus === 'waiting' ||
          newState.totalPot === 0 ||
          (newState.currentRound === 1 && state.roomState.currentRound > 1);
        return {
          roomState: newState,
          flyingChips: isNewHandReset ? [] : state.flyingChips,
        };
      });
    },

    setCurrentUser: (user) => {
      set({ currentUser: user });
    },
  };
});
