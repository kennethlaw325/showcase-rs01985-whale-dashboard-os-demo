import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, Lightbulb, Newspaper, Sparkles } from "lucide-react";
import { fetchJson } from "../lib/fetchJson";
import { createPending } from "../lib/pendingApi";
import { deriveReadiness } from "../lib/readiness";
import type { RssDaily, RssItem } from "../lib/types";

const TOPIC_TARGET = "300_Content/ig-content/";
const EMPTY: RssDaily = { date: "", title: "RSS Daily", summary: "", highlights: [], items: [], fullContent: "", sourcePath: "" };

type TopicFormat = "post" | "reel";
type Candidate = { id: string; title: string; detail: string; source: string; links: RssItem["links"] };
type TopicDirection = { format: TopicFormat; hook: string };

function TopicReadiness({ item }: { item: Candidate }) {
  const readiness = deriveReadiness(item);
  return <span className={`readiness-badge is-${readiness.state}`} title={readiness.inferred ? "由題目與摘要文字保守推斷，尚未是已確認承諾。" : "按既有欄位對應。"}>{readiness.label}{readiness.inferred ? " ?" : ""}</span>;
}

function sourceLabel(item: RssItem) {
  return item.links.map((link) => link.label).join("、") || `RSS 第 ${item.rank} 條`;
}

function topicPreview(selected: Candidate[], directions: Record<string, TopicDirection>, reportDate: string) {
  return [
    "# 明日內容選題",
    "",
    `選題板日期：${reportDate || "未有 RSS 日期"}`,
    "來源：Topic Desk（待 Demo User 批核；未有自動發佈）",
    "",
    ...selected.flatMap((item, index) => [
      `- 選題 ${index + 1}：${item.title}`,
      `  - 來源：${item.source}`,
      `  - 建議形態：${directions[item.id].format}`,
      `  - Hook 方向：${directions[item.id].hook.trim()}`,
      `  - 摘要：${item.detail}`
    ])
  ].join("\n");
}

export default function TopicDeskView() {
  const [report, setReport] = useState<RssDaily | null>(null);
  const [manualIdea, setManualIdea] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [directions, setDirections] = useState<Record<string, TopicDirection>>({});
  const [preview, setPreview] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedPath, setSavedPath] = useState<string | null>(null);

  useEffect(() => { fetchJson<RssDaily>("data/rss-daily.json", EMPTY).then(setReport); }, []);

  const candidates = useMemo<Candidate[]>(() => {
    const rss = report?.items.map((item) => ({
      id: `rss-${item.rank}`,
      title: item.headline,
      detail: item.detail,
      source: sourceLabel(item),
      links: item.links
    })) ?? [];
    if (manualIdea.trim()) {
      rss.unshift({ id: "manual", title: manualIdea.trim(), detail: "Demo User 手動加入的觀察或題目。", source: "Demo User 自加 idea", links: [] });
    }
    return rss;
  }, [manualIdea, report]);

  const selected = candidates.filter((item) => selectedIds.includes(item.id));
  const hasRss = Boolean(report?.items.length);

  function setSelected(id: string, checked: boolean) {
    setPreview("");
    setSavedPath(null);
    setNotice(null);
    if (!checked) {
      setSelectedIds((current) => current.filter((value) => value !== id));
      return;
    }
    if (selectedIds.length >= 3) return setNotice("一次揀 1 至 3 條；先取消一條，先可以換題。 ");
    setSelectedIds((current) => [...current, id]);
    setDirections((current) => ({ ...current, [id]: current[id] ?? { format: "post", hook: "" } }));
  }

  function updateDirection(id: string, update: Partial<TopicDirection>) {
    setPreview("");
    setSavedPath(null);
    setDirections((current) => ({ ...current, [id]: { ...(current[id] ?? { format: "post", hook: "" }), ...update } }));
  }

  function preparePreview() {
    if (!selected.length) return setNotice("請先剔選 1 至 3 條題目。 ");
    if (selected.some((item) => !directions[item.id]?.hook.trim())) return setNotice("每條已選題目都要寫一句 Hook 方向，先可以出草稿。 ");
    setPreview(topicPreview(selected, directions, report?.date ?? ""));
    setSavedPath(null);
    setNotice("草稿已準備好；未寫入 vault，核對後先確認。 ");
  }

  async function saveTopic() {
    if (!preview) return;
    setSaving(true);
    setNotice(null);
    try {
      const result = await createPending({ kind: "topic", target: TOPIC_TARGET, preview });
      setSavedPath(result.relativePath);
      setNotice("已建立選題 pending 檔；聽朝內容製作可用它做輸入，未有自動發佈。 ");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "未能建立選題 pending 檔。 ");
    } finally {
      setSaving(false);
    }
  }

  if (!report) return <div className="topic-loading">正在讀取 RSS Daily…</div>;

  return (
    <div className="topic-desk">
      <header className="topic-desk-head">
        <div><span className="eyebrow">MORNING CONTENT · APPROVAL BOARD</span><h1>選題板</h1><p>揀今日值得講的 1 至 3 條，再留低形式同開場方向。呢度只會建立本機 pending 草稿，唔會自動出 post 或接 IG。</p></div>
        <Lightbulb size={43} aria-hidden="true" />
      </header>

      <div className="topic-safety"><b>兩道確認</b><span>① 揀題目＋寫 Hook</span><i>→</i><span>② 睇草稿後確認，才建立 pending 檔</span><em>未有任何自動發佈</em></div>
      {notice && <p className="topic-notice" role="status">{notice}</p>}
      {savedPath && <p className="topic-saved"><ClipboardCheck size={15} />已放入 <code>{savedPath}</code>，等候明早批核。</p>}

      <section className="topic-source">
        <header><div><span>01 · RSS DAILY</span><h2>{hasRss ? `${report.date || "未有日期"} · 今日新聞訊號` : "RSS 資料暫時攞唔到"}</h2><p>{hasRss ? "由 RSS Daily 挑出可轉成內容的訊號；連結只供 Demo User 按需要自行開啟。" : "未能讀取 rss-daily.json，所以暫時沒有新聞可揀。你仍可用下面的自加 idea 記低題目。"}</p></div><Newspaper size={27} /></header>

        <label className="topic-manual">自加 idea<input value={manualIdea} onChange={(event) => { const value = event.target.value; setManualIdea(value); setPreview(""); setSavedPath(null); if (!value.trim()) setSelectedIds((current) => current.filter((id) => id !== "manual")); }} placeholder="例如：對手今朝一條爆 post，用咗咩切入角度？" /></label>
        <div className="topic-counter"><span>已揀 <b>{selected.length}</b> / 3</span><small>每條選題要補「形式」和一句 Hook。</small></div>

        {hasRss ? <div className="topic-list">
          {candidates.map((item) => {
            const checked = selectedIds.includes(item.id);
            const disableSelect = !checked && selectedIds.length >= 3;
            const direction = directions[item.id] ?? { format: "post" as TopicFormat, hook: "" };
            return <article className={`topic-card ${checked ? "is-selected" : ""}`} key={item.id}>
              <label className="topic-choice"><input type="checkbox" checked={checked} disabled={disableSelect} onChange={(event) => setSelected(item.id, event.target.checked)} /><span>{item.id === "manual" ? "自加" : `RSS #${item.id.replace("rss-", "")}`}</span><b>{item.title}</b><TopicReadiness item={item} /></label>
              <p>{item.detail}</p>
              <small className="topic-source-label">來源：{item.source}</small>
              {item.links.length > 0 && <div className="topic-links">{item.links.map((link) => <span key={link.url}>{link.label}（示範版：外部連結已停用）</span>)}</div>}
              {checked && <div className="topic-direction"><label>建議形態<select value={direction.format} onChange={(event) => updateDirection(item.id, { format: event.target.value as TopicFormat })}><option value="post">post</option><option value="reel">reel</option></select></label><label>Hook 方向<input value={direction.hook} onChange={(event) => updateDirection(item.id, { hook: event.target.value })} placeholder="一句開場，例如：排第一都未必被 AI 點名。" /></label></div>}
            </article>;
          })}
        </div> : <div className="topic-empty">RSS 暫時沒有可用條目。資料一回來，會在這裡顯示標題、來源、連結與摘要。</div>}

        {!hasRss && manualIdea.trim() && <div className="topic-list"><article className={`topic-card ${selectedIds.includes("manual") ? "is-selected" : ""}`}><label className="topic-choice"><input type="checkbox" checked={selectedIds.includes("manual")} onChange={(event) => setSelected("manual", event.target.checked)} /><span>自加</span><b>{manualIdea.trim()}</b>{candidates[0] && <TopicReadiness item={candidates[0]} />}</label><small className="topic-source-label">來源：Demo User 自加 idea</small>{selectedIds.includes("manual") && <div className="topic-direction"><label>建議形態<select value={directions.manual?.format ?? "post"} onChange={(event) => updateDirection("manual", { format: event.target.value as TopicFormat })}><option value="post">post</option><option value="reel">reel</option></select></label><label>Hook 方向<input value={directions.manual?.hook ?? ""} onChange={(event) => updateDirection("manual", { hook: event.target.value })} placeholder="一句開場方向" /></label></div>}</article></div>}
      </section>

      <section className="topic-approval">
        <header><div><span>02 · TOMORROW'S INPUT</span><h2>選題 pending 草稿</h2><p>草稿會記下每條被揀的題目、建議形態和 Hook；只留在 repo 的 pending/，不會改 vault。</p></div><Sparkles size={26} /></header>
        <button className="topic-secondary" onClick={preparePreview}>先出選題草稿</button>
        {preview && <div className="topic-preview"><div><span>準備寫入的內容</span><b>目標：{TOPIC_TARGET}</b></div><pre>{preview}</pre><button className="topic-confirm" disabled={saving} onClick={saveTopic}>{saving ? "建立中…" : <><CheckCircle2 size={15} />確認：建立選題 pending 檔</>}</button></div>}
      </section>
    </div>
  );
}
