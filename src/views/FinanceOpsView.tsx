import { ChangeEvent, DragEvent, useEffect, useState } from "react";
import { BadgeDollarSign, CircleAlert, FileUp, ReceiptText, RefreshCw, Upload, WalletCards } from "lucide-react";
import { fetchJson } from "../lib/fetchJson";

type FinanceEntry = { date: string; item: string; amountAud: number; note: string; inCurrentMonth: boolean };
type FinanceOpsData = {
  generatedAt: string;
  personal: { currentMonth: string; previousMonth: string; currentTotalAud: number; previousTotalAud: number; topCategories: Array<{ category: string; totalAud: number }>; parsedRows: number; skippedRows: number; sourceStatus: string };
  whale: { currentMonth: string; income: { entries: FinanceEntry[]; currentMonthTotalAud: number }; costs: { entries: FinanceEntry[]; currentMonthTotalAud: number }; netCurrentMonthAud: number; skippedRows: number; sourceStatus: string; rawFallback: string };
};
type SubscriptionData = { updatedAt?: string; items?: Array<{ name: string; amountMonthly: number; currency: string; source: string }>; totalMonthly?: number };
type Receipt = { name: string; size: number; createdAt: string };

const EMPTY_FINANCE: FinanceOpsData = {
  generatedAt: "",
  personal: { currentMonth: "", previousMonth: "", currentTotalAud: 0, previousTotalAud: 0, topCategories: [], parsedRows: 0, skippedRows: 0, sourceStatus: "資料尚未同步" },
  whale: { currentMonth: "", income: { entries: [], currentMonthTotalAud: 0 }, costs: { entries: [], currentMonthTotalAud: 0 }, netCurrentMonthAud: 0, skippedRows: 0, sourceStatus: "資料尚未同步", rawFallback: "" }
};

function money(amount: number, currency = "AUD") {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

function receiptSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FinanceOpsView() {
  const [data, setData] = useState<FinanceOpsData>(EMPTY_FINANCE);
  const [subscriptions, setSubscriptions] = useState<SubscriptionData | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [receiptStatus, setReceiptStatus] = useState("讀取收據收集箱中…");
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function loadReceipts() {
    try {
      const response = await fetch("/api/finance/receipts");
      if (!response.ok) throw new Error();
      const payload = await response.json() as { receipts?: Receipt[] };
      setReceipts(Array.isArray(payload.receipts) ? payload.receipts : []);
      setReceiptStatus("");
    } catch {
      setReceiptStatus("收據收集箱只在本機 npm run dev 顯示及上載。");
    }
  }

  useEffect(() => {
    void fetchJson<FinanceOpsData>("data/finance-ops.json", EMPTY_FINANCE).then(setData);
    void fetchJson<SubscriptionData | null>("data/subscriptions.json", null).then(setSubscriptions);
    void loadReceipts();
  }, []);

  async function uploadReceipt(file?: File) {
    if (!file || uploading) return;
    if (file.size > 10 * 1024 * 1024) { setReceiptStatus("收據檔不可超過 10MB。"); return; }
    setUploading(true);
    setReceiptStatus("正在存入收據收集箱…");
    try {
      const response = await fetch("/api/finance/receipts", { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream", "X-Receipt-Filename": encodeURIComponent(file.name) }, body: file });
      const payload = await response.json() as { name?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || "未能上載收據。");
      setReceiptStatus(`已存入：${payload.name || file.name}`);
      await loadReceipts();
    } catch (error) {
      setReceiptStatus(error instanceof Error ? error.message : "未能上載收據。");
    } finally {
      setUploading(false);
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) { void uploadReceipt(event.target.files?.[0]); event.target.value = ""; }
  function onDrop(event: DragEvent<HTMLLabelElement>) { event.preventDefault(); setDragging(false); void uploadReceipt(event.dataTransfer.files?.[0]); }
  const confirmedSubscriptions = (subscriptions?.items || []).filter((item) => typeof item.amountMonthly === "number" && Boolean(item.name));

  return <div className="finance-ops">
    <header className="finance-ops-head">
      <div><span className="eyebrow">FINANCE OPS · TWO BOOKS, NO GUESSWORK</span><h1>財務與收據</h1><p>個人開支與 Whale 業務帳分開顯示；所有總數由同步 script 計，畫面不自行計帳。</p></div>
      <WalletCards size={34} />
    </header>

    <div className="finance-grid">
      <section className="finance-card personal-finance">
        <header><div><span>① 個人開支</span><h2>{data.personal.currentMonth || "本月"}</h2></div><ReceiptText size={21} /></header>
        <div className="finance-total"><span>本月總計</span><strong>{money(data.personal.currentTotalAud)}</strong><small>上月 {money(data.personal.previousTotalAud)}</small></div>
        {data.personal.topCategories.length ? <ul className="finance-category-list">{data.personal.topCategories.map((row) => <li key={row.category}><span>{row.category}</span><b>{money(row.totalAud)}</b></li>)}</ul> : <p className="finance-empty">本月未有已入賬個人開支。</p>}
        <footer>已解析 {data.personal.parsedRows} 行 · 略過 {data.personal.skippedRows} 行</footer>
      </section>

      <section className="finance-card whale-finance">
        <header><div><span>② Whale 業務帳</span><h2>{data.whale.currentMonth || "本月"}</h2></div><BadgeDollarSign size={21} /></header>
        <div className="finance-business-totals"><div><span>收入</span><b>{money(data.whale.income.currentMonthTotalAud)}</b></div><div><span>成本</span><b>{money(data.whale.costs.currentMonthTotalAud)}</b></div><div className={data.whale.netCurrentMonthAud < 0 ? "is-negative" : ""}><span>Net</span><b>{money(data.whale.netCurrentMonthAud)}</b></div></div>
        <div className="finance-ledger-lists"><div><span>收入項目</span>{data.whale.income.entries.length ? <ul>{data.whale.income.entries.map((row, index) => <li key={`${row.item}-${index}`}><span>{row.item}</span><b>{money(row.amountAud)}</b></li>)}</ul> : <p>未有已核實收入。</p>}</div><div><span>成本項目</span>{data.whale.costs.entries.length ? <ul>{data.whale.costs.entries.map((row, index) => <li key={`${row.item}-${index}`}><span>{row.item}</span><b>{money(row.amountAud)}</b></li>)}</ul> : <p>未有已核實成本。</p>}</div></div>
        {data.whale.rawFallback && <p className="finance-fallback"><CircleAlert size={14} />帳本結構未能解析，僅保留原文 fallback，沒有作任何金額計算。</p>}
        <footer>略過 {data.whale.skippedRows} 行 · {data.whale.sourceStatus === "ok" ? "已核實帳本結構" : data.whale.sourceStatus}</footer>
      </section>

      <section className="finance-card subscriptions-card">
        <header><div><span>③ 訂閱月費</span><h2>Email agent 訂閱資料</h2></div><RefreshCw size={20} /></header>
        {!confirmedSubscriptions.length && <span className="unwired-badge" title="欠缺 email agent 已輸出的訂閱資料，Dashboard 沒有直接連接 email。">未接線</span>}
        {confirmedSubscriptions.length ? <><div className="finance-total"><span>每月合計</span><strong>{typeof subscriptions?.totalMonthly === "number" ? money(subscriptions.totalMonthly) : "—"}</strong><small>{subscriptions?.updatedAt || ""}</small></div><ul className="finance-category-list">{confirmedSubscriptions.map((item) => <li key={item.name}><span>{item.name}</span><b>{money(item.amountMonthly, item.currency || "AUD")}</b></li>)}</ul></> : <p className="finance-empty">等緊 email agent 出數</p>}
      </section>

      <section className="finance-card receipt-inbox-card">
        <header><div><span>④ 上載收據收集箱</span><h2>待入賬檔案</h2></div><Upload size={20} /></header>
        <label className={`receipt-dropzone ${dragging ? "is-dragging" : ""}`} onDragEnter={() => setDragging(true)} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
          <FileUp size={24} /><b>{uploading ? "上載中…" : "拖入收據，或按此揀檔"}</b><span>jpg / png / webp / pdf · 最多 10MB</span><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={onFileChange} disabled={uploading} />
        </label>
        {receiptStatus && <p className="receipt-status" aria-live="polite">{receiptStatus}</p>}
        {receipts.length ? <ul className="receipt-list">{receipts.map((receipt) => <li key={receipt.name}><span>{receipt.name}</span><b>{receiptSize(receipt.size)}</b></li>)}</ul> : !receiptStatus && <p className="finance-empty">收集箱暫未有未處理檔案。</p>}
        <p className="receipt-next">存咗之後開 Claude 窗講「/receipt 處理收據收集箱」做入賬。</p>
      </section>
    </div>
  </div>;
}
