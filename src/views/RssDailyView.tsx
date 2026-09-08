import { useEffect, useState } from "react";
import { marked } from "marked";
import { Archive, Check, ClipboardCopy, RadioTower, Send } from "lucide-react";
import { fetchJson } from "../lib/fetchJson";
import { createPending } from "../lib/pendingApi";
import { captureRss } from "../lib/vaultApi";
import { useDepartments } from "./DepartmentPulseView";
import type { RssDaily, RssItem } from "../lib/types";

const EMPTY: RssDaily = { date: "", title: "RSS Daily", summary: "未有 RSS 日報。", highlights: [], items: [], fullContent: "", sourcePath: "" };
const PM_DEPARTMENTS = [
  { id: "sales", name: "Sales", emoji: "🤝" }, { id: "ig-marketing", name: "IG & Mkt", emoji: "📣" },
  { id: "seo-blog", name: "SEO & Blog", emoji: "🔎" }, { id: "website-system", name: "W & S", emoji: "🛠️" },
  { id: "production", name: "Production", emoji: "🏗️" }, { id: "internal-audit", name: "Audit", emoji: "🛡️" }
];

function CaptureToObsidian({ item, reportDate }: { item: RssItem; reportDate: string }) {
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [tryAction, setTryAction] = useState("");
  const [reviewBy, setReviewBy] = useState("");
  const link = item.links[0]?.url;
  async function capture() {
    if (!link) return setNotice("這條未有可存的原始連結。");
    setSaving(true); setNotice(null);
    try {
      const result = await captureRss({ title: item.headline, url: link, summary: item.detail, reportDate, tryAction, reviewBy });
      setSaved(true); setOpen(false); setNotice(result.duplicate ? "之前已存過。" : "已存入 Obsidian inbox。");
    } catch (error) { setNotice(error instanceof Error ? error.message : "未能存入 Obsidian inbox。"); } finally { setSaving(false); }
  }
  return <div className="rss-capture"><button type="button" disabled={saving || saved || !link} className={saved ? "is-done" : ""} onClick={() => setOpen((value) => !value)}>{saved ? <><Check size={13} />已存 ✓</> : <><Archive size={13} />{saving ? "儲存中…" : "存入 Obsidian"}</>}</button>{open && <div className="rss-capture-menu"><label>要試乜（可留空）<textarea value={tryAction} onChange={(event) => setTryAction(event.target.value)} rows={2} placeholder="例如：用喺下一篇 SEO brief" /></label><label>幾時 review（可留空）<input type="date" value={reviewBy} onChange={(event) => setReviewBy(event.target.value)} /></label><button type="button" onClick={() => void capture()} disabled={saving}>{saving ? "儲存中…" : "確認收藏"}</button></div>}{notice && <small role="status">{notice}</small>}</div>;
}

function ForwardToPm({ item, reportDate }: { item: RssItem; reportDate: string }) {
  const departments = useDepartments();
  const [open, setOpen] = useState(false);
  const [departmentId, setDepartmentId] = useState("sales");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [forwarded, setForwarded] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const visibleDepartments = departments?.length ? departments : PM_DEPARTMENTS;
  async function forward() {
    const department = visibleDepartments.find((entry) => entry.id === departmentId);
    if (!department) return;
    setSaving(true); setNotice(null);
    const target = `000_Agent/departments/${department.id}/board.md`;
    const source = item.links.map((link) => link.url).join("\n") || "（日報未附原始連結）";
    const preview = ["# RSS Daily PM 轉交", "", `- 日報日期：${reportDate || "未有"}`, `- 部門：${department.name}`, `- 新聞：${item.headline}`, `- 連結：${source}`, `- Demo User 備註：${note.trim() || "（未有）"}`, `- 轉交時間：${new Date().toLocaleString("en-AU")}`, "", "## 內容摘要", "", item.detail].join("\n");
    try { await createPending({ kind: "relay", target, preview }); setForwarded(department.name); setOpen(false); setNote(""); }
    catch (error) { setNotice(error instanceof Error ? error.message : "未能建立 PM 轉交草稿。"); } finally { setSaving(false); }
  }
  return <div className="rss-forward"><button type="button" className={`rss-forward-toggle ${forwarded ? "is-done" : ""}`} onClick={() => setOpen((value) => !value)}>{forwarded ? <><Check size={13} />已轉俾 {forwarded} ✓</> : <><ClipboardCopy size={13} />轉俾 PM</>}</button>{open && <div className="rss-forward-menu"><label>交俾<select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>{visibleDepartments.map((dept) => <option key={dept.id} value={dept.id}>{dept.emoji} {dept.name}</option>)}</select></label><label>Demo User 備註（可留空）<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} placeholder="例如：抽去做明日內容題材" /></label><button type="button" onClick={() => void forward()} disabled={saving}><Send size={12} />{saving ? "建立中…" : "確認轉交"}</button></div>}{notice && <small className="rss-action-notice" role="status">{notice}</small>}</div>;
}

export default function RssDailyView() {
  const [report, setReport] = useState<RssDaily | null>(null);
  const [showFull, setShowFull] = useState(false);
  useEffect(() => { fetchJson<RssDaily>("data/rss-daily.json", EMPTY).then(setReport); }, []);
  if (!report) return <div className="text-muted text-sm">Loading RSS Daily…</div>;
  return <div className="rss-view"><header className="workspace-head"><div><span className="eyebrow">MARKET SIGNALS · VAULT SYNC</span><h1>RSS Daily</h1><p>只顯示已經寫入 vault 嘅最新日報；唔會喺 Dashboard 偷偷使用你的 RSS 登入資料。</p></div><RadioTower size={42} /></header><section className="rss-paper"><span className="library-dept">最新報告 · {report.date || "未有日期"}</span><h2>{report.title}</h2><p>{report.summary}</p>{report.items.length > 0 && <><h3>今日爆咩</h3><ol className="rss-items">{report.items.map((item) => <li key={item.rank}><div className="rss-item-head"><strong>{item.headline}</strong><div className="rss-item-actions"><CaptureToObsidian item={item} reportDate={report.date} /><ForwardToPm item={item} reportDate={report.date} /></div></div><p>{item.detail}</p>{item.links.length > 0 && <div className="rss-item-links">{item.links.map((link) => <span key={link.url}>{link.label}（示範版：外部連結已停用）</span>)}</div>}</li>)}</ol></>}<h3>值得留意</h3>{report.highlights.length ? <ol>{report.highlights.map((item) => <li key={item}>{item}</li>)}</ol> : <p>未抽到重點。</p>}{report.fullContent && <details className="rss-full-article" open={showFull} onToggle={(event) => setShowFull((event.target as HTMLDetailsElement).open)}><summary>睇成篇日報全文</summary><div className="rss-full-body" dangerouslySetInnerHTML={{ __html: marked.parse(report.fullContent) as string }} /></details>}<footer><span>來源：{report.sourcePath || "未有來源"}</span><span>示範版：RSS reader 連結已停用</span></footer></section></div>;
}
