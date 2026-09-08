import { useEffect, useMemo, useState } from "react";
import { CheckSquare2, ClipboardCheck, ClipboardCopy, FileText, Send, ShieldCheck } from "lucide-react";
import { copyToClipboard, kickoffText } from "../lib/kickoff";
import { createPending, listPending, rejectPending, type PendingItem } from "../lib/pendingApi";
import { useDepartments } from "./DepartmentPulseView";

const TODO_TARGET = "100_Todo/_inbox/";

type DeskMode = "todo" | "review" | "team";
type DiffLine = { kind: "same" | "removed" | "added"; text: string };

function makeTodoPreview(title: string, detail: string) {
  return [`- [ ] ${title.trim()}`, detail.trim() ? `\n${detail.trim()}` : ""].join("\n");
}

function makeReviewPreview(target: string, original: string, replacement: string) {
  return [
    `目標檔案：${target.trim()}`,
    "",
    "【原文】",
    original.trim(),
    "",
    "【新文字】",
    replacement.trim()
  ].join("\n");
}

// Small local LCS diff: this compares only text pasted into this screen; it never reads a vault file.
function makeLineDiff(original: string, replacement: string): DiffLine[] {
  const before = original.split("\n");
  const after = replacement.split("\n");
  const matrix = Array.from({ length: before.length + 1 }, () => Array(after.length + 1).fill(0) as number[]);

  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      matrix[i][j] = before[i] === after[j] ? matrix[i + 1][j + 1] + 1 : Math.max(matrix[i + 1][j], matrix[i][j + 1]);
    }
  }

  const rows: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) {
      rows.push({ kind: "same", text: before[i] }); i += 1; j += 1;
    } else if (j < after.length && (i === before.length || matrix[i][j + 1] >= matrix[i + 1][j])) {
      rows.push({ kind: "added", text: after[j] }); j += 1;
    } else {
      rows.push({ kind: "removed", text: before[i] }); i += 1;
    }
  }
  return rows;
}

export default function ActionDeskView() {
  const [mode, setMode] = useState<DeskMode>("todo");
  const [todoTitle, setTodoTitle] = useState("");
  const [todoDetail, setTodoDetail] = useState("");
  const [todoPreview, setTodoPreview] = useState("");
  const [reviewTarget, setReviewTarget] = useState("");
  const [reviewOriginal, setReviewOriginal] = useState("");
  const [reviewReplacement, setReviewReplacement] = useState("");
  const [reviewPreview, setReviewPreview] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState<"todo" | "review" | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [selectedPm, setSelectedPm] = useState("");
  const [handoffContext, setHandoffContext] = useState("");
  const [handoffAsk, setHandoffAsk] = useState("");
  const [copied, setCopied] = useState(false);
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [pendingRefreshedAt, setPendingRefreshedAt] = useState<string | null>(null);
  const departments = useDepartments();

  useEffect(() => {
    if (!selectedPm && departments?.[0]) setSelectedPm(departments[0].id);
  }, [departments, selectedPm]);

  async function refreshPending() {
    try { setPendingItems(await listPending()); setPendingError(null); }
    catch (error) { setPendingError(error instanceof Error ? error.message : "未能讀取 pending 檔。"); }
  }

  useEffect(() => { void refreshPending(); }, []);

  async function reject(item: PendingItem) {
    const reason = window.prompt("點解拒？（可留空跳過）", item.rejectedReason);
    if (reason === null) return;
    try {
      await rejectPending(item.file, reason);
      setNotice(reason.trim() ? "已記錄拒因到該 pending 檔。" : "已標記拒絕；拒因留空。 ");
      await refreshPending();
    } catch (error) { setNotice(error instanceof Error ? error.message : "未能記錄拒因。"); }
  }

  const selectedDepartment = departments?.find((department) => department.id === selectedPm) ?? departments?.[0];
  const handoffPrompt = useMemo(() => {
    if (!selectedDepartment || !handoffContext.trim() || !handoffAsk.trim()) return "";
    return kickoffText(`${selectedDepartment.name} handoff`, [
      ["交接對象", `${selectedDepartment.emoji} ${selectedDepartment.name}`],
      ["背景", handoffContext.trim()],
      ["要交付", handoffAsk.trim()],
      ["資料來源", selectedDepartment.source]
    ], "先覆述你理解嘅任務與範圍；只產出建議或文件，唔好自行執行 agent／寫入 vault。") + "\n\n▍安全界線\n呢段只係可複製 handoff prompt，未有任何人被自動指派或執行。";
  }, [handoffAsk, handoffContext, selectedDepartment]);

  function prepareTodo() {
    if (!todoTitle.trim()) return setNotice("請先寫低要做嘅事，先可以出預覽。");
    setTodoPreview(makeTodoPreview(todoTitle, todoDetail));
    setSavedPath(null);
    setNotice("預覽已準備好；未寫入任何地方。核對後先撳確認。 ");
  }

  function prepareReview() {
    if (!reviewTarget.trim() || !reviewOriginal.trim() || !reviewReplacement.trim()) {
      return setNotice("目標檔案、原文同新文字都要有，先可以做本機 diff。");
    }
    setReviewPreview(makeReviewPreview(reviewTarget, reviewOriginal, reviewReplacement));
    setSavedPath(null);
    setNotice("本機 diff 已準備好；Dashboard 未有讀取或改寫 vault。 ");
  }

  async function savePending(kind: "todo" | "review", target: string, preview: string) {
    setSaving(kind);
    setNotice(null);
    try {
      const result = await createPending({ kind, target, preview });
      setSavedPath(result.relativePath);
      setNotice("已建立 pending 檔；仍未寫入 vault，等 Demo User 明早批。 ");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "未能建立 pending 檔。");
    } finally {
      setSaving(null);
    }
  }

  async function copyHandoff() {
    if (!handoffPrompt) return setNotice("請先填好背景同要交付嘅結果。 ");
    const ok = await copyToClipboard(handoffPrompt);
    setCopied(ok);
    setNotice(ok ? "Handoff prompt 已複製；未有 agent 被自動執行。" : "未能自動複製，請手動複製下面文字。 ");
    if (ok) setTimeout(() => setCopied(false), 1800);
  }

  const diff = reviewPreview ? makeLineDiff(reviewOriginal.trim(), reviewReplacement.trim()) : [];
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const weeklyRejections = pendingItems.filter((item) => item.rejectedAt && new Date(item.rejectedAt) >= weekStart);

  return (
    <div className="action-desk">
      <header className="action-desk-head">
        <div><span className="eyebrow">SAFE INPUT · PREVIEW FIRST</span><h1>Action Desk</h1><p>所有內容先畀你睇清楚；今晚只會建立 repo 內的 pending 草稿，唔會自動改 vault 或叫 agent 開工。</p></div>
        <ShieldCheck size={42} aria-hidden="true" />
      </header>

      <div className="action-desk-safety"><b>兩道確認</b><span>① 先出預覽／diff</span><i>→</i><span>② Demo User 撳確認，才建立本機 pending 檔</span><em>正式站與 preview 沒有寫入功能</em></div>

      <section className="action-pending" aria-labelledby="pending-title"><header><div><span>LOCAL PENDING · REJECT LOOP</span><h2 id="pending-title">待批草稿與本週拒因</h2><p>只讀／寫 repo 內 pending 檔；拒絕時可留下一句原因，也可跳過。</p></div><button type="button" onClick={() => { setPendingRefreshedAt(new Date().toLocaleTimeString("zh-HK", { hour12: false })); void refreshPending(); }}>重新整理</button></header>{pendingRefreshedAt && <p className="action-notice" role="status">示範模式：已重新讀取本機 pending 檔 · {pendingRefreshedAt}</p>}{pendingError && <p className="action-notice" role="status">{pendingError}</p>}<div className="action-rejection-summary"><b>本週拒因</b>{weeklyRejections.length ? <ul>{weeklyRejections.map((item) => <li key={item.file}>{item.rejectedReason || "（未填拒因）"}</li>)}</ul> : <span>未有已拒 pending 檔</span>}</div>{pendingItems.length ? <ul className="pending-list">{pendingItems.map((item) => <li key={item.file} className={item.rejectedAt ? "is-rejected" : ""}><div><b>{item.kind}</b><strong>{item.target}</strong><p>{item.preview || "（未能讀取預覽）"}</p>{item.rejectedAt && <small>拒因：{item.rejectedReason || "（未填）"}</small>}</div><button type="button" onClick={() => void reject(item)}>拒</button></li>)}</ul> : <p className="pending-empty">暫未有本機 pending 草稿。</p>}</section>

      <div className="action-desk-tabs" role="tablist" aria-label="Action Desk 工作類型">
        <button className={mode === "todo" ? "is-active" : ""} onClick={() => setMode("todo")} role="tab" aria-selected={mode === "todo"}><CheckSquare2 size={15} />To-do</button>
        <button className={mode === "review" ? "is-active" : ""} onClick={() => setMode("review")} role="tab" aria-selected={mode === "review"}><FileText size={15} />Review</button>
        <button className={mode === "team" ? "is-active" : ""} onClick={() => setMode("team")} role="tab" aria-selected={mode === "team"}><Send size={15} />AI Team</button>
      </div>

      {notice && <p className="action-notice" role="status">{notice}</p>}
      {savedPath && <p className="action-saved"><ClipboardCheck size={15} />已放入 <code>{savedPath}</code>，只等候批核。</p>}

      {mode === "todo" && <section className="action-paper"><header><div><span>01 · TO-DO DRAFT</span><h2>記低一件待辦</h2><p>目標固定為 vault 的 inbox；你會先見到草稿，再決定是否建立 pending 檔。</p></div><code>{TODO_TARGET}</code></header>
        <label>要做乜<input value={todoTitle} onChange={(event) => { setTodoTitle(event.target.value); setTodoPreview(""); }} placeholder="例如：整理週一要跟進的客戶" /></label>
        <label>補充（可留空）<textarea value={todoDetail} onChange={(event) => { setTodoDetail(event.target.value); setTodoPreview(""); }} placeholder="背景、限期或下一步" rows={4} /></label>
        <button className="action-secondary" onClick={prepareTodo}>先出草稿預覽</button>
        {todoPreview && <div className="action-preview"><div><span>準備寫入的內容</span><b>目標：{TODO_TARGET}</b></div><pre>{todoPreview}</pre><button className="action-confirm" disabled={saving === "todo"} onClick={() => savePending("todo", TODO_TARGET, todoPreview)}>{saving === "todo" ? "建立中…" : "確認：建立 pending 草稿"}</button></div>}
      </section>}

      {mode === "review" && <section className="action-paper"><header><div><span>02 · LOCAL DIFF</span><h2>核對一段修改</h2><p>貼上你手上的原文和新文字。本機只做比較，不會讀取 vault 原檔。</p></div><code>不讀 vault</code></header>
        <label>目標 vault 檔案<input value={reviewTarget} onChange={(event) => { setReviewTarget(event.target.value); setReviewPreview(""); }} placeholder="例如：300_Content/ideas.md" /></label>
        <div className="action-dual-input"><label>原文<textarea value={reviewOriginal} onChange={(event) => { setReviewOriginal(event.target.value); setReviewPreview(""); }} rows={9} placeholder="貼上現有文字" /></label><label>新文字<textarea value={reviewReplacement} onChange={(event) => { setReviewReplacement(event.target.value); setReviewPreview(""); }} rows={9} placeholder="貼上你想換成的文字" /></label></div>
        <button className="action-secondary" onClick={prepareReview}>先做本機 diff</button>
        {reviewPreview && <div className="action-preview"><div><span>本機 diff</span><b>目標：{reviewTarget}</b></div><pre className="action-diff">{diff.map((line, index) => <span className={`diff-${line.kind}`} key={`${line.kind}-${index}`}>{line.kind === "added" ? "+ " : line.kind === "removed" ? "− " : "  "}{line.text || " "}{"\n"}</span>)}</pre><button className="action-confirm" disabled={saving === "review"} onClick={() => savePending("review", reviewTarget, reviewPreview)}>{saving === "review" ? "建立中…" : "確認：建立 pending 草稿"}</button></div>}
      </section>}

      {mode === "team" && <section className="action-paper"><header><div><span>03 · HANDOFF ONLY</span><h2>交接俾 AI Team</h2><p>產生一段可複製 prompt；它只是一段文字，不會自動開 agent、寫檔或派工。</p></div><code>copy only</code></header>
        <label>交畀邊位 PM<select value={selectedPm} onChange={(event) => setSelectedPm(event.target.value)} disabled={!departments?.length}>{departments?.map((department) => <option key={department.id} value={department.id}>{department.emoji} {department.name}</option>)}</select></label>
        <label>背景<textarea value={handoffContext} onChange={(event) => setHandoffContext(event.target.value)} rows={4} placeholder="這件事目前去到哪裡？有哪些已知資料？" /></label>
        <label>要交付乜<textarea value={handoffAsk} onChange={(event) => setHandoffAsk(event.target.value)} rows={4} placeholder="例如：整理一份可讓 Demo User 批核的 brief" /></label>
        {handoffPrompt && <div className="action-preview"><div><span>可複製 handoff prompt</span><b>未有自動執行</b></div><pre>{handoffPrompt}</pre><button className="action-confirm" onClick={copyHandoff}>{copied ? <><ClipboardCheck size={15} />已複製</> : <><ClipboardCopy size={15} />複製 handoff prompt</>}</button></div>}
      </section>}
    </div>
  );
}
