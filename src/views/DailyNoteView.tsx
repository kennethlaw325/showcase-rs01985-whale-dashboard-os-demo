import { useEffect, useState } from "react";
import { BookOpenCheck } from "lucide-react";
import { fetchJson } from "../lib/fetchJson";
import type { DailyNote } from "../lib/types";
import { DepartmentMiniGrid, useDepartments } from "./DepartmentPulseView";

export default function DailyNoteView() {
  const [notes, setNotes] = useState<DailyNote[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const departments = useDepartments();

  useEffect(() => {
    fetchJson<DailyNote[]>("data/daily-notes.json", []).then((list) => {
      const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date));
      setNotes(sorted);
      if (sorted.length > 0) setSelected(sorted[0].date);
    });
  }, []);

  if (notes === null) return <div className="text-muted text-sm">Loading…</div>;

  if (notes.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">Daily Log</h1>
        <p className="text-muted text-sm">
          冇 daily log。Dashboard 會讀 vault 嘅 <code className="bg-line px-1 rounded">000_Agent/memory/daily/</code>。
        </p>
      </div>
    );
  }

  const current = notes.find((n) => n.date === selected) ?? notes[0];

  return (
    <div className="daily-view">
      <header className="workspace-head"><div><span className="eyebrow">OBSIDIAN · WORK RECORD</span><h1>Daily Log</h1><p>由 vault 每日紀錄整理；摘要只抽取原文內容，唔會補寫未做過嘅事。</p></div><BookOpenCheck size={42} /></header>
      <div className="daily-layout"><aside className="daily-dates">
        <h2>過往紀錄</h2>
        <ul className="space-y-1">
          {notes.map((n) => (
            <li key={n.date}>
              <button
                onClick={() => setSelected(n.date)}
                className={`w-full text-left px-2 py-1 rounded text-sm ${
                  n.date === selected ? "bg-brand text-white" : "text-ink hover:bg-line"
                }`}
              >
                {n.date}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <article className="daily-paper">
        <header>
          <h2 className="text-xl font-bold">{current.date}</h2>
        </header>
        <section className="daily-summary"><span>呢日做咗乜</span>{current.summary.length ? <ul>{current.summary.map((item) => <li key={item}>{item}</li>)}</ul> : <p>呢份紀錄未有可抽取嘅完成項，以下保留原文。</p>}</section>
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink">
          {current.content}
        </pre>
        {departments && <section className="pm-context pm-context-inline"><div><span>缺 daily log 時嘅補充</span><h2>6 PM 最新 board 摘要</h2><p>這是目前部門進度，並非補造當日的 daily log。</p></div><DepartmentMiniGrid departments={departments} /></section>}
      </article>
    </div></div>
  );
}
