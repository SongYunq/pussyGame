import { create } from 'zustand';
import { CompareResultEvent, GameOverEvent, RoomState, UserProfile } from '../types/game';
import { sound } from '../audio/SoundManager';
import { getChipStackCount } from '../components/table/FlyingChipStack';
import { socketService } from '../services/socket';
import { useAuthStore } from './useAuthStore';

export interface FloatingBubble { id: string; playerId: number; type: 'emoji' | 'phrase'; content: string; timestamp: number }
export interface FlyingChip { id: string; fromSeatIndex: number; seatStackIndex: number; toPot: boolean; chipValue: number; actualAmount?: number; actionType?: 'call' | 'raise' | 'allin'; timestamp: number }
export interface AllInEffectInfo { playerId?: number; nickname?: string; amount?: number }
interface GameStore {
  currentUser: UserProfile | null;
  roomState: RoomState | null;
  connectionStatus: 'disconnected' | 'connecting' | 'connected';
  actionPending: boolean;
  error: string | null;
  isPKSelecting: boolean;
  activePKClash: CompareResultEvent | null;
  activeSettlement: GameOverEvent | null;
  isAllInTriggered: boolean;
  allInInfo: AllInEffectInfo | null;
  isGoldStreamTriggered: boolean;
  goldStreamInfo: AllInEffectInfo | null;
  hasTriggeredFirstGold: boolean;
  floatingBubbles: FloatingBubble[];
  flyingChips: FlyingChip[];
  isMuted: boolean;
  reset: () => void;
  clearRoom: () => void;
  setCurrentUser: (user: UserProfile) => void;
  updateRoomState: (state: RoomState) => void;
  toggleMute: () => void;
  lookCards: () => void;
  bet: (type: 'call' | 'raise' | 'allin', value: number) => void;
  fold: () => void;
  compareWithPlayer: (id: number) => void;
  setPKSelecting: (value: boolean) => void;
  closePKClash: () => void;
  closeSettlement: () => void;
  sendEmoji: (emoji: string) => void;
  sendPhrase: (phrase: string) => void;
  addBubble: (id: number, type: 'emoji' | 'phrase', content: string) => void;
  addFlyingChip: (index: number, value: number, toPot?: boolean, actualAmount?: number, actionType?: 'call' | 'raise' | 'allin') => void;
  triggerAllInEffect: (info: AllInEffectInfo) => void;
  triggerGoldStreamEffect: (info: AllInEffectInfo) => void;
}
let allInTimer: ReturnType<typeof setTimeout> | undefined;
let goldTimer: ReturnType<typeof setTimeout> | undefined;
const roomUi = () => ({ roomState: null, isPKSelecting: false, activePKClash: null, activeSettlement: null, isAllInTriggered: false, allInInfo: null, isGoldStreamTriggered: false, goldStreamInfo: null, hasTriggeredFirstGold: false, floatingBubbles: [], flyingChips: [] });
const ignore = (promise: Promise<unknown>) => { void promise.catch(() => {}); };

export const useGameStore = create<GameStore>((set, get) => ({
  ...roomUi(), currentUser: null, connectionStatus: 'disconnected', actionPending: false, error: null, isMuted: sound.getMuted(),
  reset: () => { clearTimeout(allInTimer); clearTimeout(goldTimer); set({ ...roomUi(), currentUser: null, connectionStatus: 'disconnected', actionPending: false, error: null }); },
  clearRoom: () => { clearTimeout(allInTimer); clearTimeout(goldTimer); set({ ...roomUi(), error: null }); },
  setCurrentUser: currentUser => set({ currentUser }),
  updateRoomState: roomState => {
    const old = get().roomState;
    const newHand = old?.roomId !== roomState.roomId || roomState.gameStatus === 'waiting' || (roomState.currentRound === 1 && old.currentRound > 1);
    const mine = roomState.seats.find(seat => seat?.user?.id === get().currentUser?.id)?.user;
    set(state => ({ roomState, flyingChips: newHand ? [] : state.flyingChips,
      currentUser: mine && state.currentUser ? { ...state.currentUser, balance: mine.balance } : state.currentUser }));
    if (mine) useAuthStore.getState().updateUser({ balance: mine.balance });
  },
  toggleMute: () => set({ isMuted: sound.toggleMute() }),
  lookCards: () => ignore(socketService.look()),
  bet: (type, value) => ignore(socketService.bet(type, value)),
  fold: () => ignore(socketService.fold()),
  compareWithPlayer: id => { set({ isPKSelecting: false }); ignore(socketService.compare(id)); },
  setPKSelecting: isPKSelecting => set({ isPKSelecting }),
  closePKClash: () => set({ activePKClash: null }),
  closeSettlement: () => set({ activeSettlement: null }),
  sendEmoji: emoji => socketService.sendEmoji(emoji),
  sendPhrase: phrase => socketService.sendPhrase(phrase),
  addBubble: (playerId, type, content) => {
    const id = Math.random().toString(36).slice(2);
    const roomId = get().roomState?.roomId;
    set(state => ({ floatingBubbles: [...state.floatingBubbles, { id, playerId, type, content, timestamp: Date.now() }] }));
    setTimeout(() => { if (get().roomState?.roomId === roomId) set(state => ({ floatingBubbles: state.floatingBubbles.filter(b => b.id !== id) })); }, 3000);
  },
  addFlyingChip: (fromSeatIndex, chipValue, toPot = true, actualAmount, actionType) => {
    const { flyingChips, roomState } = get();
    const seatChips = flyingChips.filter(chip => chip.fromSeatIndex === fromSeatIndex);
    if (!roomState || seatChips.length >= 15 || flyingChips.length >= 75 || roomState.totalPot >= 250000 || seatChips.reduce((sum, chip) => sum + (chip.actualAmount ?? chip.chipValue), 0) >= 60000) return;
    sound.playChipStack(getChipStackCount(actualAmount ?? chipValue, actionType));
    set({ flyingChips: [...flyingChips, { id: Math.random().toString(36).slice(2), fromSeatIndex, seatStackIndex: seatChips.length, chipValue, actualAmount, actionType, toPot, timestamp: Date.now() }] });
  },
  triggerAllInEffect: info => {
    clearTimeout(allInTimer);
    sound.playAllIn();
    set({ isAllInTriggered: true, allInInfo: info });
    allInTimer = setTimeout(() => set({ isAllInTriggered: false, allInInfo: null }), 2000);
  },
  triggerGoldStreamEffect: info => {
    clearTimeout(goldTimer);
    const nickname = info.nickname ?? get().roomState?.seats.find(seat => seat?.user?.id === info.playerId)?.user?.nickname ?? '玩家';
    sound.playFirstGoldAnnouncement(nickname, info.amount ?? 5000);
    set({ hasTriggeredFirstGold: true, isGoldStreamTriggered: true, goldStreamInfo: { ...info, nickname } });
    goldTimer = setTimeout(() => set({ isGoldStreamTriggered: false, goldStreamInfo: null }), 4200);
  },
}));
