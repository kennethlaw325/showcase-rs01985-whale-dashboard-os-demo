import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPendingFile, listPendingFiles, rejectPendingFile, RELAY_TARGETS, TODO_TARGET, TOPIC_TARGET } from "./pending-store.mjs";

test("pending store: writes a preview only, with its vault target recorded", async () => {
  const pendingDir = await mkdtemp(join(tmpdir(), "ray-ai-pending-"));
  const result = await createPendingFile({
    kind: "todo",
    target: TODO_TARGET,
    preview: "- [ ] 整理明日行動\n\n來源：Action Desk",
    pendingDir
  });
  const saved = await readFile(join(pendingDir, result.relativePath.split("/").at(-1)), "utf8");

  assert.match(result.relativePath, /pending|ray-ai-pending/);
  assert.match(saved, /pending: true/);
  assert.match(saved, /target: 100_Todo\/_inbox\//);
  assert.match(saved, /整理明日行動/);
  assert.match(saved, /不會自動寫入 vault/);
});

test("pending store: rejects a To-do target outside the fixed inbox", async () => {
  await assert.rejects(
    createPendingFile({ kind: "todo", target: "100_Todo/archive/", preview: "- [ ] 不應儲存" }),
    /100_Todo\/_inbox\//
  );
});

test("pending store: writes two selected topics as a local content input", async () => {
  const pendingDir = await mkdtemp(join(tmpdir(), "ray-ai-topic-pending-"));
  const result = await createPendingFile({
    kind: "topic",
    target: TOPIC_TARGET,
    preview: [
      "# 明日內容選題",
      "",
      "- 選題 1：Google Search Console 平台資源全球開放",
      "  - 建議形態：reel",
      "  - Hook 方向：你以為社交 post 冇得量？",
      "",
      "- 選題 2：AI 提唔提到你，未必同排名有關",
      "  - 建議形態：post",
      "  - Hook 方向：排第一都未必會被 AI 點名。"
    ].join("\n"),
    pendingDir
  });
  const saved = await readFile(join(pendingDir, result.relativePath.split("/").at(-1)), "utf8");

  assert.match(saved, /kind: topic/);
  assert.match(saved, /target: 300_Content\/ig-content\//);
  assert.match(saved, /選題 1：Google Search Console/);
  assert.match(saved, /建議形態：reel/);
  assert.match(saved, /選題 2：AI 提唔提到你/);
  assert.match(saved, /Hook 方向：排第一都未必會被 AI 點名。/);
});

test("pending store: PM relay is schema-bound and only writes a local pending draft", async () => {
  const pendingDir = await mkdtemp(join(tmpdir(), "ray-ai-relay-pending-"));
  const target = [...RELAY_TARGETS][0];
  const result = await createPendingFile({ kind: "relay", target, preview: "# RSS Daily PM 轉交\n\n- 部門：Sales\n- 新聞：測試\n- 轉交時間：2026-08-05" , pendingDir });
  const saved = await readFile(join(pendingDir, result.relativePath.split("/").at(-1)), "utf8");
  assert.match(saved, /kind: relay/);
  assert.match(saved, /target: 000_Agent\/departments\/sales\/board.md/);
  assert.match(saved, /PM 轉交草稿/);
  await assert.rejects(createPendingFile({ kind: "relay", target: "100_Todo/_inbox/", preview: "不應建立" }), /PM 轉交/);
});

test("pending store: rejects a local pending draft with an optional reason", async () => {
  const pendingDir = await mkdtemp(join(tmpdir(), "ray-ai-rejection-"));
  const created = await createPendingFile({ kind: "todo", target: TODO_TARGET, preview: "- [ ] 不採用這個草稿", pendingDir });
  const file = created.relativePath.split("/").at(-1);
  const rejected = await rejectPendingFile({ file, reason: "時機未到", pendingDir });
  assert.equal(rejected.rejectedReason, "時機未到");
  assert.match(rejected.rejectedAt, /^\d{4}-\d{2}-\d{2}T/);
  const listed = await listPendingFiles({ pendingDir });
  assert.equal(listed[0].file, file);
  assert.equal(listed[0].rejectedReason, "時機未到");
});
