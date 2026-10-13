import React, { useState } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { Wrench, ChevronDown, Play, Eye, Flame, Swords, Trophy, Users, Sparkles } from 'lucide-react';

export const DevToolBar: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const {
    dealCards,
    lookCards,
    bet,
    triggerAllInEffect,
    triggerGoldStreamEffect,
    setMockSeatCount,
    roomState,
    currentUser,
  } = useGameStore();

  const handleSimulateSettlement = () => {
    const { mockController } = useGameStore.getState();
    if (mockController) {
      mockController.triggerSettlement(currentUser.id);
      useGameStore.setState({
        activeSettlement: {
          winnerId: currentUser.id,
          winAmount: roomState.totalPot || 888,
          reason: 'last_survivor',
          revealedCards: [
            {
              playerId: currentUser.id,
              cards: [
                { suit: 'spades', rank: 14 },
                { suit: 'hearts', rank: 14 },
                { suit: 'diamonds', rank: 14 },
              ],
              handType: 'leopard',
              handTypeName: '豹子 AAA',
            },
          ],
        },
      });
    }
  };

  const handleSimulatePK = () => {
    useGameStore.setState({
      activePKClash: {
        initiatorId: 1,
        targetId: 2,
        winnerId: 1,
        loserId: 2,
        cost: 40,
        totalPot: 560,
      },
    });
  };

  return (
    <div className="fixed bottom-4 left-4 z-50 select-none">
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/90 hover:bg-slate-800 text-amber-400 text-xs font-mono font-bold border border-amber-500/40 shadow-xl backdrop-blur-sm transition-all"
        >
          <Wrench className="w-3.5 h-3.5" />
          <span>DevTool 调测台</span>
        </button>
      ) : (
        <div className="bg-slate-950/95 border border-amber-500/50 rounded-2xl p-3 shadow-2xl backdrop-blur-md w-72 animate-fade-in flex flex-col gap-2">
          {/* 标题栏 */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-amber-400">
              <Wrench className="w-4 h-4" />
              <span>纯前端 Mock 调测驱动台</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 text-slate-400 hover:text-slate-100 rounded"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {/* 快捷测试按钮组 */}
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            <button
              onClick={dealCards}
              className="flex items-center justify-center gap-1 py-1.5 px-2 bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 rounded-lg hover:bg-emerald-900/80 font-bold"
            >
              <Play className="w-3 h-3" />
              <span>一键发牌</span>
            </button>

            <button
              onClick={lookCards}
              className="flex items-center justify-center gap-1 py-1.5 px-2 bg-blue-950/80 border border-blue-500/40 text-blue-300 rounded-lg hover:bg-blue-900/80 font-bold"
            >
              <Eye className="w-3 h-3" />
              <span>翻开看牌</span>
            </button>

            <button
              onClick={() => bet('raise', 100)}
              className="flex items-center justify-center gap-1 py-1.5 px-2 bg-amber-950/80 border border-amber-500/40 text-amber-300 rounded-lg hover:bg-amber-900/80 font-bold"
            >
              <span>加注 100</span>
            </button>

            <button
              onClick={triggerGoldStreamEffect}
              className="flex items-center justify-center gap-1 py-1.5 px-2 bg-yellow-950/80 border border-yellow-500/40 text-yellow-300 rounded-lg hover:bg-yellow-900/80 font-bold"
            >
              <Sparkles className="w-3 h-3" />
              <span>5000+ 金光</span>
            </button>

            <button
              onClick={triggerAllInEffect}
              className="flex items-center justify-center gap-1 py-1.5 px-2 bg-red-950/80 border border-red-500/40 text-red-300 rounded-lg hover:bg-red-900/80 font-bold"
            >
              <Flame className="w-3 h-3" />
              <span>All-in 震颤</span>
            </button>

            <button
              onClick={handleSimulatePK}
              className="flex items-center justify-center gap-1 py-1.5 px-2 bg-purple-950/80 border border-purple-500/40 text-purple-300 rounded-lg hover:bg-purple-900/80 font-bold"
            >
              <Swords className="w-3 h-3" />
              <span>比牌 PK 模拟</span>
            </button>

            <button
              onClick={handleSimulateSettlement}
              className="col-span-2 flex items-center justify-center gap-1 py-1.5 px-2 bg-gradient-to-r from-amber-600 to-yellow-600 text-slate-950 rounded-lg font-black"
            >
              <Trophy className="w-3.5 h-3.5" />
              <span>终局胜利结算战报</span>
            </button>
          </div>

          {/* 自适应人数切换 */}
          <div className="mt-1 pt-2 border-t border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <Users className="w-3 h-3 text-amber-400" />
              <span>测试在座人数:</span>
            </div>
            <div className="flex gap-1">
              {[2, 4, 6, 8].map((num) => (
                <button
                  key={num}
                  onClick={() => setMockSeatCount(num)}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-300 text-[10px] font-mono font-bold transition"
                >
                  {num}人
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
