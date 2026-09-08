import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarDays, CheckCircle2, ListTodo, Newspaper, RadioTower } from "lucide-react";
import { fetchJson } from "../lib/fetchJson";
import type { CeoBrief, RssDaily, Task, TodayPlan } from "../lib/types";

type HomeTask = Task & { due?: string; dueDate?: string; date?: string };
type HomeTodo = { title: string; status: string; due?: string };
type HomeRss = RssDaily & { source?: "ray-reader" | "vault-digest" };

const EMPTY_BRIEF: CeoBrief = { date: "", northStar: "", urgent: [], priorities: [], lastSyncedAt: "" };
const EMPTY_RSS: HomeRss = { date: "", title: "", summary: "", highlights: [], items: [], fullContent: "", sourcePath: "", source: "vault-digest" };

function toDate(value?: string): Date | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function syncLabel(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-HK", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function greetingFor(hour: number) {
  if (hour < 12) return "早晨";
  if (hour < 18) return "午安";
  return "晚安";
}

// 鯨魚由手繪 SVG 換成 Codex 生成的實圖(Demo User 2026-08-05 揀 B 版:螢光邊)。
// 圖本身是純黑底,靠 CSS mix-blend-mode: screen 融入深海背景,不需去背 PNG。
function HumpbackWhale() {
  return (
    <div className="home-whale-wrap" aria-hidden="true">
      <img className="home-whale" src="whale-hero.png" alt="" width={960} height={540} decoding="async" />
    </div>
  );
}

export default function HomeView({ onNavigate, onOpenCeoMorning }: { onNavigate: (view: "tasks" | "rss") => void; onOpenCeoMorning: () => void }) {
  const [today, setToday] = useState<TodayPlan | null>(null);
  const [tasks, setTasks] = useState<HomeTask[]>([]);
  const [brief, setBrief] = useState<CeoBrief | null>(null);
  const [rss, setRss] = useState<HomeRss | null>(null);
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    Promise.all([
      fetchJson<TodayPlan | null>("data/today.json", null),
      fetchJson<HomeTask[]>("data/tasks.json", []),
      fetchJson<CeoBrief>("data/ceo-brief.json", EMPTY_BRIEF),
      fetchJson<HomeRss>("data/rss-daily.json", EMPTY_RSS)
    ]).then(([nextToday, nextTasks, nextBrief, nextRss]) => {
      setToday(nextToday);
      setTasks(nextTasks);
      setBrief(nextBrief);
      setRss(nextRss);
    });
  }, []);

  const todayTodos = useMemo<HomeTodo[]>(() => {
    const taskById = new Map(tasks.map((task) => [task.id, task]));
    const planned = (today?.taskIds || []).map((id) => taskById.get(id)).filter(Boolean) as HomeTask[];
    if (planned.length) return planned.slice(0, 6).map((task) => ({ title: task.title, status: task.status, due: task.due || task.dueDate || task.date }));
    if (today?.suggestedFocus?.length) return today.suggestedFocus.slice(0, 6).map((task) => ({ title: task.title, status: "建議" }));

    const todayKey = dateKey(now);
    const overdue = tasks.filter((task) => {
      const due = toDate(task.due || task.dueDate || task.date);
      return task.status !== "done" && due && dateKey(due) < todayKey;
    });
    const doing = tasks.filter((task) => task.status === "doing");
    const todo = tasks.filter((task) => task.status === "todo").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const seen = new Set<string>();
    return [...doing, ...overdue, ...todo].filter((task) => !seen.has(task.id) && (seen.add(task.id), true)).slice(0, 6).map((task) => ({ title: task.title, status: task.status, due: task.due || task.dueDate || task.date }));
  }, [now, tasks, today]);

  const dueByDay = useMemo(() => {
    const map = new Map<string, HomeTask[]>();
    tasks.filter((task) => task.status !== "done").forEach((task) => {
      const due = toDate(task.due || task.dueDate || task.date);
      if (!due) return;
      const key = dateKey(due);
      map.set(key, [...(map.get(key) || []), task]);
    });
    return map;
  }, [tasks]);

  const calendarDays = useMemo(() => {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const start = (first.getDay() + 6) % 7;
    return Array.from({ length: start + daysInMonth }, (_, index) => index < start ? null : new Date(now.getFullYear(), now.getMonth(), index - start + 1));
  }, [now]);

  const agenda = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + index);
    return { date, tasks: dueByDay.get(dateKey(date)) || [] };
  }).filter((item) => item.tasks.length), [dueByDay, now]);

  const dateText = new Intl.DateTimeFormat("zh-HK", { month: "long", day: "numeric", weekday: "long" }).format(now);
  const isTodayPlan = Boolean(today?.taskIds?.length || today?.suggestedFocus?.length);

  return (
    <div className="home-view">
      <section className="home-hero">
        <HumpbackWhale />
        <div className="home-hero-copy">
          <span className="home-kicker">WHALEROOM · TODAY&apos;S CONSOLE</span>
          <h1>{greetingFor(now.getHours())}，Demo User。</h1>
          <p className="home-date"><CalendarDays size={15} /> {dateText}</p>
          <div className="home-brief-strip" aria-label="今日 CEO 重點">
            <span>今日重點</span>
            {brief?.urgent?.length ? brief.urgent.slice(0, 3).map((item) => <p key={item.title}>{item.title}</p>) : <p>今日未有簡報</p>}
            <button type="button" onClick={onOpenCeoMorning}>更多 <ArrowRight size={12} /></button>
          </div>
        </div>
      </section>

      <div className="home-grid">
        <section className="home-card home-todos">
          <header><div><span className="home-card-kicker">TODAY&apos;S LIST</span><h2>今日 To-do</h2></div><ListTodo size={20} /></header>
          {todayTodos.length ? <ol>{todayTodos.map((item, index) => <li key={`${item.title}-${index}`}><span className={`home-status is-${item.status}`}>{item.status}</span><button type="button" onClick={() => onNavigate("tasks")}>{item.title}</button></li>)}</ol> : <div className="home-empty"><CheckCircle2 size={18} /> 今日未有待辦</div>}
          <footer>{isTodayPlan ? "來自 today.json" : "即時由 task 狀態整理"}<button type="button" onClick={() => onNavigate("tasks")}>去 Tasks <ArrowRight size={13} /></button></footer>
        </section>

        <section className="home-card home-calendar">
          <header><div><span className="home-card-kicker">MONTH AT A GLANCE</span><h2>{new Intl.DateTimeFormat("zh-HK", { year: "numeric", month: "long" }).format(now)}</h2></div><CalendarDays size={20} /></header>
          <div className="home-calendar-weekdays">{["一", "二", "三", "四", "五", "六", "日"].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="home-calendar-grid">{calendarDays.map((date, index) => date ? <div key={dateKey(date)} className={`home-calendar-day ${dateKey(date) === dateKey(now) ? "is-today" : ""}`}><span>{date.getDate()}</span>{dueByDay.has(dateKey(date)) && <i aria-label="有到期工作" />}</div> : <div key={`empty-${index}`} />)}</div>
          {agenda.length > 0 && <div className="home-agenda"><b>未來 7 日</b>{agenda.map(({ date, tasks: dueTasks }) => <div key={dateKey(date)}><time>{new Intl.DateTimeFormat("zh-HK", { month: "numeric", day: "numeric", weekday: "short" }).format(date)}</time><span>{dueTasks.map((task) => task.title).join(" · ")}</span></div>)}</div>}
        </section>

        <section className="home-card home-news">
          <header><div><span className="home-card-kicker">LIVE SIGNALS</span><h2>Top News</h2></div><Newspaper size={20} /></header>
          {rss?.items?.length ? <ol>{rss.items.slice().sort((a, b) => a.rank - b.rank).slice(0, 5).map((item) => <li key={item.rank}><span>#{item.rank} · {item.links[0]?.label || "RSS Daily"}</span><button type="button" onClick={() => onNavigate("rss")}>{item.headline}<ArrowRight size={12} /></button></li>)}</ol> : <div className="home-empty"><RadioTower size={18} /> 未有 RSS 日報</div>}
          <footer><span>{rss?.source === "ray-reader" ? "RSS reader 直連" : "vault 日報"}{rss?.date ? ` · ${rss.date}` : ""}</span><button type="button" onClick={() => onNavigate("rss")}>更多 <ArrowRight size={13} /></button></footer>
        </section>
      </div>

      <p className="home-data-note">資料同步：CEO Brief {syncLabel(brief?.lastSyncedAt)} · RSS Daily {rss?.date || "—"}</p>
    </div>
  );
}
