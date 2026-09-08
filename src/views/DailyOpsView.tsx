import { useEffect, useState } from "react";
import { CalendarCheck2, FileClock, RefreshCw, Sunrise } from "lucide-react";
import { fetchJson } from "../lib/fetchJson";
import type { CeoBrief, TodayPlan } from "../lib/types";

type NightReport = { title: string; date: string; path: string; content: string };
type NightReports = { current: NightReport | null; archives: NightReport[] };
type DailyOpsData = { brief: CeoBrief | null; plan: TodayPlan | null; reports: NightReports | null };

const EMPTY_DATA: DailyOpsData = { brief: null, plan: null, reports: null };

function EmptyState({ children }: { children: string }) {
  return <p className="daily-ops-empty">{children}</p>;
}

export default function DailyOpsView({ embedded = false }: { embedded?: boolean }) {
  const [data, setData] = useState<DailyOpsData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);

  async function loadDailyOps(forceFresh = false) {
    const cacheBust = forceFresh ? `?t=${Date.now()}` : "";
    const [brief, plan, reports] = await Promise.all([
      fetchJson<CeoBrief | null>(`data/ceo-brief.json${cacheBust}`, null),
      fetchJson<TodayPlan | null>(`data/today.json${cacheBust}`, null),
      fetchJson<NightReports | null>(`api/daily-ops${cacheBust}`, null)
    ]);
    setData({ brief, plan, reports });
    setLoading(false);
  }

  useEffect(() => { void loadDailyOps(); }, []);

  async function refresh() {
    setRefreshing(true);
    await loadDailyOps(true);
    setLastRefreshed(new Date().toLocaleTimeString("zh-HK", { hour12: false }));
    setRefreshing(false);
  }

  return (
    <div className={`daily-ops ${embedded ? "is-embedded" : ""}`}>
      {!embedded && <header className="daily-ops-head">
        <div><span className="eyebrow">DAILY OPS · TODAY AT A GLANCE</span><h1>日報中樞</h1><p>晨報、今日計劃與夜跑交接放在同一頁；只讀取已存在資料，不會自動寫入 vault。</p></div>
        <div className="daily-ops-refresh"><button type="button" onClick={refresh} disabled={refreshing}><RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />{refreshing ? "更新中…" : "Refresh"}</button><span aria-live="polite">{lastRefreshed ? `示範模式：已重新讀取示範資料 · ${lastRefreshed}` : ""}</span></div>
      </header>}

      {loading && <p className="text-muted text-sm">正在讀取今日資料…</p>}
      {!loading && <div className={`daily-ops-grid ${embedded ? "is-embedded" : ""}`}>
        <section className="daily-ops-card daily-ops-brief">
          <header><div><span>① 今日晨報</span><h2>CEO 晨報</h2></div><Sunrise size={21} /></header>
          {data.brief ? <>
            <p className="daily-ops-date">{data.brief.date}</p>
            <p className="daily-ops-northstar">{data.brief.northStar}</p>
            <ol>{data.brief.priorities.slice(0, 5).map((item, index) => <li key={item.title}><b>{String(index + 1).padStart(2, "0")}</b><div><strong>{item.title}</strong><p>{item.why}</p></div></li>)}</ol>
          </> : <EmptyState>攞唔到晨報資料：等 `public/data/ceo-brief.json` 回復後再按 Refresh。</EmptyState>}
        </section>

        {!embedded && <section className="daily-ops-card daily-ops-plan">
          <header><div><span>② 今日計劃</span><h2>今日要推進甚麼</h2></div><CalendarCheck2 size={21} /></header>
          {data.plan ? <>
            <p className="daily-ops-date">{data.plan.date}{data.plan.source === "ceo-priority" ? " · CEO 建議焦點" : ""}</p>
            {data.plan.note && <p className="daily-ops-note">{data.plan.note}</p>}
            {(data.plan.suggestedFocus || []).length > 0 ? <ol>{data.plan.suggestedFocus?.map((item, index) => <li key={item.title}><b>{String(index + 1).padStart(2, "0")}</b><div><strong>{item.title}</strong><p>{item.why}</p></div></li>)}</ol> : <EmptyState>今日計劃已讀到，但未有可顯示的重點。</EmptyState>}
          </> : <EmptyState>攞唔到今日計劃：等 `public/data/today.json` 回復後再按 Refresh。</EmptyState>}
        </section>}

        <section className="daily-ops-card daily-ops-reports">
          <header><div><span>{embedded ? "② 最近夜跑／日跑報告" : "③ 最近夜跑／日跑報告"}</span><h2>交接紀錄</h2></div><FileClock size={21} /></header>
          {data.reports ? <>
            {data.reports.current ? <article className="nightreport-current"><div><span>目前根目錄報告</span><b>{data.reports.current.title}</b></div><pre>{data.reports.current.content}</pre></article> : <EmptyState>攞唔到根目錄 `NIGHTREPORT.md`：今晚未有可讀交接。</EmptyState>}
            {data.reports.archives.length > 0 ? <div className="nightreport-archive"><p>最近 5 份存檔</p>{data.reports.archives.map((report) => <details key={report.path}><summary><span>{report.date}</span>{report.title}</summary><pre>{report.content}</pre></details>)}</div> : <EmptyState>`nightreports/` 未有存檔；第一份夜跑完成後會在此出現。</EmptyState>}
          </> : <EmptyState>攞唔到夜跑報告：此區只在本機 `npm run dev` 提供唯讀資料。</EmptyState>}
        </section>
      </div>}
    </div>
  );
}
