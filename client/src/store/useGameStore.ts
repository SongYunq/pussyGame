import { create } from 'zustand';
import { CompareResultEvent, GameOverEvent, RoomState, UserProfile } from '../types/game';
import { MockGameController, MOCK_ME } from './mock/mockGameService';
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
  toPot: boolean; // true: from player to pot, false: from pot to winner
  chipValue: number;
  actualAmount?: number;
  actionType?: 'call' | 'raise' | 'allin';
}

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
  isAllInTriggered: boolean; // All-in 暗红雷电全屏震颤
  isGoldStreamTriggered: boolean; // 5000+ 金光粒子横幅
  floatingBubbles: FloatingBubble[]; // 浮动表情气泡
  flyingChips: FlyingChip[]; // 正在飞行的筹码堆动画实体
  isMuted: boolean;

  // 动作分发
  toggleMute: () => void;
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
  triggerAllInEffect: () => void;
  triggerGoldStreamEffect: () => void;
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
      set((state) => ({
        roomState: updatedState,
        currentUser: meSeat?.user
          ? { ...state.currentUser, balance: meSeat.user.balance }
          : state.currentUser,
      }));
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
        get().triggerAllInEffect();
      } else if (betEvent.actualAmount >= 5000 || betEvent.chipValue >= 5000) {
        get().triggerGoldStreamEffect();
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
    isGoldStreamTriggered: false,
    floatingBubbles: [],
    flyingChips: [],
    isMuted: sound.getMuted(),

    toggleMute: () => {
      const muted = sound.toggleMute();
      set({ isMuted: muted });
    },

    setMockSeatCount: (count: number) => {
      const { mockController } = get();
      if (mockController) {
        mockController.setSeatCount(count);
      }
    },

    dealCards: () => {
      const { mockController } = get();
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
        const cost = roomState.currentBet * 2;
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

    triggerAllInEffect: () => {
      sound.playAllIn();
      set({ isAllInTriggered: true });
      setTimeout(() => {
        set({ isAllInTriggered: false });
      }, 1200);
    },

    triggerGoldStreamEffect: () => {
      set({ isGoldStreamTriggered: true });
      setTimeout(() => {
        set({ isGoldStreamTriggered: false });
      }, 2500);
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
      const stackCount = getChipStackCount(effectiveAmount, actionType);
      sound.playChipStack(stackCount);

      const chip: FlyingChip = {
        id: Math.random().toString(36).substring(2, 9),
        fromSeatIndex,
        chipValue,
        actualAmount: effectiveAmount,
        actionType,
        toPot,
      };
      set((state) => ({
        flyingChips: [...state.flyingChips, chip],
      }));
      setTimeout(() => {
        set((state) => ({
          flyingChips: state.flyingChips.filter((c) => c.id !== chip.id),
        }));
      }, 1350);
    },

    updateRoomState: (newState) => {
      set({ roomState: newState });
    },

    setCurrentUser: (user) => {
      set({ currentUser: user });
    },
  };
});
