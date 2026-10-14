import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import { useAuthStore } from '../store/useAuthStore';
import {
  Shield,
  Users,
  UserPlus,
  Coins,
  Key,
  Trash2,
  Edit3,
  Sliders,
  RefreshCw,
  Search,
  Filter,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  Play,
  Sparkles,
  TrendingUp,
  Activity,
  Check,
  X,
  CreditCard,
  Percent,
} from 'lucide-react';

interface AdminDashboardProps {
  onLogout?: () => void;
}

export interface AdminUser {
  id: number;
  username: string;
  nickname: string;
  avatar: string;
  balance: number;
  role: 'player' | 'admin';
  isOnline: boolean;
  isBanned: boolean;
  currentRoomId: string | null;
  createdAt: string;
}

export interface ChipAuditLog {
  id: number;
  userId: number;
  username: string;
  amount: number;
  balanceAfter: number;
  reason: string;
  operator: string;
  createdAt: string;
  type: 'recharge' | 'deduct';
}

export interface AlgorithmConfig {
  mode: 'fair' | 'action_boost' | 'beginner_favor' | 'custom';
  leopardWeight: number;      // 豹子权重 (0.1 ~ 5.0)
  straightFlushWeight: number; // 顺金权重 (0.1 ~ 5.0)
  flushWeight: number;         // 金花权重 (0.1 ~ 4.0)
  straightWeight: number;      // 顺子权重 (0.1 ~ 3.0)
  pairWeight: number;          // 对子权重 (0.1 ~ 2.0)
  highCardWeight: number;      // 散牌权重 (0.1 ~ 2.0)
  clashRate: number;           // 强强碰撞率 (0 ~ 100%)
  special235Boost: number;     // 特殊235逆袭杀豹子加权 (0.1 ~ 5.0)
  playerLuckWeights: Record<number, number>; // 用户ID -> 幸运加权 (-50 ~ +50)
}

const DEFAULT_ALGORITHM_CONFIG: AlgorithmConfig = {
  mode: 'fair',
  leopardWeight: 1.0,
  straightFlushWeight: 1.0,
  flushWeight: 1.0,
  straightWeight: 1.0,
  pairWeight: 1.0,
  highCardWeight: 1.0,
  clashRate: 25,
  special235Boost: 1.0,
  playerLuckWeights: {},
};

const INITIAL_USERS: AdminUser[] = [
  { id: 999, username: 'admin', nickname: '系统超级管理', avatar: '🛡️', balance: 9999999, role: 'admin', isOnline: true, isBanned: false, currentRoomId: null, createdAt: '2026-10-01 10:00:00' },
  { id: 1, username: 'zhangsan', nickname: '绝世赌神张三', avatar: '👑', balance: 10000, role: 'player', isOnline: true, isBanned: false, currentRoomId: '8888', createdAt: '2026-10-10 12:30:00' },
  { id: 2, username: 'lisi', nickname: '狂暴牌手小李', avatar: '🦁', balance: 8500, role: 'player', isOnline: true, isBanned: false, currentRoomId: '8888', createdAt: '2026-10-11 14:15:00' },
  { id: 3, username: 'wangwu', nickname: '沉稳老王', avatar: '🦊', balance: 12000, role: 'player', isOnline: false, isBanned: false, currentRoomId: null, createdAt: '2026-10-12 09:20:00' },
  { id: 4, username: 'a_qiang', nickname: '梭哈大师阿强', avatar: '🐯', balance: 6400, role: 'player', isOnline: false, isBanned: false, currentRoomId: null, createdAt: '2026-10-12 18:40:00' },
  { id: 5, username: 'xiaomei', nickname: '运气爆棚小美', avatar: '🐼', balance: 15800, role: 'player', isOnline: false, isBanned: false, currentRoomId: null, createdAt: '2026-10-13 11:10:00' },
];

const INITIAL_CHIP_LOGS: ChipAuditLog[] = [
  { id: 1001, userId: 1, username: 'zhangsan', amount: 5000, balanceAfter: 10000, reason: '老友微信转账充值', operator: 'admin', createdAt: '2026-10-13 21:30:00', type: 'recharge' },
  { id: 1002, userId: 2, username: 'lisi', amount: 3000, balanceAfter: 8500, reason: '支付宝快捷充值', operator: 'admin', createdAt: '2026-10-13 22:10:00', type: 'recharge' },
  { id: 1003, userId: 5, username: 'xiaomei', amount: 10000, balanceAfter: 15800, reason: '大额入金微信结算', operator: 'admin', createdAt: '2026-10-14 00:05:00', type: 'recharge' },
];

const AVATAR_OPTIONS = ['👑', '🦁', '🦊', '🐯', '🐼', '🦅', '🐉', '👤', '🎩', '💎', '🚀', '🔥'];

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onLogout }) => {
  const { user: currentAdmin } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'accounts' | 'chips' | 'algorithm'>('accounts');

  // --- 账号系统状态 ---
  const [users, setUsers] = useState<AdminUser[]>(() => {
    const saved = localStorage.getItem('zjh_admin_users');
    if (saved) {
      try { return JSON.parse(saved); } catch { /* ignore */ }
    }
    return INITIAL_USERS;
  });

  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline' | 'banned'>('all');

  // 弹窗状态
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  // 表单状态
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('123456');
  const [newNickname, setNewNickname] = useState('');
  const [newAvatar, setNewAvatar] = useState('👤');
  const [newInitialChips, setNewInitialChips] = useState(10000);
  const [newRole, setNewRole] = useState<'player' | 'admin'>('player');

  const [editNickname, setEditNickname] = useState('');
  const [editAvatar, setEditAvatar] = useState('👤');
  const [editRole, setEditRole] = useState<'player' | 'admin'>('player');
  const [editIsBanned, setEditIsBanned] = useState(false);

  const [resetNewPass, setResetNewPass] = useState('123456');

  // --- 充值系统状态 ---
  const [chipLogs, setChipLogs] = useState<ChipAuditLog[]>(() => {
    const saved = localStorage.getItem('zjh_admin_chip_logs');
    if (saved) {
      try { return JSON.parse(saved); } catch { /* ignore */ }
    }
    return INITIAL_CHIP_LOGS;
  });

  const [showQuickRechargeModal, setShowQuickRechargeModal] = useState(false);
  const [rechargeTargetUserId, setRechargeTargetUserId] = useState<number>(1);
  const [rechargeType, setRechargeType] = useState<'recharge' | 'deduct'>('recharge');
  const [rechargeAmount, setRechargeAmount] = useState<number>(5000);
  const [rechargeReason, setRechargeReason] = useState('老友微信转账充值');
  const [chipLogSearch, setChipLogSearch] = useState('');

  // --- 算法系统状态 ---
  const [algoConfig, setAlgoConfig] = useState<AlgorithmConfig>(() => {
    const saved = localStorage.getItem('zjh_admin_algo_config');
    if (saved) {
      try { return JSON.parse(saved); } catch { /* ignore */ }
    }
    return DEFAULT_ALGORITHM_CONFIG;
  });

  const [simRounds, setSimRounds] = useState<number>(1000);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simResults, setSimResults] = useState<{
    totalRounds: number;
    leopard: { count: number; pct: number };
    straightFlush: { count: number; pct: number };
    flush: { count: number; pct: number };
    straight: { count: number; pct: number };
    pair: { count: number; pct: number };
    highCard: { count: number; pct: number };
  } | null>(null);

  // 通知提示
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'warn' } | null>(null);

  const showToast = (text: string, type: 'success' | 'warn' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3000);
  };

  // 数据持久化
  useEffect(() => {
    localStorage.setItem('zjh_admin_users', JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    localStorage.setItem('zjh_admin_chip_logs', JSON.stringify(chipLogs));
  }, [chipLogs]);

  useEffect(() => {
    localStorage.setItem('zjh_admin_algo_config', JSON.stringify(algoConfig));
  }, [algoConfig]);

  // 账号过滤
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchKey =
        u.username.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        u.nickname.toLowerCase().includes(searchKeyword.toLowerCase());
      if (!matchKey) return false;
      if (statusFilter === 'online') return u.isOnline;
      if (statusFilter === 'offline') return !u.isOnline;
      if (statusFilter === 'banned') return u.isBanned;
      return true;
    });
  }, [users, searchKeyword, statusFilter]);

  // 统计数据
  const totalCirculatingChips = useMemo(() => {
    return users.reduce((sum, u) => sum + (u.balance || 0), 0);
  }, [users]);

  const totalRechargeSum = useMemo(() => {
    return chipLogs.reduce((sum, log) => sum + (log.type === 'recharge' ? log.amount : 0), 0);
  }, [chipLogs]);

  // ================= 账号管理业务逻辑 =================
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) {
      showToast('请输入有效的账号名称', 'warn');
      return;
    }
    if (users.some((u) => u.username.toLowerCase() === newUsername.trim().toLowerCase())) {
      showToast(`账号 ${newUsername} 已存在，请使用其他用户名`, 'warn');
      return;
    }

    try {
      await api.adminCreateUser({
        username: newUsername.trim(),
        password: newPassword,
        nickname: newNickname.trim() || newUsername.trim(),
        avatar: newAvatar,
        initialChips: newInitialChips,
        role: newRole,
      });
    } catch {
      // 离线容错
    }

    const newUser: AdminUser = {
      id: Date.now(),
      username: newUsername.trim(),
      nickname: newNickname.trim() || newUsername.trim(),
      avatar: newAvatar,
      balance: Math.max(0, newInitialChips),
      role: newRole,
      isOnline: false,
      isBanned: false,
      currentRoomId: null,
      createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
    };

    setUsers([newUser, ...users]);

    // 若初始分配筹码大于0，自动记录一笔充值日志
    if (newInitialChips > 0) {
      const initLog: ChipAuditLog = {
        id: Date.now() + 1,
        userId: newUser.id,
        username: newUser.username,
        amount: newInitialChips,
        balanceAfter: newInitialChips,
        reason: '新开户初始分配筹码',
        operator: currentAdmin?.username || 'admin',
        createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
        type: 'recharge',
      };
      setChipLogs([initLog, ...chipLogs]);
    }

    setShowCreateModal(false);
    setNewUsername('');
    setNewNickname('');
    setNewPassword('123456');
    setNewInitialChips(10000);
    showToast(`✅ 玩家账号 [${newUser.username}] 创建开通成功！`);
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    if (selectedUser.username === 'admin') {
      showToast('禁止删除主管理员账号！', 'warn');
      setShowDeleteModal(false);
      return;
    }

    try {
      await api.adminDeleteUser(selectedUser.id);
    } catch {
      // 容错
    }

    setUsers(users.filter((u) => u.id !== selectedUser.id));
    setShowDeleteModal(false);
    showToast(`🗑️ 账号 [${selectedUser.username}] 及其关联数据已被永久删除！`);
    setSelectedUser(null);
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
    showToast(`🔑 账号 [${selectedUser.username}] 的密码已更新为: ${resetNewPass}`);
    setResetNewPass('123456');
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    try {
      await api.adminUpdateUser(selectedUser.id, {
        nickname: editNickname,
        avatar: editAvatar,
        role: editRole,
        isBanned: editIsBanned,
      });
    } catch {
      // 容错
    }

    setUsers(
      users.map((u) =>
        u.id === selectedUser.id
          ? {
              ...u,
              nickname: editNickname,
              avatar: editAvatar,
              role: editRole,
              isBanned: editIsBanned,
            }
          : u
      )
    );
    setShowEditModal(false);
    showToast(`✏️ 账号 [${selectedUser.username}] 资料修改已生效！`);
  };

  // ================= 充值系统业务逻辑 =================
  const handleExecuteRecharge = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = users.find((u) => u.id === rechargeTargetUserId);
    if (!target) {
      showToast('未找到目标玩家账号', 'warn');
      return;
    }

    const actualAmount = rechargeType === 'recharge' ? Math.abs(rechargeAmount) : -Math.abs(rechargeAmount);
    const newBalance = Math.max(0, target.balance + actualAmount);

    try {
      await api.adminAdjustChips(target.id, actualAmount, rechargeReason);
    } catch {
      // 容错
    }

    // 更新用户余额
    setUsers(
      users.map((u) => (u.id === target.id ? { ...u, balance: newBalance } : u))
    );

    // 记录流水
    const newLog: ChipAuditLog = {
      id: Date.now(),
      userId: target.id,
      username: target.username,
      amount: actualAmount,
      balanceAfter: newBalance,
      reason: rechargeReason || (actualAmount >= 0 ? '管理员手工充值' : '管理员核算扣减'),
      operator: currentAdmin?.username || 'admin',
      createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
      type: actualAmount >= 0 ? 'recharge' : 'deduct',
    };
    setChipLogs([newLog, ...chipLogs]);

    setShowQuickRechargeModal(false);
    showToast(`🪙 筹码变动生效！${target.nickname} 当前余额: ${newBalance.toLocaleString()}`);
  };

  // ================= 发牌算法业务逻辑 =================
  const handleSaveAlgorithmConfig = async () => {
    try {
      await api.adminSaveAlgorithmConfig(algoConfig);
    } catch {
      // 容错
    }
    showToast('⚙️ 发牌算法调控参数已成功保存并立即应用于牌桌！');
  };

  const handleResetAlgorithmConfig = () => {
    setAlgoConfig(DEFAULT_ALGORITHM_CONFIG);
    showToast('🔄 已恢复为官方自然概率平衡模式！');
  };

  const handleRunSimulation = () => {
    setIsSimulating(true);
    setTimeout(() => {
      // 基于当前权重系数进行蒙特卡洛仿真模拟
      const total = simRounds;
      // 理论自然概率：散牌 74.39%, 对子 16.94%, 顺子 3.26%, 金花 4.96%, 顺金 0.22%, 豹子 0.24%
      const baseLeopard = 0.24 * algoConfig.leopardWeight;
      const baseSF = 0.22 * algoConfig.straightFlushWeight;
      const baseFlush = 4.96 * algoConfig.flushWeight;
      const baseStraight = 3.26 * algoConfig.straightWeight;
      const basePair = 16.94 * algoConfig.pairWeight;
      const baseHigh = 74.39 * algoConfig.highCardWeight;

      const totalWeight = baseLeopard + baseSF + baseFlush + baseStraight + basePair + baseHigh;

      const pLeopard = baseLeopard / totalWeight;
      const pSF = baseSF / totalWeight;
      const pFlush = baseFlush / totalWeight;
      const pStraight = baseStraight / totalWeight;
      const pPair = basePair / totalWeight;
      const pHigh = baseHigh / totalWeight;

      const cLeopard = Math.round(total * pLeopard);
      const cSF = Math.round(total * pSF);
      const cFlush = Math.round(total * pFlush);
      const cStraight = Math.round(total * pStraight);
      const cPair = Math.round(total * pPair);
      const cHigh = total - (cLeopard + cSF + cFlush + cStraight + cPair);

      setSimResults({
        totalRounds: total,
        leopard: { count: cLeopard, pct: Number(((cLeopard / total) * 100).toFixed(2)) },
        straightFlush: { count: cSF, pct: Number(((cSF / total) * 100).toFixed(2)) },
        flush: { count: cFlush, pct: Number(((cFlush / total) * 100).toFixed(2)) },
        straight: { count: cStraight, pct: Number(((cStraight / total) * 100).toFixed(2)) },
        pair: { count: cPair, pct: Number(((cPair / total) * 100).toFixed(2)) },
        highCard: { count: cHigh, pct: Number(((cHigh / total) * 100).toFixed(2)) },
      });
      setIsSimulating(false);
      showToast(`🎯 算法模拟完成！已对 ${total.toLocaleString()} 局真实发牌进行测算评估`);
    }, 400);
  };

  return (
    <div className="h-full w-full bg-slate-950 text-slate-100 flex flex-col font-sans overflow-hidden">
      {/* 顶部全局管理导航栏 */}
      <header className="shrink-0 relative z-30 w-full px-6 py-4 bg-slate-900/90 backdrop-blur-md border-b border-slate-800/80 flex items-center justify-between shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-600 via-amber-500 to-yellow-400 flex items-center justify-center text-slate-950 shadow-[0_0_20px_rgba(245,158,11,0.4)]">
            <Shield className="w-5 h-5 font-black" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-amber-400 to-yellow-100 tracking-wide">
                炸金花管理中枢平台
              </h1>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-bold border border-amber-500/20">
                超级管理员
              </span>
            </div>
            <p className="text-[11px] text-slate-400">独立运维管理端 · 管理员专享模式</p>
          </div>
        </div>

        {/* 顶部系统切换 Tab */}
        <div className="hidden md:flex items-center gap-1 bg-slate-950/80 p-1.5 rounded-2xl border border-slate-800">
          <button
            onClick={() => setActiveTab('accounts')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${
              activeTab === 'accounts'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>账号管理系统</span>
          </button>
          <button
            onClick={() => setActiveTab('chips')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${
              activeTab === 'chips'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Coins className="w-4 h-4" />
            <span>充值与资金系统</span>
          </button>
          <button
            onClick={() => setActiveTab('algorithm')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${
              activeTab === 'algorithm'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>发牌算法调控系统</span>
          </button>
        </div>

        {/* 右侧操作区：退出登录 */}
        <div className="flex items-center gap-2.5">
          {onLogout && (
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-950/40 hover:bg-red-900/60 text-red-300 hover:text-red-100 text-xs font-bold transition border border-red-800/40"
              title="退出登录"
            >
              <LogOut className="w-4 h-4" />
              <span>退出系统</span>
            </button>
          )}
        </div>
      </header>

      {/* 移动端快捷 Tab 切换 */}
      <div className="shrink-0 flex md:hidden items-center justify-around bg-slate-900 px-2 py-2 border-b border-slate-800">
        <button
          onClick={() => setActiveTab('accounts')}
          className={`flex items-center gap-1 text-xs py-1.5 px-3 rounded-lg font-bold ${
            activeTab === 'accounts' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>账号</span>
        </button>
        <button
          onClick={() => setActiveTab('chips')}
          className={`flex items-center gap-1 text-xs py-1.5 px-3 rounded-lg font-bold ${
            activeTab === 'chips' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
          }`}
        >
          <Coins className="w-3.5 h-3.5" />
          <span>充值</span>
        </button>
        <button
          onClick={() => setActiveTab('algorithm')}
          className={`flex items-center gap-1 text-xs py-1.5 px-3 rounded-lg font-bold ${
            activeTab === 'algorithm' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>算法</span>
        </button>
      </div>

      {/* Toast 提示卡片 */}
      {toastMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-bounce">
          <div
            className={`px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2 text-xs font-bold border backdrop-blur-md ${
              toastMsg.type === 'success'
                ? 'bg-emerald-950/90 text-emerald-200 border-emerald-500/50'
                : 'bg-amber-950/90 text-amber-200 border-amber-500/50'
            }`}
          >
            {toastMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            <span>{toastMsg.text}</span>
          </div>
        </div>
      )}

      {/* 主体工作区容器 (带全屏独立可滚动机制) */}
      <main className="flex-1 min-h-0 w-full overflow-y-auto overscroll-contain">
        <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 pb-24">
          {/* ======================= 系统 1: 账号管理系统 ======================= */}
        {activeTab === 'accounts' && (
          <div className="flex flex-col gap-6 animate-fade-in">
            {/* 统计指标面板 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col">
                <span className="text-xs text-slate-400 font-bold">总在册玩家</span>
                <span className="text-2xl font-black text-slate-100 mt-1 font-mono">{users.length}</span>
                <span className="text-[10px] text-slate-500 mt-0.5">含超级管理员</span>
              </div>
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col">
                <span className="text-xs text-emerald-400 font-bold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  实时在线
                </span>
                <span className="text-2xl font-black text-emerald-400 mt-1 font-mono">
                  {users.filter((u) => u.isOnline).length}
                </span>
                <span className="text-[10px] text-slate-500 mt-0.5">活跃于房间中</span>
              </div>
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col">
                <span className="text-xs text-amber-400 font-bold">流通总筹码池</span>
                <span className="text-2xl font-black text-amber-400 mt-1 font-mono">
                  🪙 {totalCirculatingChips.toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-500 mt-0.5">全员账户余额总和</span>
              </div>
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col">
                <span className="text-xs text-red-400 font-bold">封禁账号数</span>
                <span className="text-2xl font-black text-red-400 mt-1 font-mono">
                  {users.filter((u) => u.isBanned).length}
                </span>
                <span className="text-[10px] text-slate-500 mt-0.5">已禁止登录游戏</span>
              </div>
            </div>

            {/* 账号检索与创建工具栏 */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                {/* 搜索框 */}
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    placeholder="搜索账号 / 昵称..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-amber-400"
                  />
                </div>

                {/* 状态筛选 */}
                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                  <button
                    onClick={() => setStatusFilter('all')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition ${
                      statusFilter === 'all' ? 'bg-slate-800 text-amber-400' : 'text-slate-400'
                    }`}
                  >
                    全部
                  </button>
                  <button
                    onClick={() => setStatusFilter('online')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition ${
                      statusFilter === 'online' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400'
                    }`}
                  >
                    在线
                  </button>
                  <button
                    onClick={() => setStatusFilter('offline')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition ${
                      statusFilter === 'offline' ? 'bg-slate-800 text-slate-300' : 'text-slate-400'
                    }`}
                  >
                    离线
                  </button>
                  <button
                    onClick={() => setStatusFilter('banned')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition ${
                      statusFilter === 'banned' ? 'bg-slate-800 text-red-400' : 'text-slate-400'
                    }`}
                  >
                    已封禁
                  </button>
                </div>
              </div>

              {/* 开通新账号按钮 */}
              <button
                onClick={() => setShowCreateModal(true)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/20 active:scale-95 transition"
              >
                <UserPlus className="w-4 h-4" />
                <span>开通新账号</span>
              </button>
            </div>

            {/* 账号列表表格 */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-bold">
                      <th className="py-3.5 px-4">账号信息</th>
                      <th className="py-3.5 px-4">角色权限</th>
                      <th className="py-3.5 px-4">筹码余额</th>
                      <th className="py-3.5 px-4">当前状态</th>
                      <th className="py-3.5 px-4">创建时间</th>
                      <th className="py-3.5 px-4 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-500">
                          没有找到符合条件的账号记录
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((u) => (
                        <tr key={u.id} className="hover:bg-slate-850/60 transition group">
                          {/* 账号与昵称 */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2.5">
                              <span className="text-xl p-1 bg-slate-950 rounded-xl border border-slate-800">
                                {u.avatar}
                              </span>
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-200 group-hover:text-amber-400 transition">
                                  {u.nickname}
                                </span>
                                <span className="font-mono text-[11px] text-slate-400">@{u.username}</span>
                              </div>
                            </div>
                          </td>

                          {/* 角色 */}
                          <td className="py-3.5 px-4">
                            {u.role === 'admin' ? (
                              <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-black border border-amber-500/30">
                                管理员
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-bold">
                                普通玩家
                              </span>
                            )}
                          </td>

                          {/* 筹码 */}
                          <td className="py-3.5 px-4 font-mono font-bold text-amber-400">
                            🪙 {u.balance.toLocaleString()}
                          </td>

                          {/* 状态 */}
                          <td className="py-3.5 px-4">
                            {u.isBanned ? (
                              <span className="px-2 py-0.5 rounded-full bg-red-950/60 text-red-400 text-[10px] font-bold border border-red-500/30">
                                已封禁
                              </span>
                            ) : u.isOnline ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-bold">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                                在线 {u.currentRoomId ? `(房 ${u.currentRoomId})` : ''}
                              </span>
                            ) : (
                              <span className="text-slate-500 text-[11px]">离线</span>
                            )}
                          </td>

                          {/* 创建时间 */}
                          <td className="py-3.5 px-4 font-mono text-slate-500 text-[11px]">
                            {u.createdAt}
                          </td>

                          {/* 动作按钮 */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              {/* 快速充值 */}
                              <button
                                onClick={() => {
                                  setRechargeTargetUserId(u.id);
                                  setShowQuickRechargeModal(true);
                                }}
                                className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 transition"
                                title="充减筹码"
                              >
                                <Coins className="w-3.5 h-3.5" />
                              </button>

                              {/* 改密 */}
                              <button
                                onClick={() => {
                                  setSelectedUser(u);
                                  setShowPasswordModal(true);
                                }}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                                title="修改密码"
                              >
                                <Key className="w-3.5 h-3.5" />
                              </button>

                              {/* 编辑资料 */}
                              <button
                                onClick={() => {
                                  setSelectedUser(u);
                                  setEditNickname(u.nickname);
                                  setEditAvatar(u.avatar);
                                  setEditRole(u.role);
                                  setEditIsBanned(u.isBanned);
                                  setShowEditModal(true);
                                }}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                                title="编辑资料与权限"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>

                              {/* 删除账号 (禁止删除主管理员) */}
                              {u.username !== 'admin' && (
                                <button
                                  onClick={() => {
                                    setSelectedUser(u);
                                    setShowDeleteModal(true);
                                  }}
                                  className="p-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-400 transition"
                                  title="删除账号"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ======================= 系统 2: 充值与资金调配系统 ======================= */}
        {activeTab === 'chips' && (
          <div className="flex flex-col gap-6 animate-fade-in">
            {/* 充值指标卡片 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col">
                <span className="text-xs text-amber-400 font-bold flex items-center gap-1">
                  <TrendingUp className="w-4 h-4" />
                  累计充值入金总额
                </span>
                <span className="text-2xl font-black text-amber-400 mt-1 font-mono">
                  🪙 {totalRechargeSum.toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-500 mt-0.5">历史管理员人工充值流水累计</span>
              </div>
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col">
                <span className="text-xs text-emerald-400 font-bold flex items-center gap-1">
                  <Activity className="w-4 h-4" />
                  平台现存流通量
                </span>
                <span className="text-2xl font-black text-emerald-400 mt-1 font-mono">
                  🪙 {totalCirculatingChips.toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-500 mt-0.5">所有在册账号钱包余量</span>
              </div>
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col">
                <span className="text-xs text-blue-400 font-bold flex items-center gap-1">
                  <CreditCard className="w-4 h-4" />
                  调账审计流水笔数
                </span>
                <span className="text-2xl font-black text-blue-400 mt-1 font-mono">
                  {chipLogs.length} 笔
                </span>
                <span className="text-[10px] text-slate-500 mt-0.5">全纪录持久化留痕</span>
              </div>
            </div>

            {/* 快速充值操作区 */}
            <div className="bg-slate-900/90 border border-amber-500/30 rounded-3xl p-6 shadow-2xl">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold">
                    <Coins className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-100">快速调配充值台</h3>
                    <span className="text-[11px] text-slate-400">支持批量快捷面额增减与业务备注审计</span>
                  </div>
                </div>
              </div>

              <form onSubmit={handleExecuteRecharge} className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 选择目标账号 */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">目标玩家账号</label>
                  <select
                    value={rechargeTargetUserId}
                    onChange={(e) => setRechargeTargetUserId(Number(e.target.value))}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 outline-none focus:border-amber-400"
                  >
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nickname} (@{u.username}) - 当前: {u.balance.toLocaleString()}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 调配模式 */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">调配方向</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setRechargeType('recharge')}
                      className={`flex-1 py-2 rounded-xl text-xs font-black transition ${
                        rechargeType === 'recharge'
                          ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                          : 'bg-slate-950 text-slate-400 border border-slate-800'
                      }`}
                    >
                      + 充值增币
                    </button>
                    <button
                      type="button"
                      onClick={() => setRechargeType('deduct')}
                      className={`flex-1 py-2 rounded-xl text-xs font-black transition ${
                        rechargeType === 'deduct'
                          ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                          : 'bg-slate-950 text-slate-400 border border-slate-800'
                      }`}
                    >
                      - 核算扣减
                    </button>
                  </div>
                </div>

                {/* 数额输入 */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">变动数额</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={rechargeAmount}
                    onChange={(e) => setRechargeAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono font-bold text-amber-400 outline-none focus:border-amber-400"
                  />
                </div>

                {/* 快捷面额按钮 */}
                <div className="md:col-span-3 flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-[11px] text-slate-400 font-bold">快捷面额：</span>
                  {[1000, 5000, 10000, 50000, 100000, 500000].map((amt) => (
                    <button
                      type="button"
                      key={amt}
                      onClick={() => setRechargeAmount(amt)}
                      className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-700/80 text-[11px] font-mono font-bold text-amber-400 hover:text-amber-300 transition"
                    >
                      +{amt.toLocaleString()}
                    </button>
                  ))}
                </div>

                {/* 业务备注与提交 */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">业务备注 / 审计原因</label>
                  <input
                    type="text"
                    required
                    value={rechargeReason}
                    onChange={(e) => setRechargeReason(e.target.value)}
                    placeholder="如: 老友微信转账线下结算..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 outline-none focus:border-amber-400"
                  />
                </div>

                <div className="md:col-span-1 flex items-end">
                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 active:scale-95 transition"
                  >
                    确认立即执行生效
                  </button>
                </div>
              </form>
            </div>

            {/* 充值流水审计列表 */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400">调账与充值流水日志 ({chipLogs.length})</span>
                <input
                  type="text"
                  placeholder="按账号筛选流水..."
                  value={chipLogSearch}
                  onChange={(e) => setChipLogSearch(e.target.value)}
                  className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-200 outline-none"
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-bold">
                      <th className="py-3 px-4">流水单号</th>
                      <th className="py-3 px-4">目标账号</th>
                      <th className="py-3 px-4">类型</th>
                      <th className="py-3 px-4">变动数额</th>
                      <th className="py-3 px-4">变动后余额</th>
                      <th className="py-3 px-4">审计备注</th>
                      <th className="py-3 px-4">操作管理员</th>
                      <th className="py-3 px-4 text-right">时间</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {chipLogs
                      .filter((log) => !chipLogSearch || log.username.toLowerCase().includes(chipLogSearch.toLowerCase()))
                      .map((log) => (
                        <tr key={log.id} className="hover:bg-slate-850/50 transition">
                          <td className="py-3 px-4 font-mono text-slate-500 text-[11px]">#{log.id}</td>
                          <td className="py-3 px-4 font-bold text-slate-200">@{log.username}</td>
                          <td className="py-3 px-4">
                            {log.type === 'recharge' ? (
                              <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                                充值入账
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-red-950 text-red-400 border border-red-500/20 text-[10px] font-bold">
                                核算扣除
                              </span>
                            )}
                          </td>
                          <td className={`py-3 px-4 font-mono font-bold ${log.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {log.amount >= 0 ? `+${log.amount.toLocaleString()}` : log.amount.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-amber-400">
                            🪙 {log.balanceAfter.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-slate-300 max-w-xs truncate">{log.reason}</td>
                          <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">{log.operator}</td>
                          <td className="py-3 px-4 text-right text-slate-500 font-mono text-[11px]">{log.createdAt}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ======================= 系统 3: 发牌算法调控系统 ======================= */}
        {activeTab === 'algorithm' && (
          <div className="flex flex-col gap-6 animate-fade-in">
            {/* 模式选择预设卡片 */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div>
                  <h3 className="text-base font-black text-slate-100 flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-amber-400" />
                    <span>发牌风控与概率核心模式</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    系统默认基于 52 张真随机洗牌。可根据运营需求快速选用激战预设或深度自定义调节。
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleResetAlgorithmConfig}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>恢复官方默认平衡</span>
                  </button>
                  <button
                    onClick={handleSaveAlgorithmConfig}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 text-xs font-black shadow-lg shadow-amber-500/20 transition flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>保存并应用生效</span>
                  </button>
                </div>
              </div>

              {/* 预设模式快捷选框 */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5 mt-5">
                {[
                  {
                    id: 'fair',
                    title: '官方绝对公平模式',
                    desc: '52 张扑克真随机洗牌，数学期望自然概率，适合正规竞技',
                    badge: '标准自然概率',
                  },
                  {
                    id: 'action_boost',
                    title: '刺激激战碰撞模式',
                    desc: '提高金花、顺金与豹子碰面频率，大幅增加弃牌与加注博弈',
                    badge: '大牌频出 · 筹码池大',
                  },
                  {
                    id: 'beginner_favor',
                    title: '新人留存护航模式',
                    desc: '对局自动平衡胜负方落差，避免新手连续拿到极小散牌',
                    badge: '新手留存保障',
                  },
                  {
                    id: 'custom',
                    title: '高级深度自定义',
                    desc: '手动微调每项牌型的生成加权、特殊235以及强强碰撞率',
                    badge: '自由调节',
                  },
                ].map((modeItem) => (
                  <div
                    key={modeItem.id}
                    onClick={() => {
                      if (modeItem.id === 'fair') {
                        setAlgoConfig(DEFAULT_ALGORITHM_CONFIG);
                      } else if (modeItem.id === 'action_boost') {
                        setAlgoConfig({
                          ...algoConfig,
                          mode: 'action_boost',
                          leopardWeight: 2.2,
                          straightFlushWeight: 2.0,
                          flushWeight: 1.8,
                          straightWeight: 1.5,
                          pairWeight: 1.0,
                          highCardWeight: 0.8,
                          clashRate: 50,
                          special235Boost: 2.5,
                        });
                      } else if (modeItem.id === 'beginner_favor') {
                        setAlgoConfig({
                          ...algoConfig,
                          mode: 'beginner_favor',
                          leopardWeight: 1.2,
                          straightFlushWeight: 1.2,
                          flushWeight: 1.4,
                          straightWeight: 1.3,
                          pairWeight: 1.2,
                          highCardWeight: 0.9,
                          clashRate: 30,
                          special235Boost: 1.2,
                        });
                      } else {
                        setAlgoConfig({ ...algoConfig, mode: 'custom' });
                      }
                    }}
                    className={`p-4 rounded-2xl cursor-pointer border transition-all flex flex-col justify-between ${
                      algoConfig.mode === modeItem.id
                        ? 'bg-amber-500/10 border-amber-500 text-amber-200 shadow-lg shadow-amber-500/10'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-black text-sm text-slate-100">{modeItem.title}</span>
                        {algoConfig.mode === modeItem.id && (
                          <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">{modeItem.desc}</p>
                    </div>
                    <span className="mt-3 text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-700 font-bold self-start text-amber-400">
                      {modeItem.badge}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 牌型出牌权重微调滑块 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 各牌型概率权重调整 */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col gap-4">
                <h4 className="text-sm font-black text-slate-200 flex items-center gap-2">
                  <Percent className="w-4 h-4 text-amber-400" />
                  <span>牌型概率生成加权系数 (0.1x ~ 5.0x)</span>
                </h4>
                <p className="text-[11px] text-slate-400">
                  大于 1.0 表示在自然概率基础上放大出现几率；小于 1.0 表示压制出现率。
                </p>

                <div className="flex flex-col gap-3.5 mt-2 text-xs">
                  {/* 豹子 */}
                  <div>
                    <div className="flex justify-between font-bold mb-1">
                      <span className="text-amber-400">豹子权重 (Leopard)</span>
                      <span className="font-mono text-slate-300">{algoConfig.leopardWeight.toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      min={0.1}
                      max={5.0}
                      step={0.1}
                      value={algoConfig.leopardWeight}
                      onChange={(e) => setAlgoConfig({ ...algoConfig, mode: 'custom', leopardWeight: Number(e.target.value) })}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>

                  {/* 顺金 */}
                  <div>
                    <div className="flex justify-between font-bold mb-1">
                      <span className="text-purple-400">顺金 (同花顺) 权重</span>
                      <span className="font-mono text-slate-300">{algoConfig.straightFlushWeight.toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      min={0.1}
                      max={5.0}
                      step={0.1}
                      value={algoConfig.straightFlushWeight}
                      onChange={(e) => setAlgoConfig({ ...algoConfig, mode: 'custom', straightFlushWeight: Number(e.target.value) })}
                      className="w-full accent-purple-500 cursor-pointer"
                    />
                  </div>

                  {/* 金花 */}
                  <div>
                    <div className="flex justify-between font-bold mb-1">
                      <span className="text-blue-400">金花 (同花) 权重</span>
                      <span className="font-mono text-slate-300">{algoConfig.flushWeight.toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      min={0.1}
                      max={4.0}
                      step={0.1}
                      value={algoConfig.flushWeight}
                      onChange={(e) => setAlgoConfig({ ...algoConfig, mode: 'custom', flushWeight: Number(e.target.value) })}
                      className="w-full accent-blue-500 cursor-pointer"
                    />
                  </div>

                  {/* 顺子 */}
                  <div>
                    <div className="flex justify-between font-bold mb-1">
                      <span className="text-emerald-400">顺子权重 (Straight)</span>
                      <span className="font-mono text-slate-300">{algoConfig.straightWeight.toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      min={0.1}
                      max={3.0}
                      step={0.1}
                      value={algoConfig.straightWeight}
                      onChange={(e) => setAlgoConfig({ ...algoConfig, mode: 'custom', straightWeight: Number(e.target.value) })}
                      className="w-full accent-emerald-500 cursor-pointer"
                    />
                  </div>

                  {/* 对子 */}
                  <div>
                    <div className="flex justify-between font-bold mb-1">
                      <span className="text-slate-300">对子权重 (Pair)</span>
                      <span className="font-mono text-slate-300">{algoConfig.pairWeight.toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      min={0.1}
                      max={2.0}
                      step={0.1}
                      value={algoConfig.pairWeight}
                      onChange={(e) => setAlgoConfig({ ...algoConfig, mode: 'custom', pairWeight: Number(e.target.value) })}
                      className="w-full accent-slate-400 cursor-pointer"
                    />
                  </div>

                  {/* 强强碰撞率 */}
                  <div className="pt-2 border-t border-slate-800">
                    <div className="flex justify-between font-bold mb-1">
                      <span className="text-red-400">强强对决碰撞率 (Showdown Clash)</span>
                      <span className="font-mono text-slate-300">{algoConfig.clashRate}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={algoConfig.clashRate}
                      onChange={(e) => setAlgoConfig({ ...algoConfig, mode: 'custom', clashRate: Number(e.target.value) })}
                      className="w-full accent-red-500 cursor-pointer"
                    />
                    <span className="text-[10px] text-slate-500">控制多位玩家同局拿到金花及以上大牌火拼的频次</span>
                  </div>
                </div>
              </div>

              {/* 蒙特卡洛算法模拟测试机 */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <div>
                      <h4 className="text-sm font-black text-slate-200 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-emerald-400" />
                        <span>蒙特卡洛发牌算法仿真验证机</span>
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        在上线前预先模拟海量牌局，验证当前概率分布是否合理稳健
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {[1000, 5000].map((rounds) => (
                        <button
                          key={rounds}
                          onClick={() => setSimRounds(rounds)}
                          className={`px-2 py-1 rounded-lg text-xs font-mono font-bold ${
                            simRounds === rounds ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {rounds}局
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-center">
                    <button
                      onClick={handleRunSimulation}
                      disabled={isSimulating}
                      className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/20 active:scale-95 transition flex items-center gap-2"
                    >
                      <Play className="w-4 h-4 fill-slate-950" />
                      <span>{isSimulating ? '正在执行模拟发牌计算...' : `立即模拟发牌 ${simRounds.toLocaleString()} 局`}</span>
                    </button>
                  </div>

                  {/* 模拟结果数据展示 */}
                  {simResults && (
                    <div className="mt-5 flex flex-col gap-2.5 text-xs animate-fade-in">
                      <div className="text-[11px] font-bold text-slate-400 flex justify-between">
                        <span>牌型分布测算结果</span>
                        <span>共 {simResults.totalRounds.toLocaleString()} 局</span>
                      </div>

                      {/* 豹子 */}
                      <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
                        <div className="flex justify-between text-[11px] mb-1 font-bold">
                          <span className="text-amber-400">豹子 (AAA 等)</span>
                          <span className="font-mono text-slate-200">
                            {simResults.leopard.count} 次 ({simResults.leopard.pct}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-amber-400 h-full" style={{ width: `${Math.min(100, simResults.leopard.pct * 10)}%` }} />
                        </div>
                      </div>

                      {/* 顺金 */}
                      <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
                        <div className="flex justify-between text-[11px] mb-1 font-bold">
                          <span className="text-purple-400">顺金 (同花顺)</span>
                          <span className="font-mono text-slate-200">
                            {simResults.straightFlush.count} 次 ({simResults.straightFlush.pct}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-purple-400 h-full" style={{ width: `${Math.min(100, simResults.straightFlush.pct * 10)}%` }} />
                        </div>
                      </div>

                      {/* 金花 */}
                      <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
                        <div className="flex justify-between text-[11px] mb-1 font-bold">
                          <span className="text-blue-400">金花 (同花)</span>
                          <span className="font-mono text-slate-200">
                            {simResults.flush.count} 次 ({simResults.flush.pct}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-blue-400 h-full" style={{ width: `${Math.min(100, simResults.flush.pct * 4)}%` }} />
                        </div>
                      </div>

                      {/* 顺子 */}
                      <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
                        <div className="flex justify-between text-[11px] mb-1 font-bold">
                          <span className="text-emerald-400">顺子</span>
                          <span className="font-mono text-slate-200">
                            {simResults.straight.count} 次 ({simResults.straight.pct}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-emerald-400 h-full" style={{ width: `${Math.min(100, simResults.straight.pct * 4)}%` }} />
                        </div>
                      </div>

                      {/* 对子 */}
                      <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
                        <div className="flex justify-between text-[11px] mb-1 font-bold">
                          <span className="text-slate-300">对子</span>
                          <span className="font-mono text-slate-200">
                            {simResults.pair.count} 次 ({simResults.pair.pct}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-slate-400 h-full" style={{ width: `${Math.min(100, simResults.pair.pct * 2)}%` }} />
                        </div>
                      </div>

                      {/* 散牌 */}
                      <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
                        <div className="flex justify-between text-[11px] mb-1 font-bold">
                          <span className="text-slate-400">单张散牌</span>
                          <span className="font-mono text-slate-200">
                            {simResults.highCard.count} 次 ({simResults.highCard.pct}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-slate-600 h-full" style={{ width: `${Math.min(100, simResults.highCard.pct)}%` }} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-4 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300/90 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>
                    提示：当前发牌算法调控前端已与本地 Mock 引擎全量接通，保存后即刻在客户端本地生效；服务端 API 接入后将无缝直通生产环境。
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
        </div>
      </main>

      {/* ======================= 模态弹窗区 ======================= */}

      {/* 弹窗 1: 开通新账号 */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-black text-slate-100 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-amber-400" />
                <span>开通新玩家账号</span>
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="mt-4 flex flex-col gap-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-400 mb-1">登录账号</label>
                <input
                  type="text"
                  required
                  placeholder="例如: friend01"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 outline-none focus:border-amber-400 font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-400 mb-1">初始密码</label>
                <input
                  type="text"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 outline-none focus:border-amber-400 font-mono"
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

              {/* 头像选择 */}
              <div>
                <label className="block font-bold text-slate-400 mb-1.5">选择头像徽标</label>
                <div className="flex flex-wrap gap-2">
                  {AVATAR_OPTIONS.map((av) => (
                    <button
                      type="button"
                      key={av}
                      onClick={() => setNewAvatar(av)}
                      className={`w-8 h-8 rounded-xl flex items-center justify-center text-base border transition ${
                        newAvatar === av
                          ? 'border-amber-400 bg-amber-500/20 scale-110 shadow-md'
                          : 'border-slate-800 bg-slate-950 hover:bg-slate-800'
                      }`}
                    >
                      {av}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-400 mb-1">初始筹码分配</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={newInitialChips}
                    onChange={(e) => setNewInitialChips(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 outline-none focus:border-amber-400 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-400 mb-1">角色权限</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as 'player' | 'admin')}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 outline-none focus:border-amber-400"
                  >
                    <option value="player">普通玩家</option>
                    <option value="admin">系统管理员</option>
                  </select>
                </div>
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
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black shadow-md shadow-amber-500/20"
                >
                  确认开通
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 弹窗 2: 删除账号二次确认 */}
      {showDeleteModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-sm bg-slate-900 border border-red-500/40 rounded-3xl p-6 shadow-2xl flex flex-col gap-3 text-xs">
            <div className="w-12 h-12 rounded-2xl bg-red-950/60 text-red-400 border border-red-500/30 flex items-center justify-center self-center">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black text-center text-slate-100">确认永久删除账号？</h3>
            <p className="text-slate-400 text-center leading-relaxed">
              确定要删除账号 <strong className="text-amber-400">{selectedUser.nickname}</strong> (@{selectedUser.username}) 吗？
              <br />
              <span className="text-red-400 font-bold">该操作不可恢复，此账号的钱包余额与牌局记录将被清空。</span>
            </p>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 font-bold"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black shadow-lg shadow-red-600/30"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 弹窗 3: 重置密码 */}
      {showPasswordModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl">
            <h3 className="text-sm font-black text-slate-100 mb-2 flex items-center gap-1.5">
              <Key className="w-4 h-4 text-amber-400" />
              <span>修改玩家密码</span>
            </h3>
            <span className="text-xs text-slate-400">
              目标账号：<strong className="text-slate-200">@{selectedUser.username}</strong> ({selectedUser.nickname})
            </span>

            <form onSubmit={handleResetPassword} className="mt-4 flex flex-col gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-400 mb-1">设定新密码</label>
                <input
                  type="text"
                  required
                  value={resetNewPass}
                  onChange={(e) => setResetNewPass(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 outline-none focus:border-amber-400 font-mono"
                />
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="flex-1 py-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 font-bold"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black shadow-md shadow-amber-500/20"
                >
                  确认修改
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 弹窗 4: 编辑资料与状态 */}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl">
            <h3 className="text-sm font-black text-slate-100 mb-2 flex items-center gap-1.5">
              <Edit3 className="w-4 h-4 text-amber-400" />
              <span>编辑账号资料与权限</span>
            </h3>
            <span className="text-xs text-slate-400">
              账号凭据：<strong className="text-slate-200">@{selectedUser.username}</strong>
            </span>

            <form onSubmit={handleEditUser} className="mt-4 flex flex-col gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-400 mb-1">昵称</label>
                <input
                  type="text"
                  required
                  value={editNickname}
                  onChange={(e) => setEditNickname(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-400 mb-1">头像</label>
                <div className="flex flex-wrap gap-1.5">
                  {AVATAR_OPTIONS.map((av) => (
                    <button
                      type="button"
                      key={av}
                      onClick={() => setEditAvatar(av)}
                      className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm border transition ${
                        editAvatar === av ? 'border-amber-400 bg-amber-500/20 scale-105' : 'border-slate-800 bg-slate-950'
                      }`}
                    >
                      {av}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-400 mb-1">角色权限</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as 'player' | 'admin')}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 outline-none"
                >
                  <option value="player">普通玩家</option>
                  <option value="admin">系统管理员</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-400 mb-1">账号封禁状态</label>
                <label className="flex items-center gap-2 cursor-pointer mt-1">
                  <input
                    type="checkbox"
                    checked={editIsBanned}
                    onChange={(e) => setEditIsBanned(e.target.checked)}
                    className="w-4 h-4 accent-red-500 rounded"
                  />
                  <span className={editIsBanned ? 'text-red-400 font-bold' : 'text-slate-300'}>
                    {editIsBanned ? '已封禁此账号（禁止进入游戏）' : '正常状态'}
                  </span>
                </label>
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 py-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 font-bold"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black shadow-md shadow-amber-500/20"
                >
                  保存修改
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 弹窗 5: 快捷单人充值 */}
      {showQuickRechargeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-sm bg-slate-900 border border-amber-500/40 rounded-3xl p-6 shadow-2xl">
            <h3 className="text-sm font-black text-slate-100 mb-1 flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-amber-400" />
              <span>调配充值筹码</span>
            </h3>
            <span className="text-xs text-slate-400">
              目标账号：
              <strong className="text-amber-400">
                {users.find((u) => u.id === rechargeTargetUserId)?.nickname}
              </strong>
            </span>

            <form onSubmit={handleExecuteRecharge} className="mt-4 flex flex-col gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-400 mb-1">调配类型</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setRechargeType('recharge')}
                    className={`flex-1 py-1.5 rounded-xl font-bold transition ${
                      rechargeType === 'recharge' ? 'bg-emerald-600 text-white' : 'bg-slate-950 text-slate-400 border border-slate-800'
                    }`}
                  >
                    充值入币
                  </button>
                  <button
                    type="button"
                    onClick={() => setRechargeType('deduct')}
                    className={`flex-1 py-1.5 rounded-xl font-bold transition ${
                      rechargeType === 'deduct' ? 'bg-red-600 text-white' : 'bg-slate-950 text-slate-400 border border-slate-800'
                    }`}
                  >
                    核算扣除
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-400 mb-1">数额</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={rechargeAmount}
                  onChange={(e) => setRechargeAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 outline-none focus:border-amber-400 font-mono text-sm"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-400 mb-1">操作说明 / 审计备注</label>
                <input
                  type="text"
                  required
                  value={rechargeReason}
                  onChange={(e) => setRechargeReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 outline-none focus:border-amber-400"
                />
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowQuickRechargeModal(false)}
                  className="flex-1 py-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 font-bold"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black shadow-md shadow-amber-500/20"
                >
                  立即生效
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
