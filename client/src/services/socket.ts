import { io, Socket } from 'socket.io-client';
import { RoomState, CompareResultEvent, GameOverEvent } from '../types/game';
import { useGameStore } from '../store/useGameStore';
import { useAuthStore } from '../store/useAuthStore';
import { sound } from '../audio/SoundManager';

type Ack = { code: number; message?: string; roomId?: string };
class SocketService {
  private socket: Socket | null = null;
  private pending = 0;
  public connect(token: string) {
    this.disconnect();
    useGameStore.setState({ connectionStatus: 'connecting', error: null });
    this.socket = io('/', { auth: { token }, transports: ['websocket'], autoConnect: false });
    const socket = this.socket;
    socket.on('connect', () => {
      useGameStore.getState().clearRoom();
      useGameStore.setState({ connectionStatus: 'connected', error: null });
    });
    socket.on('disconnect', reason => {
      useGameStore.setState({ connectionStatus: 'disconnected' });
      if (reason === 'io server disconnect') useAuthStore.getState().logout();
    });
    socket.io.on('reconnect_attempt', () => useGameStore.setState({ connectionStatus: 'connecting' }));
    socket.on('connect_error', error => {
      useGameStore.setState({ connectionStatus: 'disconnected', error: '连接失败，正在重试…' });
      if (/身份|凭据|用户不存在|Token|未提供/i.test(error.message)) useAuthStore.getState().logout();
    });
    socket.on('error', (error: Ack) => {
      useGameStore.setState({ error: error.message ?? '操作失败' });
      if (error.code === 401) useAuthStore.getState().logout();
    });
    socket.on('room:state', (state: RoomState) => useGameStore.getState().updateRoomState(state));
    socket.on('room:left', () => useGameStore.getState().clearRoom());
    socket.on('game:start', () => {
      sound.playDealCard();
      useGameStore.setState({ flyingChips: [], hasTriggeredFirstGold: false, activePKClash: null, activeSettlement: null, isPKSelecting: false });
    });
    socket.on('game:player_bet', (data: { playerId: number; actionType: 'call' | 'raise' | 'allin'; amount: number; chipOption: number; specialEffect?: string }) => {
      const state = useGameStore.getState();
      const seat = state.roomState?.seats.find(s => s?.user?.id === data.playerId);
      if (seat) state.addFlyingChip(seat.seatIndex, data.chipOption || data.amount, true, data.amount, data.actionType);
      if (data.actionType === 'allin') state.triggerAllInEffect({ playerId: data.playerId, amount: data.amount });
      else if (data.specialEffect === 'gold' || (data.specialEffect === undefined && data.amount >= 5000 && !state.hasTriggeredFirstGold)) state.triggerGoldStreamEffect({ playerId: data.playerId, amount: data.amount });
    });
    socket.on('game:player_looked', (data: { playerId: number }) => { if (data.playerId === useGameStore.getState().currentUser?.id) sound.playFlipCard(); });
    socket.on('game:compare_result', (event: CompareResultEvent) => { sound.playPKClash(); useGameStore.setState({ activePKClash: event }); });
    socket.on('game:over', (event: GameOverEvent) => { sound.playWin(); useGameStore.setState({ activeSettlement: event }); });
    socket.on('chat:emoji_broadcast', (data: { playerId: number; emojiId: string }) => useGameStore.getState().addBubble(data.playerId, 'emoji', data.emojiId));
    socket.on('chat:phrase_broadcast', (data: { playerId: number; text: string }) => useGameStore.getState().addBubble(data.playerId, 'phrase', data.text));
    socket.connect();
  }
  public disconnect() {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.pending = 0;
  }
  private async request(event: string, data?: unknown): Promise<Ack> {
    if (!this.socket?.connected) {
      const error = new Error('网络连接尚未就绪，请等待重连');
      useGameStore.setState({ error: error.message });
      throw error;
    }
    const socket = this.socket;
    this.pending++;
    useGameStore.setState({ actionPending: true, error: null });
    try {
      const result: Ack = await new Promise((resolve, reject) => {
        const callback = (error: Error | null, result: Ack) => error ? reject(new Error('服务器确认超时，请核对最新状态后再操作')) : resolve(result);
        if (data === undefined) socket.timeout(10000).emit(event, callback);
        else socket.timeout(10000).emit(event, data, callback);
      });
      if (result?.code !== 200) {
        if (result?.code === 401) useAuthStore.getState().logout();
        throw new Error(result?.message ?? '操作失败');
      }
      return result;
    } catch (error) {
      if (socket === this.socket) useGameStore.setState({ error: error instanceof Error ? error.message : '操作失败' });
      throw error;
    } finally {
      if (socket === this.socket) { this.pending--; useGameStore.setState({ actionPending: this.pending > 0 }); }
    }
  }
  public createRoom(roomName: string, baseAnte: number, turnSeconds: number, playerCount: number) { return this.request('room:create', { roomName, baseAnte, turnSeconds, playerCount }); }
  public joinRoom(roomId: string) { return this.request('room:join', { roomId }); }
  public leaveRoom() { return this.request('room:leave', {}); }
  public sit(seatIndex: number) { return this.request('room:sit', { seatIndex }); }
  public stand() { return this.request('room:stand'); }
  public ready(isReady: boolean) { return this.request('room:ready', { isReady }); }
  public look() { return this.request('game:look'); }
  public bet(actionType: 'call' | 'raise' | 'allin', chipOption: number) { return this.request('game:bet', { actionType, chipOption }); }
  public fold() { return this.request('game:fold'); }
  public compare(targetPlayerId: number) { return this.request('game:compare', { targetPlayerId }); }
  public sendEmoji(emojiId: string) { this.socket?.emit('chat:emoji', { emojiId }); }
  public sendPhrase(text: string) { this.socket?.emit('chat:phrase', { phraseId: 0, text }); }
}
export const socketService = new SocketService();
