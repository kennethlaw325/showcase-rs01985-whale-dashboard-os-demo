import { useEffect, useState } from "react";
import { CheckCircle2, CircleDotDashed, ShieldCheck } from "lucide-react";
import { fetchJson } from "../lib/fetchJson";
import type { DepartmentPulse } from "../lib/types";

type DepartmentWithLight = DepartmentPulse & {
  light?: "on" | "run" | "off";
  lightReason?: string;
};

export function useDepartments() {
  const [departments, setDepartments] = useState<DepartmentWithLight[] | null>(null);
  useEffect(() => { fetchJson<DepartmentWithLight[]>("data/departments.json", []).then(setDepartments); }, []);
  return departments;
}

export function DepartmentMiniGrid({ departments }: { departments: DepartmentPulse[] }) {
  return (
    <div className="pm-mini-grid">
      {departments.map((department) => {
        const current = department.active[0] ?? department.done[0];
        return <article className="pm-mini-card" key={department.id}>
          <div><span>{department.emoji}</span><b>{department.name}</b></div>
          {current ? <p><em>{current.status}</em>{current.title}</p> : <p>暫無可抽取項目</p>}
        </article>;
      })}
    </div>
  );
}

export default function DepartmentPulseView() {
  const departments = useDepartments();
  const [focused, setFocused] = useState<DepartmentWithLight | null>(null);
  if (departments === null) return <div className="text-muted text-sm">Loading PM boards…</div>;

  return <div className="pm-view">
    <header className="pm-hero">
      <div><span>DEMO-AI · LIVE BOARD SNAPSHOT</span><h1>6 PM 脈搏</h1><p>每張卡都直接來自部門 <code>board.md</code>。呢個係 live board 摘要，唔會冒充成每日已完成日誌。</p></div>
      <ShieldCheck size={46} aria-hidden="true" />
    </header>
    <nav className="pm-lights" aria-label="六個部門的即時狀態燈">
      {departments.map((department) => (
        <button key={department.id} type="button" className="pm-light" title={`${department.name}：${department.lightReason || "未有狀態資料"}`} onClick={() => { setFocused(department); document.getElementById(`department-${department.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
          <span className={`pm-light-dot is-${department.light || "off"}`} aria-hidden="true" />
          <span>{department.emoji} {department.name}</span>
        </button>
      ))}
    </nav>
    {focused && <p className="pm-light-focus" role="status">已跳到 {focused.emoji} {focused.name}：{focused.lightReason || "未有狀態資料"}（進行中 {focused.active.length} 項 · 已完成 {focused.done.length} 項）</p>}
    <aside className="pm-light-legend">
      <b>三盞燈代表咩?</b>
      <ul>
        <li><span className="pm-light-dot is-run" aria-hidden="true" />紫 = 該部門 board 有單標住 🔄 進行中</li>
        <li><span className="pm-light-dot is-on" aria-hidden="true" />綠 = 7 日內有單 ✅ 完成,<em>或者</em> board.md 7 日內改過</li>
        <li><span className="pm-light-dot is-off" aria-hidden="true" />灰 = 以上都冇,即 7 日內完全靜英英</li>
      </ul>
      <small>全部由 <code>board.md</code> 自動計,冇人手填。⚠️ 綠燈唔一定等於「有成果」——淨係改過 board.md(例如執錯字)都會著綠。撳燈可以跳去該部門;移上去睇實際原因。</small>
    </aside>
    <div className="pm-board-grid">
      {departments.map((department) => <article className="pm-board" id={`department-${department.id}`} key={department.id}>
        <header><div><span>{department.emoji}</span><h2>{department.name}</h2></div><code>{department.source}</code></header>
        <section><h3><CircleDotDashed size={15} /> 進行中 / 等待</h3>{department.active.length ? <ul>{department.active.map((item) => <li key={item.title}><b>{item.status}</b><div><strong>{item.title}</strong><p>{item.detail}</p></div></li>)}</ul> : <p className="pm-empty">暫無進行中項目</p>}</section>
        <section><h3><CheckCircle2 size={15} /> 已完成</h3>{department.done.length ? <ul>{department.done.map((item) => <li key={item.title}><b>{item.status}</b><div><strong>{item.title}</strong><p>{item.detail}</p></div></li>)}</ul> : <p className="pm-empty">暫無可抽取完成項目</p>}</section>
      </article>)}
    </div>
  </div>;
}
