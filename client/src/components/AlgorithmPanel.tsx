import { useEffect, useState } from 'react';
import { GUARANTEE_TYPES, SimulationResult, defaultAlgorithmConfig, validateAlgorithmConfig } from '../../../server/src/shared/dealing';
import { HAND_NAMES } from '../../../server/src/shared/poker';
import { api } from '../services/api';

const branches: Record<string, string> = { standard_random: '标准牌 · 随机', standard_rival: '标准牌 · 冤家', standard_guarantee: '标准牌 · 保底', short_random: '短牌 · 随机', short_rival: '短牌 · 冤家' };
const inputClass = 'w-20 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-center text-sm font-mono text-slate-100';
const sectionClass = 'rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-3';

export function AlgorithmPanel() {
  const [draft, setDraft] = useState(defaultAlgorithmConfig);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');
  const [rounds, setRounds] = useState(1000);
  const [players, setPlayers] = useState(6);
  const [simulating, setSimulating] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true); setLoaded(false); setFailure(''); setMessage('');
    (async () => {
      try {
        const config = await api.adminGetAlgorithmConfig();
        if (active) { setDraft(validateAlgorithmConfig(config)); setLoaded(true); }
      } catch (error) {
        if (active) setFailure(error instanceof Error ? error.message : '读取配置失败');
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [reload]);

  let validation = '';
  try { validateAlgorithmConfig(draft); } catch (error) { validation = error instanceof Error ? error.message : '配置无效'; }

  async function save() {
    setSaving(true); setFailure(''); setMessage('');
    try {
      const config = validateAlgorithmConfig(draft);
      const saved = await api.adminSaveAlgorithmConfig(config);
      setDraft(saved);
      setMessage('联机配置已保存，从下一局开始生效。');
    } catch (error) { setFailure(error instanceof Error ? error.message : '保存失败'); }
    finally { setSaving(false); }
  }
  async function simulate() {
    setSimulating(true); setFailure(''); setResult(null);
    try {
      const config = validateAlgorithmConfig(draft);
      const data = await api.adminSimulateAlgorithm(rounds, players, config);
      setResult(data);
    } catch (error) { setFailure(error instanceof Error ? error.message : '模拟失败'); }
    finally { setSimulating(false); }
  }
  function percentageGroup<K extends 'standardModes' | 'shortModes' | 'rivalWeights'>(key: K, labels: Record<string, string>) {
    const values = draft[key];
    return <div className="flex flex-wrap gap-4">{Object.entries(labels).map(([name, label]) => <label key={name} className="flex items-center gap-2 text-sm text-slate-300">
      {label}<input aria-label={`${key}-${label}`} type="number" min={0} max={100} step={1} className={inputClass} value={(values as Record<string, number>)[name]}
        onChange={event => setDraft(current => ({ ...current, [key]: { ...current[key], [name]: Number(event.target.value) } }))} />%
    </label>)}<span className="self-center text-xs text-slate-400">合计 {Object.values(values).reduce((sum, n) => sum + n, 0)}%</span></div>;
  }

  return <div className="space-y-4 max-w-6xl mx-auto">
    <div className="flex flex-wrap justify-between gap-3 items-start">
      <div><h2 className="text-xl font-black text-amber-400">发牌规则配置</h2><p className="text-xs text-slate-400 mt-1">联机牌局 · 保存后从下一局生效 · 已开始的牌局保持原规则</p></div>
      <button className="text-sm text-slate-300 underline" disabled={saving || simulating} onClick={() => setReload(n => n + 1)}>重新载入</button>
    </div>
    {loading && <p role="status" className="text-slate-300">正在读取配置…</p>}
    {failure && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-red-300 text-sm">{failure}</p>}
    {message && <p role="status" className="rounded-xl bg-emerald-500/10 p-3 text-emerald-300 text-sm">{message}</p>}
    <fieldset disabled={loading || saving || simulating || !loaded} className="space-y-4 disabled:opacity-60">
      <section className={sectionClass}>
        <h3 className="font-bold text-slate-100">牌库比例</h3>
        <div className="flex flex-wrap gap-5 text-sm text-slate-300">
          <label className="flex items-center gap-2">52 张标准牌<input aria-label="标准牌概率" className={inputClass} type="number" min={0} max={100} value={draft.deckProbabilities.standard}
            onChange={event => { const standard = Number(event.target.value); setDraft(current => ({ ...current, deckProbabilities: { standard, short: 100 - standard } })); }} />%</label>
          <span className="self-center">28 张短牌 {draft.deckProbabilities.short}%</span>
        </div>
      </section>
      <section className={sectionClass}><h3 className="font-bold text-slate-100">52 张标准牌 · 三选一</h3>{percentageGroup('standardModes', { random: '随机', rival: '冤家', guarantee: '保底' })}</section>
      <section className={sectionClass}><h3 className="font-bold text-slate-100">28 张短牌 · 二选一</h3>{percentageGroup('shortModes', { random: '随机', rival: '冤家' })}<p className="text-xs text-slate-400">短牌仅保留 8 至 A，不启用保底。</p></section>
      <section className={sectionClass}><h3 className="font-bold text-slate-100">冤家组合比例</h3>{percentageGroup('rivalWeights', { big_pair: '大对子对撞', straight: '顺子对撞', flush: '金花对撞', premium: '极品对撞' })}<p className="text-xs text-slate-400">指定两手强牌，其余手牌随机；全部手牌随机分配给玩家。</p></section>
      <section className={sectionClass}>
        <h3 className="font-bold text-slate-100">标准牌保底 · 按实际发牌人数配置</h3>
        <p className="text-xs text-slate-400">指定什么牌型就生成什么牌型，剩余名额随机；0 表示不指定，不限制自然出现。</p>
        <div className="overflow-x-auto"><table className="w-full text-sm text-slate-300"><thead><tr><th className="p-2">人数</th>{GUARANTEE_TYPES.map(type => <th key={type} className="p-2">{HAND_NAMES[type]}</th>)}<th className="p-2">随机</th></tr></thead><tbody>
          {Object.entries(draft.guarantees).map(([count, plan]) => <tr key={count} className="border-t border-slate-800"><th className="p-2">{count} 人</th>{GUARANTEE_TYPES.map(type => <td key={type} className="p-2 text-center"><input aria-label={`${count}人-${HAND_NAMES[type]}`} className={inputClass} type="number" min={0} max={Number(count)} step={1} value={plan[type]}
            onChange={event => setDraft(current => ({ ...current, guarantees: { ...current.guarantees, [count]: { ...current.guarantees[count], [type]: Number(event.target.value) } } }))} /></td>)}<td className="p-2 text-center">{Number(count) - Object.values(plan).reduce((sum, n) => sum + n, 0)}</td></tr>)}
        </tbody></table></div>
      </section>
      {validation && <p role="alert" className="text-sm text-red-300">{validation}</p>}
      <div className="flex gap-3"><button disabled={!!validation} onClick={save} className="rounded-xl bg-amber-500 px-5 py-2 text-sm font-bold text-slate-950 disabled:opacity-40">{saving ? '保存中…' : '保存配置'}</button><button onClick={() => { setDraft(defaultAlgorithmConfig()); setResult(null); setMessage('已恢复默认草稿，保存后生效。'); }} className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300">恢复默认草稿</button></div>
      <section className={sectionClass}>
        <h3 className="font-bold text-slate-100">真实发牌模拟</h3><p className="text-xs text-slate-400">使用当前草稿和正式发牌规则，不保存配置；牌型按手统计，分支按局统计。</p>
        <div className="flex flex-wrap gap-4 items-center text-sm text-slate-300">
          <label>人数 <select aria-label="模拟人数" className={inputClass} value={players} onChange={event => setPlayers(Number(event.target.value))}>{Array.from({ length: 7 }, (_, i) => <option key={i} value={i + 2}>{i + 2}</option>)}</select></label>
          <label>局数 <select aria-label="模拟局数" className={inputClass} value={rounds} onChange={event => setRounds(Number(event.target.value))}><option value={1000}>1000</option><option value={5000}>5000</option></select></label>
          <button disabled={!!validation} onClick={simulate} className="rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white disabled:opacity-40">{simulating ? '模拟中…' : '开始模拟'}</button>
        </div>
      </section>
    </fieldset>
    {simulating && <p role="status" className="text-emerald-300 text-sm">正在执行真实发牌，请稍候…</p>}
    {result && <section className={sectionClass}><h3 className="font-bold text-slate-100">模拟结果：{result.totalRounds.toLocaleString()} 局 / {result.totalHands.toLocaleString()} 手</h3><div className="grid gap-4 sm:grid-cols-2"><div>{Object.entries(result.branches).map(([key, count]) => <p className="flex justify-between text-sm text-slate-300 py-1" key={key}><span>{branches[key]}</span><span>{count} 局</span></p>)}</div><div>{Object.entries(result.stats).map(([type, stat]) => <p className="flex justify-between text-sm text-slate-300 py-1" key={type}><span>{HAND_NAMES[type as keyof typeof HAND_NAMES]}</span><span>{stat.count} 手 · {stat.percentage}%</span></p>)}</div></div></section>}
  </div>;
}
