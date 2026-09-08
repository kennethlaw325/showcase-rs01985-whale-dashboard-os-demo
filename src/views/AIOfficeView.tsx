import { useEffect, useState } from "react";
import { BookOpen, FileText, Layers3, RefreshCw, Search, ShieldCheck, X } from "lucide-react";
import { fetchJson } from "../lib/fetchJson";
import type { Agent, AgentHandbooks, AgentStatus, OfficeOrg, OfficePm, PmHandbooks, PromptLibraryItem, PulseLevel, SkillLibraryItem } from "../lib/types";

type OpenDoc = { kind: "pm" | "skill"; kicker: string; title: string; body: string };

const STATUS_COLOR: Record<AgentStatus, string> = {
  idle: "bg-line text-muted",
  running: "bg-brand text-white",
  done: "bg-emerald-100 text-emerald-700",
  error: "bg-red-100 text-red-700"
};

const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: "idle",
  running: "returning…",
  done: "done",
  error: "error"
};

function lastRunText(lastRun: string | null): string {
  if (!lastRun) return "未開工";
  return `上次跑：${lastRun.replace("T", " ")}`;
}

// 部門更新狀態:唯一訊號源係 pulse.lastCommitISO(vault git 該部門資料夾最後 commit)。
// level 喺 render 時由 ISO 重計 —— sync 寫嘅 level 只係當刻快照,擺耐咗就唔啱。
// 攞唔到訊號一律 unknown,唔准扮 idle / 扮活躍;冇憑據嘅燈唔准着。
const PULSE_META: Record<PulseLevel, { dot: string; label: string }> = {
  active: { dot: "pulse-dot-active", label: "活躍" },
  slowing: { dot: "pulse-dot-slowing", label: "放緩" },
  stalled: { dot: "pulse-dot-stalled", label: "停咗" },
  unknown: { dot: "pulse-dot-unknown", label: "攞唔到訊號" }
};

function renderPulse(pm: OfficePm) {
  const iso = pm.pulse?.lastCommitISO ?? null;
  if (!iso) return { level: "unknown" as PulseLevel, evidence: "攞唔到 git 訊號(sample vault 或 git 指令失敗)" };
  const hours = (Date.now() - Date.parse(iso)) / 3_600_000;
  if (Number.isNaN(hours)) return { level: "unknown" as PulseLevel, evidence: "訊號格式讀唔到" };
  const level: PulseLevel = hours <= 24 ? "active" : hours <= 72 ? "slowing" : "stalled";
  const when = iso.slice(5, 16).replace("T", " ");
  const ago = hours < 48 ? `${Math.round(hours)} 小時前` : `${Math.floor(hours / 24)} 日前`;
  const subject = pm.pulse?.lastCommitSubject ? ` · ${pm.pulse.lastCommitSubject.slice(0, 42)}` : "";
  return { level, evidence: `最後更新 ${when}(${ago})${subject}` };
}

function PulseChip({ pm }: { pm: OfficePm }) {
  const { level, evidence } = renderPulse(pm);
  const meta = PULSE_META[level];
  return <span className="pm-pulse" title={evidence}><i className={`pulse-dot ${meta.dot}`} />{meta.label}<em>{evidence}</em></span>;
}

function WhaleOrgChart({ org }: { org: OfficeOrg }) {
  return <section className="whale-org"><div className="org-node org-ceo"><span>🐳</span><div><b>{org.ceo.name}</b><small>{org.ceo.role}</small></div></div><div className="org-connector" /><div className="co-ai-row">{org.coAi.map((agent) => <article className="org-node org-co-ai" key={agent.name}><b>{agent.name}</b><small>{agent.role}</small><p>{agent.focus}</p></article>)}</div><div className="org-connector" /><p className="pulse-legend">部門更新狀態 = 該部門資料夾喺 vault git 嘅最後 commit(唔係手填;🟢 24h 內 · 🟡 24–72h · ⚪ 超過 72h)</p><div className="pm-org-grid">{org.pms.map((pm) => <article className="org-node org-pm" key={pm.id}><span>{pm.emoji}</span><div><b>{pm.name} PM</b><small>{pm.mission}</small><PulseChip pm={pm} /><p><strong>{pm.skillCount}</strong> 個 skills · {pm.capabilityAgents.length ? pm.capabilityAgents.join("、") : "按需要調度能力 agent"}</p></div></article>)}</div><p className="org-note">{org.note}</p></section>;
}

function DocPanel({ doc, onClose }: { doc: OpenDoc; onClose: () => void }) {
  return (
    <div className="agent-panel-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="agent-panel doc-panel" role="dialog" aria-modal="true" aria-labelledby="doc-panel-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="agent-panel-head">
          <div><p className="agent-panel-kicker">{doc.kicker}</p><h2 id="doc-panel-title">{doc.title}</h2></div>
          <button type="button" className="agent-panel-close" onClick={onClose} aria-label="關閉"><X size={18} /></button>
        </header>
        <div className="agent-manual doc-panel-body"><pre>{doc.body || "未搵到呢份檔案 —— 可能仲未寫,或者 sourcePath 對唔上。"}</pre></div>
      </section>
    </div>
  );
}

function CapabilityPool({ org, skills, prompts, handbooks, onOpenDoc }: { org: OfficeOrg; skills: SkillLibraryItem[]; prompts: PromptLibraryItem[]; handbooks: PmHandbooks | null; onOpenDoc: (doc: OpenDoc) => void }) {
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("all");
  const filtered = skills.filter((skill) => {
    const haystack = `${skill.name} ${skill.category} ${skill.what} ${skill.department}`.toLowerCase();
    return (department === "all" || skill.department === department) && haystack.includes(query.toLowerCase());
  });

  function openPmHandbook(pm: OfficePm) {
    onOpenDoc({ kind: "pm", kicker: "部門憲章 · CHARTER.md", title: `${pm.name} PM`, body: handbooks?.departments[pm.id] || "" });
  }

  function openSkillDoc(skill: SkillLibraryItem) {
    onOpenDoc({ kind: "skill", kicker: `SKILL.md · ${skill.sourcePath || "冇 sourcePath"}`, title: `/${skill.name}`, body: handbooks?.skills[skill.id] || "" });
  }

  return <section className="capability-pool">
    <div className="capability-pool-head"><div><span className="section-label">能力池 · 不是課程假員工</span><h2>Whale 可調度能力</h2><p>{org.capabilityPool.note}</p></div><div className="capability-totals"><span><Layers3 size={15} /><b>{skills.filter((s) => s.department !== "ceo").length}</b> 自家 skills(PM 1:1)</span><span><Layers3 size={15} /><b>{skills.filter((s) => s.department === "ceo").length}</b> 外掛 · CEO 直用</span><span><FileText size={15} /><b>{prompts.length || org.capabilityPool.promptTotal}</b> prompts</span></div></div>
    <div className="capability-dept-grid">{org.pms.map((pm) => (
      <div className={`capability-dept ${department === pm.id ? "is-active" : ""}`} key={pm.id}>
        <button type="button" className="capability-dept-main" onClick={() => setDepartment(department === pm.id ? "all" : pm.id)}><span>{pm.emoji}</span><div><b>{pm.name} PM</b><small>{pm.mission}</small></div><strong>{pm.skillCount}</strong></button>
        <button type="button" className="capability-dept-doc" onClick={() => openPmHandbook(pm)} aria-label={`睇 ${pm.name} 部門憲章`}><ShieldCheck size={13} /> 部門憲章</button>
      </div>
    ))}
      <div className={`capability-dept ${department === "ceo" ? "is-active" : ""}`}>
        <button type="button" className="capability-dept-main" onClick={() => setDepartment(department === "ceo" ? "all" : "ceo")}><span>🐳</span><div><b>CEO 直用</b><small>外掛(plugin)工具,唔入 PM 池,Demo User 直接調用。</small></div><strong>{skills.filter((s) => s.department === "ceo").length}</strong></button>
      </div>
    </div>
    <div className="capability-toolbar"><label><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋 skill、用途或部門" /></label><span>顯示 {Math.min(filtered.length, 18)} / {filtered.length} 項</span></div>
    <div className="capability-list">{filtered.slice(0, 18).map((skill) => (
      <button type="button" className="capability-skill-card" key={skill.id} onClick={() => openSkillDoc(skill)}>
        <div><span>{skill.department === "ceo" ? "CEO 直用(外掛)" : org.pms.find((pm) => pm.id === skill.department)?.name || skill.department}</span><b>/{skill.name}</b></div>
        <p>{skill.what}</p>
        <small>交付：{skill.output}</small>
      </button>
    ))}</div>
    {filtered.length > 18 && <p className="capability-more">其餘 {filtered.length - 18} 項可在 Skills & Prompts 查看完整手冊。</p>}
  </section>;
}

function AgentPanel({ agent, handbooks, onClose }: { agent: Agent; handbooks: AgentHandbooks | null; onClose: () => void }) {
  const skill = handbooks?.skills[agent.id] || "正在等候此員工的 SKILL.md 資料。";
  return (
    <div className="agent-panel-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="agent-panel" role="dialog" aria-modal="true" aria-labelledby="agent-panel-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="agent-panel-head">
          <div><span className="text-3xl">{agent.emoji}</span><div><p className="agent-panel-kicker">AI OFFICE · EMPLOYEE FILE</p><h2 id="agent-panel-title">{agent.name}</h2></div></div>
          <button type="button" className="agent-panel-close" onClick={onClose} aria-label="關閉員工資料"><X size={18} /></button>
        </header>
        <div className="agent-panel-body">
          <article className="agent-brief"><span>簡介</span><strong>{agent.role}</strong><p>{agent.statusNote}</p><div><em className={STATUS_COLOR[agent.status]}>{STATUS_LABEL[agent.status]}</em><small>{lastRunText(agent.lastRun)} · output ×{agent.outputCount || 0}</small></div></article>
          <article className="agent-manual"><h3><ShieldCheck size={16} />公司手冊 · AGENTS.md</h3><pre>{handbooks?.companyManual || "正在等候公司手冊資料。"}</pre></article>
          <article className="agent-manual"><h3><BookOpen size={16} />個人手冊 · SKILL.md</h3><pre>{skill}</pre></article>
        </div>
      </section>
    </div>
  );
}

export default function AIOfficeView() {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [handbooks, setHandbooks] = useState<AgentHandbooks | null>(null);
  const [org, setOrg] = useState<OfficeOrg | null>(null);
  const [skills, setSkills] = useState<SkillLibraryItem[]>([]);
  const [prompts, setPrompts] = useState<PromptLibraryItem[]>([]);
  const [pmHandbooks, setPmHandbooks] = useState<PmHandbooks | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [openDoc, setOpenDoc] = useState<OpenDoc | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);

  async function loadOffice(forceFresh = false) {
    const cacheBust = forceFresh ? `?t=${Date.now()}` : "";
    const [nextAgents, nextHandbooks, nextOrg, nextSkills, nextPrompts, nextPmHandbooks] = await Promise.all([
      fetchJson<Agent[]>(`data/agents.json${cacheBust}`, []),
      fetchJson<AgentHandbooks | null>(`data/agent-handbooks.json${cacheBust}`, null),
      fetchJson<OfficeOrg | null>(`data/office-org.json${cacheBust}`, null),
      fetchJson<SkillLibraryItem[]>(`data/skills-library.json${cacheBust}`, []),
      fetchJson<PromptLibraryItem[]>(`data/prompt-library.json${cacheBust}`, []),
      fetchJson<PmHandbooks | null>(`data/pm-handbooks.json${cacheBust}`, null)
    ]);
    setAgents(nextAgents);
    setHandbooks(nextHandbooks);
    setOrg(nextOrg);
    setSkills(nextSkills);
    setPrompts(nextPrompts);
    setPmHandbooks(nextPmHandbooks);
  }

  useEffect(() => { void loadOffice(); }, []);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { setSelectedAgent(null); setOpenDoc(null); } };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  async function refreshOffice() {
    setRefreshing(true);
    await loadOffice(true);
    setLastRefreshed(new Date().toLocaleTimeString("zh-HK", { hour12: false }));
    setRefreshing(false);
  }

  if (agents === null) return <div className="text-muted text-sm">Loading…</div>;
  if (agents.length === 0) return <div><h1 className="text-2xl font-bold mb-4">AI Office</h1><p className="text-muted text-sm">冇員工名冊。跑 <code className="bg-line px-1 rounded">npm run sync:vault</code> 會補返 roster。</p></div>;

  const today = new Date().toISOString().slice(0, 10);
  const ranToday = agents.filter((a) => a.lastRun?.startsWith(today)).length;
  const totalOutput = agents.reduce((sum, a) => sum + (a.outputCount || 0), 0);

  return (
    <div>
      <div className="office-title-row"><div><span className="section-label">WHale AI Office · 6 PM model</span><h1 className="text-2xl font-bold mb-1">AI Office</h1><p className="text-muted text-sm">課程範例今日 {ranToday}/{agents.length} 位有紀錄 · 總 output {totalOutput}</p></div><div className="office-refresh-wrap"><button type="button" onClick={refreshOffice} disabled={refreshing} className="office-refresh"><RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />{refreshing ? "更新中…" : "Refresh"}</button><span aria-live="polite">{lastRefreshed ? `示範模式：已重新讀取示範資料 · ${lastRefreshed}` : ""}</span></div></div>
      <p className="text-muted text-xs mb-6">Refresh 會重新讀取 runtime JSON；資料更新後毋須 rebuild。</p>
      {org && <><h2 className="font-semibold mb-1">Whale 實際 AI Office</h2><p className="text-muted text-xs mb-4">CEO 定方向，Codex 與 Claude Code 做跨部門協作；六位 PM 才是日常管理入口。</p><WhaleOrgChart org={org} /></>}
      {org && <CapabilityPool org={org} skills={skills} prompts={prompts} handbooks={pmHandbooks} onOpenDoc={setOpenDoc} />}
      <details className="course-templates"><summary>課程能力模板 · {agents.length} 位（非 Whale 正式組織）</summary><p>這些是 lesson 3 的示範員工，保留作參考；真正的能力池在上方(自家 skills 歸六 PM,外掛 CEO 直用)。</p><ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{agents.map((a) => <li key={a.id}><button type="button" onClick={() => setSelectedAgent(a)} className="office-card"><div className="flex items-center gap-2"><span className="text-2xl leading-none">{a.emoji}</span><div className="min-w-0"><div className="font-semibold truncate">{a.name}</div><div className="text-xs text-muted truncate">{a.role}</div></div><span className={`ml-auto text-xs px-2 py-0.5 rounded-md font-medium ${STATUS_COLOR[a.status]}`}>{STATUS_LABEL[a.status]}</span></div><div className="flex items-center text-xs text-muted"><span>{lastRunText(a.lastRun)}</span><span className="ml-auto">output ×{a.outputCount || 0}</span></div></button></li>)}</ul></details>
      {selectedAgent && <AgentPanel agent={selectedAgent} handbooks={handbooks} onClose={() => setSelectedAgent(null)} />}
      {openDoc && <DocPanel doc={openDoc} onClose={() => setOpenDoc(null)} />}
    </div>
  );
}
