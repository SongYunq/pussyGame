import React, { useState } from 'react';
import { api } from '../services/api';
import { Shield, UserPlus, Coins, Key, ArrowLeft, CheckCircle2 } from 'lucide-react';

interface AdminDashboardProps {
  onBack: () => void;
}

interface MockAdminUser {
  id: number;
  username: string;
  nickname: string;
  avatar: string;
  balance: number;
  isOnline: boolean;
  currentRoomId: string | null;
}

const INITIAL_MOCK_USERS: MockAdminUser[] = [
  { id: 1, username: 'zhangsan', nickname: '绝世赌神张三', avatar: '👑', balance: 10000, isOnline: true, currentRoomId: '8888' },
  { id: 2, username: 'lisi', nickname: '狂暴牌手小李', avatar: '🦁', balance: 8500, isOnline: true, currentRoomId: '8888' },
  { id: 3, username: 'wangwu', nickname: '沉稳老王', avatar: '🦊', balance: 12000, isOnline: false, currentRoomId: null },
  { id: 4, username: 'a强', nickname: '梭哈大师阿强', avatar: '🐯', balance: 6400, isOnline: false, currentRoomId: null },
];

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBack }) => {
  const [users, setUsers] = useState<MockAdminUser[]>(INITIAL_MOCK_USERS);
  const [selectedUser, setSelectedUser] = useState<MockAdminUser | null>(null);

  // 开通账号表单
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('123456');
  const [newNickname, setNewNickname] = useState('');
  const [newInitialChips, setNewInitialChips] = useState(5000);

  // 充减筹码表单
  const [showChipsModal, setShowChipsModal] = useState(false);
  const [chipAmount, setChipAmount] = useState(1000);
  const [chipReason, setChipReason] = useState('线下结算转账');

  // 重置密码表单
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [resetNewPass, setResetNewPass] = useState('123456');

  const [toastMsg, setToastMsg] = useState('');

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.adminCreateUser({
        username: newUsername,
        password: newPassword,
        nickname: newNickname,
        avatar: '👤',
        initialChips: newInitialChips,
      });
    } catch {
      // 本地离线模拟
    }

    const newUser: MockAdminUser = {
      id: Date.now(),
      username: newUsername,
      nickname: newNickname || newUsername,
      avatar: '👤',
      balance: newInitialChips,
      isOnline: false,
      currentRoomId: null,
    };
    setUsers([newUser, ...users]);
    setShowCreateModal(false);
    setNewUsername('');
    setNewNickname('');
    showToast(`✅ 账号 ${newUser.username} 开通成功！`);
  };

  const handleAdjustChips = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    try {
      await api.adminAdjustChips(selectedUser.id, chipAmount, chipReason);
    } catch {
      // 容错
    }

    setUsers(
      users.map((u) =>
        u.id === selectedUser.id ? { ...u, balance: Math.max(0, u.balance + chipAmount) } : u
      )
    );
    setShowChipsModal(false);
    showToast(`✅ 筹码变动生效：${chipAmount >= 0 ? '+' : ''}${chipAmount}`);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    try {
      await api.adminResetPassword(selectedUser.id, resetNewPass);
    } catch {
      // 容错
    }
    setShowPasswordModal(false);
    showToast(`✅ 密码已重置为: ${resetNewPass}`);
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col p-4 sm:p-8 select-none">
      {/* 顶部标题与返回 */}
      <div className="max-w-5xl mx-auto w-full flex items-center justify-between pb-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-100">房主/管理员控制台</h1>
              <span className="text-xs text-slate-400">发号管理 · 筹码调配 · 账户审计</span>
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 active:scale-95 transition"
        >
          <UserPlus className="w-4 h-4" />
          <span>开通新账号</span>
        </button>
      </div>

      {/* 提示通知 */}
      {toastMsg && (
        <div className="max-w-5xl mx-auto w-full mt-4 p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-xs font-bold flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* 用户列表表格 */}
      <div className="max-w-5xl mx-auto w-full mt-6 bg-slate-900/80 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-400">在册玩家列表 ({users.length})</span>
          <span className="text-[11px] text-slate-500">点击操作列可直接调配筹码与密码</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800/80 bg-slate-950/40 text-slate-400 font-bold">
                <th className="py-3 px-4">玩家账号</th>
                <th className="py-3 px-4">昵称</th>
                <th className="py-3 px-4">钱包余额</th>
                <th className="py-3 px-4">实时状态</th>
                <th className="py-3 px-4 text-right">管理操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-850/50 transition">
                  <td className="py-3.5 px-4 font-mono font-bold text-slate-200">{u.username}</td>
                  <td className="py-3.5 px-4 text-slate-300">
                    <span className="mr-1.5">{u.avatar}</span>
                    <span>{u.nickname}</span>
                  </td>
                  <td className="py-3.5 px-4 font-mono font-bold text-amber-400">
                    🪙 {u.balance.toLocaleString()}
                  </td>
                  <td className="py-3.5 px-4">
                    {u.isOnline ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-bold">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                        <span>在线 {u.currentRoomId ? `(房 ${u.currentRoomId})` : ''}</span>
                      </span>
                    ) : (
                      <span className="text-slate-500 text-[11px]">离线</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="inline-flex gap-2">
                      <button
                        onClick={() => {
                          setSelectedUser(u);
                          setShowChipsModal(true);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold text-[11px] flex items-center gap-1"
                      >
                        <Coins className="w-3 h-3" />
                        <span>充/减筹码</span>
                      </button>
                      <button
                        onClick={() => {
                          setSelectedUser(u);
                          setShowPasswordModal(true);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[11px] flex items-center gap-1"
                      >
                        <Key className="w-3 h-3" />
                        <span>改密</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 开通账号弹窗 */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl">
            <h3 className="text-base font-black text-slate-100 mb-4">开通新玩家账号</h3>
            <form onSubmit={handleCreateUser} className="flex flex-col gap-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-400 mb-1">账号 (登录凭据)</label>
                <input
                  type="text"
                  required
                  placeholder="例如: friend01"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-400 mb-1">初始密码</label>
                <input
                  type="text"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-400 mb-1">显示昵称</label>
                <input
                  type="text"
                  placeholder="例如: 赌侠小明"
                  value={newNickname}
                  onChange={(e) => setNewNickname(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-400 mb-1">初始分配筹码</label>
                <input
                  type="number"
                  required
                  value={newInitialChips}
                  onChange={(e) => setNewInitialChips(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 outline-none focus:border-amber-400 font-mono"
                />
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 font-bold"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black"
                >
                  确认开通
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 充减筹码弹窗 */}
      {showChipsModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-sm bg-slate-900 border border-amber-500/40 rounded-3xl p-6 shadow-2xl">
            <h3 className="text-base font-black text-slate-100 mb-2">调配筹码</h3>
            <span className="text-xs text-slate-400">
              目标玩家：<strong className="text-amber-400">{selectedUser.nickname}</strong> (当前余额: {selectedUser.balance})
            </span>

            <form onSubmit={handleAdjustChips} className="mt-4 flex flex-col gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-400 mb-1">变动数额 (负数为扣减)</label>
                <input
                  type="number"
                  required
                  value={chipAmount}
                  onChange={(e) => setChipAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 outline-none focus:border-amber-400 font-mono text-sm"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-400 mb-1">操作说明 / 审计备注</label>
                <input
                  type="text"
                  required
                  value={chipReason}
                  onChange={(e) => setChipReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 outline-none focus:border-amber-400"
                />
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowChipsModal(false)}
                  className="flex-1 py-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 font-bold"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black"
                >
                  确认生效
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 修改密码弹窗 */}
      {showPasswordModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl">
            <h3 className="text-base font-black text-slate-100 mb-2">重置玩家密码</h3>
            <span className="text-xs text-slate-400">
              目标账号：<strong className="text-slate-200">{selectedUser.username}</strong>
            </span>

            <form onSubmit={handleResetPassword} className="mt-4 flex flex-col gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-400 mb-1">新密码</label>
                <input
                  type="text"
                  required
                  value={resetNewPass}
                  onChange={(e) => setResetNewPass(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 outline-none focus:border-amber-400"
                />
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="flex-1 py-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 font-bold"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black"
                >
                  确认重置
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
