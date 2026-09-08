#!/usr/bin/env node
/**
 * log-agent.mjs — AI Office「著燈」helper（Part 3 H3 嘅 contract）
 *
 * 用法：node scripts/log-agent.mjs <id> <status> <outputCount>
 *   例：node scripts/log-agent.mjs client-crm done 3
 *       node scripts/log-agent.mjs client-crm running 0
 *       node scripts/log-agent.mjs client-crm error 0
 *
 * 每條 skill 收尾跑一句 → update public/data/agents.json 一行 → dashboard 著燈。
 * 死板轉換用 script 唔用 LLM：deterministic、唔會漏字。Upsert：有就改、冇就新增。
 */
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const [, , id, status, count] = process.argv;
const VALID = ["idle", "running", "done", "error"];
if (!id || !VALID.includes(status)) {
  console.error("用法：node scripts/log-agent.mjs <id> <idle|running|done|error> [outputCount]");
  process.exit(1);
}

const P = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "data", "agents.json");
const rows = JSON.parse(await readFile(P, "utf8"));
let r = rows.find((x) => x.id === id);
if (!r) {
  r = {
    id, name: id, emoji: "🤖", role: "自訂員工", statusNote: "由 log-agent 建立，待補充職責說明",
    lastRun: null, outputCount: 0
  }; // 第一次跑自動加一行（upsert）
  rows.push(r);
}
Object.assign(r, {
  status,
  lastRun: new Date().toISOString().slice(0, 16),
  outputCount: count !== undefined ? Number(count) : r.outputCount
});
await writeFile(P, JSON.stringify(rows, null, 2) + "\n");
console.log(`💡 ${id} → ${status}${count !== undefined ? ` (output ×${count})` : ""}`);
