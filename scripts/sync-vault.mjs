#!/usr/bin/env node
/**
 * sync-vault.mjs
 *
 * 將 DEMO-AI Obsidian vault 嘅指定 folder 同 markdown pattern 轉做 JSON，
 * 寫入 public/data/ 比 React frontend 讀。
 *
 * 用法：
 *   node scripts/sync-vault.mjs                 # 讀 sample-vault/
 *   VAULT_DIR=/abs/path node scripts/sync-vault.mjs
 *
 * 教學重點（Day 1 H3）：
 *  - 同學睇得明每一步：scan → parse frontmatter → transform → write JSON
 *  - 唔用 ORM、唔用 framework，純 fast-glob + gray-matter
 *  - VAULT_DIR 永遠只讀；所有 JSON 只寫入 dashboard 自己嘅 public/data/
 */

import { readFile, writeFile, mkdir, realpath, stat } from "node:fs/promises";
import { join, dirname, basename, relative } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
import fg from "fast-glob";
import matter from "gray-matter";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const VAULT_DIR = process.env.VAULT_DIR || join(ROOT, "sample-vault");
const OUT_DIR = join(ROOT, "public", "data");
const IGNORED_VAULT_PATHS = [
  ".git/**",
  ".claude/**",
  ".agents/**",
  ".obsidian/**",
  "node_modules/**",
  "200_Reference/dotai-personal-os/**"
];
const PM_DEPARTMENTS = [
  ["sales", "Sales", "🤝"],
  ["ig-marketing", "IG & Marketing", "📣"],
  ["seo-blog", "SEO & Blog", "🔎"],
  ["website-system", "Website & System", "🛠️"],
  ["production", "Production", "🏗️"],
  ["internal-audit", "Internal Audit", "🛡️"]
];
const PM_BY_ID = new Map(PM_DEPARTMENTS.map(([id, name, emoji]) => [id, { id, name, emoji }]));
const SKILLS_INDEX_PATH = join(VAULT_DIR, "000_Agent", "skills", "INDEX.md");
const SKILLS_ROOT = join(VAULT_DIR, "000_Agent", "skills");
const PROMPTS_INDEX_PATH = join(VAULT_DIR, "200_Reference", "claude-prompts", "md example", "INDEX.md");
const WORK_REPORT_PROMPTS_PATH = join(VAULT_DIR, "200_Reference", "prompt-library-work-reports", "_index.md");
const RSS_REPORT_DIR = join(VAULT_DIR, "200_Reference", "whale-digital", "marketing-pm", "reports", "daily");
const RAY_READER_CONFIG_PATH = join(homedir(), ".config", "ray-reader", "config");

const PM_MISSIONS = {
  sales: "把有價值的客戶訊號，變成清楚、可跟進的下一步。",
  "ig-marketing": "把品牌內容與市場訊號，變成穩定的曝光與互動。",
  "seo-blog": "把搜尋與內容資料，變成長期可見度和可信度。",
  "website-system": "把網站、工具與自動化，變成可靠、可維護的系統。",
  production: "把策略與資料，整理成可交付、可覆核的作品。",
  "internal-audit": "守住資料、流程與品質，讓每個決定可回查。"
};

const DEPARTMENT_BY_CATEGORY = {
  "Whale 營運": "sales",
  "內容與社群": "ig-marketing",
  "設計與出圖": "production",
  "SEO": "seo-blog",
  "研究-爬蟲": "seo-blog",
  "研究與情報": "seo-blog",
  "思考與規劃": "internal-audit",
  "辦公室工作流": "production",
  "開發": "website-system",
  "開發-前端動畫": "website-system",
  "個人效率": "internal-audit",
  "財務與行政": "internal-audit"
};

const SKILL_DEPARTMENT_OVERRIDES = {
  client: "sales", "restaurant-lead-finder": "sales", "restaurant-research": "sales", "value-drop": "sales", "value-story": "sales", "competitor-sprint": "sales", "route-b-build": "website-system", landing: "website-system", "retire-demo": "website-system",
  "ad-report": "ig-marketing", "ig-loop": "ig-marketing", "whale-post-pipeline": "ig-marketing", "whale-content-creator": "ig-marketing", "whale-ig-carousel": "ig-marketing", "reels-idea-bank": "ig-marketing", "social-video-insights": "ig-marketing", "x-digest": "seo-blog",
  dataviz: "production", "web-research": "seo-blog", recall: "internal-audit", "vault-lint": "internal-audit", "codex-second-opinion": "internal-audit",
  receipt: "internal-audit", finance: "internal-audit", "wr-": "internal-audit",
  "menu-to-json": "production", "card-studio": "production", "brand-identity": "production", "gen-image": "production", "gen-video": "production", "speak-human-tw": "production", "design-explore": "production", "psd-export": "production",
  "frontend-design": "website-system", "design-taste-frontend": "website-system", "hifi-prototype": "website-system", "ui-ux-pro-max": "website-system", "cloudflare": "website-system", "cloudflare-email-service": "website-system", "durable-objects": "website-system", "sandbox-sdk": "website-system", "turnstile-spin": "website-system", "web-perf": "website-system", "workers-best-practices": "website-system", wrangler: "website-system", "agents-sdk": "website-system"
};

// Defensive guard: forbid syncing Kenneth's real Obsidian vault into public/data/.
// Rule source: ~/.claude/memory/feedback_dotai_no_real_vault_sync.md (2026-05-29).
// 學員 fork 自己 vault 唔受影響（path 唔含呢個 keyword）。
// 如 vault path 日後移動，喺 sync command 加 ALLOW_REAL_VAULT=1 環境變數 override。
//
// M2 fix: strict opt-in — only literal '1' bypasses (ALLOW_REAL_VAULT=0/false/anything-else still blocks).
// L6 fix: realpath() resolves symlinks before regex test, defeats mklink junction bypass.
const FORBIDDEN_VAULT_PATTERNS = [/Desktop[\\/]Obsidian/i];

async function checkVaultGuard() {
  if (process.env.ALLOW_REAL_VAULT === "1") return;

  let resolved = VAULT_DIR;
  try {
    resolved = await realpath(VAULT_DIR);
  } catch {
    // VAULT_DIR doesn't exist yet — fall through, regex test on raw string
  }

  const blocked = FORBIDDEN_VAULT_PATTERNS.some((p) => p.test(VAULT_DIR) || p.test(resolved));
  if (blocked) {
    console.error(`❌ Refusing to sync real Obsidian vault: ${VAULT_DIR}`);
    if (resolved !== VAULT_DIR) console.error(`   (resolved via symlink to: ${resolved})`);
    console.error(`   Production deploy only allows sample-vault/.`);
    console.error(`   Override (本機 dev only, 唔好 commit public/data/) with ALLOW_REAL_VAULT=1.`);
    process.exit(1);
  }
}

const toPosix = (p) => p.split("\\").join("/");

async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

async function readMarkdown(absPath) {
  const raw = await readFile(absPath, "utf8");
  const parsed = matter(raw);
  return { frontmatter: parsed.data, body: parsed.content, raw };
}

/**
 * DEMO-AI 嘅「進行中」任務只來自兩處：
 *  - `000_Agent/memory/daily/YYYY-MM-DD.md` 嘅「今日 Top 3」
 *  - `100_Todo/_inbox/` 未整理筆記入面嘅 checkbox
 *
 * 不掃 archive / reference / code repo，避免歷史工作與範例淹沒駕駛艙。
 */
const CHECKBOX_RE = /^(\s*)-\s+\[([ x/-])\]\s+(.+?)\s*$/i;

function checkboxStatus(state) {
  return state === "x" || state === "X" ? "done" :
    state === "/" || state === "-" ? "doing" : "todo";
}

function dateFromPath(path) {
  return basename(path, ".md").match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || todayString();
}

function departmentFromPath(rel) {
  return rel.match(/^000_Agent\/departments\/([^/]+)\//)?.[1] || "general";
}

async function checkboxTasksFromFiles(files) {
  const tasks = [];
  for (const f of files) {
    const raw = await readFile(f, "utf8");
    const rel = toPosix(relative(VAULT_DIR, f));
    const createdAt = dateFromPath(f);
    for (const [index, line] of raw.split("\n").entries()) {
      const match = line.match(CHECKBOX_RE);
      if (!match) continue;
      const [, , state, title] = match;
      tasks.push({
        id: `cb:${rel}:${index + 1}`,
        title: title.trim(),
        status: checkboxStatus(state),
        createdAt,
        source: "checkbox",
        sourceFile: rel,
        department: departmentFromPath(rel)
      });
    }
  }
  return tasks;
}

async function syncTasks() {
  const files = await fg([
    "000_Agent/memory/daily/*.md",
    "100_Todo/_inbox/*.md"
  ], { cwd: VAULT_DIR, absolute: true, ignore: ["100_Todo/_inbox/README.md"] });
  const tasks = await checkboxTasksFromFiles(files);

  await writeFile(join(OUT_DIR, "tasks.json"), JSON.stringify(tasks, null, 2));
  console.log(`  tasks.json ← ${tasks.length} active tasks`);
}

function todayString() {
  // 用本機 timezone（學員 default 想要 local），可以用 TODAY=YYYY-MM-DD 覆寫
  if (process.env.TODAY) return process.env.TODAY;
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function syncToday() {
  const today = todayString();
  const dailyPath = join(VAULT_DIR, "000_Agent", "memory", "daily", `${today}.md`);
  let plan = null;
  try {
    const raw = await readFile(dailyPath, "utf8");
    const top3 = raw.match(/##\s*今日 Top 3\s*\n([\s\S]*?)(?=\n##|$)/);
    const taskIds = top3 ? top3[1]
      .split("\n")
      .map((line, index) => line.match(CHECKBOX_RE) ? `cb:000_Agent/memory/daily/${today}.md:${raw.split("\n").indexOf(line) + 1}` : null)
      .filter(Boolean) : [];
    const note = raw.match(/##\s*備註\s*\n([\s\S]*?)(?=\n##|$)/)?.[1].trim() || "";
    plan = {
      date: today,
      taskIds,
      note
    };
  } catch {
    // no daily file today — fall through to CEO priorities below, clearly labelled as a fallback.
  }
  if (!plan) {
    try {
      const brief = JSON.parse(await readFile(join(OUT_DIR, "ceo-brief.json"), "utf8"));
      const suggestedFocus = Array.isArray(brief.priorities) ? brief.priorities.slice(0, 5) : [];
      plan = {
        date: today,
        taskIds: [],
        note: "今日未有正式 daily log。以下是最新 CEO priority queue，只作今日建議焦點，並非已寫入的待辦。",
        source: "ceo-priority",
        suggestedFocus
      };
    } catch {
      // leave null when both daily log and CEO recap are unavailable.
    }
  }
  await writeFile(join(OUT_DIR, "today.json"), JSON.stringify(plan, null, 2));
  console.log(`  today.json ← ${plan ? `${plan.taskIds.length} task refs` : "no plan"}`);
}

// Finance Ops 只讀兩本既有帳，所有金額都在此 script 計算；React 只負責顯示。
// 個人帳與 Whale 業務帳故意輸出成兩個獨立段落，避免「第三本混合帳」。
function csvCells(line) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(cell.trim()); cell = "";
    } else cell += char;
  }
  if (quoted) return null;
  cells.push(cell.trim());
  return cells;
}

function amountAud(value) {
  const normalized = String(value || "").replace(/A\$|\$|,/g, "").trim();
  return /^-?\d+(?:\.\d{1,2})?$/.test(normalized) ? Number(normalized) : null;
}

function monthBefore(month) {
  const match = month.match(/^(\d{4})-(\d{2})$/);
  if (!match) return "";
  const date = new Date(Number(match[1]), Number(match[2]) - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function markdownSection(text, heading) {
  const start = text.indexOf(heading);
  if (start < 0) return "";
  const end = text.indexOf("\n## ", start + heading.length);
  return text.slice(start, end < 0 ? text.length : end);
}

function markdownTableRows(section) {
  return section.split("\n").filter((line) => line.trim().startsWith("|")).map((line) =>
    line.split("|").slice(1, -1).map((cell) => cleanMarkdown(cell))
  ).filter((cells) => cells.length && !cells.every((cell) => /^:?-{2,}:?$/.test(cell)));
}

function ledgerTable(section, expectedHeader) {
  const rows = markdownTableRows(section);
  if (!rows.length || !expectedHeader.every((name, index) => rows[0]?.[index]?.includes(name))) return null;
  return rows.slice(1);
}

async function syncFinance() {
  const currentMonth = todayString().slice(0, 7);
  const previousMonth = monthBefore(currentMonth);
  const expensesPath = join(VAULT_DIR, "000_Agent", "finances", "expenses.csv");
  const ledgerPath = join(VAULT_DIR, "000_Agent", "finance-ledger.md");
  const subscriptionsPath = join(VAULT_DIR, "000_Agent", "finances", "subscriptions.json");
  let personal = { currentMonth: currentMonth, previousMonth, currentTotalAud: 0, previousTotalAud: 0, topCategories: [], parsedRows: 0, skippedRows: 0, sourceStatus: "ok" };

  try {
    const lines = (await readFile(expensesPath, "utf8")).split(/\r?\n/).filter(Boolean);
    const headers = csvCells(lines.shift() || "")?.map((header) => header.trim().toLowerCase()) || [];
    const dateAt = headers.indexOf("date");
    const categoryAt = headers.indexOf("category");
    const amountAt = headers.indexOf("amount_aud");
    if (dateAt < 0 || categoryAt < 0 || amountAt < 0) throw new Error("expenses.csv 欄位不符合 date/category/amount_aud");
    const categoryTotals = new Map();
    for (const line of lines) {
      const cells = csvCells(line);
      const date = cells?.[dateAt] || "";
      const amount = amountAud(cells?.[amountAt]);
      if (!cells || !/^\d{4}-\d{2}-\d{2}$/.test(date) || amount === null) { personal.skippedRows += 1; continue; }
      const month = date.slice(0, 7);
      personal.parsedRows += 1;
      if (month === currentMonth) {
        personal.currentTotalAud += amount;
        const category = cells[categoryAt] || "未分類";
        categoryTotals.set(category, (categoryTotals.get(category) || 0) + amount);
      }
      if (month === previousMonth) personal.previousTotalAud += amount;
    }
    personal.topCategories = [...categoryTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([category, totalAud]) => ({ category, totalAud }));
  } catch (error) {
    personal = { ...personal, sourceStatus: error instanceof Error ? error.message : "未能讀取 expenses.csv" };
  }

  let whale = { currentMonth, income: { entries: [], currentMonthTotalAud: 0 }, costs: { entries: [], currentMonthTotalAud: 0 }, netCurrentMonthAud: 0, skippedRows: 0, sourceStatus: "ok", rawFallback: "" };
  try {
    const ledger = await readFile(ledgerPath, "utf8");
    const incomeRows = ledgerTable(markdownSection(ledger, "## A. 收入"), ["日期", "項目", "金額"]);
    const monthlyCostRows = ledgerTable(markdownSection(ledger, "## B. 每月訂閱成本"), ["項目", "金額"]);
    const oneOffCostRows = ledgerTable(markdownSection(ledger, "## C. 一次性 / 不定期成本"), ["日期", "項目", "金額"]);
    if (!incomeRows || !monthlyCostRows || !oneOffCostRows) throw new Error("finance-ledger.md 表格結構未能核實");
    for (const row of incomeRows) {
      const amount = amountAud(row[2]);
      if (amount === null) { whale.skippedRows += 1; continue; }
      const date = row[0];
      whale.income.entries.push({ date, item: row[1], amountAud: amount, note: row[3] || "", inCurrentMonth: date.startsWith(currentMonth) });
      if (date.startsWith(currentMonth)) whale.income.currentMonthTotalAud += amount;
    }
    for (const row of monthlyCostRows) {
      const amount = amountAud(row[1]);
      if (amount === null) { whale.skippedRows += 1; continue; }
      whale.costs.entries.push({ date: "每月", item: row[0], amountAud: amount, note: row[3] || "", inCurrentMonth: true });
      whale.costs.currentMonthTotalAud += amount;
    }
    for (const row of oneOffCostRows) {
      const amount = amountAud(row[2]);
      if (amount === null) { whale.skippedRows += 1; continue; }
      const date = row[0];
      whale.costs.entries.push({ date, item: row[1], amountAud: amount, note: row[3] || "", inCurrentMonth: date.startsWith(currentMonth) });
      if (date.startsWith(currentMonth)) whale.costs.currentMonthTotalAud += amount;
    }
    whale.netCurrentMonthAud = whale.income.currentMonthTotalAud - whale.costs.currentMonthTotalAud;
  } catch (error) {
    whale.sourceStatus = error instanceof Error ? error.message : "未能讀取 finance-ledger.md";
    whale.rawFallback = (await readOptional(ledgerPath, "")).slice(0, 4_000);
  }

  await writeFile(join(OUT_DIR, "finance-ops.json"), JSON.stringify({ generatedAt: new Date().toISOString(), personal, whale }, null, 2) + "\n");
  try {
    const subscriptions = JSON.parse(await readFile(subscriptionsPath, "utf8"));
    await writeFile(join(OUT_DIR, "subscriptions.json"), JSON.stringify(subscriptions, null, 2) + "\n");
    console.log("  subscriptions.json ← finance email-agent output");
  } catch {
    console.log("  subscriptions.json ← source unavailable (kept absent)");
  }
  console.log(`  finance-ops.json ← personal ${personal.parsedRows} rows / skipped ${personal.skippedRows}; Whale skipped ${whale.skippedRows}`);
}

async function syncDailyNotes() {
  const files = await fg("000_Agent/memory/daily/*.md", { cwd: VAULT_DIR, absolute: true });
  const notes = [];
  for (const f of files) {
    const { body } = await readMarkdown(f);
    const date = basename(f, ".md");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const content = body.trim();
    const completedSection = ["今天做了什麼", "今日完成", "已完成", "完成"]
      .map((heading) => sectionAfter(content, `## ${heading}`))
      .find(Boolean) || "";
    const candidates = (completedSection || content).split("\n")
      .filter((line) => /^\s*-\s+(?:\[[xX]\]\s+)?/.test(line))
      .map((line) => cleanMarkdown(line.replace(/^\s*-\s+(?:\[[xX]\]\s+)?/, "")))
      .filter(Boolean)
      .slice(0, 5);
    notes.push({ date, content, summary: candidates });
  }
  await writeFile(join(OUT_DIR, "daily-notes.json"), JSON.stringify(notes, null, 2));
  console.log(`  daily-notes.json ← ${notes.length} notes`);
}

async function syncVaultHealth() {
  const inbox = await fg("100_Todo/_inbox/*.md", { cwd: VAULT_DIR, ignore: ["100_Todo/_inbox/README.md"] });
  const recent = await fg("500_Notes/**/*.md", { cwd: VAULT_DIR, absolute: true });
  recent.sort().reverse();
  const recentAtomNotes = recent.slice(0, 5).map((f) => {
    const name = basename(f, ".md");
    const dateMatch = name.match(/^(\d{4}-\d{2}-\d{2})/);
    return {
      title: name.replace(/^\d{4}-\d{2}-\d{2}\s*/, ""),
      date: dateMatch?.[1] || "",
      path: toPosix(relative(VAULT_DIR, f))
    };
  });

  // orphan = note in 500_Notes/ with 0 inbound wikilinks (best-effort).
  const allNotes = await fg("**/*.md", { cwd: VAULT_DIR, absolute: true, ignore: IGNORED_VAULT_PATHS });
  const titles = new Map();
  for (const f of allNotes) {
    titles.set(basename(f, ".md"), f);
  }
  const referenced = new Set();
  for (const f of allNotes) {
    const raw = await readFile(f, "utf8");
    for (const m of raw.matchAll(/\[\[([^\]|#]+)/g)) {
      const target = m[1].trim();
      if (titles.has(target)) referenced.add(target);
    }
  }
  const atomNotes = (await fg("500_Notes/**/*.md", { cwd: VAULT_DIR })).map((f) =>
    basename(f, ".md")
  );
  const orphanCount = atomNotes.filter((n) => !referenced.has(n)).length;

  const data = {
    inboxCount: inbox.length,
    orphanCount,
    recentAtomNotes,
    lastSyncedAt: new Date().toISOString()
  };
  await writeFile(join(OUT_DIR, "vault-health.json"), JSON.stringify(data, null, 2));
  console.log(`  vault-health.json ← inbox ${data.inboxCount} / orphan ${orphanCount} / recent ${recentAtomNotes.length}`);
}

// content-drafts.json: 冇專屬 dashboard view，但保留 sync 俾之後加入 Content Pipeline view。
async function syncContentDrafts() {
  const files = await fg("100_Todo/drafts/**/*.md", { cwd: VAULT_DIR, absolute: true });
  const drafts = [];
  for (const f of files) {
    const { frontmatter } = await readMarkdown(f);
    if (!frontmatter.title || !frontmatter.platform) continue;
    drafts.push({
      id: String(frontmatter.id || basename(f, ".md")),
      title: String(frontmatter.title),
      platform: String(frontmatter.platform),
      status: String(frontmatter.status || "idea"),
      updatedAt: frontmatter.updated_at || new Date().toISOString()
    });
  }
  await writeFile(join(OUT_DIR, "content-drafts.json"), JSON.stringify(drafts, null, 2));
  console.log(`  content-drafts.json ← ${drafts.length} drafts`);
}

function cleanMarkdown(value = "") {
  return value
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function summaryText(value, max = 190) {
  const text = cleanMarkdown(value);
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function tableCells(line) {
  return line.split("|").slice(1, -1).map((cell) => cleanMarkdown(cell));
}

function normalizeCategory(category) {
  return cleanMarkdown(category).replace(/^[^\p{L}\p{N}]+/u, "").replace(/\(\d+\)\s*$/u, "").trim();
}

function isTableHeader(cells) {
  return !cells.length || cells[0].startsWith(":") || /^(Skill|檔名|#|用途)$/i.test(cells[0]);
}

function departmentForSkill(name, category) {
  if (SKILL_DEPARTMENT_OVERRIDES[name]) return SKILL_DEPARTMENT_OVERRIDES[name];
  for (const [prefix, department] of Object.entries(SKILL_DEPARTMENT_OVERRIDES)) {
    if (prefix.endsWith("-") && name.startsWith(prefix)) return department;
  }
  if (name.startsWith("seo-")) return "seo-blog";
  if (name.startsWith("firecrawl")) return "seo-blog";
  if (name.startsWith("gsap-")) return "website-system";
  return DEPARTMENT_BY_CATEGORY[normalizeCategory(category)] || "internal-audit";
}

function guideForSkill(name, category, department) {
  const isSeo = department === "seo-blog";
  const isMarketing = department === "ig-marketing";
  const isBuild = department === "website-system";
  const isProduction = department === "production";
  const isSales = department === "sales";
  const isFirecrawl = name.startsWith("firecrawl");
  const common = {
    sales: "客戶背景、已核實事實，以及你想推進的下一步",
    "ig-marketing": "內容目標、目標受眾、品牌語氣與已有素材",
    "seo-blog": "網站／主題／資料來源；沒有證據的地方要保留待確認",
    "website-system": "要解決的問題、現有程式或系統位置、驗收方式",
    production: "已核實內容、品牌規範、交付格式與使用情境",
    "internal-audit": "來源資料、範圍、負責人與人手覆核要求"
  };
  const related = isSeo ? ["/web-research", "/seo-tasks", "/speak-human-tw"]
    : isMarketing ? ["/whale-post-pipeline", "/card-studio", "/ig-loop"]
    : isBuild ? ["/brainstorm", "/frontend-design", "/codex-second-opinion"]
    : isProduction ? ["/brand-identity", "/speak-human-tw", "/wr-design-qa"]
    : isSales ? ["/client", "/restaurant-research", "/value-story"]
    : ["/brainstorm", "/wr-seven-layer-qa", "/session-note"];
  if (isFirecrawl) {
    return {
      what: "這是網頁資料擷取工具。Whale 預設不用；只有 Demo User 明確叫用，而且較低成本方法走不通時才可考慮。",
      when: "Demo User 明確批准 Firecrawl，並且已記錄較低成本研究方法無法取得必要資料。",
      inputs: "已核實的目標與範圍；不可把客戶敏感資料送去第三方服務。",
      steps: ["先確認 Demo User 的明確授權", "先跑較低成本方法", "只取完成任務所需資料", "標記來源與抓取日期"],
      output: "有來源、可覆核的研究資料；不是自動行動或決策。",
      links: ["/web-research", "/firecrawl"]
    };
  }
  const teamName = PM_BY_ID.get(department)?.name || "部門 PM";
  return {
    what: `幫 ${teamName} 處理「${category}」類工作，將模糊工作變成可覆核的下一步。`,
    when: `當你要處理「${name}」相關工作，而且已有足夠資料讓 AI 不用猜測時使用。`,
    inputs: common[department],
    steps: ["先講清楚你要的結果", `叫 AI 使用 /${name}`, "檢查輸出是否有來源、假設或待確認項", "確認後才交給下一個 skill 或真人執行"],
    output: isSeo ? "一份有來源、可採納或退回的 SEO／研究結果。" : isMarketing ? "一份可審閱的內容、策略或成效重點。" : isBuild ? "一份可測試的系統方案、程式或技術檢查結果。" : isProduction ? "一份可交付、可人手檢查的文字／視覺／文件成品。" : isSales ? "一份清楚的客戶下一步、研究摘要或銷售素材。" : "一份可核對的流程、檢查結果或管理摘要。",
    links: related
  };
}

async function syncSkillsLibrary() {
  const raw = await readOptional(SKILLS_INDEX_PATH, "");
  let category = "未分類";
  const used = new Map();
  const skills = raw.split("\n").flatMap((line) => {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      category = normalizeCategory(heading[1]);
      return [];
    }
    if (!line.startsWith("|")) return [];
    const cells = tableCells(line);
    if (cells.length < 3 || isTableHeader(cells)) return [];
    const name = cells[0].replace(/^\//, "").trim();
    if (!name || name.includes("---")) return [];
    const source = cells.at(-1) || "目錄";
    const department = departmentForSkill(name, category);
    const count = (used.get(`${name}:${source}`) || 0) + 1;
    used.set(`${name}:${source}`, count);
    const sourcePath = join(SKILLS_ROOT, name, "SKILL.md");
    const guide = guideForSkill(name, category, department);
    return [{
      id: `${name}-${source}-${count}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name,
      category,
      department,
      source,
      sourcePath: source.includes("自家") ? toPosix(relative(VAULT_DIR, sourcePath)) : undefined,
      ...guide
    }];
  });
  // Demo User 2026-08-01 拍板:①plugin skills 唔入 PM 池,歸 "ceo"(CEO 直用)②每個 skill 只准一個 owner(1:1)。
  // 8 個 gsap 自家 folder 同 plugin 版係同一能力 → 自家版行先(owner 照舊),plugin 重複行剷走。
  const ownedNames = new Set(skills.filter((s) => s.source.includes("自家")).map((s) => s.name));
  for (const skill of skills) {
    if (!skill.sourcePath) continue;
    try {
      const parsed = matter(await readFile(join(VAULT_DIR, skill.sourcePath), "utf8"));
      if (typeof parsed.data.description === "string" && parsed.data.description.trim()) skill.description = parsed.data.description.trim();
    } catch { /* unreadable source keeps the existing guide fallback */ }
  }
  const finalSkills = skills
    .filter((s) => !(s.source.includes("plugin") && ownedNames.has(s.name)))
    .map((s) => (s.source.includes("plugin") ? { ...s, department: "ceo" } : s));
  const ceoDirect = finalSkills.filter((s) => s.department === "ceo").length;
  await writeFile(join(OUT_DIR, "skills-library.json"), JSON.stringify(finalSkills, null, 2) + "\n");
  console.log(`  skills-library.json ← ${finalSkills.length} skills(PM 1:1 ${finalSkills.length - ceoDirect} + CEO 直用外掛 ${ceoDirect};去重 ${skills.length - finalSkills.length})`);
}

// AI Office 撳 PM 見返部門真手冊(CHARTER.md,呢個系統冇逐部門 CLAUDE.md,CHARTER.md 係最貼近嘅「部門憲章」)、
// 撳 skill 見返 SKILL.md 原文(唔係 skills-library.json 已經parse好嘅摘要)。
async function syncPmHandbooks() {
  const departments = {};
  for (const [id] of PM_DEPARTMENTS) {
    departments[id] = await readOptional(join(VAULT_DIR, "000_Agent", "departments", id, "CHARTER.md"), "");
  }
  let skillsRaw = [];
  try { skillsRaw = JSON.parse(await readFile(join(OUT_DIR, "skills-library.json"), "utf8")); } catch { /* empty */ }
  const skillDocs = {};
  for (const skill of skillsRaw) {
    if (!skill.sourcePath) continue;
    const content = await readOptional(join(VAULT_DIR, skill.sourcePath), "");
    if (content) skillDocs[skill.id] = content;
  }
  await writeFile(join(OUT_DIR, "pm-handbooks.json"), JSON.stringify({ departments, skills: skillDocs }, null, 2) + "\n");
  console.log(`  pm-handbooks.json ← ${Object.keys(departments).length} charters + ${Object.keys(skillDocs).length} skill docs`);
}

function departmentForPrompt(category) {
  if (/SEO|研究/.test(category)) return "seo-blog";
  if (/行銷|社群|影片/.test(category)) return "ig-marketing";
  if (/開發/.test(category)) return "website-system";
  if (/圖像|設計|學術|企劃/.test(category)) return "production";
  if (/客戶/.test(category)) return "sales";
  return "internal-audit";
}

function promptRows(raw, source) {
  let category = "未分類";
  const rows = [];
  for (const line of raw.split("\n")) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) { category = normalizeCategory(heading[1]); continue; }
    if (!line.startsWith("|")) continue;
    const cells = tableCells(line);
    if (cells.length < 2 || isTableHeader(cells)) continue;
    const title = cells[0].replace(/^\d+\s*/, "").trim();
    if (!title || title.includes("---")) continue;
    const summary = cells[1] || "按原始 prompt 指引處理。";
    const when = cells[2] || "當你有相應的工作目標時使用。";
    const inputs = cells[3] || "依 prompt 要求準備來源資料。";
    rows.push({
      id: `${source}-${title}`.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/(^-|-$)/g, ""),
      title,
      category,
      department: departmentForPrompt(category),
      summary: summaryText(summary, 180),
      when: summaryText(when, 150),
      inputs: summaryText(inputs, 150),
      source
    });
  }
  return rows;
}

async function syncPromptLibrary() {
  const [promptsRaw, workReportRaw] = await Promise.all([
    readOptional(PROMPTS_INDEX_PATH, ""),
    readOptional(WORK_REPORT_PROMPTS_PATH, "")
  ]);
  const prompts = [
    ...promptRows(promptsRaw, "Claude Prompt Library"),
    ...promptRows(workReportRaw, "工作報告 Prompt Library")
  ];
  await writeFile(join(OUT_DIR, "prompt-library.json"), JSON.stringify(prompts, null, 2) + "\n");
  console.log(`  prompt-library.json ← ${prompts.length} prompts`);
}

function rssLinks(cell) {
  const links = [];
  // 展示版嘅示範原文係站內 demo-news.html，唔止 http(s)；所以連相對路徑都收。
  const pattern = /\[([^\]]+)\]\(([^\s)]+)\)/g;
  let match;
  while ((match = pattern.exec(cell))) links.push({ label: cleanMarkdown(match[1]), url: match[2] });
  return links;
}

function rssTopItems(text) {
  const section = sectionAfter(text, "## ① 今日爆咩");
  return section.split("\n").flatMap((line) => {
    if (!line.startsWith("|")) return [];
    const raw = line.split("|").slice(1, -1);
    if (raw.length < 4) return [];
    const rank = cleanMarkdown(raw[0]);
    if (!/^\d+$/.test(rank)) return []; // 跳過 header(#)同分隔行(:--)
    return [{ rank: Number(rank), headline: cleanMarkdown(raw[1]), detail: summaryText(raw[2], 260), links: rssLinks(raw[3]) }];
  });
}

function readerConfigValue(raw, key) {
  const match = raw.match(new RegExp(`^\\s*(?:export\\s+)?${key}\\s*[=:]\\s*(.+?)\\s*$`, "m"));
  return match?.[1]?.trim().replace(/^(["'])(.*)\\1$/, "$2") || "";
}

async function rayReaderCredentials() {
  try {
    const raw = await readFile(RAY_READER_CONFIG_PATH, "utf8");
    const baseUrl = readerConfigValue(raw, "READER_URL").replace(/\/$/, "");
    const token = readerConfigValue(raw, "READER_TOKEN");
    if (!baseUrl || !token || !/^https?:\/\//.test(baseUrl)) return null;
    return { baseUrl, token };
  } catch {
    return null;
  }
}

async function readerPicks(url, token) {
  // 測試 fixture 只可由本機環境變數啟用，確保 fallback 可以離線驗證。
  if (process.env.RSS_READER_FETCH_FIXTURE === "fail") throw new Error("RSS reader fixture failure");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "User-Agent": "ray-ai-dashboard-sync/1.0"
      },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Demo User Reader HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function readerItem(item, rank) {
  const headline = summaryText(String(item?.title || "未命名文章"), 220);
  const detail = summaryText(String(item?.ai_zh_summary || item?.ai_reason || item?.summary || "Demo User Reader 今日推薦。"), 260);
  const url = typeof item?.url === "string" && /^https?:\/\//.test(item.url) ? item.url : "";
  return { rank, headline, detail, links: url ? [{ label: summaryText(String(item?.feed_title || "Demo User Reader"), 80), url }] : [] };
}

async function syncRssDaily() {
  const credentials = await rayReaderCredentials();
  if (credentials) {
    try {
      const today = todayString();
      let picks = await readerPicks(`${credentials.baseUrl}/api/picks?date=${encodeURIComponent(today)}`, credentials.token);
      if (!Array.isArray(picks?.items) || picks.items.length === 0) picks = await readerPicks(`${credentials.baseUrl}/api/picks`, credentials.token);
      if (!Array.isArray(picks?.items)) throw new Error("Demo User Reader picks payload invalid");
      const items = picks.items.slice(0, 8).map(readerItem);
      const data = {
        date: typeof picks.date === "string" ? picks.date : today,
        title: "RSS Daily · Demo User Reader",
        summary: items.length ? `Demo User Reader 直連：今日 ${items.length} 篇推薦。` : "Demo User Reader 暫未有可顯示的推薦。",
        highlights: items.map((item) => item.detail).filter(Boolean).slice(0, 5),
        items,
        fullContent: "",
        sourcePath: "ray-reader:/api/picks",
        source: "ray-reader"
      };
      await writeFile(join(OUT_DIR, "rss-daily.json"), JSON.stringify(data, null, 2) + "\n");
      console.log(`  rss-daily.json ← Demo User Reader ${data.date}`);
      return;
    } catch {
      // 網絡、授權或資料格式失敗都退回 vault 日報，Dashboard 永不因 RSS 中斷白屏。
      console.warn("  rss-daily.json — Demo User Reader unavailable; using vault digest fallback");
    }
  }

  const files = await fg("*.md", { cwd: RSS_REPORT_DIR, absolute: true });
  files.sort();
  const latest = files.at(-1);
  const fallback = { date: "", title: "RSS Daily", summary: "未找到 RSS 日報。", highlights: [], items: [], fullContent: "", sourcePath: "", source: "vault-digest" };
  if (!latest) {
    await writeFile(join(OUT_DIR, "rss-daily.json"), JSON.stringify(fallback, null, 2) + "\n");
    return;
  }
  const raw = await readFile(latest, "utf8");
  const highlights = raw.split("\n")
    .filter((line) => /^-\s+\*\*/.test(line) || /^###\s+/.test(line))
    .map((line) => summaryText(line.replace(/^[-#*\s]+/, ""), 145))
    .filter(Boolean)
    .slice(0, 5);
  const data = {
    date: basename(latest, ".md"),
    title: cleanMarkdown(raw.match(/^#\s+(.+)$/m)?.[1] || "RSS Daily"),
    summary: summaryText(raw.replace(/^#.*$/m, ""), 220),
    highlights,
    items: rssTopItems(raw).slice(0, 8),
    fullContent: raw.replace(/^#\s+.+$/m, "").trim(),
    sourcePath: toPosix(relative(VAULT_DIR, latest)),
    source: "vault-digest"
  };
  await writeFile(join(OUT_DIR, "rss-daily.json"), JSON.stringify(data, null, 2) + "\n");
  console.log(`  rss-daily.json ← ${data.date}`);
}

function sectionAfter(text, heading) {
  const index = text.indexOf(heading);
  if (index < 0) return "";
  const rest = text.slice(index + heading.length);
  const nextHeading = rest.search(/\n##\s/);
  return nextHeading < 0 ? rest : rest.slice(0, nextHeading);
}

function boardRows(text) {
  return text.split("\n").flatMap((line) => {
    if (!line.startsWith("|")) return [];
    const cells = line.split("|").slice(1, -1).map((cell) => cleanMarkdown(cell));
    if (cells.length < 3 || cells[0] === "工作" || cells[0].startsWith(":")) return [];
    return [{ title: cells[0], status: cells[1], detail: summaryText(cells[2]) }];
  });
}

function websiteProjectRows(text) {
  return sectionAfter(text, "## 🗂️ 專案總覽").split("\n").flatMap((line) => {
    if (!line.startsWith("|")) return [];
    const cells = line.split("|").slice(1, -1).map((cell) => cleanMarkdown(cell));
    if (cells.length < 4 || cells[0] === "#" || cells[0].startsWith(":")) return [];
    return [{ title: cells[1], status: cells[2], detail: summaryText(cells[3]) }];
  });
}

function statusDate(status, now) {
  const full = status.match(/(20\d{2})-(\d{1,2})-(\d{1,2})/);
  if (full) return new Date(Number(full[1]), Number(full[2]) - 1, Number(full[3]));
  const short = status.match(/(?:^|[^\d])(\d{1,2})-(\d{1,2})(?:$|[^\d])/);
  return short ? new Date(now.getFullYear(), Number(short[1]) - 1, Number(short[2])) : null;
}

function isWithinSevenDays(date, now) {
  if (!date || Number.isNaN(date.getTime())) return false;
  const elapsed = now.getTime() - date.getTime();
  return elapsed >= 0 && elapsed <= 7 * 24 * 60 * 60 * 1000;
}

function shortDate(date) {
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

async function departmentLight(rows, boardPath) {
  const now = new Date();
  const running = rows.filter((row) => row.status.includes("🔄"));
  if (running.length) return { light: "run", lightReason: `${running.length} 單進行中` };

  const recentDone = rows.filter((row) => row.status.includes("✅") && isWithinSevenDays(statusDate(row.status, now), now));
  if (recentDone.length) return { light: "on", lightReason: `${recentDone.length} 單 7 日內完成` };

  const lastActivity = new Date((await stat(boardPath)).mtime);
  if (isWithinSevenDays(lastActivity, now)) return { light: "on", lightReason: `board 最後活動 ${shortDate(lastActivity)}` };
  return { light: "off", lightReason: `最後活動 ${shortDate(lastActivity)}` };
}

async function syncDepartments() {
  const departments = [];
  for (const [id, name, emoji] of PM_DEPARTMENTS) {
    let relativeSource = `000_Agent/departments/${id}/board.md`;
    let path = join(VAULT_DIR, relativeSource);
    try {
      let text = await readFile(path, "utf8");
      let rows = boardRows(sectionAfter(text, "## 進行中 / 待做"));
      // Website & System 將 board.md 留作 pointer；其單一真相是 dashboard.md。
      if (rows.length === 0 && id === "website-system") {
        relativeSource = `000_Agent/departments/${id}/dashboard.md`;
        path = join(VAULT_DIR, relativeSource);
        text = await readFile(path, "utf8");
        rows = websiteProjectRows(text);
      }
      const done = rows.filter((row) => row.status.includes("✅")).slice(0, 3);
      const active = rows.filter((row) => /🔄|📥|⛔|⏸|🟡/.test(row.status)).slice(0, 3);
      const { light, lightReason } = await departmentLight(rows, path);
      departments.push({ id, name, emoji, active, done, tasks: rows.slice(0, 12), source: relativeSource, light, lightReason });
    } catch (error) {
      console.log(`  departments.json — skipped ${id} (${error.code || "source unavailable"})`);
    }
  }
  await writeFile(join(OUT_DIR, "departments.json"), JSON.stringify(departments, null, 2));
  console.log(`  departments.json ← ${departments.length} PM boards`);
}

function textFromHtml(value = "") {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<span[^>]*>/gi, " ")
    .replace(/<\/span>/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([\da-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function matches(html, pattern, map) {
  return Array.from(html.matchAll(pattern), map);
}

function ceoSection(html, heading) {
  const marker = `<h2>${heading}</h2>`;
  const start = html.indexOf(marker);
  if (start < 0) return "";
  const sectionStart = html.lastIndexOf("<section", start);
  const sectionEnd = html.indexOf("</section>", start);
  return sectionStart >= 0 && sectionEnd >= 0 ? html.slice(sectionStart, sectionEnd + "</section>".length) : "";
}

function sectionNote(section) {
  return textFromHtml(section.match(/<span class="estimate">([\s\S]*?)<\/span>/)?.[1] || "");
}

function sectionText(section) {
  return textFromHtml(section);
}

// 收入目標只接受兩份指定計畫內同時明寫的「打平／理想／超額」月、年數字；
// 缺其中一個即不補算。pipeline 則只計現有階段數 × 明示為假設的轉換率。
async function revenueGapData() {
  const sourcePaths = ["000_Agent/WHALE-1M-PLAN.md", "000_Agent/WHALE-AUG-2026-PLAN.md", "000_Agent/client-stages.md"];
  const [million, august, stages] = await Promise.all(sourcePaths.map((path) => readFile(join(VAULT_DIR, path), "utf8")));
  const targetText = `${million}\n${august}`;
  const targetsApproved = /打平[\s\S]{0,240}(?:月|年)[\s\S]{0,240}理想[\s\S]{0,240}(?:月|年)[\s\S]{0,240}超額/.test(targetText);
  const rates = new Map([["待pitch", 0.4], ["已聯絡", 0.25], ["等回覆", 0.1]]);
  const counts = new Map();
  for (const line of stages.split("\n")) {
    if (!line.trim().startsWith("|") || /客戶\s*\|\s*階段/.test(line) || /^\|[-\s|:]+\|$/.test(line)) continue;
    const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
    if (cells.length < 2 || !rates.has(cells[1])) continue;
    counts.set(cells[1], (counts.get(cells[1]) || 0) + 1);
  }
  const pipeline = [...rates].map(([stage, assumedRate]) => {
    const count = counts.get(stage) || 0;
    return { stage, count, assumedRate, expectedWins: Number((count * assumedRate).toFixed(1)) };
  });
  return { targetsApproved, note: targetsApproved ? "目標文字已在指定計畫明確列出。" : "目標未拍板——去 WHALE-1M-PLAN §5", sources: sourcePaths, pipeline };
}

// CEO 視圖原本係 vault 內兩份自包含 HTML。呢度只抽取顯示資料，
// 寫入 Vault 外嘅 dashboard，避免 React app 依賴或修改 Vault 內 HTML。
async function syncCeoViews() {
  const opsPath = join(VAULT_DIR, "000_Agent", "ceo-ops-dashboard.html");
  const recapPath = join(VAULT_DIR, "000_Agent", "ceo-daily-recap.html");

  try {
    const html = await readFile(opsPath, "utf8");
    const hero = html.match(/<section class="hero panel">[\s\S]*?<h1>([\s\S]*?)<\/h1>[\s\S]*?<p class="sub">([\s\S]*?)<\/p>/);
    const badges = matches(html, /<span class="badge[^\"]*">([\s\S]*?)<\/span>/g, (m) => textFromHtml(m[1]));
    const timeline = matches(html, /<div class="stop([^\"]*)"><span class="dot">([\s\S]*?)<\/span><b>([\s\S]*?)<\/b><small>([\s\S]*?)<\/small><\/div>/g, (m) => ({
      state: m[1].includes("now") ? "now" : m[1].includes("target") ? "target" : m[1].includes("done") ? "done" : "future",
      icon: textFromHtml(m[2]),
      title: textFromHtml(m[3]),
      detail: textFromHtml(m[4])
    }));
    const projects = matches(html, /<div class="progress([^\"]*)"><span class="label">([\s\S]*?)<\/span><div class="track"><div class="fill" style="width:(\d+)%"><\/div><\/div><strong>([\s\S]*?)<\/strong><\/div>/g, (m) => ({
      status: m[1].includes("complete") ? "complete" : m[1].includes("zero") ? "zero" : m[1].includes("primary") ? "primary" : "active",
      label: textFromHtml(m[2]),
      value: Number(m[3]),
      display: textFromHtml(m[4])
    }));
    const kpis = matches(html, /<div class="kpi([^\"]*)"><strong>([\s\S]*?)<\/strong><span>([\s\S]*?)<\/span><\/div>/g, (m) => ({
      tone: m[1].includes("danger") ? "danger" : "normal",
      value: textFromHtml(m[2]),
      label: textFromHtml(m[3])
    }));
    const ops = html.match(/<section class="ops panel"><span>([\s\S]*?)<\/span><span class="ray">([\s\S]*?)<\/span><\/section>/);
    const northStarSection = ceoSection(html, "💰 US$1M 戰略軌 · 次帶");
    const financeSection = ceoSection(html, "💰 FINANCE");
    const launchSection = ceoSection(html, "🚀 LAUNCH 前跑道 · 五線並行");
    const dateBandSection = ceoSection(html, "📅 日期帶");
    const positioningSection = ceoSection(html, "對手定位");
    const northStarText = sectionText(northStarSection);
    const financeTiles = matches(financeSection, /font-size:20px[^>]*>([\s\S]*?)<\/div><div[^>]*>([\s\S]*?)<\/div>/g, (m) => ({
      value: textFromHtml(m[1]), label: textFromHtml(m[2]),
      tone: /損益|−/.test(textFromHtml(m[1])) ? "danger" : /\?|待填/.test(textFromHtml(m[1])) ? "warn" : "normal"
    }));
    const launchTracks = matches(launchSection, /<b[^>]*>([\s\S]*?)<\/b><div[^>]*>([\s\S]*?)<\/div>/g, (m) => {
      const title = textFromHtml(m[1]);
      return { icon: title.match(/^\S+/)?.[0] || "•", title: title.replace(/^\S+\s*/, ""), detail: textFromHtml(m[2]), highlight: /pitch|首單/i.test(title) };
    });
    const dateBadges = matches(dateBandSection, /<span class="badge([^\"]*)">([\s\S]*?)<\/span>/g, (m) => ({
      text: textFromHtml(m[2]), tone: m[1].includes("danger") ? "danger" : m[1].includes("hot") ? "hot" : "normal"
    }));
    const marketPoints = matches(positioningSection, /<circle class="([^\"]+)" cx="(\d+)" cy="(\d+)"[^>]*\/><text class="label-svg([^\"]*)"([^>]*)>([\s\S]*?)<\/text>/g, (m) => ({
      type: m[1].includes("ai") ? "ai" : m[1].includes("old") ? "old" : m[1].includes("exit") ? "exit" : "neutral",
      x: Number(m[2]), y: Number(m[3]), label: textFromHtml(m[6]), labelAnchor: m[5].includes('text-anchor="end"') ? "end" : "start"
    }));
    const whaleLabel = textFromHtml(positioningSection.match(/<text class="whale-label"[^>]*>([\s\S]*?)<\/text>/)?.[1] || "Whale AI in One");
    if (positioningSection.includes('class="whale"')) marketPoints.push({ type: "whale", x: 557, y: 70, label: whaleLabel, labelAnchor: "end" });
    const pricing = matches(positioningSection, /<div class="bar-row([^\"]*)"><label>([\s\S]*?)<\/label><div class="bar"><i style="width:(\d+)%"><\/i><em>([\s\S]*?)<\/em>/g, (m) => ({
      label: textFromHtml(m[2]), widthPct: Number(m[3]), display: textFromHtml(m[4]), highlight: m[1].includes("whale-bar")
    }));
    let revenueGap;
    try { revenueGap = await revenueGapData(); } catch { revenueGap = { targetsApproved: false, note: "目標未拍板——去 WHALE-1M-PLAN §5", sources: [], pipeline: [] }; }
    const data = {
      title: textFromHtml(hero?.[1] || "Whale CEO Ops"),
      subtitle: textFromHtml(hero?.[2] || ""),
      badges: badges.slice(0, 3),
      timeline,
      projects,
      kpis,
      departmentPulse: textFromHtml(ops?.[1] || ""),
      rayFocus: textFromHtml(ops?.[2] || ""),
      northStarTrack: {
        note: sectionNote(northStarSection),
        target: northStarText.match(/目標\s*([^·]+)/)?.[1] || "未有資料",
        baseCase: northStarText.match(/基準情境\s*([^·]+)/)?.[1] || "未有資料",
        bullCase: northStarText.match(/(牛市月[^;·]+)/)?.[1] || "未有資料",
        risk: northStarText.match(/(純服務[^→·]+)/)?.[1] || "未有資料",
        gates: (northStarText.match(/閘門:([\s\S]*?)·\s*狀態/)?.[1] || "").split("→").map((gate) => gate.trim()).filter(Boolean),
        status: northStarText.match(/狀態:([\s\S]*?)$/)?.[1] || "未有資料"
      },
      finance: {
        note: sectionNote(financeSection),
        tiles: financeTiles,
        subscriptions: sectionText(financeSection).match(/訂閱清單:([\s\S]*?)(?:;|$)/)?.[1] || "未有訂閱資料"
      },
      launchTracks: { note: sectionNote(launchSection), tracks: launchTracks },
      dateBand: { note: sectionNote(dateBandSection), badges: dateBadges },
      positioning: {
        note: sectionNote(positioningSection),
        axes: { xLeft: "教你 DIY", xRight: "幫你做晒", yBottom: "傳統", yTop: "AI-native" },
        points: marketPoints,
        pricing
      },
      revenueGap,
      lastSyncedAt: new Date().toISOString()
    };
    await writeFile(join(OUT_DIR, "ceo-ops.json"), JSON.stringify(data, null, 2));
    console.log(`  ceo-ops.json ← ${data.kpis.length} KPI / ${data.projects.length} projects`);
  } catch (error) {
    console.log(`  ceo-ops.json ← skipped (${error.code || "source unavailable"})`);
  }

  try {
    const html = await readFile(recapPath, "utf8");
    const date = textFromHtml(html.match(/<div class="date-badge">([\s\S]*?)<\/div>/)?.[1] || "");
    const northStar = textFromHtml(html.match(/<div class="strap">([\s\S]*?)<\/div>\s*<!-- URGENT -->/)?.[1] || "");
    const urgent = matches(html, /<li>\s*<div class="item">([\s\S]*?)<\/div>\s*<div class="why">([\s\S]*?)<\/div>\s*<div class="ask">([\s\S]*?)<\/div>\s*<\/li>/g, (m) => ({
      title: textFromHtml(m[1]),
      why: textFromHtml(m[2]),
      ask: textFromHtml(m[3])
    }));
    const priorities = matches(html, /<div class="todo-item">([\s\S]*?)<\/div>\s*<div class="todo-why">([\s\S]*?)<\/div>/g, (m) => ({
      title: textFromHtml(m[1]),
      why: textFromHtml(m[2])
    }));
    const data = { date, northStar, urgent, priorities, lastSyncedAt: new Date().toISOString() };
    await writeFile(join(OUT_DIR, "ceo-brief.json"), JSON.stringify(data, null, 2));
    console.log(`  ceo-brief.json ← ${data.urgent.length} urgent / ${data.priorities.length} priorities`);
  } catch (error) {
    console.log(`  ceo-brief.json ← skipped (${error.code || "source unavailable"})`);
  }
}

// agents.json 係 runtime roster：log-agent.mjs 寫運作狀態，sync 補固定名冊資料。
// 每次 sync 只 merge 靜態 metadata，保留 status / lastRun / outputCount，唔會洗走著燈狀態。
const AGENT_ROSTER = [
  { id: "content-creator", name: "內容創作", emoji: "✍️", role: "社群內容與帖文草稿", statusNote: "按平台與受眾產出可審閱的內容初稿", skillPath: "workers/content-creator/SKILL.md" },
  { id: "meeting-organizer", name: "會議整理", emoji: "🗒️", role: "會議摘要與跟進事項", statusNote: "將原始會議記錄整理成清楚的行動項目", skillPath: "workers/meeting-organizer/SKILL.md" },
  { id: "doc-processor", name: "文書處理", emoji: "📄", role: "文件處理與格式整理", statusNote: "處理常見文件工作，輸出可覆核的成品", skillPath: "bonus/doc-processor/SKILL.md" },
  { id: "client-crm", name: "客戶 CRM 跟進", emoji: "🤝", role: "客戶狀態與跟進節奏", statusNote: "找出需要跟進的客戶，整理下一步", skillPath: "workers/client-crm/SKILL.md" },
  { id: "project-manager", name: "Project Manager", emoji: "📋", role: "今日計劃與優先排序", statusNote: "協助揀出最值得完成的工作", skillPath: "workers/project-manager/SKILL.md" },
  { id: "finance", name: "Finance", emoji: "💰", role: "收支整理與月報", statusNote: "將帳目整理成可核對的財務概覽", skillPath: "workers/finance/SKILL.md" },
  { id: "excel-analyst", name: "Excel 數據分析", emoji: "📊", role: "CSV／Excel 資料分析", statusNote: "將表格資料變成可理解的重點", skillPath: "workers/excel-analyst/SKILL.md" },
  { id: "trend-research", name: "Trend Research", emoji: "🔭", role: "趨勢研究與觀察", statusNote: "彙整新訊號，標示待查證項目", skillPath: null },
  { id: "data-consolidation", name: "Data Consolidation", emoji: "🧩", role: "多來源資料整合", statusNote: "把分散資料整理成一致的可用格式", skillPath: "bonus/data-consolidation/SKILL.md" },
  { id: "whatsapp-secretary", name: "WhatsApp 私人秘書", emoji: "💬", role: "訊息整理與行政支援", statusNote: "協助整理訊息脈絡與待辦事項", skillPath: "bonus/whatsapp-secretary/SKILL.md" }
];

const LESSON3_PACK = join(VAULT_DIR, "200_Reference", "course", "ai-builder-course-samples", "lesson3-pack");

async function readOptional(path, fallback) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return fallback;
  }
}

async function syncAgents() {
  const out = join(OUT_DIR, "agents.json");
  let existing = [];
  try {
    existing = JSON.parse(await readFile(out, "utf8"));
  } catch {
    // First run: start from the roster below.
  }

  const byId = new Map(existing.map((agent) => [agent.id, agent]));
  const roster = AGENT_ROSTER.map((meta) => {
    const runtime = byId.get(meta.id) || {};
    const { skillPath, ...agent } = meta;
    return {
      ...agent,
      status: runtime.status || "idle",
      lastRun: runtime.lastRun || null,
      outputCount: Number.isFinite(runtime.outputCount) ? runtime.outputCount : 0
    };
  });
  const customAgents = existing.filter((agent) => !AGENT_ROSTER.some((meta) => meta.id === agent.id));
  await writeFile(out, JSON.stringify([...roster, ...customAgents], null, 2) + "\n");

  const companyManual = await readOptional(
    join(LESSON3_PACK, "AGENTS.md"),
    "未有公司手冊資料。請確認 lesson3-pack/AGENTS.md 是否存在。"
  );
  const skills = {};
  for (const agent of AGENT_ROSTER) {
    skills[agent.id] = agent.skillPath
      ? await readOptional(join(LESSON3_PACK, agent.skillPath), "未能讀取此員工的專屬 SKILL.md。")
      : "未有此員工的專屬 SKILL.md。";
  }
  await writeFile(
    join(OUT_DIR, "agent-handbooks.json"),
    JSON.stringify({ companyManual, skills, lastSyncedAt: new Date().toISOString() }, null, 2) + "\n"
  );
  console.log(`  agents.json ← merge ${roster.length}-row roster（保留 runtime 狀態）`);
  console.log(`  agent-handbooks.json ← company manual + ${Object.keys(skills).length} skill handbooks`);
}

const CAPABILITY_AGENT_DEPARTMENTS = {
  "content-creator": "ig-marketing",
  "meeting-organizer": "production",
  "doc-processor": "production",
  "client-crm": "sales",
  "project-manager": "internal-audit",
  finance: "internal-audit",
  "excel-analyst": "internal-audit",
  "trend-research": "seo-blog",
  "data-consolidation": "website-system",
  "whatsapp-secretary": "production"
};

// 部門更新狀態(pulse):由 vault git 攞「該部門資料夾最後一次 commit」做真訊號。
// 唔准用 TASKBOARD(冇部門欄、Lane 11 個值對唔到)、唔准用 mtime(心跳/checkout 會搞污)。
// 攞唔到訊號 → level "unknown",絕不 fallback 做 idle/active —— 扮有數就係呢個功能要修嘅病。
function pulseLevelFrom(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "unknown";
  const hours = (now - t) / 3_600_000;
  if (hours <= 24) return "active";
  if (hours <= 72) return "slowing";
  return "stalled";
}

async function deriveDeptPulse(deptId) {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", VAULT_DIR, "log", "-1", "--format=%aI%n%s", "--", `000_Agent/departments/${deptId}/`],
      { timeout: 10_000 }
    );
    const [iso, ...subjectParts] = stdout.trim().split("\n");
    if (!iso) return { level: "unknown", lastCommitISO: null, lastCommitSubject: null };
    return { level: pulseLevelFrom(iso), lastCommitISO: iso, lastCommitSubject: subjectParts.join(" ").slice(0, 120) || null };
  } catch {
    return { level: "unknown", lastCommitISO: null, lastCommitSubject: null };
  }
}

async function syncOrganisation() {
  let skills = [];
  let prompts = [];
  try { skills = JSON.parse(await readFile(join(OUT_DIR, "skills-library.json"), "utf8")); } catch { /* handled as empty */ }
  try { prompts = JSON.parse(await readFile(join(OUT_DIR, "prompt-library.json"), "utf8")); } catch { /* handled as empty */ }
  const pms = await Promise.all(PM_DEPARTMENTS.map(async ([id, name, emoji]) => ({
    id,
    name,
    emoji,
    mission: PM_MISSIONS[id],
    skillCount: skills.filter((skill) => skill.department === id).length,
    capabilityAgents: AGENT_ROSTER
      .filter((agent) => CAPABILITY_AGENT_DEPARTMENTS[agent.id] === id)
      .map((agent) => agent.name),
    pulse: await deriveDeptPulse(id)
  })));
  const data = {
    ceo: { name: "Demo User", role: "CEO · 決定方向與最後批准" },
    coAi: [
      { name: "Codex", role: "Co-AI · 系統、資料與實作", focus: "把已批准的工作做成可驗證成果" },
      { name: "Claude Code", role: "Co-AI · 規劃、研究與內容", focus: "把問題整理成可執行方案與初稿" }
    ],
    pms,
    capabilityPool: {
      skillTotal: skills.length,
      pmOwnedTotal: skills.filter((s) => s.department !== "ceo").length,
      ceoDirectTotal: skills.filter((s) => s.department === "ceo").length,
      promptTotal: prompts.length,
      courseTemplateTotal: AGENT_ROSTER.length,
      note: "自家 skills 一人一 owner(1:1)歸六 PM;外掛(plugin)skills 唔入 PM 池,CEO 直接用。課程 10 位員工只保留作示範模板。"
    },
    note: "Whale 的實際管理層是 CEO、兩位 Co-AI 和六位部門 PM。課程的 10 位員工不是 Demo User 的直屬員工，也不是能力池總數。",
    lastSyncedAt: new Date().toISOString()
  };
  await writeFile(join(OUT_DIR, "office-org.json"), JSON.stringify(data, null, 2) + "\n");
  console.log(`  office-org.json ← CEO + 2 Co-AI + ${pms.length} PM`);
}

async function main() {
  await checkVaultGuard();
  console.log(`📚 syncing vault: ${VAULT_DIR}`);
  console.log(`📤 output dir:    ${OUT_DIR}`);
  await ensureDir(OUT_DIR);
  await syncTasks();
  await syncDepartments();
  await syncCeoViews();
  await syncFinance();
  await syncToday();
  await syncDailyNotes();
  await syncVaultHealth();
  await syncContentDrafts();
  await syncSkillsLibrary();
  await syncPmHandbooks();
  await syncPromptLibrary();
  await syncRssDaily();
  await syncAgents();
  await syncOrganisation();
  console.log("✅ sync done");
}

main().catch((err) => {
  console.error("❌ sync failed:", err);
  process.exit(1);
});
