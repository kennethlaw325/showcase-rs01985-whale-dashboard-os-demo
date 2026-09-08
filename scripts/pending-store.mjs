import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_PENDING_DIR = resolve(REPO_ROOT, "pending");
const TODO_TARGET = "100_Todo/_inbox/";
const TOPIC_TARGET = "300_Content/ig-content/";
const VALID_KINDS = new Set(["todo", "review", "topic", "relay"]);
const RELAY_TARGETS = new Set([
  "000_Agent/departments/sales/board.md",
  "000_Agent/departments/ig-marketing/board.md",
  "000_Agent/departments/seo-blog/board.md",
  "000_Agent/departments/website-system/board.md",
  "000_Agent/departments/production/board.md",
  "000_Agent/departments/internal-audit/board.md"
]);

function asText(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label}不可留空。`);
  }
  if (value.length > 50000) throw new Error(`${label}太長，請分開處理。`);
  return value.trim();
}

function validateTarget(kind, target) {
  const cleanTarget = asText(target, "目標檔案").replaceAll("\\", "/");
  if (cleanTarget.startsWith("/") || cleanTarget.split("/").includes("..")) {
    throw new Error("目標檔案必須是 vault 內的相對路徑。");
  }
  if (kind === "todo" && cleanTarget !== TODO_TARGET) {
    throw new Error(`To-do 只可送往 ${TODO_TARGET}`);
  }
  if (kind === "topic" && cleanTarget !== TOPIC_TARGET) {
    throw new Error(`選題只可送往 ${TOPIC_TARGET}`);
  }
  if (kind === "relay" && !RELAY_TARGETS.has(cleanTarget)) {
    throw new Error("PM 轉交只可記錄至指定部門的 pending 草稿。");
  }
  return cleanTarget;
}

function pendingDocument({ kind, target, preview, createdAt }) {
  const label = kind === "todo" ? "To-do 草稿" : kind === "review" ? "Review 批核草稿" : kind === "topic" ? "內容選題草稿" : "PM 轉交草稿";
  return [
    "---",
    "pending: true",
    `kind: ${kind}`,
    `created_at: ${createdAt}`,
    `target: ${target}`,
    "---",
    "",
    `# ${label}`,
    "",
    "> 這是 Dashboard 在本機產生的 pending 檔，不會自動寫入 vault。Demo User 確認後才可人手套用。",
    "",
    "## 預覽內容",
    "",
    "```text",
    preview,
    "```",
    ""
  ].join("\n");
}

function optionalSingleLine(value, label) {
  if (typeof value !== "string") throw new Error(`${label}格式不正確。`);
  const clean = value.trim();
  if (clean.length > 1000 || /[\r\n]/.test(clean)) throw new Error(`${label}格式不正確。`);
  return clean;
}

function pendingPath(file, pendingDir) {
  const clean = asText(file, "pending 檔案").replaceAll("\\", "/");
  if (clean.includes("/") || clean !== basename(clean) || !clean.endsWith(".md")) throw new Error("只可處理 pending 目錄內的 Markdown 檔。");
  const directory = resolve(pendingDir);
  const path = resolve(directory, clean);
  if (dirname(path) !== directory) throw new Error("pending 檔案不在允許目錄內。");
  return path;
}

function frontmatterValue(raw, key) {
  return raw.match(new RegExp(`^${key}:\\s*(.*)$`, "m"))?.[1]?.trim().replace(/^"|"$/g, "") || "";
}

function summary(path, raw, info) {
  return {
    file: basename(path), kind: frontmatterValue(raw, "kind"), target: frontmatterValue(raw, "target"),
    createdAt: frontmatterValue(raw, "created_at"), rejectedReason: frontmatterValue(raw, "rejected_reason"), rejectedAt: frontmatterValue(raw, "rejected_at"),
    preview: (raw.match(/## 預覽內容\n\n```text\n([\s\S]*?)\n```/)?.[1] || "").trim().slice(0, 280), modifiedAt: info.mtimeMs
  };
}

export async function listPendingFiles({ pendingDir = DEFAULT_PENDING_DIR } = {}) {
  const directory = resolve(pendingDir);
  let names = [];
  try { names = await readdir(directory); } catch (error) { if (error?.code === "ENOENT") return []; throw error; }
  const records = await Promise.all(names.filter((name) => name.endsWith(".md")).map(async (name) => {
    const path = pendingPath(name, directory);
    const [raw, info] = await Promise.all([readFile(path, "utf8"), stat(path)]);
    return summary(path, raw, info);
  }));
  return records.sort((a, b) => b.modifiedAt - a.modifiedAt);
}

export async function rejectPendingFile({ file, reason = "", pendingDir = DEFAULT_PENDING_DIR }) {
  const path = pendingPath(file, pendingDir);
  const raw = await readFile(path, "utf8");
  if (!raw.startsWith("---\n")) throw new Error("pending 檔缺少 frontmatter，不能回收拒因。");
  const line = `rejected_reason: ${JSON.stringify(optionalSingleLine(reason, "拒因"))}`;
  let updated = /^rejected_reason:.*$/m.test(raw) ? raw.replace(/^rejected_reason:.*$/m, line) : raw.replace(/^---\n/, `---\n${line}\n`);
  const at = `rejected_at: ${new Date().toISOString()}`;
  updated = /^rejected_at:.*$/m.test(updated) ? updated.replace(/^rejected_at:.*$/m, at) : updated.replace(/^---\n/, `---\n${at}\n`);
  await writeFile(path, updated, "utf8");
  return summary(path, updated, await stat(path));
}

/**
 * 將已由 UI 確認的預覽放進 repo 內的 pending/。
 * 此模組不讀取、亦不寫入 vault；target 只會被記錄在 pending 文件。
 */
export async function createPendingFile({ kind, target, preview, pendingDir = DEFAULT_PENDING_DIR }) {
  if (!VALID_KINDS.has(kind)) throw new Error("不支援的 pending 類型。");
  const safeTarget = validateTarget(kind, target);
  const safePreview = asText(preview, "預覽內容");
  const safeDir = resolve(pendingDir);
  await mkdir(safeDir, { recursive: true });
  const createdAt = new Date().toISOString();
  const stamp = createdAt.replace(/[:.]/g, "-");
  const filename = `${stamp}-${kind}-${Math.random().toString(36).slice(2, 8)}.md`;
  const path = resolve(safeDir, filename);
  const document = pendingDocument({ kind, target: safeTarget, preview: safePreview, createdAt });
  await writeFile(path, document, { encoding: "utf8", flag: "wx" });

  return {
    createdAt,
    relativePath: relative(REPO_ROOT, path).replaceAll("\\", "/"),
    document
  };
}

export { TODO_TARGET, TOPIC_TARGET, RELAY_TARGETS };
