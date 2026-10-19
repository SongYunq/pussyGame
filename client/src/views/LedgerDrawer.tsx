import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { LedgerItem } from '../types/game';
import { X, TrendingUp, TrendingDown, Clock, ShieldCheck } from 'lucide-react';

interface LedgerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LedgerDrawer: React.FC<LedgerDrawerProps> = ({ isOpen, onClose }) => {
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<LedgerItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (!isOpen) setPage(1); }, [isOpen]);
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setLoading(true); setError(''); setItems([]);
    api.getLedger(page).then(data => { if (active) { setItems(data.list); setTotal(data.total); } })
      .catch(e => { if (active) setError(e.message || '读取账本失败'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isOpen, page]);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fade-in select-none">
      <div className="w-full max-w-md h-full bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col justify-between">
        {/* 抽屉头部 */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-100">个人筹码战绩账本</h2>
              <span className="text-[10px] text-slate-400">收支变动分毫必究 · 每笔明细可溯</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 流水明细列表 */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {loading && <p role="status">正在读取账本…</p>}
          {error && <p role="alert" className="text-rose-300">{error}</p>}
          {!loading && !error && !items.length && <p className="text-slate-400">暂无流水</p>}
          {items.map((item) => {
            const isIncome = item.amount > 0;
            return (
              <div
                key={item.id}
                className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm ${
                      isIncome
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    {isIncome ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-200">{item.description}</span>
                    <span className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />
                      <span>{item.createdAt}</span>
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-end">
                  <span
                    className={`text-sm font-black font-mono ${
                      isIncome ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {isIncome ? `+${item.amount.toLocaleString()}` : item.amount.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    结余: {item.balanceAfter.toLocaleString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-center items-center gap-4 p-2 text-xs">
          <button disabled={loading || page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
          <span>第 {page} 页 · 共 {total} 笔</span>
          <button disabled={loading || page * 20 >= total} onClick={() => setPage(p => p + 1)}>下一页</button>
        </div>
        {/* 底部关闭 */}
        <div className="p-4 border-t border-slate-800">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition"
          >
            关闭账本
          </button>
        </div>
      </div>
    </div>
  );
};
