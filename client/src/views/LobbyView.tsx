import React, { useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useGameStore } from '../store/useGameStore';
import { PlusCircle, LogIn, BookOpen, Shield, FileText, Volume2, VolumeX, LogOut, ChevronRight } from 'lucide-react';

interface LobbyViewProps {
  onEnterRoom: (roomId: string) => void;
  onOpenLedger: () => void;
  onOpenAdmin: () => void;
}

export const LobbyView: React.FC<LobbyViewProps> = ({
  onEnterRoom,
  onOpenLedger,
  onOpenAdmin,
}) => {
  const { user, logout } = useAuthStore();
  const { isMuted, toggleMute, updateRoomState, roomState } = useGameStore();

  const [inputRoomId, setInputRoomId] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);

  // 创建房间表单
  const [newRoomName, setNewRoomName] = useState('老友欢聚私房');
  const [newBaseAnte, setNewBaseAnte] = useState(10);
  const [newTurnSeconds, setNewTurnSeconds] = useState(20);

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputRoomId.trim()) return;
    onEnterRoom(inputRoomId.trim());
  };

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const generatedId = Math.floor(1000 + Math.random() * 9000).toString();
    updateRoomState({
      ...roomState,
      roomId: generatedId,
      roomName: newRoomName,
      baseAnte: newBaseAnte,
      turnSeconds: newTurnSeconds,
    });
    setShowCreateModal(false);
    onEnterRoom(generatedId);
  };

  return (
    <div className="relative min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col justify-between overflow-x-hidden select-none">
      {/* 顶部导航 */}
      <header className="w-full px-4 sm:px-8 py-3.5 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 flex items-center justify-between">
        {/* 用户资料卡 */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-800 border-2 border-amber-400 flex items-center justify-center text-xl shadow">
            {user?.avatar || '👑'}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-extrabold text-slate-100">{user?.nickname}</span>
            <div className="flex items-center gap-1 text-xs font-mono font-bold text-amber-400">
              <span>🪙</span>
              <span>{user?.balance.toLocaleString()} 筹码</span>
            </div>
          </div>
        </div>

        {/* 右侧操作栏 */}
        <div className="flex items-center gap-2">
          {/* 流水明细 */}
          <button
            onClick={onOpenLedger}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center gap-1 text-xs"
            title="筹码账本"
          >
            <FileText className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">账本</span>
          </button>

          {/* 管理员专区 */}
          {user?.role === 'admin' && (
            <button
              onClick={onOpenAdmin}
              className="p-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 transition flex items-center gap-1 text-xs border border-amber-500/30"
              title="管理后台"
            >
              <Shield className="w-4 h-4" />
              <span className="hidden sm:inline">管理后台</span>
            </button>
          )}

          {/* 静音开关 */}
          <button
            onClick={toggleMute}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-slate-500" /> : <Volume2 className="w-4 h-4 text-amber-400" />}
          </button>

          {/* 登出 */}
          <button
            onClick={logout}
            className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 transition"
            title="退出登录"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 大厅主体内容区 */}
      <main className="max-w-4xl mx-auto w-full px-4 py-8 flex-1 flex flex-col items-center justify-center">
        {/* 欢迎 Banner */}
        <div className="text-center mb-8">
          <h2 className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-amber-400 to-yellow-100 tracking-wider">
            游戏大厅 · 极速约局
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-2">
            输入房间号即刻进入好友私局，或自定底注创建全新竞技场
          </p>
        </div>

        {/* 核心操作卡片网格 */}
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          {/* 1. 快捷加入房间卡片 */}
          <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 hover:border-amber-500/40 transition shadow-xl flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mb-4">
                <LogIn className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-100">输入房间号加入</h3>
              <p className="text-xs text-slate-400 mt-1">进入朋友已创建好的牌桌</p>
            </div>

            <form onSubmit={handleJoinRoom} className="mt-6 flex gap-2">
              <input
                type="text"
                value={inputRoomId}
                onChange={(e) => setInputRoomId(e.target.value)}
                placeholder="4~6 位房间号 (如 8888)"
                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-amber-400"
              />
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition shadow-md"
              >
                加入
              </button>
            </form>
          </div>

          {/* 2. 创建专属房间卡片 */}
          <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 hover:border-amber-500/40 transition shadow-xl flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-4">
                <PlusCircle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-100">创建专属私局</h3>
              <p className="text-xs text-slate-400 mt-1">自由配置底注基准与思考倒计时</p>
            </div>

            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-6 w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-xs transition shadow-md flex items-center justify-center gap-1.5"
            >
              <span>立即开辟新房间</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 玩法规则速查展开栏 */}
        <div className="w-full mt-6">
          <button
            onClick={() => setShowRulesModal(true)}
            className="w-full p-4 rounded-2xl bg-slate-900/50 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 transition flex items-center justify-between text-xs"
          >
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-amber-400" />
              <span className="font-bold">经典炸金花牌型大小与裁判规则图解</span>
            </div>
            <span className="text-[11px] text-amber-400/80">点击查看</span>
          </button>
        </div>
      </main>

      {/* 创建房间弹窗 */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-amber-500/40 rounded-3xl p-6 shadow-2xl">
            <h3 className="text-lg font-black text-slate-100 mb-4">创建游戏房间</h3>
            <form onSubmit={handleCreateRoom} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">房间名称</label>
                <input
                  type="text"
                  required
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-slate-100 outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">
                  底注基准 (筹码)
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[10, 20, 50, 100].map((ante) => (
                    <button
                      type="button"
                      key={ante}
                      onClick={() => setNewBaseAnte(ante)}
                      className={`py-2 rounded-xl text-xs font-mono font-bold border transition ${
                        newBaseAnte === ante
                          ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                          : 'border-slate-800 bg-slate-950 text-slate-400'
                      }`}
                    >
                      {ante}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">
                  每轮出牌倒计时 (秒)
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[15, 20, 30, 60].map((sec) => (
                    <button
                      type="button"
                      key={sec}
                      onClick={() => setNewTurnSeconds(sec)}
                      className={`py-2 rounded-xl text-xs font-mono font-bold border transition ${
                        newTurnSeconds === sec
                          ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                          : 'border-slate-800 bg-slate-950 text-slate-400'
                      }`}
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 text-xs font-bold"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black shadow"
                >
                  确认创建
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 规则速查图解弹窗 */}
      {showRulesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl flex flex-col max-h-[85vh] overflow-y-auto">
            <h3 className="text-lg font-black text-amber-400 mb-3 flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              <span>炸金花规则与牌型指南</span>
            </h3>

            <div className="flex flex-col gap-3 text-xs text-slate-300 leading-relaxed">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span className="font-bold text-amber-400">1. 牌型权重从大到小：</span>
                <p className="mt-1 font-mono text-slate-300">
                  豹子 (AAA &gt; ... &gt; 222) &gt; 同花顺 (顺金) &gt; 金花 (同花) &gt; 顺子 &gt; 对子 &gt; 单张 (散牌)
                </p>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-amber-500/20">
                <span className="font-bold text-rose-400">2. 特殊 235 逆袭规则：</span>
                <p className="mt-1 text-slate-300">
                  不同花色的 2-3-5，当场上有“豹子”比牌时，<strong>235 逆袭大于所有豹子</strong>；若场上无豹子，则作为最小散牌。
                </p>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span className="font-bold text-emerald-400">3. 平局与比牌规则：</span>
                <p className="mt-1 text-slate-300">
                  牌型点数完全相同时，<strong>主动发起比牌者判负</strong>；比牌绝密暗封，不公开双方手牌。
                </p>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span className="font-bold text-blue-400">4. 明注与暗注：</span>
                <p className="mt-1 text-slate-300">
                  未看牌（闷牌）下注为 1 倍；已看牌（明注）必须下注 2 倍；单局上限 20 轮强制全开结算。
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowRulesModal(false)}
              className="mt-6 w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold"
            >
              我知道了
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
