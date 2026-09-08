import { access, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DEFAULT_VAULT_DIR = resolve(REPO_ROOT, "..", "..");
const SKILLS_RELATIVE_ROOT = "000_Agent/skills";
const INBOX_RELATIVE_ROOT = "100_Todo/_inbox";
const MAX_SKILL_BYTES = 512 * 1024;

export class VaultStoreError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function normalizedRelativePath(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new VaultStoreError(`${label}不可留空。`);
  const clean = value.trim();
  if (clean.includes("\\") || clean.startsWith("/") || clean.split("/").includes("..")) {
    throw new VaultStoreError(`${label}必須是 vault 內的安全相對路徑。`);
  }
  return clean.replace(/^\.\//, "");
}

function isInside(parent, child) {
  const rel = relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !rel.includes("../");
}

async function resolveSkillPath(sourcePath, vaultDir) {
  const clean = normalizedRelativePath(sourcePath, "Skill 路徑");
  if (!clean.startsWith(`${SKILLS_RELATIVE_ROOT}/`) || basename(clean) !== "SKILL.md") {
    throw new VaultStoreError("只可讀寫 vault 內現存的 SKILL.md。", 400);
  }
  const vaultRoot = resolve(vaultDir);
  const skillsRoot = resolve(vaultRoot, SKILLS_RELATIVE_ROOT);
  const candidate = resolve(vaultRoot, clean);
  if (!isInside(skillsRoot, candidate)) throw new VaultStoreError("Skill 路徑不在允許範圍內。", 400);

  let realSkillsRoot;
  let realCandidate;
  try {
    [realSkillsRoot, realCandidate] = await Promise.all([realpath(skillsRoot), realpath(candidate)]);
  } catch {
    throw new VaultStoreError("找不到指定的 SKILL.md。", 404);
  }
  if (!isInside(realSkillsRoot, realCandidate) || basename(realCandidate) !== "SKILL.md") {
    throw new VaultStoreError("Skill 路徑不在允許範圍內。", 400);
  }
  return { clean, path: realCandidate };
}

function assertSkillContent(content) {
  if (typeof content !== "string" || !content.trim()) throw new VaultStoreError("Skill 內容不可留空。");
  if (Buffer.byteLength(content, "utf8") > MAX_SKILL_BYTES) throw new VaultStoreError("Skill 內容太長，請分開處理。");
}

export async function readSkillFile({ sourcePath, vaultDir = DEFAULT_VAULT_DIR }) {
  const skill = await resolveSkillPath(sourcePath, vaultDir);
  const [content, info] = await Promise.all([readFile(skill.path, "utf8"), stat(skill.path)]);
  return { sourcePath: skill.clean, content, modifiedAt: info.mtimeMs };
}

export async function saveSkillFile({ sourcePath, content, modifiedAt, vaultDir = DEFAULT_VAULT_DIR }) {
  assertSkillContent(content);
  if (typeof modifiedAt !== "number" || !Number.isFinite(modifiedAt)) throw new VaultStoreError("缺少檔案版本，請重新載入後再儲存。");
  const skill = await resolveSkillPath(sourcePath, vaultDir);
  const before = await stat(skill.path);
  if (before.mtimeMs !== modifiedAt) throw new VaultStoreError("檔案已在別處更新，請重新載入後再決定是否改寫。", 409);
  await writeFile(skill.path, content, "utf8");
  return readSkillFile({ sourcePath: skill.clean, vaultDir });
}

function cleanSingleLine(value, label, required = true) {
  if (typeof value !== "string" || (!value.trim() && required)) throw new VaultStoreError(`${label}不可留空。`);
  const clean = value.trim();
  if (clean.length > 1000 || /[\r\n]/.test(clean)) throw new VaultStoreError(`${label}格式不正確。`);
  return clean;
}

function cleanSummary(value) {
  if (typeof value !== "string" || !value.trim()) throw new VaultStoreError("摘要不可留空。");
  const clean = value.trim();
  if (clean.length > 12000) throw new VaultStoreError("摘要太長，請分開處理。");
  return clean;
}

function validDate(value) {
  const date = cleanSingleLine(value, "日報日期");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new VaultStoreError("日報日期必須是 YYYY-MM-DD。");
  return date;
}

function safeUrl(value) {
  const url = cleanSingleLine(value, "新聞連結");
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
  } catch {
    throw new VaultStoreError("新聞連結必須是 http(s) URL。");
  }
  return url;
}

function slugFor(title, url) {
  const readable = title.toLocaleLowerCase().normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
  if (readable) return readable;
  return `rss-${createHash("sha256").update(`${title}\n${url}`).digest("hex").slice(0, 10)}`;
}

function captureDocument({ title, url, summary }) {
  const created = new Date().toISOString();
  return [
    "---",
    "type: reference",
    "source: rss-daily",
    `created: ${created}`,
    "tags: [rss, capture]",
    `title: ${JSON.stringify(title)}`,
    "---",
    "",
    `# ${title}`,
    "",
    `連結：${url}`,
    "",
    "## 日報摘要",
    "",
    summary,
    "",
    "## 點解存",
    "",
    "（留空俾 Demo User 補）",
    ""
  ].join("\n");
}

export async function captureRssReference({ title, url, summary, reportDate, vaultDir = DEFAULT_VAULT_DIR }) {
  const safeTitle = cleanSingleLine(title, "新聞標題");
  const safeUrlValue = safeUrl(url);
  const safeSummary = cleanSummary(summary);
  const date = validDate(reportDate);
  const inbox = resolve(vaultDir, INBOX_RELATIVE_ROOT);
  const filename = `${date}_${slugFor(safeTitle, safeUrlValue)}.md`;
  const path = resolve(inbox, filename);
  if (!isInside(inbox, path)) throw new VaultStoreError("收集目標不在 inbox 內。", 400);
  await mkdir(inbox, { recursive: true });
  try {
    await writeFile(path, captureDocument({ title: safeTitle, url: safeUrlValue, summary: safeSummary }), { encoding: "utf8", flag: "wx" });
    return { duplicate: false, relativePath: `${INBOX_RELATIVE_ROOT}/${filename}` };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
      return { duplicate: true, relativePath: `${INBOX_RELATIVE_ROOT}/${filename}` };
    }
    throw error;
  }
}

export { DEFAULT_VAULT_DIR, INBOX_RELATIVE_ROOT, SKILLS_RELATIVE_ROOT };
