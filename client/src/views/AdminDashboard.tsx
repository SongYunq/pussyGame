import React, { useEffect, useState } from 'react';
import { api, AdminUser, AuditRecord } from '../services/api';
import { useAuthStore } from '../store/useAuthStore';
import { AlgorithmPanel } from '../components/AlgorithmPanel';

const input = 'w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-sm';
const button = 'rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-40';
const panel = 'rounded-2xl border border-slate-800 bg-slate-900 p-5';
export function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const user = useAuthStore(s => s.user);
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [logs, setLogs] = useState<AuditRecord[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);
  const [create, setCreate] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', nickname: '', avatar: '🙂', initialChips: 1000 });
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [operation, setOperation] = useState<'chips' | 'password'>('chips');
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    Promise.all([api.adminGetUsers(), api.adminGetAuditLogs(page, 20)])
      .then(([list, audit]) => { if (active) { setUsers(list); setLogs(audit.list); setTotal(audit.total); } })
      .catch(e => { if (active) setError(e.message || '读取失败'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, reload]);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (pending) return;
    setPending(true); setError(''); setMessage('');
    try {
      if (create) { await api.adminCreateUser(form); setCreate(false); setForm({ username: '', password: '', nickname: '', avatar: '🙂', initialChips: 1000 }); setMessage('玩家账号已创建'); }
      else if (selected) {
        if (operation === 'chips') { await api.adminAdjustChips(selected.id, amount, reason); setMessage('筹码已调整，流水已记录'); }
        else { await api.adminResetPassword(selected.id, password); setMessage('密码已重置，原登录状态已失效'); }
        setSelected(null); setPassword(''); setReason(''); setAmount(0);
      }
      setReload(n => n + 1);
    } catch (e) { setError(e instanceof Error ? e.message : '操作失败'); }
    finally { setPending(false); }
  }
  return <div className="flex-1 overflow-y-auto bg-slate-950 text-slate-100">
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-800 bg-slate-950/95 px-5 py-4">
      <div><h1 className="text-lg font-black text-amber-400">管理后台</h1><p className="text-xs text-slate-400">{user?.nickname} · 账号与筹码管理</p></div>
      <button onClick={onLogout} className="text-sm text-slate-300">退出登录</button>
    </header>
    <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <nav className="flex gap-2">{[['users','玩家账号'],['audit','全站流水'],['algorithm','发牌规则']].map(([id,label]) => <button key={id} onClick={() => setTab(id)} className={tab === id ? button : 'rounded-xl bg-slate-800 px-4 py-2 text-sm'}>{label}</button>)}</nav>
      {error && <p role="alert" className="rounded-xl bg-rose-950 p-3 text-rose-300">{error}</p>}
      {message && <p role="status" className="rounded-xl bg-emerald-950 p-3 text-emerald-300">{message}</p>}
      {tab === 'algorithm' ? <AlgorithmPanel /> : <>
        <div className="flex items-center justify-between"><p className="text-sm text-slate-400">{tab === 'users' ? `${users.length} 个账号 · ${users.filter(u => u.isOnline).length} 人在线` : `共 ${total} 笔流水`}</p><div className="flex gap-3"><button disabled={loading || pending} onClick={() => setReload(n => n + 1)} className="text-sm text-slate-300">刷新</button>{tab === 'users' && <button className={button} onClick={() => { setCreate(true); setSelected(null); setError(''); }}>创建玩家账号</button>}</div></div>
        {loading ? <p role="status">正在读取服务器数据…</p> : tab === 'users' ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{users.map(u => <article key={u.id} className={panel}>
          <div className="flex items-center gap-3"><span className="text-3xl">{u.avatar}</span><div><h2 className="font-bold">{u.nickname}</h2><p className="text-xs text-slate-400">{u.username} · {u.role === 'admin' ? '管理员' : '玩家'} · {u.isOnline ? '在线' : '离线'}</p></div></div>
          <p className="my-4 text-xl font-mono text-amber-300">{u.balance.toLocaleString()} 筹码</p><p className="text-xs text-slate-400 mb-3">{u.currentRoomId ? `房间 ${u.currentRoomId}` : '未加入房间'}</p>
          <div className="flex gap-4"><button className="text-sm text-emerald-300" onClick={() => { setCreate(false); setSelected(u); setOperation('chips'); setError(''); }}>调整筹码</button><button className="text-sm text-slate-300" onClick={() => { setCreate(false); setSelected(u); setOperation('password'); setError(''); }}>重置密码</button></div>
        </article>)}</div> : <section className={panel}><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-slate-400"><tr>{['时间','玩家','变动','余额','说明','操作人'].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{logs.map(l => <tr key={l.id} className="border-t border-slate-800"><td className="p-2 whitespace-nowrap">{l.createdAt}</td><td className="p-2">{l.nickname || l.username}</td><td className={`p-2 ${l.amount > 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{l.amount > 0 ? '+' : ''}{l.amount}</td><td className="p-2">{l.balanceAfter}</td><td className="p-2">{l.description}</td><td className="p-2">{l.operatorUsername || '系统'}</td></tr>)}</tbody></table></div>{!logs.length && <p>暂无流水</p>}<div className="mt-4 flex justify-center gap-5 text-sm"><button disabled={page <= 1} onClick={() => setPage(n => n - 1)}>上一页</button><span>第 {page} 页</span><button disabled={page * 20 >= total} onClick={() => setPage(n => n + 1)}>下一页</button></div></section>}
      </>}
    </main>
    {(create || selected) && <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4"><form onSubmit={submit} className={`${panel} w-full max-w-md max-h-[90vh] overflow-y-auto space-y-4`}>
      <h2 className="font-bold text-amber-300">{create ? '创建玩家账号' : `${operation === 'chips' ? '调整筹码' : '重置密码'} · ${selected?.nickname}`}</h2>
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      <fieldset disabled={pending} className="space-y-3">
        {create ? <>{[['username','登录账号'],['nickname','玩家昵称'],['password','登录密码'],['avatar','头像表情']].map(([key,label]) => <label key={key} className="block text-xs text-slate-400">{label}<input className={`${input} mt-1 text-slate-100`} aria-label={label} required maxLength={key === 'password' ? 128 : 30} minLength={key === 'password' ? 6 : 1} type={key === 'password' ? 'password' : 'text'} autoComplete={key === 'password' ? 'new-password' : 'off'} value={form[key as 'username']} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} /></label>)}<label className="block text-xs text-slate-400">初始筹码<input className={`${input} mt-1 text-slate-100`} aria-label="初始筹码" type="number" min={0} step={1} required value={form.initialChips} onChange={e => setForm(f => ({ ...f, initialChips: Number(e.target.value) }))} /></label></> : operation === 'chips' ? <><label className="block text-sm">调整数量（扣除填负数）<input aria-label="调整数量" className={`${input} mt-1`} type="number" step={1} required value={amount} onChange={e => setAmount(Number(e.target.value))} /></label><label className="block text-sm">调整原因<input aria-label="调整原因" className={`${input} mt-1`} required maxLength={200} value={reason} onChange={e => setReason(e.target.value)} /></label></> : <label className="block text-sm">新密码<input aria-label="新密码" className={`${input} mt-1`} required type="password" minLength={6} maxLength={128} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></label>}
        <div className="flex justify-end gap-4 pt-2"><button type="button" onClick={() => { setCreate(false); setSelected(null); setPassword(''); setError(''); }}>取消</button><button type="submit" className={button}>{pending ? '正在提交…' : '确认提交'}</button></div>
      </fieldset>
    </form></div>}
  </div>;
}
