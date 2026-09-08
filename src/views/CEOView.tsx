import { useEffect, useRef, useState } from "react";
import { Activity, ArrowUpRight, CalendarRange, CircleAlert, Compass, DollarSign, Rocket, Sparkles, Target, TrendingUp, Waves } from "lucide-react";
import { fetchJson } from "../lib/fetchJson";
import { useDepartments } from "./DepartmentPulseView";
import DailyOpsView from "./DailyOpsView";
import type { CeoBrief, CeoKpi, CeoOps, DepartmentPulse, RevenueGap } from "../lib/types";

const EMPTY_OPS: CeoOps = {
  title: "CEO Ops", subtitle: "", badges: [], timeline: [], projects: [], kpis: [],
  departmentPulse: "", rayFocus: "",
  northStarTrack: { note: "", target: "", baseCase: "", bullCase: "", risk: "", gates: [], status: "" },
  finance: { note: "", tiles: [], subscriptions: "" },
  launchTracks: { note: "", tracks: [] },
  dateBand: { note: "", badges: [] },
  positioning: { note: "", axes: { xLeft: "", xRight: "", yTop: "", yBottom: "" }, points: [], pricing: [] },
  revenueGap: { targetsApproved: false, note: "目標未拍板——去 WHALE-1M-PLAN §5", sources: [], pipeline: [] },
  lastSyncedAt: ""
};
const EMPTY_BRIEF: CeoBrief = { date: "", northStar: "", urgent: [], priorities: [], lastSyncedAt: "" };

// sync 可能只供應 01–05 段資料；每個巢狀段落都補齊 fallback，避免舊／部分 JSON 拖冧整個 dashboard。
function normalizeOps(raw: Partial<CeoOps>): CeoOps {
  return {
    ...EMPTY_OPS,
    ...raw,
    northStarTrack: { ...EMPTY_OPS.northStarTrack, ...raw.northStarTrack },
    finance: { ...EMPTY_OPS.finance, ...raw.finance },
    launchTracks: { ...EMPTY_OPS.launchTracks, ...raw.launchTracks },
    dateBand: { ...EMPTY_OPS.dateBand, ...raw.dateBand },
    positioning: {
      ...EMPTY_OPS.positioning,
      ...raw.positioning,
      axes: { ...EMPTY_OPS.positioning.axes, ...raw.positioning?.axes }
    }
  };
}

function syncLabel(value: string) {
  return value ? value.replace("T", " ").slice(0, 16) : "—";
}

// UI 第二浪 · pattern 1 環形 KPI:淨轉換三格「有分母」嘅 KPI(靠 label 認,冇對到就照舊顯示數字,唔靠估)。
type KpiRing = { pct: number };

function parseKpiRing(kpi: CeoKpi): KpiRing | null {
  if (kpi.label.includes("TASKBOARD")) {
    const m = kpi.value.match(/(\d+).*?\/.*?(\d+)/);
    if (!m) return null;
    const done = Number(m[1]);
    const pending = Number(m[2]);
    const total = done + pending;
    return total ? { pct: Math.round((done / total) * 100) } : null;
  }
  if (kpi.label.includes("AI Search Score") || kpi.label.includes("briefs")) {
    const m = kpi.value.match(/(\d+)\s*\/\s*(\d+)/);
    if (!m) return null;
    const den = Number(m[2]);
    return den ? { pct: Math.round((Number(m[1]) / den) * 100) } : null;
  }
  return null;
}

// pattern 2 分段進度條:10 格,填格數 = 完成度四捨五入。
function segmentCount(value: number) {
  return Math.max(0, Math.min(10, Math.round(value / 10)));
}

// pattern 4 部門卡:沿用 DepartmentMiniGrid 已有嘅 current 抽取邏輯,加狀態燈。
// 「下個死線」試過用 regex 喺 detail 度撈日期,但真數據撈到嘅係垃圾(例如 "2026-07-10" 撈出 "26-07"、
// "P0-2" 撈出 "0-2",甚至撈到過去引用日期當成「下個」)—— 呢啲全部係睇落似真實但其實假嘅precision,
// 犯咗同 FINANCE 「唔准畫成有數」同一條線,所以摞走,改用可靠嘅真數字(進行中/已完成項目數)。
function currentDeptItem(dept: DepartmentPulse) {
  return dept.active[0] ?? dept.done[0] ?? null;
}

function deptStatusLight(dept: DepartmentPulse): "red" | "amber" | "green" {
  const pool = [...dept.active, ...dept.tasks];
  if (pool.some((item) => item.status.includes("🔴"))) return "red";
  if (pool.some((item) => item.status.includes("🟡") || item.status.includes("🟠"))) return "amber";
  return "green";
}

// pattern 6(2026-07-30 加)CEO 一句話:northStar 係一整段長文字,Demo User 要 point form 3-5 條。
// 淨係喺 Demo User 自己原文已有嘅標籤(北極星/唯一樽頸/全司優先序/今日一句/⚠️誠實補充)度切開 —— 唔係我幫佢揀邊句重要,
// 內容一個字冇改冇刪,淨係換排版。搵唔到任何標籤就當一整條照原樣顯示。
const NORTHSTAR_MARKERS = /(?=北極星[:：]|唯一樽頸[:：]|全司優先序[:：]|今日一句[:：]|⚠️\s*誠實補充[:：])/;

function northStarBullets(text: string): string[] {
  return text.split(NORTHSTAR_MARKERS).map((part) => part.trim()).filter(Boolean).slice(0, 5);
}

function RevenueGapPanel({ data }: { data: RevenueGap }) {
  return <section className="ceo-section ceo-revenue-gap"><div className="ceo-section-head"><div><span>06 · 收入缺口</span><h2>目標 vs pipeline</h2></div><p>pipeline 轉換率為假設值，可改</p></div><div className="ceo-panel revenue-gap-panel">{!data.targetsApproved && <div className="revenue-target-unapproved"><b>目標未拍板——去 WHALE-1M-PLAN §5</b><p>指定計畫未同時列出打平／理想／超額的月、年收入數字，因此不補造缺口金額。</p></div>}<div className="revenue-pipeline"><span>現有 pipeline（階段數 × 假設轉換率）</span>{data.pipeline.length ? <ul>{data.pipeline.map((stage) => <li key={stage.stage}><b>{stage.stage}</b><span>{stage.count} 個 × {Math.round(stage.assumedRate * 100)}%</span><strong>≈ {stage.expectedWins} 單</strong></li>)}</ul> : <p>client-stages 未有可計階段。</p>}</div><small className="revenue-source">資料源：{data.sources.join(" · ") || "未能讀取指定來源"}</small></div></section>;
}


export default function CEOView({ scrollToMorning = 0 }: { scrollToMorning?: number }) {
  const [ops, setOps] = useState<CeoOps | null>(null);
  const [brief, setBrief] = useState<CeoBrief | null>(null);
  const [activeDateBadge, setActiveDateBadge] = useState<string | null>(null);
  const morningRef = useRef<HTMLElement>(null);
  const departments = useDepartments();

  useEffect(() => {
    fetchJson<CeoOps>("data/ceo-ops.json", EMPTY_OPS).then((data) => setOps(normalizeOps(data)));
    fetchJson<CeoBrief>("data/ceo-brief.json", EMPTY_BRIEF).then(setBrief);
  }, []);

  useEffect(() => {
    if (scrollToMorning && ops && brief) morningRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [brief, ops, scrollToMorning]);

  if (!ops || !brief) return <div className="text-muted text-sm">Loading CEO cockpit…</div>;

  const outstanding = brief.priorities.slice(0, 5);
  const critical = brief.urgent.slice(0, 5);

  return (
    <div className="ceo-view">
      <section className="ceo-hero">
        <div className="ceo-orbit ceo-orbit-one" />
        <div className="ceo-orbit ceo-orbit-two" />
        <div className="ceo-hero-copy">
          <div className="ceo-kicker"><Waves size={15} /> WHALE · CEO OPS</div>
          <div className="ceo-badges">
            {ops.badges.map((badge, index) => <span key={badge} className={index === 0 ? "is-danger" : ""}>{badge}</span>)}
          </div>
        </div>
        <div className="ceo-compass" aria-label="Whale AI in One strategy compass">
          <div className="ceo-compass-core">🐳</div>
          <span className="compass-n">AI-native</span><span className="compass-e">Done-for-you</span>
          <span className="compass-s">首個收入</span><span className="compass-w">系統複利</span>
        </div>
      </section>

      <section className="ceo-command-grid" aria-label="CEO command summary">
        <article className="ceo-command-chart"><div className="command-head"><span>PROJECT STATUS</span><b>專案完成度</b></div><div className="command-bars">{ops.projects.map((project) => <div key={project.label}><div><span>{project.label}</span><strong>{project.display}</strong></div><i><em style={{ width: `${Math.max(0, Math.min(100, project.value))}%` }} /></i></div>)}</div><p>每條 bar 直接反映 vault 現有完成度；冇資料就維持 0%，不估算。</p></article>
        <article className="ceo-command-list"><div className="command-head"><span>TOP 5 OUTSTANDING</span><b>最重要未完成</b></div><ol>{outstanding.map((item, index) => <li key={item.title}><b>{String(index + 1).padStart(2, "0")}</b><div><strong>{item.title}</strong><p>{item.why}</p></div></li>)}</ol></article>
        <article className="ceo-command-list is-critical"><div className="command-head"><span>TOP 5 CRITICAL</span><b>最關鍵問題 · 已核實 {critical.length}/5</b></div><ol>{critical.map((item, index) => <li key={item.title}><b>{String(index + 1).padStart(2, "0")}</b><div><strong>{item.title}</strong><p>{item.ask}</p></div></li>)}</ol>{critical.length < 5 && <p className="critical-gap">未有第 5 項已核實 critical issue；不補造數據。</p>}</article>
      </section>

      <section className="ceo-section">
        <div className="ceo-section-head"><div><span>01 · 今日方向</span><h2>45 日衝刺軌</h2></div><p>{brief.date || "最新同步"}</p></div>
        <div className="ceo-timeline">
          {ops.timeline.map((stop, index) => (
            <div className={`ceo-stop ${stop.state}`} key={`${stop.title}-${index}`}>
              <div className="ceo-stop-dot">{stop.icon}</div>
              <div><strong>{stop.title}</strong><small>{stop.detail}</small></div>
            </div>
          ))}
        </div>
      </section>

      <section className="ceo-kpi-grid" aria-label="CEO KPI">
        {ops.kpis.map((kpi) => {
          const ring = parseKpiRing(kpi);
          return (
            <article className={`ceo-kpi ${kpi.tone === "danger" ? "danger" : ""} ${ring ? "has-ring" : ""}`} key={kpi.label}>
              <span>{kpi.label}</span>
              {ring ? (
                <div className="kpi-ring" role="img" aria-label={kpi.value} style={{ background: `conic-gradient(var(--ocean-teal) ${ring.pct}%, var(--ocean-mist) 0)` }}>
                  <div className="kpi-ring-hole"><strong>{ring.pct}%</strong></div>
                </div>
              ) : (
                <strong>{kpi.value}</strong>
              )}
              <i aria-hidden="true" />
            </article>
          );
        })}
      </section>

      <section className="ceo-two-col ceo-section">
        <div className="ceo-panel ceo-projects">
          <div className="ceo-section-head"><div><span>02 · 產出</span><h2>Project 完成度</h2></div><Activity size={18} /></div>
          <div className="project-list">
            {ops.projects.map((project) => {
              const filled = segmentCount(project.value);
              return (
                <div className={`project-row ${project.status}`} key={project.label}>
                  <div className="project-meta"><span>{project.label}</span><strong>{project.display}</strong></div>
                  <div className="project-track project-track-seg" role="img" aria-label={`完成度 ${project.display}`}>
                    {Array.from({ length: 10 }, (_, index) => <i key={index} className={index < filled ? "is-filled" : ""} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="ceo-panel ceo-northstar">
          <div className="ceo-section-head"><div><span>03 · 北極星</span><h2>CEO 一句話</h2></div><Sparkles size={18} /></div>
          <ul className="ceo-northstar-bullets">
            {northStarBullets(brief.northStar).map((point) => <li key={point}>{point}</li>)}
          </ul>
          <div className="ceo-pulse-block">
            <span><Target size={15} /> 六部門脈搏</span>
            {departments ? (
              <div className="dept-pulse-grid">
                {departments.map((dept) => {
                  const current = currentDeptItem(dept);
                  return (
                    <article className="dept-pulse-card" key={dept.id}>
                      <div className="dept-pulse-head"><i className={`dept-light is-${deptStatusLight(dept)}`} aria-hidden="true" /><span>{dept.emoji}</span><b>{dept.name}</b></div>
                      <p>{current ? current.title : "暫無可抽取項目"}</p>
                      <small>進行中 {dept.active.length} · 已完成 {dept.done.length}</small>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="dept-pulse-loading">載入六部門脈搏…</p>
            )}
          </div>
          <div className="ceo-ray-focus"><CircleAlert size={17} /><div><b>等 Demo User 裁決</b><p>{ops.rayFocus}</p></div></div>
        </div>
      </section>

      <section className="ceo-section">
        <div className="ceo-section-head"><div><span>04 · CEO 晨報</span><h2>而家最值得處理</h2></div><p>只顯示已核實重點</p></div>
        <div className="ceo-urgent-grid">
          {brief.urgent.map((item, index) => (
            <article className="ceo-urgent" key={item.title}>
              <div className="ceo-urgent-number">0{index + 1}</div>
              <h3>{item.title}</h3><p>{item.why}</p>
              <div className="ceo-ask"><ArrowUpRight size={15} /> {item.ask}</div>
            </article>
          ))}
        </div>
      </section>

      <section className="ceo-priorities ceo-section">
        <div className="ceo-section-head"><div><span>05 · 下一步</span><h2>Priority queue</h2></div><p>快照更新：{syncLabel(brief.lastSyncedAt)}</p></div>
        <ol>
          {brief.priorities.map((item, index) => <li key={item.title}><b>{String(index + 1).padStart(2, "0")}</b><div><strong>{item.title}</strong><p>{item.why}</p></div></li>)}
        </ol>
      </section>

      <RevenueGapPanel data={ops.revenueGap ?? EMPTY_OPS.revenueGap!} />

      <section className="ceo-section">
        <div className="ceo-section-head"><div><span>07 · 資金軌</span><h2>US$1M 戰略軌</h2></div><p>{ops.northStarTrack.note}</p></div>
        <div className="ceo-panel ceo-track">
          <div className="ceo-track-head"><TrendingUp size={18} /><p className="ceo-track-target">{ops.northStarTrack.target} · {ops.northStarTrack.baseCase}（{ops.northStarTrack.bullCase}；{ops.northStarTrack.risk}）</p></div>
          <div className="ceo-track-gates">
            <span className="ceo-track-gates-label">閘門</span>
            {ops.northStarTrack.gates.map((gate, index) => (
              <span className="ceo-track-gate" key={gate}>{index > 0 && <ArrowUpRight size={12} />}{gate}</span>
            ))}
          </div>
          <p className="ceo-track-status">狀態：{ops.northStarTrack.status}</p>
        </div>
      </section>

      <section className="ceo-section">
        <div className="ceo-section-head"><div><span>08 · 損益</span><h2>FINANCE</h2></div><p>{ops.finance.note}</p></div>
        <div className="ceo-panel ceo-finance">
          <div className="ceo-finance-grid">
            {ops.finance.tiles.map((tile) => (
              <div className={`ceo-finance-tile ${tile.tone}`} key={tile.label}>
                <strong>{tile.value}</strong>
                <span>{tile.label}</span>
              </div>
            ))}
          </div>
          <p className="ceo-finance-sub"><DollarSign size={13} /> {ops.finance.subscriptions}</p>
        </div>
      </section>

      <section className="ceo-section">
        <div className="ceo-section-head"><div><span>09 · 起跑</span><h2>LAUNCH 前跑道 · 五線並行</h2></div><p className="ceo-section-note"><Rocket size={14} /> {ops.launchTracks.note}</p></div>
        <div className="ceo-panel ceo-launch">
          <div className="ceo-launch-grid">
            {ops.launchTracks.tracks.map((track) => (
              <div className={`ceo-launch-card ${track.highlight ? "is-highlight" : ""}`} key={track.title}>
                <b>{track.icon} {track.title}</b>
                <p>{track.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="ceo-section">
        <div className="ceo-section-head"><div><span>10 · 節點</span><h2>日期帶</h2></div><p className="ceo-section-note"><CalendarRange size={14} /> {ops.dateBand.note}</p></div>
        <div className="ceo-panel ceo-dateband">
          <div className="ceo-pill-row" role="group" aria-label="日期節點(可揀,純視覺,唔改變資料)">
            {ops.dateBand.badges.map((badge) => (
              <button
                type="button"
                key={badge.text}
                className={`ceo-pill ${badge.tone !== "normal" ? `is-${badge.tone}` : ""} ${activeDateBadge === badge.text ? "is-active" : ""}`}
                aria-pressed={activeDateBadge === badge.text}
                onClick={() => setActiveDateBadge((current) => (current === badge.text ? null : badge.text))}
              >
                {badge.text}
              </button>
            ))}
          </div>
          {activeDateBadge && <p className="ceo-dateband-note">已標記節點：{activeDateBadge}（再撳一次取消）</p>}
        </div>
      </section>

      <section className="ceo-section">
        <div className="ceo-section-head"><div><span>10 · 戰場</span><h2>對手定位</h2></div><p className="ceo-section-note"><Compass size={14} /> {ops.positioning.note}</p></div>
        <div className="ceo-panel ceo-positioning">
          <div className="ceo-positioning-grid">
            <div className="ceo-scatter-wrap">
              <svg className="ceo-scatter" viewBox="0 0 650 430" role="img" aria-label="市場對手定位圖">
                <line className="ceo-grid-line" x1="325" y1="34" x2="325" y2="380" />
                <line className="ceo-grid-line" x1="70" y1="205" x2="610" y2="205" />
                <line className="ceo-axis-line" x1="70" y1="380" x2="610" y2="380" />
                <line className="ceo-axis-line" x1="70" y1="380" x2="70" y2="34" />
                <text className="ceo-axis-text" x="70" y="407">{ops.positioning.axes.xLeft}</text>
                <text className="ceo-axis-text" x="610" y="407" textAnchor="end">{ops.positioning.axes.xRight}</text>
                <text className="ceo-axis-text" x="55" y="374" textAnchor="end">{ops.positioning.axes.yBottom}</text>
                <text className="ceo-axis-text" x="55" y="42" textAnchor="end">{ops.positioning.axes.yTop}</text>
                {ops.positioning.points.map((point) => point.type === "whale" ? (
                  <g key={`${point.type}-${point.label}-${point.x}-${point.y}`}>
                    <polygon className="ceo-point-whale" points={`${point.x},${point.y - 17} ${point.x + 6},${point.y - 3} ${point.x + 22},${point.y - 2} ${point.x + 10},${point.y + 8} ${point.x + 14},${point.y + 23} ${point.x},${point.y + 15} ${point.x - 14},${point.y + 23} ${point.x - 10},${point.y + 8} ${point.x - 22},${point.y - 2} ${point.x - 6},${point.y - 3}`} />
                    <text className="ceo-point-whale-label" x={point.x - 29} y={point.y + 43}>{point.label}</text>
                  </g>
                ) : (
                  <g key={`${point.type}-${point.label}-${point.x}-${point.y}`}>
                    <circle className={`ceo-point ceo-point-${point.type}`} cx={point.x} cy={point.y} r={point.type === "ai" ? 7 : 6} />
                    <text
                      className={`ceo-point-label ${point.type === "exit" ? "is-exit" : ""}`}
                      x={point.labelAnchor === "end" ? point.x - 12 : point.x + 12}
                      y={point.y + 4}
                      textAnchor={point.labelAnchor === "end" ? "end" : "start"}
                    >
                      {point.label}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
            <div className="ceo-pricing-wrap">
              <span className="ceo-pricing-eyebrow">月費行情 · A$/月</span>
              <div className="ceo-price-table-wrap">
                <table className="ceo-price-table">
                  <thead><tr><th>方案 / 對手</th><th>月費</th><th>定位</th></tr></thead>
                  <tbody>
                    {ops.positioning.pricing.map((row) => (
                      <tr className={row.highlight ? "is-highlight" : ""} key={row.label}>
                        <td>{row.label}</td>
                        <td>{row.display}</td>
                        <td><div className="ceo-price-bar"><i style={{ width: `${row.widthPct}%` }} /></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="ceo-section ceo-daily-ops" id="ceo-morning-report" ref={morningRef}>
        <div className="ceo-section-head"><div><span>11 · 每日交接</span><h2>今日晨報與最近報告</h2></div><p>由 Daily Ops 原始資料直接讀取</p></div>
        <DailyOpsView embedded />
      </section>
    </div>
  );
}
