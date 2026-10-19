import React, { useState } from 'react';
import { TableSeat } from '../../types/game';
import { Eye, Flame, Swords, ShieldAlert, Sparkles, Smile, MessageSquare, ChevronUp } from 'lucide-react';

interface ActionPanelProps {
  mySeat: TableSeat | null;
  isMyTurn: boolean;
  baseAnte?: number;
  currentBet: number;
  currentRound: number;
  gameStatus: 'waiting' | 'playing' | 'settling';
  onLook: () => void;
  onBet: (type: 'call' | 'raise' | 'allin', chipValue: number) => void;
  onFold: () => void;
  onStartPK: () => void;
  onSendEmoji: (emoji: string) => void;
  onSendPhrase: (phrase: string) => void;
  onStartDeal?: () => void;
}

const EMOJIS = ['🔥', '😎', '😭', '💀', '💰', '👍', '🚀', '🍺'];
const PHRASES = [
  '快点吧，我等到花儿都谢了！',
  '梭哈是一种智慧！',
  '风水轮流转，底裤全靠这把！',
  '老铁，稳住别慌！',
  '搏一搏，单车变摩托！',
];

export const ActionPanel: React.FC<ActionPanelProps> = ({
  mySeat,
  isMyTurn,
  baseAnte = 10,
  currentBet,
  currentRound,
  gameStatus,
  onLook,
  onBet,
  onFold,
  onStartPK,
  onSendEmoji,
  onSendPhrase,
  onStartDeal,
}) => {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showPhrasePicker, setShowPhrasePicker] = useState(false);
  const [showRaiseDrawer, setShowRaiseDrawer] = useState(false);

  const hasLooked = mySeat?.hasLooked ?? false;
  const myBalance = mySeat?.user?.balance ?? 0;
  const isPlaying = gameStatus === 'playing';
  const isAlive = mySeat?.status === 'active';
  const isRaised = currentBet > baseAnte;

  // 底注不变；后续下注明牌为 1 倍，闷牌为 0.5 倍
  const betMultiplier = hasLooked ? 1 : 0.5;
  const callAmount = currentBet * betMultiplier;
  // 比牌所需筹码：第 2 轮起开放，为自身跟注金额的 2 倍
  const pkCost = callAmount * 2;
  const canPK = isMyTurn && currentRound >= 2 && myBalance >= pkCost;

  const raiseOptions = [10, 20, 50, 100, 500, 1000, 5000, 8000, 10000];

  return (
    <div className="w-full bg-slate-950/90 backdrop-blur-md border-t border-slate-800 p-2 md:p-3 relative z-30">
      {/* 快捷表情弹窗 */}
      {showEmojiPicker && (
        <div className="absolute bottom-full left-4 mb-2 p-2 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex gap-2 z-50 animate-fade-in">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                onSendEmoji(emoji);
                setShowEmojiPicker(false);
              }}
              className="text-2xl p-1.5 hover:scale-125 transition-transform"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* 快捷短语弹窗 */}
      {showPhrasePicker && (
        <div className="absolute bottom-full left-16 mb-2 p-2 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col gap-1.5 z-50 w-64 animate-fade-in">
          {PHRASES.map((phrase, idx) => (
            <button
              key={idx}
              onClick={() => {
                onSendPhrase(phrase);
                setShowPhrasePicker(false);
              }}
              className="text-left text-xs text-slate-200 hover:text-amber-400 hover:bg-slate-800 p-1.5 rounded transition-colors"
            >
              {phrase}
            </button>
          ))}
        </div>
      )}

      {/* 加注多档位抽屉 */}
      {showRaiseDrawer && isMyTurn && isAlive && (
        <div className="absolute bottom-full inset-x-0 bg-slate-900/95 border-t border-amber-500/30 p-3 shadow-2xl flex flex-wrap justify-center gap-2 z-40 animate-fade-in">
          <div className="w-full text-center text-xs text-amber-400 font-bold mb-1">
            选择加注后的注额（闷注减半）
          </div>
          {raiseOptions.map((opt) => {
            const actualCost = opt * betMultiplier;
            const disabled = actualCost > myBalance || opt <= currentBet;
            return (
              <button
                key={opt}
                disabled={disabled}
                onClick={() => {
                  onBet('raise', opt);
                  setShowRaiseDrawer(false);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all ${
                  disabled
                    ? 'border-slate-800 text-slate-600 bg-slate-950/40 cursor-not-allowed'
                    : 'border-amber-500/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500 hover:text-slate-950 shadow-md'
                }`}
              >
                +{opt} ({actualCost})
              </button>
            );
          })}
        </div>
      )}

      <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
        {/* 左侧：社交互动、看牌 + 轮数、当前注额与闷注信息 */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="p-2 rounded-xl bg-slate-800/80 text-amber-400 hover:bg-slate-700 transition"
            title="发送表情"
          >
            <Smile className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowPhrasePicker(!showPhrasePicker)}
            className="p-2 rounded-xl bg-slate-800/80 text-slate-300 hover:bg-slate-700 transition"
            title="快捷短语"
          >
            <MessageSquare className="w-5 h-5" />
          </button>

          {/* 以当前注额为主，闷注金额作为补充说明 */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700/80 text-[11px] font-mono font-bold">
            <span className="px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/40 font-black">
              第 {currentRound}/20 轮
            </span>
            <span
              className={`px-2 py-0.5 rounded flex items-center gap-1 font-black ${
                isRaised
                  ? 'bg-gradient-to-r from-rose-600/90 to-amber-500/90 text-white border border-yellow-300/60'
                  : 'bg-emerald-950/90 text-emerald-300 border border-emerald-500/40'
              }`}
            >
              {isRaised && <Flame className="w-3 h-3 text-yellow-200 fill-yellow-200" />}
              <span>
                当前注额 {currentBet}
              </span>
              <span className="opacity-70">·</span>
              <span className="text-[10px] font-medium opacity-70">
                闷注 {currentBet * 0.5}
              </span>
            </span>
          </div>

          {/* 看牌按钮 */}
          {isPlaying && isAlive && !hasLooked && (
            <button
              onClick={onLook}
              className="flex items-center gap-1 px-3 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-blue-500/20 active:scale-95 transition"
            >
              <Eye className="w-4 h-4" />
              <span>看牌</span>
            </button>
          )}
        </div>

        {/* 右侧核心对局操作区 */}
        {isPlaying && isAlive ? (
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* 弃牌 */}
            <button
              onClick={onFold}
              disabled={!isMyTurn}
              className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold transition shadow ${
                isMyTurn
                  ? 'bg-slate-800 hover:bg-rose-900/60 text-rose-300 border border-rose-500/30 active:scale-95'
                  : 'bg-slate-900/50 text-slate-600 border border-slate-800 cursor-not-allowed'
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
              <span>弃牌</span>
            </button>

            {/* 比牌 PK */}
            <button
              onClick={onStartPK}
              disabled={!canPK}
              className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold transition shadow ${
                canPK
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white shadow-purple-500/20 active:scale-95'
                  : 'bg-slate-900/50 text-slate-600 border border-slate-800 cursor-not-allowed'
              }`}
            >
              <Swords className="w-4 h-4" />
              <span>比牌 ({pkCost})</span>
            </button>

            {/* 加注展开 */}
            <button
              onClick={() => setShowRaiseDrawer(!showRaiseDrawer)}
              disabled={!isMyTurn}
              className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold transition border ${
                isMyTurn
                  ? 'border-amber-500/60 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                  : 'border-slate-800 text-slate-600 cursor-not-allowed'
              }`}
            >
              <span>加注</span>
              <ChevronUp className="w-3.5 h-3.5" />
            </button>

            {/* 跟注 */}
            <button
              onClick={() => onBet('call', currentBet)}
              disabled={!isMyTurn || myBalance < callAmount}
              className={`flex items-center gap-1 px-4 py-2 rounded-xl text-xs font-extrabold transition shadow-lg ${
                isMyTurn && myBalance >= callAmount
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 active:scale-95 ring-2 ring-emerald-400/50'
                  : 'bg-slate-900/50 text-slate-600 border border-slate-800 cursor-not-allowed'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>跟注 ({callAmount})</span>
            </button>

            {/* All-in 梭哈 */}
            <button
              onClick={() => onBet('allin', myBalance)}
              disabled={!isMyTurn || myBalance <= 0}
              className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-black transition border shadow-lg ${
                isMyTurn && myBalance > 0
                  ? 'bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 text-white border-red-400 hover:scale-105 active:scale-95 shadow-red-600/40 animate-pulse'
                  : 'bg-slate-900/50 text-slate-600 border-slate-800 cursor-not-allowed'
              }`}
            >
              <Flame className="w-4 h-4" />
              <span>全押</span>
            </button>
          </div>
        ) : (
          /* 等待开局模式 */
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">等待开局中...</span>
            {onStartDeal && (
              <button
                onClick={onStartDeal}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-600 text-slate-950 font-black text-xs hover:from-amber-400 hover:to-yellow-500 shadow-lg shadow-amber-500/20 active:scale-95"
              >
                立即开局
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
