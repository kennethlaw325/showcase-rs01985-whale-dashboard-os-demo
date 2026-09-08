// 展示版冇後端（GitHub Pages 靜態站）。原本 /api/* 只喺 `npm run dev` 由 vite middleware 提供，
// 靜態站上會 404 令啲掣靜靜哋死。呢度攔截 /api/*，用示範資料即時回覆，令每個掣都有嘢睇。
// ponytail: in-memory store，refresh 頁面就回到種子狀態 —— demo 站唔需要持久化。
import nightReportCurrent from "../../NIGHTREPORT.md?raw";

const nightReportArchives = import.meta.glob("../../nightreports/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

const realFetch = window.fetch.bind(window);

type Pending = { file: string; kind: string; target: string; createdAt: string; rejectedReason: string; rejectedAt: string; preview: string; modifiedAt: number };

function seedPending(): Pending[] {
  const base = Date.now();
  return [
    { file: "2026-05-26T08-10-00-todo.md", kind: "todo", target: "100_Todo/_inbox/", createdAt: "2026-05-26T08:10:00.000Z", rejectedReason: "", rejectedAt: "", preview: "- [ ] 出 Velora 續約兩檔方案\n對方已問兩次，星期三前要出。", modifiedAt: base - 1000 },
    { file: "2026-05-26T09-02-00-topic.md", kind: "topic", target: "300_Content/ig-content/", createdAt: "2026-05-26T09:02:00.000Z", rejectedReason: "", rejectedAt: "", preview: "# 明日內容選題\n- 選題 1：儀表板做之前先問睇完會改變咩決定\n  - 建議形態：post", modifiedAt: base - 2000 },
    { file: "2026-05-25T18-40-00-review.md", kind: "review", target: "300_Content/ideas.md", createdAt: "2026-05-25T18:40:00.000Z", rejectedReason: "數字未有出處，退返去補來源", rejectedAt: new Date(Date.now() - 3600_000).toISOString(), preview: "目標檔案：300_Content/ideas.md\n【原文】開信率升 40%\n【新文字】開信率升 12%（示範數字）", modifiedAt: base - 3000 }
  ];
}

const pending = seedPending();
const receipts = [
  { name: "2026-05-24_示範收據-雲端寄存.pdf", size: 184_320, createdAt: "2026-05-24T02:11:00.000Z" },
  { name: "2026-05-25_示範收據-設計工具.png", size: 96_500, createdAt: "2026-05-25T23:40:00.000Z" }
];
const skillEdits = new Map<string, string>();
let skillDocs: Promise<Map<string, string>> | null = null;

// Skill 正文重用已經 build 落 public/data 嘅 SKILL.md 原文（pm-handbooks.json），唔另外複製一份。
function loadSkillDocs(): Promise<Map<string, string>> {
  if (!skillDocs) {
    skillDocs = (async () => {
      const map = new Map<string, string>();
      try {
        const [library, handbooks] = await Promise.all([
          realFetch(new URL("data/skills-library.json", document.baseURI).href).then((r) => r.json()) as Promise<Array<{ id: string; sourcePath?: string }>>,
          realFetch(new URL("data/pm-handbooks.json", document.baseURI).href).then((r) => r.json()) as Promise<{ skills: Record<string, string> }>
        ]);
        for (const item of library) {
          if (item.sourcePath && handbooks.skills?.[item.id]) map.set(item.sourcePath, handbooks.skills[item.id]);
        }
      } catch { /* 攞唔到就用下面嘅通用示範內文 */ }
      return map;
    })();
  }
  return skillDocs;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function reportMeta(path: string, content: string) {
  const heading = [...content.matchAll(/^#\s+(.+)$/gm)].at(-1)?.[1]?.trim() || "夜跑報告";
  return { title: heading, date: heading.match(/\d{4}-\d{2}-\d{2}/)?.[0] || path.match(/\d{4}-\d{2}-\d{2}/)?.[0] || "日期未標示", path, content };
}

function bodyText(init?: RequestInit): string {
  const body = init?.body;
  return typeof body === "string" ? body : "";
}

async function handle(route: string, method: string, url: URL, init?: RequestInit): Promise<Response> {
  if (route === "sync") {
    return json({ ok: true, summary: `示範模式：已重新讀取示範 JSON（${new Date().toLocaleTimeString("zh-HK", { hour12: false })}），唔會真正同步 vault。` });
  }

  if (route === "pending") {
    if (method === "GET") return json([...pending].sort((a, b) => b.modifiedAt - a.modifiedAt));
    if (method === "PATCH") {
      const payload = JSON.parse(bodyText(init) || "{}") as { file?: string; rejectedReason?: string };
      const item = pending.find((entry) => entry.file === payload.file);
      if (!item) return json({ error: "搵唔到呢個 pending 檔。" }, 400);
      item.rejectedReason = payload.rejectedReason || "";
      item.rejectedAt = new Date().toISOString();
      item.modifiedAt = Date.now();
      return json(item);
    }
    const payload = JSON.parse(bodyText(init) || "{}") as { kind?: string; target?: string; preview?: string };
    const createdAt = new Date().toISOString();
    const file = `${stamp()}-${payload.kind || "todo"}.md`;
    pending.unshift({ file, kind: payload.kind || "todo", target: payload.target || "", createdAt, rejectedReason: "", rejectedAt: "", preview: (payload.preview || "").slice(0, 280), modifiedAt: Date.now() });
    return json({ createdAt, relativePath: `pending/${file}` }, 201);
  }

  if (route === "library/skill") {
    if (method === "GET") {
      const sourcePath = url.searchParams.get("path") || "";
      const docs = await loadSkillDocs();
      const content = skillEdits.get(sourcePath) ?? docs.get(sourcePath) ?? `---\nname: ${sourcePath.split("/").at(-2) || "demo-skill"}\nverified_at: ""\nrisk_note: ""\nlast_check: ""\n---\n\n# 示範 SKILL.md\n\n呢份係展示版嘅示範內文（${sourcePath}）。真機由本機 vault 讀取正本。\n`;
      return json({ sourcePath, content, modifiedAt: 1_700_000_000_000 });
    }
    const payload = JSON.parse(bodyText(init) || "{}") as { sourcePath?: string; content?: string };
    if (payload.sourcePath) skillEdits.set(payload.sourcePath, payload.content || "");
    return json({ sourcePath: payload.sourcePath || "", content: payload.content || "", modifiedAt: 1_700_000_000_000 });
  }

  if (route === "rss/capture") {
    const payload = JSON.parse(bodyText(init) || "{}") as { title?: string };
    const slug = (payload.title || "rss-item").slice(0, 24).replace(/[\\/:*?"<>|\s]+/g, "-");
    return json({ duplicate: false, relativePath: `00 - Inbox/${new Date().toISOString().slice(0, 10)}-${slug}.md` });
  }

  if (route === "daily-ops") {
    const archives = Object.entries(nightReportArchives)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 5)
      .map(([path, content]) => reportMeta(`nightreports/${path.split("/").at(-1)}`, content));
    return json({ current: reportMeta("NIGHTREPORT.md", nightReportCurrent), archives });
  }

  if (route === "finance/receipts") {
    if (method === "GET") return json({ receipts });
    const raw = decodeURIComponent(new Headers(init?.headers).get("X-Receipt-Filename") || "收據.pdf");
    const name = `${new Date().toISOString().slice(0, 10)}_${raw.replace(/[^\p{L}\p{N}._-]+/gu, "-")}`;
    const size = init?.body instanceof Blob ? init.body.size : 0;
    receipts.unshift({ name, size, createdAt: new Date().toISOString() });
    return json({ name });
  }

  return json({ ok: true, demo: true, route });
}

export function installDemoApi(): void {
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href, document.baseURI);
    const route = url.pathname.match(/\/api\/(.+)$/)?.[1];
    if (!route) return realFetch(input, init);
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    try {
      return await handle(route, method, url, init);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "示範模式處理失敗。" }, 400);
    }
  };
}
