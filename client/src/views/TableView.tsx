import React from 'react';
import { useGameStore } from '../store/useGameStore';
import { PokerTable } from '../components/table/PokerTable';
import { ActionPanel } from '../components/table/ActionPanel';
import { PKClashModal } from '../components/animations/PKClashModal';
import { AllInEpicEffect } from '../components/animations/AllInEpicEffect';
import { GoldStreamer } from '../components/animations/GoldStreamer';
import { SettlementModal } from '../components/animations/SettlementModal';
import { socketService } from '../services/socket';
import { Volume2, VolumeX, LogOut, FileText } from 'lucide-react';

interface TableViewProps {
  onBackToLobby?: () => void;
  onOpenLedger?: () => void;
}

export const TableView: React.FC<TableViewProps> = ({
  onBackToLobby,
  onOpenLedger,
}) => {
  const {
    roomState,
    currentUser,
    isPKSelecting,
    activePKClash,
    activeSettlement,
    isAllInTriggered,
    allInInfo,
    isGoldStreamTriggered,
    goldStreamInfo,
    floatingBubbles,
    flyingChips,
    isMuted,
    toggleMute,
    connectionStatus, actionPending, error,
    lookCards,
    bet,
    fold,
    setPKSelecting,
    compareWithPlayer,
    closePKClash,
    closeSettlement,
    sendEmoji,
    sendPhrase,
  } = useGameStore();

  if (!roomState || !currentUser) return null;
  const seated = roomState.seats.filter(s => s?.user);
  const target = roomState.playerCount ?? 2;
  const unavailable = connectionStatus !== 'connected' || actionPending;
  const mySeat = roomState.seats.find((s) => s?.user?.id === currentUser.id) || null;
  const isMyTurn = roomState.currentTurnPlayerId === currentUser.id && !isGoldStreamTriggered;

  return (
    <div className="relative w-full h-full flex flex-col justify-between bg-slate-950 text-slate-100 overflow-hidden select-none">
      {/* 顶部状态与功能栏 */}
      <header className="relative z-30 w-full px-4 py-2.5 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80 flex items-center justify-between">
        {/* 左侧：房间号与返回 */}
        <div className="flex items-center gap-3">
          {onBackToLobby && (
            <button
              onClick={() => { if (roomState.gameStatus !== 'playing' || !mySeat || window.confirm('退出房间会放弃本局，确定退出吗？')) onBackToLobby?.(); }}
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
              title="返回大厅"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}

          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-amber-400 tracking-wide font-mono">
                房号: {roomState.roomId}
              </span>
              <span className="text-xs text-slate-300 font-bold hidden sm:inline">
                {roomState.roomName}
              </span>
            </div>
            <span className="text-[10px] text-slate-400">
              {roomState.deckKind === 'short' ? '28 张短牌' : '52 张标准牌'} · 底注: {roomState.baseAnte} · 思考: {roomState.turnSeconds === 0 ? '无限制' : `${roomState.turnSeconds}s`}
            </span>
          </div>
        </div>

        {/* 右侧：流水账单、管理员专区、音效与个人筹码 */}
        <div className="flex items-center gap-2">
          {/* 流水明细入口 */}
          {onOpenLedger && (
            <button
              onClick={onOpenLedger}
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 transition flex items-center gap-1 text-xs"
              title="个人流水"
            >
              <FileText className="w-4 h-4 text-emerald-400" />
              <span className="hidden md:inline">账本</span>
            </button>
          )}

          {/* 音效开关 */}
          <button
            onClick={toggleMute}
            className={`p-2 rounded-xl border transition ${
              isMuted
                ? 'bg-slate-900 border-slate-700 text-slate-500'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-400 shadow-sm'
            }`}
            title={isMuted ? '取消静音' : '静音'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {/* 个人当前余额 */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/90 border border-amber-500/30 font-mono text-xs font-bold text-amber-300">
            <span>🪙</span>
            <span>{currentUser.balance.toLocaleString()}</span>
          </div>
        </div>
      </header>

      {(error || connectionStatus !== 'connected') && <p role="alert" className="relative z-40 bg-rose-950 text-rose-200 text-sm px-4 py-2">{connectionStatus !== 'connected' ? '连接已断开，正在重连，请稍候…' : error}</p>}
      <div className="px-4 py-1 text-xs text-slate-400">已入座 {seated.length} / {target} 人 · 观战 {roomState.spectators.length} 人</div>
      {/* 比牌选择目标提示横条 */}
      {isPKSelecting && (
        <div className="absolute top-14 inset-x-0 z-40 bg-red-600/90 text-white text-xs font-bold py-1.5 px-4 text-center shadow-lg flex items-center justify-center gap-2 animate-bounce">
          <span>请点击上方亮起光圈的对手头像发起 PK 对决！</span>
          <button
            onClick={() => setPKSelecting(false)}
            className="px-2 py-0.5 bg-black/40 rounded text-[10px] hover:bg-black/60"
          >
            取消
          </button>
        </div>
      )}

      {/* 牌桌主体核心区 */}
      <main className="relative flex-1 w-full flex items-center justify-center overflow-hidden">
        <PokerTable
          roomState={roomState}
          myUserId={currentUser.id}
          isPKSelecting={isPKSelecting}
          onSelectPKTarget={compareWithPlayer}
          floatingBubbles={floatingBubbles}
          flyingChips={flyingChips}
          isAllInTriggered={isAllInTriggered}
        />
      </main>

      {roomState.gameStatus === 'waiting' && <section className="z-30 p-4 bg-slate-900 border-t border-slate-700 text-center space-y-3">
        <p className="text-sm text-amber-300">等待满 {target} 人且全员准备 · 已准备 {seated.filter(s => s?.isReady).length} / {target}</p>
        <div className="flex flex-wrap gap-3 justify-center text-xs">{seated.map(s => <span key={s!.user!.id}>{s!.user!.nickname} · {roomState.onlinePlayerIds && !roomState.onlinePlayerIds.includes(s!.user!.id) ? '离线' : s!.isReady ? '已准备' : '未准备'}</span>)}</div>
        {roomState.spectators.length > 0 && <p className="text-xs text-slate-400">观战：{roomState.spectators.map(u => u.nickname).join('、')}</p>}
        <div className="flex gap-3 justify-center">
          {mySeat ? <><button disabled={unavailable} onClick={() => { void socketService.ready(!mySeat.isReady).catch(() => {}); }} className="px-6 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold">{mySeat.isReady ? '取消准备' : '准备'}</button>
            <button disabled={unavailable} onClick={() => { void socketService.stand().catch(() => {}); }} className="px-4 py-2 rounded-xl bg-slate-800">离座观战</button></> :
            <button disabled={unavailable || seated.length >= target} onClick={() => { const index = roomState.seats.findIndex(s => !s?.user); if (index >= 0) void socketService.sit(index).catch(() => {}); }} className="px-6 py-2 rounded-xl bg-emerald-500 text-slate-950 font-bold">{seated.length >= target ? '座位已满，正在观战' : '入座参与'}</button>}
        </div>
      </section>}
      {/* 底部操作盘 */}
      {roomState.gameStatus !== 'waiting' && <fieldset disabled={unavailable} className="contents"><ActionPanel
        mySeat={mySeat}
        isMyTurn={isMyTurn}
        baseAnte={roomState.baseAnte}
        currentBet={roomState.currentBet}
        currentRound={roomState.currentRound}
        gameStatus={roomState.gameStatus}
        onLook={lookCards}
        onBet={bet}
        onFold={fold}
        onStartPK={() => setPKSelecting(true)}
        onSendEmoji={sendEmoji}
        onSendPhrase={sendPhrase}
      /></fieldset>}

      {/* 专属特效与弹窗层 */}
      {activePKClash && (
        <PKClashModal
          clashEvent={activePKClash}
          seats={roomState.seats}
          viewerId={currentUser.id}
          onClose={closePKClash}
        />
      )}

      {isAllInTriggered && <AllInEpicEffect info={allInInfo} />}
      {isGoldStreamTriggered && <GoldStreamer info={goldStreamInfo} />}

      {activeSettlement && !activePKClash && (
        <SettlementModal
          settlementEvent={activeSettlement}
          seats={roomState.seats}
          onClose={closeSettlement}
        />
      )}


    </div>
  );
};
