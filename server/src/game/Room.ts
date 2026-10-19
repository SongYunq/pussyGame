import { Server } from 'socket.io';
import { Card, CompareResultEvent, RoomState, TableSeat } from '../types/index.js';
import { DeckKind, splitPot } from '../shared/poker.js';
import { dealHands } from '../shared/dealing.js';
import { AlgorithmModel } from '../models/algorithmModel.js';
import { getDb } from '../db/database.js';
import { GameReferee } from './GameReferee.js';
import { UserModel } from '../models/userModel.js';

export interface RoomOptions {
  roomId: string;
  roomName: string;
  baseAnte: number;
  turnSeconds: number;
  playerCount?: number;
  io?: Server;
}

export class Room {
  public roomId: string;
  public roomName: string;
  public baseAnte: number;
  public turnSeconds: number;
  public playerCount: number;
  public gameStatus: 'waiting' | 'playing' | 'settling' = 'waiting';
  public deckKind: DeckKind = 'standard';
  public currentRound: number = 0;
  public currentTurnPlayerId: number | null = null;
  public turnDeadline: number | null = null;
  public currentBet: number = 10;
  public totalPot: number = 0;
  public dealerSeatIndex: number = 0;
  public seats: (TableSeat | null)[] = Array(8).fill(null);
  public spectators: Map<number, { id: number; nickname: string; avatar: string }> = new Map();

  private turnTimer: NodeJS.Timeout | null = null;
  private settlingTimer: NodeJS.Timeout | null = null;
  private pendingTurnPlayerIds: Set<number> = new Set();
  private hasTriggeredFirstGold: boolean = false;
  private comparisonWins: Map<number, Set<number>> = new Map();
  private io?: Server;

  constructor(options: RoomOptions) {
    this.roomId = options.roomId;
    this.roomName = options.roomName;
    this.baseAnte = options.baseAnte;
    this.turnSeconds = options.turnSeconds;
    this.playerCount = options.playerCount ?? 2;
    if (!Number.isInteger(this.playerCount) || this.playerCount < 2 || this.playerCount > 8) {
      throw new Error('房间人数必须为 2～8 的整数');
    }
    this.currentBet = options.baseAnte;
    this.io = options.io;
  }

  public setIo(io: Server) {
    this.io = io;
  }

  public dispose(): void {
    this.clearTurnTimer();
    if (this.settlingTimer) {
      clearTimeout(this.settlingTimer);
      this.settlingTimer = null;
    }
  }

  /**
   * 添加观战者
   */
  public addSpectator(user: { id: number; nickname: string; avatar: string }) {
    this.spectators.set(user.id, { id: user.id, nickname: user.nickname, avatar: user.avatar });
  }

  /**
   * 移除观战者
   */
  public removeSpectator(userId: number) {
    this.spectators.delete(userId);
  }

  /**
   * 玩家入座
   */
  public sit(userId: number, seatIndex: number): void {
    if (this.gameStatus !== 'waiting') throw new Error('请等待本局结束后入座');
    if (!Number.isInteger(seatIndex) || seatIndex < 0 || seatIndex >= 8) {
      throw new Error('无效的座位号');
    }
    if (this.seats[seatIndex] !== null) {
      throw new Error('该座位已被占用');
    }

    if (this.findSeatIndexByUserId(userId) === -1 && this.seats.filter(Boolean).length >= this.playerCount) {
      throw new Error('房间座位已满，可继续观战');
    }

    const userRecord = UserModel.findById(userId);
    if (!userRecord) {
      throw new Error('用户不存在');
    }

    const minChips = this.baseAnte * 10;
    if (userRecord.balance < minChips) {
      throw new Error(`筹码不足，至少需要 ${minChips} 筹码方可入座`);
    }

    // 从原有的其它座位站起
    this.stand(userId, false);
    // 从观战席移除
    this.removeSpectator(userId);

    this.seats[seatIndex] = {
      seatIndex,
      user: {
        id: userRecord.id,
        nickname: userRecord.nickname,
        avatar: userRecord.avatar,
        balance: userRecord.balance,
      },
      status: 'sitting',
      hasLooked: false,
      cards: null,
      currentInvested: 0,
      isReady: false,
    };
  }

  /**
   * 玩家离座
   */
  public stand(userId: number, addToSpectators: boolean = true): void {
    const seatIdx = this.findSeatIndexByUserId(userId);
    if (seatIdx === -1) return;

    const seat = this.seats[seatIdx];
    if (seat) {
      // 若在游戏中离座，视同弃牌
      if (this.gameStatus === 'playing' && seat.status === 'active') {
        this.fold(userId, 'manual');
      }

      const userData = seat.user;
      this.seats[seatIdx] = null;

      if (addToSpectators && userData) {
        this.addSpectator(userData);
      }
    }
  }

  /**
   * 准备或取消准备
   */
  public setReady(userId: number, isReady: boolean): void {
    if (typeof isReady !== 'boolean') {
      throw new Error('准备状态必须为布尔值');
    }
    if (this.gameStatus !== 'waiting') {
      throw new Error('游戏进行中，无法更改准备状态');
    }

    const seatIdx = this.findSeatIndexByUserId(userId);
    if (seatIdx === -1) {
      throw new Error('您未入座');
    }

    const seat = this.seats[seatIdx]!;
    seat.isReady = isReady;
    seat.status = isReady ? 'ready' : 'sitting';

    this.checkAutoStart();
  }

  /**
   * 检查是否可以自动开局 (达到指定人数、全员在线且全部就绪)
   */
  private checkAutoStart(): void {
    const seatedPlayers = this.seats.filter((s): s is TableSeat => s !== null);
    const readyPlayers = seatedPlayers.filter((s) => s.isReady);

    if (seatedPlayers.length === this.playerCount && readyPlayers.length === this.playerCount &&
        seatedPlayers.every(seat => !this.io || this.findSocketIdsByUserId(seat.user!.id).length > 0)) {
      this.startGame();
    }
  }

  /**
   * 开始牌局
   */
  public startGame(): void {
    if (this.gameStatus !== 'waiting') return;

    const readySeats = this.seats.filter((s): s is TableSeat => s !== null && s.isReady);
    if (readySeats.length !== this.playerCount || this.seats.filter(Boolean).length !== this.playerCount ||
        readySeats.some(seat => this.io && this.findSocketIdsByUserId(seat.user!.id).length === 0)) return;

    // 发牌前重新确认实际可参与人数，避免扣款失败后出现单人或空局。
    const activeSeats = readySeats.filter(seat => {
      const user = UserModel.findById(seat.user!.id);
      if (!user || user.balance < this.baseAnte) {
        seat.status = 'sitting';
        seat.isReady = false;
        seat.cards = null;
        if (user) seat.user!.balance = user.balance;
        return false;
      }
      return true;
    });
    if (activeSeats.length !== this.playerCount) { this.broadcastState(); return; }

    // 先生成完整合法手牌；配置或选牌失败时不扣除任何底注。
    const deal = dealHands(activeSeats.length, AlgorithmModel.getConfig());
    const payments = getDb().transaction(() => activeSeats.map(seat => UserModel.changeBalance(
      seat.user!.id, -this.baseAnte, 'ante', `第 ${this.roomId} 房间底注扣除`, { roomId: this.roomId }
    )))();

    if (this.settlingTimer) { clearTimeout(this.settlingTimer); this.settlingTimer = null; }
    this.gameStatus = 'playing';
    this.currentRound = 1;
    this.currentBet = this.baseAnte;
    this.totalPot = this.baseAnte * activeSeats.length;
    this.deckKind = deal.deckKind;
    this.hasTriggeredFirstGold = false;
    this.comparisonWins.clear();
    activeSeats.forEach((seat, index) => {
      seat.user!.balance = payments[index].balance;
      seat.currentInvested = this.baseAnte;
      seat.status = 'active';
      seat.hasLooked = false;
      seat.cards = deal.hands[index].cards;
    });

    // 3. 确定首轮出牌人（庄家顺时针下一位）
    const activeIndices = activeSeats.map((s) => s.seatIndex);
    let nextTurnIdx = activeIndices.find((idx) => idx > this.dealerSeatIndex);
    if (nextTurnIdx === undefined) {
      nextTurnIdx = activeIndices[0];
    }

    const currentSeat = this.seats[nextTurnIdx]!;
    this.currentTurnPlayerId = currentSeat.user!.id;
    this.pendingTurnPlayerIds = new Set(activeSeats.map(seat => seat.user!.id));

    // 4. 发送开局广播并开启倒计时
    this.startTurnTimer();

    if (this.io) {
      // 独立向每个在座玩家单发其自身底牌
      for (const seat of activeSeats) {
        for (const socketId of this.findSocketIdsByUserId(seat.user!.id)) {
          this.io.to(socketId).emit('game:start', {
            round: 1,
            dealerId: this.seats[this.dealerSeatIndex]?.user?.id || currentSeat.user!.id,
            baseAnte: this.baseAnte,
            totalPot: this.totalPot,
            handCards: seat.cards,
            deckKind: this.deckKind,
          });
        }
      }
      this.broadcastState();
    }
  }

  /**
   * 看牌操作
   */
  public lookCards(userId: number): Card[] {
    if (this.gameStatus !== 'playing') {
      throw new Error('游戏未在进行中');
    }
    const seatIdx = this.findSeatIndexByUserId(userId);
    if (seatIdx === -1) {
      throw new Error('未入座');
    }

    const seat = this.seats[seatIdx]!;
    if (seat.status !== 'active') {
      throw new Error('未在当前对局中');
    }
    if (seat.hasLooked) {
      return seat.cards!;
    }

    seat.hasLooked = true;

    if (this.io) {
      this.io.to(`room:${this.roomId}`).emit('game:player_looked', {
        playerId: userId,
        nickname: seat.user!.nickname,
      });
      this.broadcastState();
    }

    return seat.cards!;
  }

  /**
   * 玩家下注/加注/全押
   */
  public bet(
    userId: number,
    actionType: 'call' | 'raise' | 'allin',
    chipOption: number | string,
    amount?: number
  ): void {
    if (this.gameStatus !== 'playing') {
      throw new Error('游戏未在进行中');
    }
    if (this.currentTurnPlayerId !== userId) {
      throw new Error('还没轮到您的出牌回合');
    }
    if (!['call', 'raise', 'allin'].includes(actionType)) {
      throw new Error('无效的下注类型');
    }

    const seatIdx = this.findSeatIndexByUserId(userId);
    if (seatIdx === -1 || this.seats[seatIdx]?.status !== 'active') {
      throw new Error('未在当前对局中');
    }
    const seat = this.seats[seatIdx]!;
    const user = UserModel.findById(userId);
    if (!user) throw new Error('用户不存在');
    seat.user!.balance = user.balance;
    const betMultiplier = seat.hasLooked ? 1 : 0.5;

    let payAmount = 0;
    let nextBet = this.currentBet;

    if (actionType === 'call') {
      payAmount = this.currentBet * betMultiplier;
    } else if (actionType === 'raise') {
      const targetBet = typeof chipOption === 'number' || typeof chipOption === 'string' ? Number(chipOption) : NaN;
      if (!Number.isFinite(targetBet) || targetBet > Number.MAX_SAFE_INTEGER || targetBet <= this.currentBet) {
        throw new Error('加注档位必须大于当前单注');
      }
      nextBet = targetBet;
      payAmount = targetBet * betMultiplier;
    } else if (actionType === 'allin') {
      payAmount = seat.user!.balance;
      if (payAmount <= 0) {
        throw new Error('筹码不足');
      }
      const effectiveBet = payAmount / betMultiplier;
      nextBet = Math.max(this.currentBet, effectiveBet);
    }

    if (!Number.isFinite(payAmount) || payAmount <= 0 || payAmount > Number.MAX_SAFE_INTEGER
      || !Number.isFinite(nextBet) || nextBet > Number.MAX_SAFE_INTEGER
      || this.totalPot + payAmount > Number.MAX_SAFE_INTEGER || this.totalPot + payAmount <= this.totalPot
      || seat.currentInvested + payAmount > Number.MAX_SAFE_INTEGER || seat.currentInvested + payAmount <= seat.currentInvested) {
      throw new Error('下注金额超出有效范围');
    }

    // 扣减筹码
    const res = UserModel.changeBalance(
      userId,
      -payAmount,
      'bet',
      `第 ${this.roomId} 房间${actionType === 'raise' ? '加注' : actionType === 'allin' ? '全押' : '跟注'}`,
      { roomId: this.roomId }
    );
    this.currentBet = nextBet;
    seat.user!.balance = res.balance;
    seat.currentInvested += payAmount;
    this.totalPot += payAmount;

    // 特效判定（5000+ 大金特效每局仅在首次达到时触发）
    let specialEffect: 'none' | 'gold' | 'allin' = 'none';
    if (actionType === 'allin') {
      specialEffect = 'allin';
    } else if (payAmount >= 5000 && !this.hasTriggeredFirstGold) {
      this.hasTriggeredFirstGold = true;
      specialEffect = 'gold';
    }

    if (this.io) {
      this.io.to(`room:${this.roomId}`).emit('game:player_bet', {
        playerId: userId,
        actionType,
        chipOption,
        amount: payAmount,
        totalPot: this.totalPot,
        playerBalance: seat.user!.balance,
        specialEffect,
      });
    }

    this.advanceTurn();
  }

  /**
   * 弃牌操作
   */
  public fold(userId: number, reason: 'manual' | 'timeout' = 'manual'): void {
    if (this.gameStatus !== 'playing') return;
    const seatIdx = this.findSeatIndexByUserId(userId);
    if (seatIdx === -1) return;

    const seat = this.seats[seatIdx]!;
    if (seat.status !== 'active') return;

    seat.status = 'folded';

    if (this.io) {
      this.io.to(`room:${this.roomId}`).emit('game:player_folded', {
        playerId: userId,
        reason,
      });
    }

    // 检查是否仅剩唯一存活者
    const activeSeats = this.getActiveSeats();
    if (activeSeats.length === 1) {
      this.settleGameOver(activeSeats[0].user!.id, 'last_survivor');
    } else if (this.currentTurnPlayerId === userId) {
      this.advanceTurn();
    } else {
      this.broadcastState();
    }
  }

  /**
   * 双人比牌 (PK 对决)
   */
  public compare(initiatorId: number, targetPlayerId: number): void {
    if (this.gameStatus !== 'playing') {
      throw new Error('游戏未在进行中');
    }
    if (this.currentTurnPlayerId !== initiatorId) {
      throw new Error('还没轮到您的出牌回合');
    }
    if (this.currentRound < 2) {
      throw new Error('第 2 轮起方可发起比牌');
    }
    if (initiatorId === targetPlayerId) {
      throw new Error('不能与自己比牌');
    }

    const initSeatIdx = this.findSeatIndexByUserId(initiatorId);
    const targetSeatIdx = this.findSeatIndexByUserId(targetPlayerId);

    if (initSeatIdx === -1 || targetSeatIdx === -1) {
      throw new Error('玩家不在房间座位中');
    }

    const initSeat = this.seats[initSeatIdx]!;
    const targetSeat = this.seats[targetSeatIdx]!;

    if (initSeat.status !== 'active' || targetSeat.status !== 'active') {
      throw new Error('比牌对象必须处于存活对局状态');
    }

    // 比牌消耗：发起方跟注金额的 2 倍（明牌 2 倍基准，闷牌 1 倍基准）
    const cost = this.currentBet * 2 * (initSeat.hasLooked ? 1 : 0.5);
    const user = UserModel.findById(initiatorId);
    if (!user) throw new Error('用户不存在');
    initSeat.user!.balance = user.balance;
    if (!Number.isFinite(cost) || cost <= 0 || cost > Number.MAX_SAFE_INTEGER
      || this.totalPot + cost > Number.MAX_SAFE_INTEGER || this.totalPot + cost <= this.totalPot
      || initSeat.currentInvested + cost > Number.MAX_SAFE_INTEGER || initSeat.currentInvested + cost <= initSeat.currentInvested) {
      throw new Error('比牌金额超出有效范围');
    }
    if (user.balance < cost) {
      throw new Error('筹码不足，无法发起比牌');
    }

    // 扣除比牌花费
    const changeRes = UserModel.changeBalance(
      initiatorId,
      -cost,
      'bet',
      `第 ${this.roomId} 房间发起比牌对决`,
      { roomId: this.roomId }
    );
    initSeat.user!.balance = changeRes.balance;
    initSeat.currentInvested += cost;
    this.totalPot += cost;

    // 裁判引擎判定胜负
    const result = GameReferee.compareHands(initSeat.cards!, targetSeat.cards!, 'A', this.deckKind);
    const winnerId = result === 1 ? initiatorId : targetPlayerId;
    const loserId = result === 1 ? targetPlayerId : initiatorId;

    // 输家淘汰
    const loserSeat = loserId === initiatorId ? initSeat : targetSeat;
    loserSeat.status = 'lost';
    const visibleLosers = this.comparisonWins.get(winnerId) ?? new Set<number>();
    visibleLosers.add(loserId);
    this.comparisonWins.set(winnerId, visibleLosers);

    // 按接收者分别发送：仅本次胜者取得输者底牌，支持同账号多连接。
    if (this.io) {
      const event: CompareResultEvent = {
        initiatorId,
        targetId: targetPlayerId,
        winnerId,
        loserId,
        cost,
        totalPot: this.totalPot,
      };
      const socketIds = this.io.sockets.adapter.rooms.get(`room:${this.roomId}`);
      for (const socketId of socketIds ?? []) {
        const socket = this.io.sockets.sockets.get(socketId);
        if (!socket) continue;
        socket.emit('game:compare_result', (socket as any).userId === winnerId
          ? { ...event, loserCards: loserSeat.cards!.map(card => ({ ...card })) }
          : event);
      }
    }

    // 检查是否决出唯一赢家
    const activeSeats = this.getActiveSeats();
    if (activeSeats.length === 1) {
      this.settleGameOver(activeSeats[0].user!.id, 'last_survivor');
    } else {
      this.advanceTurn();
    }
  }

  /**
   * 轮换至下一个出牌玩家
   */
  private advanceTurn(): void {
    if (this.gameStatus !== 'playing') return;
    this.clearTurnTimer();

    const activeSeats = this.getActiveSeats();
    if (activeSeats.length <= 1) {
      if (activeSeats.length === 1) {
        this.settleGameOver(activeSeats[0].user!.id, 'last_survivor');
      }
      return;
    }

    const currentSeatIdx = this.findSeatIndexByUserId(this.currentTurnPlayerId!);
    const sortedActiveIndices = activeSeats.map((s) => s.seatIndex).sort((a, b) => a - b);
    this.pendingTurnPlayerIds.delete(this.currentTurnPlayerId!);
    const activePlayerIds = new Set(activeSeats.map(seat => seat.user!.id));
    for (const playerId of this.pendingTurnPlayerIds) {
      if (!activePlayerIds.has(playerId)) this.pendingTurnPlayerIds.delete(playerId);
    }
    if (this.pendingTurnPlayerIds.size === 0) {
      this.currentRound++;
      this.pendingTurnPlayerIds = activePlayerIds;
    }

    // 寻找顺时针下一个座位
    let nextIdx = sortedActiveIndices.find((idx) => idx > currentSeatIdx);
    if (nextIdx === undefined) {
      nextIdx = sortedActiveIndices[0];
    }

    // 检查轮数上限（满 20 轮全员开牌决胜）
    if (this.currentRound > 20) {
      this.maxRoundShowdown();
      return;
    }

    const nextSeat = this.seats[nextIdx]!;
    this.currentTurnPlayerId = nextSeat.user!.id;

    this.startTurnTimer();
    this.broadcastState();
  }

  /**
   * 满 20 轮终局全员比牌
   */
  private maxRoundShowdown(): void {
    const activeSeats = this.getActiveSeats();
    const showdownData = activeSeats.map((s) => ({
      id: s.user!.id,
      cards: s.cards!,
      seatIndex: s.seatIndex,
    }));

    const result = GameReferee.showdownMultiple(showdownData, this.deckKind);
    this.settleGameOver(result.winnerIds, 'max_round_showdown');
  }

  /**
   * 结算终局，派发总底池
   */
  private settleGameOver(winners: number | number[], reason: 'last_survivor' | 'max_round_showdown'): void {
    // 已完成的对局不得因重复动作再次派发同一底池。
    if (this.gameStatus !== 'playing') return;
    const winnerIds = Array.isArray(winners) ? winners : [winners];
    const winnerId = winnerIds.length === 1 ? winnerIds[0] : null;
    const winAmount = this.totalPot;
    const payouts = splitPot(winAmount, winnerIds);
    const balances = getDb().transaction(() => payouts.map(payout => UserModel.changeBalance(
      payout.playerId, payout.amount, 'game_win',
      `第 ${this.roomId} 房间炸金花${winnerIds.length > 1 ? '循环克制平分奖池' : '独揽奖池'}`,
      { roomId: this.roomId }
    )))();
    payouts.forEach((payout, index) => {
      const seat = this.seats.find(s => s?.user?.id === payout.playerId);
      if (seat?.user) seat.user.balance = balances[index].balance;
    });
    const winnerSeat = winnerId === null ? undefined : this.seats.find(s => s?.user?.id === winnerId);
    this.clearTurnTimer();
    this.gameStatus = 'settling';
    this.currentTurnPlayerId = null;

    // 构建亮牌列表
    const revealedCards: Array<{
      playerId: number;
      cards: Card[];
      handType: string;
      handTypeName: string;
    }> = [];

    if (reason === 'max_round_showdown') {
      // 20 轮开牌公开所有存活玩家手牌
      for (const s of this.getActiveSeats()) {
        const evalRes = GameReferee.evaluateHand(s.cards!, this.deckKind);
        revealedCards.push({
          playerId: s.user!.id,
          cards: s.cards!,
          handType: evalRes.type,
          handTypeName: evalRes.typeName,
        });
      }
    } else {
      // 独存赢家亮牌
      if (winnerSeat && winnerSeat.cards) {
        const evalRes = GameReferee.evaluateHand(winnerSeat.cards, this.deckKind);
        revealedCards.push({
          playerId: winnerSeat.user!.id,
          cards: winnerSeat.cards,
          handType: evalRes.type,
          handTypeName: evalRes.typeName,
        });
      }
    }

    if (this.io) {
      this.io.to(`room:${this.roomId}`).emit('game:over', {
        winnerId,
        winnerIds,
        payouts,
        splitPot: winnerIds.length > 1,
        winAmount,
        reason,
        revealedCards,
      });
      this.broadcastState();
    }

    // 下局庄家转移给胜者
    if (winnerSeat) {
      this.dealerSeatIndex = winnerSeat.seatIndex;
    }

    // 结算展示 4 秒后重置回等待状态
    this.settlingTimer = setTimeout(() => {
      this.resetToWaiting();
    }, 4000);
  }

  /**
   * 重置房间回到准备等待阶段
   */
  public resetToWaiting(): void {
    this.clearTurnTimer();
    this.comparisonWins.clear();
    this.pendingTurnPlayerIds.clear();
    if (this.settlingTimer) { clearTimeout(this.settlingTimer); this.settlingTimer = null; }
    this.gameStatus = 'waiting';
    this.currentRound = 0;
    this.currentTurnPlayerId = null;
    this.turnDeadline = null;
    this.currentBet = this.baseAnte;
    this.totalPot = 0;

    for (let i = 0; i < 8; i++) {
      const seat = this.seats[i];
      if (seat && seat.user) {
        // 同步最新的数据库余额
        const u = UserModel.findById(seat.user.id);
        seat.user.balance = u ? u.balance : seat.user.balance;
        seat.cards = null;
        seat.hasLooked = false;
        seat.currentInvested = 0;
        seat.isReady = false;
        seat.status = 'sitting';

        // 若筹码不足底注 10 倍，强制站起进入观战席
        if (seat.user.balance < this.baseAnte * 10) {
          this.stand(seat.user.id, true);
        }
      }
    }

    this.broadcastState();
  }

  /**
   * 启动出牌倒计时
   */
  private startTurnTimer(): void {
    this.clearTurnTimer();
    if (this.turnSeconds === 0) return;

    const durationMs = this.turnSeconds * 1000;
    this.turnDeadline = Date.now() + durationMs;

    this.turnTimer = setTimeout(() => {
      if (this.gameStatus === 'playing' && this.currentTurnPlayerId) {
        // 超时自动弃牌
        this.fold(this.currentTurnPlayerId, 'timeout');
      }
    }, durationMs);
  }

  private clearTurnTimer(): void {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    this.turnDeadline = null;
  }

  /**
   * 获取所有存活在局玩家
   */
  public getActiveSeats(): TableSeat[] {
    return this.seats.filter((s): s is TableSeat => s !== null && s.status === 'active');
  }

  public findSeatIndexByUserId(userId: number): number {
    return this.seats.findIndex((s) => s !== null && s.user !== null && s.user.id === userId);
  }

  /**
   * 生成防作弊脱敏全量快照
   * 仅本人手牌及本局直接击败玩家的手牌可见，其他人的 cards 为 null
   */
  public getMaskedState(forUserId?: number): RoomState {
    const maskedSeats: (TableSeat | null)[] = this.seats.map((seat) => {
      if (!seat) return null;
      const isSelf = forUserId !== undefined && seat.user?.id === forUserId;
      const isDefeatedByViewer = forUserId !== undefined && seat.status === 'lost' && seat.user !== null
        && this.comparisonWins.get(forUserId)?.has(seat.user.id) === true;
      return {
        ...seat,
        user: seat.user ? { ...seat.user } : null,
        cards: isSelf || isDefeatedByViewer ? seat.cards?.map(card => ({ ...card })) ?? null : null,
      };
    });

    return {
      roomId: this.roomId,
      roomName: this.roomName,
      playerCount: this.playerCount,
      onlinePlayerIds: Array.from(new Set([...this.seats.flatMap(seat => seat?.user ? [seat.user.id] : []), ...this.spectators.keys()]))
        .filter(id => !this.io || this.findSocketIdsByUserId(id).length > 0),
      deckKind: this.deckKind,
      baseAnte: this.baseAnte,
      turnSeconds: this.turnSeconds,
      gameStatus: this.gameStatus,
      currentRound: this.currentRound,
      currentTurnPlayerId: this.currentTurnPlayerId,
      turnDeadline: this.turnDeadline,
      currentBet: this.currentBet,
      totalPot: this.totalPot,
      dealerSeatIndex: this.dealerSeatIndex,
      seats: maskedSeats,
      spectators: Array.from(this.spectators.values(), user => ({ id: user.id, nickname: user.nickname, avatar: user.avatar })),
    };
  }

  /**
   * 向全房间广播脱敏快照 (每个 Socket 单独脱敏)
   */
  public broadcastState(): void {
    if (!this.io) return;

    const roomChannel = `room:${this.roomId}`;
    const sockets = this.io.sockets.adapter.rooms.get(roomChannel);
    if (!sockets) return;

    for (const socketId of sockets) {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        const userId = (socket as any).userId;
        const state = this.getMaskedState(userId);
        socket.emit('room:state', state);
      }
    }
  }

  private findSocketIdsByUserId(userId: number): string[] {
    if (!this.io) return [];
    const socketIds = this.io.sockets.adapter.rooms.get(`room:${this.roomId}`);
    return Array.from(socketIds ?? []).filter(socketId =>
      (this.io!.sockets.sockets.get(socketId) as any)?.userId === userId);
  }
}
