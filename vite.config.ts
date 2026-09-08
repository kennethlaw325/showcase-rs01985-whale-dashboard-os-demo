import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { createPendingFile, listPendingFiles, rejectPendingFile } from "./scripts/pending-store.mjs";
import { readNightReports } from "./scripts/nightreport-store.mjs";
import { captureRssReference, readSkillFile, saveSkillFile, VaultStoreError } from "./scripts/vault-store.mjs";

const MAX_PENDING_BODY_BYTES = 64 * 1024;
const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
const RECEIPT_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);
const execFileAsync = promisify(execFile);
const ROOT_DIR = dirname(fileURLToPath(import.meta.url));
let activeVaultSync: Promise<void> | null = null;

function sendJson(response: ServerResponse, status: number, body: object) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_PENDING_BODY_BYTES) throw new Error("內容太長，請分開建立草稿。");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function readBinaryBody(request: IncomingMessage) {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_RECEIPT_BYTES) throw new Error("收據檔不可超過 10MB。");
    chunks.push(buffer);
  }
  if (!size) throw new Error("未收到收據檔。");
  return Buffer.concat(chunks);
}

function melbourneDate() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "00";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function cleanReceiptName(value: string) {
  const decoded = decodeURIComponent(value || "");
  const base = basename(decoded).replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "");
  const extension = extname(base).toLowerCase();
  if (!base || !RECEIPT_EXTENSIONS.has(extension)) throw new Error("只接受 jpg、png、webp 或 pdf 收據。");
  return base;
}

function validReceiptMagic(buffer: Buffer, extension: string) {
  if (extension === ".jpg" || extension === ".jpeg") return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (extension === ".png") return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (extension === ".webp") return buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  return buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

async function availableReceiptPath(inboxDir: string, date: string, safeName: string) {
  const extension = extname(safeName);
  const stem = basename(safeName, extension);
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const candidate = resolve(inboxDir, `${date}_${stem}${suffix ? `-${suffix}` : ""}${extension}`);
    if (!candidate.startsWith(`${inboxDir}/`)) throw new Error("收據路徑不在允許目錄內。");
    try { await access(candidate); } catch { return candidate; }
  }
  throw new Error("同名收據太多，請更改檔名後重試。");
}

async function verifiedReceiptInbox(inboxDir: string) {
  const resolved = await realpath(inboxDir);
  if (resolved !== inboxDir) throw new Error("收據收集箱不可使用符號連結。");
  return resolved;
}

// configureServer 只會被 Vite dev server 掛載；build、preview 與正式站沒有寫檔路由。
function pendingApiPlugin(): Plugin {
  return {
    name: "action-desk-pending-api",
    configureServer(server) {
      server.middlewares.use("/api/pending", async (request, response) => {
        if (server.config.command !== "serve") return sendJson(response, 404, { error: "此端點只限本機開發模式。" });
        if (request.method === "GET") {
          try { return sendJson(response, 200, await listPendingFiles()); }
          catch (error) { return sendJson(response, 500, { error: error instanceof Error ? error.message : "未能讀取 pending 檔。" }); }
        }
        if (request.method === "PATCH") {
          try {
            const payload = await readJsonBody(request) as { file?: string; rejectedReason?: string };
            return sendJson(response, 200, await rejectPendingFile({ file: payload.file || "", reason: payload.rejectedReason || "" }));
          } catch (error) { return sendJson(response, 400, { error: error instanceof Error ? error.message : "未能記錄拒因。" }); }
        }
        if (request.method !== "POST") return sendJson(response, 405, { error: "只接受 POST。" });
        try {
          const payload = await readJsonBody(request) as { kind?: string; target?: string; preview?: string };
          const result = await createPendingFile({
            kind: payload.kind as "todo" | "review" | "topic",
            target: payload.target ?? "",
            preview: payload.preview ?? ""
          });
          sendJson(response, 201, { createdAt: result.createdAt, relativePath: result.relativePath });
        } catch (error) {
          const message = error instanceof Error ? error.message : "未能建立 pending 檔。";
          sendJson(response, 400, { error: message });
        }
      });
    }
  };
}

function vaultWriteApiPlugin(): Plugin {
  return {
    name: "vault-library-and-rss-write-api",
    configureServer(server) {
      const vaultDir = resolve(ROOT_DIR, "..", "..");
      server.middlewares.use("/api/library/skill", async (request, response) => {
        if (server.config.command !== "serve") return sendJson(response, 404, { error: "此端點只限本機開發模式。" });
        try {
          if (request.method === "GET") {
            const url = new URL(request.url || "", "http://localhost");
            return sendJson(response, 200, await readSkillFile({ sourcePath: url.searchParams.get("path") || "", vaultDir }));
          }
          if (request.method === "POST") {
            const payload = await readJsonBody(request) as { sourcePath?: string; content?: string; modifiedAt?: number };
            return sendJson(response, 200, await saveSkillFile({ sourcePath: payload.sourcePath || "", content: payload.content || "", modifiedAt: payload.modifiedAt ?? Number.NaN, vaultDir }));
          }
          return sendJson(response, 405, { error: "只接受 GET 或 POST。" });
        } catch (error) {
          const status = error instanceof VaultStoreError ? error.status : 500;
          const message = error instanceof Error ? error.message : "未能讀寫 Skill。";
          return sendJson(response, status, { error: message });
        }
      });
      server.middlewares.use("/api/rss/capture", async (request, response) => {
        if (server.config.command !== "serve") return sendJson(response, 404, { error: "此端點只限本機開發模式。" });
        if (request.method !== "POST") return sendJson(response, 405, { error: "只接受 POST。" });
        try {
          const payload = await readJsonBody(request) as { title?: string; url?: string; summary?: string; reportDate?: string; tryAction?: string; reviewBy?: string };
          const result = await captureRssReference({ title: payload.title || "", url: payload.url || "", summary: payload.summary || "", reportDate: payload.reportDate || "", vaultDir });
          if (!result.duplicate) {
            const clean = (value: unknown, label: string) => {
              if (typeof value !== "string" || value.length > 1000 || /[\r\n]/.test(value)) throw new Error(`${label}格式不正確。`);
              return value.trim();
            };
            const path = resolve(vaultDir, result.relativePath);
            const raw = await readFile(path, "utf8");
            if (!raw.startsWith("---\n")) throw new Error("新收藏缺少 frontmatter。 ");
            const metadata = [["try_action", clean(payload.tryAction || "", "要試乜")], ["review_by", clean(payload.reviewBy || "", "幾時 review")]];
            const updated = metadata.reduce((document, [key, value]) => document.replace(/^---\n/, `---\n${key}: ${JSON.stringify(value)}\n`), raw);
            await writeFile(path, updated, "utf8");
          }
          return sendJson(response, 201, result);
        } catch (error) {
          const status = error instanceof VaultStoreError ? error.status : 500;
          const message = error instanceof Error ? error.message : "未能存入 Obsidian inbox。";
          return sendJson(response, status, { error: message });
        }
      });
    }
  };
}

// 夜跑報告留在 repo 本機，不落 public/data；這個讀取端點只會在 npm run dev 出現。
function dailyOpsPlugin(): Plugin {
  return {
    name: "daily-ops-read-api",
    configureServer(server) {
      server.middlewares.use("/api/daily-ops", async (request, response) => {
        if (server.config.command !== "serve") return sendJson(response, 404, { error: "此端點只限本機開發模式。" });
        if (request.method !== "GET") return sendJson(response, 405, { error: "只接受 GET。" });
        try {
          sendJson(response, 200, await readNightReports());
        } catch {
          sendJson(response, 500, { error: "未能讀取夜跑報告。" });
        }
      });
    }
  };
}

// 收據只可在本機 Vite 開發模式新增到唯一 allowlist；正式 build 不帶寫檔端點。
function financeReceiptPlugin(): Plugin {
  return {
    name: "finance-receipt-inbox-api",
    configureServer(server) {
      const vaultDir = resolve(ROOT_DIR, "..", "..");
      const inboxDir = resolve(vaultDir, "000_Agent", "finances", "receipts-inbox");
      server.middlewares.use("/api/finance/receipts", async (request, response) => {
        if (server.config.command !== "serve") return sendJson(response, 404, { error: "此端點只限本機開發模式。" });
        if (request.method === "GET") {
          try {
            await verifiedReceiptInbox(inboxDir);
            const files = await readdir(inboxDir);
            const receipts = await Promise.all(files.filter((name) => RECEIPT_EXTENSIONS.has(extname(name).toLowerCase())).map(async (name) => {
              const file = await stat(resolve(inboxDir, name));
              return { name, size: file.size, createdAt: file.birthtime.toISOString() };
            }));
            return sendJson(response, 200, { receipts: receipts.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return sendJson(response, 200, { receipts: [] });
            return sendJson(response, 500, { error: "未能讀取收據收集箱。" });
          }
        }
        if (request.method !== "POST") return sendJson(response, 405, { error: "只接受 GET 或 POST。" });
        try {
          const safeName = cleanReceiptName(request.headers["x-receipt-filename"]?.toString() || "");
          const body = await readBinaryBody(request);
          if (!validReceiptMagic(body, extname(safeName).toLowerCase())) throw new Error("副檔名與檔案格式不相符。");
          await mkdir(inboxDir, { recursive: true });
          await verifiedReceiptInbox(inboxDir);
          const target = await availableReceiptPath(inboxDir, melbourneDate(), safeName);
          await writeFile(target, body, { flag: "wx" });
          return sendJson(response, 201, { name: basename(target), size: body.length });
        } catch (error) {
          const message = error instanceof Error ? error.message : "未能存入收據收集箱。";
          return sendJson(response, 400, { error: message });
        }
      });
    }
  };
}

// 只在 Vite 開發伺服器存在：執行同步後才讓前端重新讀 JSON。
function vaultSyncPlugin(): Plugin {
  return {
    name: "vault-sync-api",
    configureServer(server) {
      server.middlewares.use("/api/sync", async (request, response) => {
        if (server.config.command !== "serve") return sendJson(response, 404, { error: "此端點只限本機開發模式。" });
        if (request.method !== "POST") return sendJson(response, 405, { error: "只接受 POST。" });
        if (activeVaultSync) return sendJson(response, 409, { error: "同步進行中，請稍候。" });
        activeVaultSync = execFileAsync(process.execPath, [resolve(ROOT_DIR, "scripts", "sync-vault.mjs")], {
          cwd: ROOT_DIR,
          env: { ...process.env, VAULT_DIR: resolve(ROOT_DIR, "..", "..") },
          timeout: 120_000,
          maxBuffer: 512 * 1024
        }).then(() => undefined);
        try {
          await activeVaultSync;
          sendJson(response, 200, { ok: true, summary: "Vault 同步完成；JSON 已重新生成。" });
        } catch {
          sendJson(response, 500, { error: "Vault 同步失敗；保留現有 JSON。" });
        } finally {
          activeVaultSync = null;
        }
      });
    }
  };
}

export default defineConfig({
  // 相對 base：local dev/preview 喺 root，GitHub Pages 子路徑（/dotai-personal-os/）都行。
  base: "./",
  plugins: [react(), pendingApiPlugin(), vaultWriteApiPlugin(), dailyOpsPlugin(), financeReceiptPlugin(), vaultSyncPlugin()],
  server: { port: 5173, strictPort: false },
  preview: { port: 4173, strictPort: false }
});
