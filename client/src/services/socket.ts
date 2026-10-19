import { io, Socket } from 'socket.io-client';
import { RoomState, CompareResultEvent, GameOverEvent } from '../types/game';
import { useGameStore } from '../store/useGameStore';
import { sound } from '../audio/SoundManager';

class SocketService {
  private socket: Socket | null = null;

  public connect(token: string) {
    if (this.socket) {
      this.socket.disconnect();
    }

    this.socket = io('/', {
      auth: { token },
      transports: ['websocket'],
    });

    this.setupListeners();
  }

  public disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  private setupListeners() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('✅ WebSocket connected successfully');
    });

    this.socket.on('room:state', (state: RoomState) => {
      useGameStore.getState().updateRoomState(state);
    });

    this.socket.on('game:start', () => {
      sound.playDealCard();
      useGameStore.setState({ hasTriggeredFirstGold: false, activePKClash: null, isPKSelecting: false });
    });

    this.socket.on('game:player_looked', (data: { nickname: string }) => {
      console.log(`玩家 ${data.nickname} 已看牌`);
    });

    this.socket.on(
      'game:player_bet',
      (data: {
        playerId: number;
        actionType: 'call' | 'raise' | 'allin';
        amount: number;
        chipOption: number;
        specialEffect?: 'none' | 'gold' | 'allin';
      }) => {
        const state = useGameStore.getState();
        const seat = state.roomState.seats.find((s) => s?.user?.id === data.playerId);
        if (seat) {
          state.addFlyingChip(
            seat.seatIndex,
            Number(data.chipOption) || data.amount,
            true,
            data.amount,
            data.actionType
          );
        } else {
          sound.playChip();
        }

        if (data.actionType === 'allin' || data.specialEffect === 'allin') {
          state.triggerAllInEffect({
            playerId: data.playerId,
            amount: data.amount,
          });
        } else if (
          data.specialEffect === 'gold' ||
          (data.specialEffect === undefined && data.amount >= 5000 && !state.hasTriggeredFirstGold)
        ) {
          useGameStore.setState({ hasTriggeredFirstGold: true });
          state.triggerGoldStreamEffect({
            playerId: data.playerId,
            amount: data.amount,
          });
        }
      }
    );

    this.socket.on('game:compare_result', (result: CompareResultEvent) => {
      sound.playPKClash();
      useGameStore.setState({ activePKClash: result });
    });

    this.socket.on('game:over', (event: GameOverEvent) => {
      sound.playWin();
      useGameStore.setState({ activeSettlement: event });
    });

    this.socket.on('chat:emoji_broadcast', (data: { playerId: number; emojiId: string }) => {
      useGameStore.getState().sendEmoji(data.emojiId);
    });

    this.socket.on('chat:phrase_broadcast', (data: { playerId: number; text: string }) => {
      useGameStore.getState().sendPhrase(data.text);
    });
  }

  // 客户端发出信令
  public createRoom(roomName: string, baseAnte: number, turnSeconds: number) {
    this.socket?.emit('room:create', { roomName, baseAnte, turnSeconds });
  }

  public joinRoom(roomId: string) {
    this.socket?.emit('room:join', { roomId });
  }

  public sit(seatIndex: number) {
    this.socket?.emit('room:sit', { seatIndex });
  }

  public stand() {
    this.socket?.emit('room:stand', {});
  }

  public ready(isReady: boolean) {
    this.socket?.emit('room:ready', { isReady });
  }

  public look() {
    this.socket?.emit('game:look');
  }

  public bet(actionType: 'call' | 'raise' | 'allin', chipOption: number, amount: number) {
    this.socket?.emit('game:bet', { actionType, chipOption, amount });
  }

  public fold() {
    this.socket?.emit('game:fold');
  }

  public compare(targetPlayerId: number) {
    this.socket?.emit('game:compare', { targetPlayerId });
  }

  public sendEmoji(emojiId: string) {
    this.socket?.emit('chat:emoji', { emojiId });
  }

  public sendPhrase(phraseId: number, text: string) {
    this.socket?.emit('chat:phrase', { phraseId, text });
  }
}

export const socketService = new SocketService();
