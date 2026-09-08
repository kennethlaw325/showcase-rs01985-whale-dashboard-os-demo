import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { captureRssReference, readSkillFile, saveSkillFile } from "./vault-store.mjs";

async function fixtureVault() {
  const vault = await mkdtemp(join(tmpdir(), "ray-ai-vault-store-"));
  const skillDir = join(vault, "000_Agent", "skills", "demo-skill");
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, "SKILL.md"), "---\ndescription: demo\n---\n\n# Demo\n", "utf8");
  return vault;
}

test("vault store: only an existing SKILL.md below the skills allowlist can be read or written", async () => {
  const vault = await fixtureVault();
  const sourcePath = "000_Agent/skills/demo-skill/SKILL.md";
  const loaded = await readSkillFile({ sourcePath, vaultDir: vault });
  assert.match(loaded.content, /# Demo/);
  await assert.rejects(readSkillFile({ sourcePath: "../../100_Todo/_inbox/nope.md", vaultDir: vault }), /安全相對路徑/);
  await assert.rejects(readSkillFile({ sourcePath: "000_Agent/skills/demo-skill/other.md", vaultDir: vault }), /SKILL\.md/);
});

test("vault store: refuses a stale Skill mtime instead of overwriting another editor", async () => {
  const vault = await fixtureVault();
  const sourcePath = "000_Agent/skills/demo-skill/SKILL.md";
  const loaded = await readSkillFile({ sourcePath, vaultDir: vault });
  const target = join(vault, sourcePath);
  const newer = new Date(Date.now() + 2_000);
  await utimes(target, newer, newer);
  await assert.rejects(saveSkillFile({ sourcePath, content: "# stale overwrite", modifiedAt: loaded.modifiedAt, vaultDir: vault }), /別處更新/);
  assert.match(await readFile(target, "utf8"), /# Demo/);
});

test("vault store: RSS capture only creates one inbox file and keeps the required note structure", async () => {
  const vault = await fixtureVault();
  const payload = { title: "A useful RSS signal", url: "https://example.com/news", summary: "一段日報摘要。", reportDate: "2026-08-05", vaultDir: vault };
  const first = await captureRssReference(payload);
  const second = await captureRssReference(payload);
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(first.relativePath, "100_Todo/_inbox/2026-08-05_a-useful-rss-signal.md");
  const saved = await readFile(join(vault, first.relativePath), "utf8");
  assert.match(saved, /type: reference/);
  assert.match(saved, /source: rss-daily/);
  assert.match(saved, /tags: \[rss, capture\]/);
  assert.match(saved, /## 點解存/);
  assert.equal((await stat(join(vault, first.relativePath))).isFile(), true);
});
