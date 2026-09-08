import { useEffect, useState } from "react";
import { CalendarCheck2, CircleAlert } from "lucide-react";
import { fetchJson } from "../lib/fetchJson";
import type { Task, TodayPlan } from "../lib/types";
import { DepartmentMiniGrid, useDepartments } from "./DepartmentPulseView";

export default function TodayView() {
  const [plan, setPlan] = useState<TodayPlan | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const departments = useDepartments();

  useEffect(() => {
    fetchJson<TodayPlan | null>("data/today.json", null).then(setPlan);
    fetchJson<Task[]>("data/tasks.json", []).then(setTasks);
  }, []);

  if (!plan) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">Today</h1>
        <p className="text-muted text-sm">
          今日仲未有 Top 3。Dashboard 會讀 vault 嘅 <code className="bg-line px-1 rounded">000_Agent/memory/daily/</code>，唔會寫返入去。
        </p>
      </div>
    );
  }

  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const planTasks = plan.taskIds.map((id) => taskById.get(id)).filter(Boolean) as Task[];
  const fallback = plan.source === "ceo-priority";

  return (
    <div className="today-view">
      <header className="workspace-head"><div><span className="eyebrow">TODAY · ACTION DESK</span><h1>今日作戰</h1><p>{plan.date} · 今日只睇最重要、可推進嘅工作。</p></div><CalendarCheck2 size={42} /></header>

      {plan.note && (
        <div className={`today-note ${fallback ? "is-fallback" : ""}`}>
          {fallback && <CircleAlert size={17} />}{plan.note}
        </div>
      )}

      {fallback && <section className="today-focus"><div className="section-label">今日建議焦點 · 來自 CEO priority queue</div><ol>
        {(plan.suggestedFocus || []).map((item, index) => <li key={item.title}><b>{String(index + 1).padStart(2, "0")}</b><div><strong>{item.title}</strong><p>{item.why}</p></div></li>)}
      </ol></section>}
      {!fallback && <ol className="today-focus">
        {planTasks.map((t, i) => (
          <li
            key={t.id}
            className="flex items-center gap-3 bg-panel border border-line rounded-xl p-3"
          >
            <span className="w-6 text-center text-muted text-sm font-mono">{i + 1}</span>
            <span className={t.status === "done" ? "text-muted line-through" : ""}>
              {t.title}
            </span>
            <span className="ml-auto text-xs text-muted">{t.status}</span>
          </li>
        ))}
      </ol>}
      {departments && <section className="pm-context"><div><span>6 PM 脈搏</span><h2>部門 live board 摘要</h2><p>呢啲係各 PM 最新 board 狀態，唔等於今日完成。</p></div><DepartmentMiniGrid departments={departments} /></section>}
    </div>
  );
}
