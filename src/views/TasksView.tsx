import { useEffect, useState } from "react";
import { CheckSquare2, CircleDotDashed, ClipboardCheck, ClipboardCopy } from "lucide-react";
import { fetchJson } from "../lib/fetchJson";
import { copyToClipboard, kickoffText } from "../lib/kickoff";
import { deriveReadiness } from "../lib/readiness";
import type { DepartmentWorkItem, Task, TaskStatus } from "../lib/types";
import { useDepartments } from "./DepartmentPulseView";

const STATUS_COLOR: Record<TaskStatus, string> = {
  todo: "bg-line text-ink",
  doing: "bg-brand text-white",
  done: "bg-emerald-100 text-emerald-700"
};

const STATUS_DISTRIBUTION: Array<{ status: TaskStatus; label: string; color: string }> = [
  { status: "todo", label: "待處理", color: "var(--ocean-lamp-off)" },
  { status: "doing", label: "進行中", color: "var(--ocean-teal)" },
  { status: "done", label: "已完成", color: "var(--ocean-lamp-green)" }
];

function useKickoffCopy() {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ text: string; copied: boolean } | null>(null);
  async function copy(key: string, text: string) {
    const ok = await copyToClipboard(text);
    setPreview({ text, copied: ok });
    if (ok) {
      setCopiedId(key);
      setTimeout(() => setCopiedId((current) => (current === key ? null : current)), 1800);
    }
  }
  return { copiedId, copy, preview };
}

function deptTaskKickoff(deptName: string, source: string, task: DepartmentWorkItem): string {
  return kickoffText(`${deptName} 任務跟進`, [
    ["任務", task.title],
    ["現況", task.status],
    ["詳情", task.detail],
    ["來源", source]
  ], "睇清楚嚟源檔案，決定跟進定收檔，結果同步返去源頭 board.md。");
}

function generalTaskKickoff(source: string, task: Task): string {
  return kickoffText("CEO / General 任務跟進", [
    ["任務", task.title],
    ["現況", task.status],
    ["來源", source]
  ], "呢個係未歸屬部門嘅 inbox / daily checkbox，睇要唔要指派俾邊個 PM，或者直接處理。");
}

function CopyBadge({ copied }: { copied: boolean }) {
  return copied ? <span className="task-copy-badge is-copied"><ClipboardCheck size={12} /> 已複製</span> : <span className="task-copy-badge"><ClipboardCopy size={12} /> 複製 kickoff</span>;
}

function ReadinessBadge({ item }: { item: object }) {
  const readiness = deriveReadiness(item);
  return <span className={`readiness-badge is-${readiness.state}`} title={readiness.inferred ? "由文字規則保守推斷，並非原始欄位。" : "按現有狀態欄位對應。"}>{readiness.label}{readiness.inferred ? " ?" : ""}</span>;
}

function TaskDistribution({ tasks }: { tasks: Task[] }) {
  const distribution = STATUS_DISTRIBUTION.map((item) => {
    const count = tasks.filter((task) => task.status === item.status).length;
    return { ...item, count, percentage: tasks.length ? (count / tasks.length) * 100 : 0 };
  });
  let position = 0;
  const stops = distribution.map(({ color, percentage }) => {
    const start = position;
    position += percentage;
    return `${color} ${start}% ${position}%`;
  });

  if (!tasks.length) {
    return <section className="task-distribution task-distribution-empty" aria-label="工作狀態分佈"><span className="section-label">LIVE STATUS MIX</span><p>未有 task</p></section>;
  }

  return (
    <section className="task-distribution" aria-labelledby="task-distribution-title">
      <div className="task-donut" role="img" aria-label={`共 ${tasks.length} 個 task 的狀態分佈`} style={{ background: `conic-gradient(${stops.join(", ")})` }}><div><b>{tasks.length}</b><span>tasks</span></div></div>
      <div className="task-distribution-copy"><span className="section-label">LIVE STATUS MIX</span><h2 id="task-distribution-title">工作狀態分佈</h2><p>直接按 vault 同步的 task 即時計算。</p><ul>{distribution.map(({ status, label, color, count, percentage }) => <li key={status}><i style={{ background: color }} /><span>{label}</span><b>{count}</b><em>{Math.round(percentage)}%</em></li>)}</ul></div>
    </section>
  );
}

export default function TasksView() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const departments = useDepartments();
  const { copiedId, copy, preview } = useKickoffCopy();

  useEffect(() => {
    fetchJson<Task[]>("data/tasks.json", []).then(setTasks);
  }, []);

  if (tasks === null) {
    return <div className="text-muted text-sm">Loading…</div>;
  }

  if (tasks.length === 0) {
    return (
      <div className="task-view">
        <header className="workspace-head"><div><span className="eyebrow">WORKBOARD · VAULT SYNC</span><h1>Tasks by Department</h1></div><CheckSquare2 size={42} /></header>
        <TaskDistribution tasks={tasks} />
        <p className="text-muted text-sm">
          冇 task。跑 <code className="bg-line px-1 rounded">npm run sync:vault</code> 將 vault 嘅 task 拉入嚟。
        </p>
      </div>
    );
  }

  const generalTasks = tasks.filter((task) => !task.department || task.department === "general");

  return (
    <div className="task-view">
      <header className="workspace-head"><div><span className="eyebrow">WORKBOARD · VAULT SYNC</span><h1>Tasks by Department</h1><p>六個 PM 各自有一條工作線；未歸屬的 inbox／daily checkbox 會留在 CEO / General，不會亂派。</p></div><CheckSquare2 size={42} /></header>
      <TaskDistribution tasks={tasks} />
      <p className="task-hint">撳一撳任何任務，複製一段 kickoff 文字，貼落新對話就可以跟進。</p>
      {preview && <div className="action-preview"><div><span>Kickoff 文字</span><b>{preview.copied ? "已複製到剪貼簿" : "瀏覽器唔俾自動複製；請手動複製下面文字"}</b></div><pre>{preview.text}</pre></div>}
      <div className="task-lanes">
        {departments?.map((department) => <section className="task-lane" key={department.id}><header><span>{department.emoji}</span><div><h2>{department.name}</h2><p>{department.tasks.length} 項由 board 抽取</p></div></header><ul>{department.tasks.length ? department.tasks.map((task) => {
          const key = `${department.id}-${task.title}-${task.status}`;
          return (
            <li key={key} role="button" tabIndex={0} className="is-clickable" onClick={() => copy(key, deptTaskKickoff(department.name, department.source, task))} onKeyDown={(event) => { if (event.key === "Enter") copy(key, deptTaskKickoff(department.name, department.source, task)); }}>
              <CircleDotDashed size={14} /><div><b>{task.title}</b><p>{task.detail}</p></div><ReadinessBadge item={task} /><em>{task.status}</em><CopyBadge copied={copiedId === key} />
            </li>
          );
        }) : <li>未有可抽取工作</li>}</ul><footer>{department.source}</footer></section>)}
        <section className="task-lane task-general"><header><span>🐳</span><div><h2>CEO / General</h2><p>{generalTasks.length} 項未歸屬工作</p></div></header><ul>{generalTasks.slice(0, 12).map((task) => {
          const key = task.id;
          const source = task.sourceFile || task.createdAt;
          return (
            <li key={key} role="button" tabIndex={0} className="is-clickable" onClick={() => copy(key, generalTaskKickoff(source, task))} onKeyDown={(event) => { if (event.key === "Enter") copy(key, generalTaskKickoff(source, task)); }}>
              <span className={`task-status ${STATUS_COLOR[task.status]}`}>{task.status}</span><div><b>{task.title}</b><p>{source}</p></div><ReadinessBadge item={task} /><CopyBadge copied={copiedId === key} />
            </li>
          );
        })}</ul><footer>daily log / inbox checkbox</footer></section>
      </div>
    </div>
  );
}
