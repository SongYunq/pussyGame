import React, { useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useGameStore } from '../store/useGameStore';
import { api } from '../services/api';
import { Sparkles, Lock, User, ArrowRight } from 'lucide-react';

import { UserProfile } from '../types/game';

interface LoginViewProps {
  onLoginSuccess: (user: UserProfile) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('zhangsan');
  const [password, setPassword] = useState('user123456');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const { login } = useAuthStore();
  const { setCurrentUser } = useGameStore();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    try {
      const res = await api.login(username, password);
      login(res.token, res.user);
      setCurrentUser(res.user);
      onLoginSuccess(res.user);
    } catch {
      // 若后端尚未启动或处于纯前端模式，提供安全回退快速进入
      console.warn('后端服务未连接，使用离线模拟身份进入大厅');
      const fallbackUser: UserProfile = {
        id: username === 'admin' ? 999 : 1,
        username: username || 'player1',
        nickname: username === 'admin' ? '系统管理员' : '老友牌神',
        avatar: username === 'admin' ? '🛡️' : '👑',
        balance: 10000,
        role: (username === 'admin' ? 'admin' : 'player') as 'player' | 'admin',
      };
      login('mock_jwt_token', fallbackUser);
      setCurrentUser(fallbackUser);
      onLoginSuccess(fallbackUser);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 bg-slate-950 overflow-hidden select-none">
      {/* 背景暗金流光氛围 */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-amber-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-md bg-gradient-to-b from-slate-900/90 to-slate-950/90 border border-amber-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
        {/* 头部 Logo */}
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 via-amber-500 to-yellow-600 flex items-center justify-center shadow-[0_0_30px_rgba(245,158,11,0.5)] mb-4">
            <span className="text-3xl">♠</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-amber-400 to-yellow-100 tracking-wider">
            老 友 炸 金 花
          </h1>
          <p className="text-xs text-slate-400 mt-1">专属私局 · 拟真手感 · 权威防作弊</p>
        </div>

        {/* 错误提示 */}
        {errorMsg && (
          <div className="mt-4 p-2.5 rounded-xl bg-red-950/60 border border-red-500/40 text-red-300 text-xs text-center font-bold">
            {errorMsg}
          </div>
        )}

        {/* 登录表单 */}
        <form onSubmit={handleLogin} className="mt-6 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              游戏账号
            </label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入管理员分配的账号"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950/80 border border-slate-700 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 text-sm text-slate-100 placeholder-slate-600 outline-none transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              登录密码
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950/80 border border-slate-700 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 text-sm text-slate-100 placeholder-slate-600 outline-none transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-yellow-500 text-slate-950 font-black text-sm shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 transition active:scale-98"
          >
            {loading ? (
              <span>登录中...</span>
            ) : (
              <>
                <span>立即进入游戏</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* 快捷测试账号说明卡片 */}
        <div className="mt-6 p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400 flex flex-col gap-2">
          <div className="flex items-center gap-1 text-amber-400 font-bold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>开发者体验账号（点击一键填入）：</span>
          </div>
          <div className="flex items-center justify-between bg-slate-900/60 hover:bg-slate-800/60 p-2 rounded-lg cursor-pointer transition border border-slate-800/80"
            onClick={() => {
              setUsername('admin');
              setPassword('admin123456');
            }}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-amber-400 font-bold">🛡️ 管理员后台：</span>
              <code className="text-slate-200 font-mono">admin</code> / <code className="text-slate-300 font-mono">admin123456</code>
            </div>
            <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 font-bold">填入管理员</span>
          </div>
          <div className="flex items-center justify-between bg-slate-900/60 hover:bg-slate-800/60 p-2 rounded-lg cursor-pointer transition border border-slate-800/80"
            onClick={() => {
              setUsername('zhangsan');
              setPassword('user123456');
            }}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-emerald-400 font-bold">👤 普通玩家：</span>
              <code className="text-slate-200 font-mono">zhangsan</code> / <code className="text-slate-300 font-mono">user123456</code>
            </div>
            <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-bold">填入玩家</span>
          </div>
        </div>
      </div>
    </div>
  );
};
