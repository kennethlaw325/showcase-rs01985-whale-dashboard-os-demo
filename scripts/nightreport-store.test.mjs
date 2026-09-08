import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readNightReports } from "./nightreport-store.mjs";

test("night report store: reads the root report and the five newest dated archives", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "ray-ai-nightreports-"));
  await writeFile(join(rootDir, "NIGHTREPORT.md"), "# 夜跑報告 · 2026-08-04\n\n根目錄交接", "utf8");
  await mkdir(join(rootDir, "nightreports"));
  await Promise.all([
    writeFile(join(rootDir, "nightreports", "2026-08-01.md"), "# 夜跑報告 · 2026-08-01\n\n一", "utf8"),
    writeFile(join(rootDir, "nightreports", "2026-08-04.md"), "# 夜跑報告 · 2026-08-04\n\n四", "utf8"),
    writeFile(join(rootDir, "nightreports", "note.txt"), "不應讀取", "utf8")
  ]);

  const reports = await readNightReports({ rootDir });
  assert.equal(reports.current?.date, "2026-08-04");
  assert.equal(reports.current?.path, "NIGHTREPORT.md");
  assert.deepEqual(reports.archives.map((report) => report.path), ["nightreports/2026-08-04.md", "nightreports/2026-08-01.md"]);
  assert.equal(reports.archives[0].content.includes("四"), true);
});

test("night report store: has explicit empty values when no report files exist", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "ray-ai-nightreports-empty-"));
  const reports = await readNightReports({ rootDir });
  assert.equal(reports.current, null);
  assert.deepEqual(reports.archives, []);
});
