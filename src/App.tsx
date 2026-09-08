import { useMemo, useState } from "react";
import { CheckSquare, CalendarDays, BookOpen, Activity, Bot, Waves, Radio, LibraryBig, RadioTower, Search, Sparkles, ClipboardPenLine, Lightbulb, RefreshCw, WalletCards } from "lucide-react";
import TasksView from "./views/TasksView";
import TodayView from "./views/TodayView";
import DailyNoteView from "./views/DailyNoteView";
import VaultHealthView from "./views/VaultHealthView";
import AIOfficeView from "./views/AIOfficeView";
import CEOView from "./views/CEOView";
import DepartmentPulseView from "./views/DepartmentPulseView";
import LibraryView from "./views/LibraryView";
import RssDailyView from "./views/RssDailyView";
import ActionDeskView from "./views/ActionDeskView";
import TopicDeskView from "./views/TopicDeskView";
import HomeView from "./views/HomeView";
import FinanceOpsView from "./views/FinanceOpsView";
import { beginJsonRefresh } from "./lib/fetchJson";

type View = "home" | "ceo" | "pm" | "tasks" | "today" | "daily" | "library" | "rss" | "vault" | "office" | "action" | "finance" | "topic";

const NAV: Array<{ id: View; label: string; icon: typeof CheckSquare }> = [
  { id: "home", label: "Home", icon: Waves },
  { id: "ceo", label: "CEO Ops", icon: Waves },
  { id: "pm", label: "6 PM 脈搏", icon: Radio },
  { id: "today", label: "Today", icon: CalendarDays },
  { id: "tasks", label: "Tasks", icon: CheckSquare },
  { id: "topic", label: "選題板", icon: Lightbulb },
  { id: "action", label: "Action Desk", icon: ClipboardPenLine },
  { id: "finance", label: "Finance Ops", icon: WalletCards },
  { id: "daily", label: "Daily Log", icon: BookOpen },
  { id: "library", label: "Skills & Prompts", icon: LibraryBig },
  { id: "rss", label: "RSS Daily", icon: RadioTower },
  { id: "vault", label: "Vault 狀態", icon: Activity },
  { id: "office", label: "AI Office", icon: Bot }
];

export default function App() {
  const [view, setView] = useState<View>("home");
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [ceoMorningRequest, setCeoMorningRequest] = useState(0);
  const activeNav = NAV.find((item) => item.id === view) || NAV[0];
  const dateLabel = useMemo(() => new Intl.DateTimeFormat("zh-HK", { month: "long", day: "numeric", weekday: "short" }).format(new Date()), []);

  async function refreshDashboardData() {
    setIsRefreshing(true);
    try {
      const response = await fetch("/api/sync", { method: "POST" });
      const body = await response.json().catch(() => ({})) as { summary?: string };
      if (!response.ok) throw new Error(`Sync API HTTP ${response.status}`);
      setSyncNote(body.summary || `已重新讀取資料 · ${new Date().toLocaleTimeString("zh-HK", { hour12: false })}`);
    } catch (error) {
      setSyncNote(`示範模式：已用頁內示範資料重新整理（唔會真正送出）· ${new Date().toLocaleTimeString("zh-HK", { hour12: false })}`);
      // 靜態部署沒有本機 dev middleware；保留原本只 re-fetch 的安全退路。
      console.warn("[vault sync] Local sync unavailable; refreshing existing JSON instead.", error);
    } finally {
      beginJsonRefresh();
      setRefreshRevision((revision) => revision + 1);
      setIsRefreshing(false);
    }
  }

  function openCeoMorning() {
    setView("ceo");
    setCeoMorningRequest((request) => request + 1);
  }

  return (
    <div className="min-h-screen flex dashboard-shell">
      <aside className="w-60 dashboard-sidebar border-r border-line p-4 flex flex-col gap-1" aria-label="Dashboard navigation">
        <div className="dashboard-brand"><span>🐳</span><div><b>Demo-AI</b><small>WHALE OS DASHBOARD</small></div></div>
        <p className="sidebar-section-label">指揮台</p>
        {NAV.slice(0, 5).map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setView(id)} className={`dashboard-nav ${view === id ? "is-active" : ""}`}><Icon size={16} />{label}</button>
        ))}
        <p className="sidebar-section-label">知識與系統</p>
        {NAV.slice(5).map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setView(id)} className={`dashboard-nav ${view === id ? "is-active" : ""}`}><Icon size={16} />{label}</button>
        ))}
        <div className="dashboard-side-status"><Sparkles size={14} /><div><b>Vault 同步</b><span>只讀資料層 · 可安全 refresh</span></div></div>
      </aside>

      <main className="flex-1 dashboard-main">
        <header className="dashboard-topbar">
          <div><span className="topbar-kicker">DEMO-AI · WHALE OS DASHBOARD</span><strong>{activeNav.label}</strong></div>
          <div className="topbar-actions"><span className="topbar-date">{dateLabel}</span><button type="button" className="dashboard-refresh" onClick={refreshDashboardData} disabled={isRefreshing} aria-label="重新讀取 Vault 資料" title="重新讀取 Vault 資料"><RefreshCw size={15} className={isRefreshing ? "animate-spin" : ""} /><span>{isRefreshing ? "更新中…" : "Refresh"}</span></button><button type="button" className="topbar-search" onClick={() => setView("library")} aria-label="搜尋 Skills 與 Prompts"><Search size={15} /> 搜尋能力庫</button></div>
        </header>
        {syncNote && <p className="dashboard-sync-note" role="status">{syncNote}</p>}
        <div className="dashboard-content" key={refreshRevision}>
        {view === "home" && <HomeView onNavigate={setView} onOpenCeoMorning={openCeoMorning} />}
        {view === "ceo" && <CEOView scrollToMorning={ceoMorningRequest} />}
        {view === "pm" && <DepartmentPulseView />}
        {view === "finance" && <FinanceOpsView />}
        {view === "today" && <TodayView />}
        {view === "tasks" && <TasksView />}
        {view === "action" && <ActionDeskView />}
        {view === "topic" && <TopicDeskView />}
        {view === "daily" && <DailyNoteView />}
        {view === "library" && <LibraryView />}
        {view === "rss" && <RssDailyView />}
        {view === "vault" && <VaultHealthView />}
        {view === "office" && <AIOfficeView />}
        </div>
      </main>
    </div>
  );
}
