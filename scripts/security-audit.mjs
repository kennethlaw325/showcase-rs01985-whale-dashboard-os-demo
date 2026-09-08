#!/usr/bin/env node
// Personal OS — security audit
// 掃 public/data/*.json + sample-vault/ (or 學員 vault) 入面：
//   1) API key pattern (sk-, hf_, ANTHROPIC_KEY=, OPENAI_KEY=, AWS_ access keys ...)
//   2) PII pattern (email, HK 8-digit phone, HKID format)
//   3) Outbound URL (markdown image / link to https://... non-whitelisted)
//
// Exit 1 if any P0 hit. Exit 0 if clean.
//
// Usage:
//   npm run security:audit
//   node scripts/security-audit.mjs                  # default: ./public/data + ./sample-vault + ./vault
//   node scripts/security-audit.mjs <path> [<path>]  # custom scan paths
//
// Skip a file from audit: add `audit_skip: true` to its frontmatter (L7 fix).

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const args = process.argv.slice(2);
// Default scan: shipped JSON + sample vault + 學員自己 vault (Q8.4)
// walk() ENOENT-safe — 學員未 import 自己 vault 唔會 break
const SCAN_PATHS = args.length > 0 ? args : ['public/data', 'sample-vault', 'vault'];

const ALLOWED_OUTBOUND_HOSTS = new Set([
  // 加入學員信嘅 CDN domain（e.g. own vault assets, school-issued URLs）
  // 'cdn.jsdelivr.net',
]);

// M3 fix: single source of truth — regex + severity in same record per rule.
// Add new rule = add one entry, no cross-map drift.
export const RULES = {
  // P0 — secret / key
  'openai-key':            { severity: 'P0', regex: /sk-[A-Za-z0-9]{20,}/g },
  'anthropic-key':         { severity: 'P0', regex: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  'huggingface-token':     { severity: 'P0', regex: /\bhf_[A-Za-z0-9]{20,}/g },
  'aws-access-key':        { severity: 'P0', regex: /\bAKIA[0-9A-Z]{16}\b/g },
  // Use negative lookbehind on alphanumeric so SITE_PASSWORD etc. (separator = `_`) still match.
  'generic-secret-assign': { severity: 'P0', regex: /(?<![A-Za-z0-9])(OPENAI_KEY|ANTHROPIC_KEY|API_KEY|SECRET|TOKEN|PASSWORD)\s*=\s*['"]?[A-Za-z0-9_\-]{12,}/gi },
  'private-key-block':     { severity: 'P0', regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |)PRIVATE KEY-----/g },
  'hkid':                  { severity: 'P0', regex: /\b[A-Z]{1,2}\d{6}\(?[A0-9]\)?/g },
  // L5 fix: balanced-paren URL extractor — supports `\)` escaped close paren in markdown URLs.
  'markdown-outbound-image': { severity: 'P0', regex: /!\[[^\]]*\]\((https?:\/\/(?:\\\)|[^)])+)\)/g },

  // P1 — PII / lower-severity
  'email':                 { severity: 'P1', regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  'hk-phone':              { severity: 'P1', regex: /\b[5-9]\d{3}[\s-]?\d{4}\b/g },
  'markdown-outbound-link': { severity: 'P1', regex: /(?<!!)\[[^\]]*\]\((https?:\/\/(?:\\\)|[^)])+)\)/g },
};

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return out;
    throw e;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (['node_modules', '.git', 'dist', '.vite'].includes(ent.name)) continue;
      out.push(...await walk(full));
    } else if (ent.isFile()) {
      // L3 fix: also match .markdown extension (Obsidian / Logseq variants).
      if (/\.(md|markdown|json|txt|env)$/i.test(ent.name) || ent.name === '.env') {
        out.push(full);
      }
    }
  }
  return out;
}

function extractHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

// L7 fix: detect `audit_skip: true` in YAML frontmatter (first --- block).
export function hasAuditSkipFlag(text) {
  if (!text.startsWith('---')) return false;
  const end = text.indexOf('\n---', 3);
  if (end < 0) return false;
  const frontmatter = text.slice(3, end);
  return /^\s*audit_skip\s*:\s*true\s*$/im.test(frontmatter);
}

// L4 fix: pre-compute line-start byte offsets once per file (O(n)), then binary-search
// per match (O(log n)) instead of O(n) re-scan per match.
function buildLineIndex(text) {
  const offsets = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10 /* \n */) offsets.push(i + 1);
  }
  return offsets;
}

function lineOf(offsets, charIndex) {
  // binary search for largest offset <= charIndex
  let lo = 0, hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (offsets[mid] <= charIndex) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1; // 1-indexed line number
}

export function scanText(text, file = '<inline>') {
  const findings = [];
  if (hasAuditSkipFlag(text)) return findings;

  const lines = text.split('\n');
  const offsets = buildLineIndex(text);

  for (const [name, { regex, severity }] of Object.entries(RULES)) {
    regex.lastIndex = 0;
    let m;
    while ((m = regex.exec(text)) !== null) {
      // Outbound URL — whitelist check
      if (name.startsWith('markdown-outbound')) {
        const host = extractHost(m[1]);
        if (host && ALLOWED_OUTBOUND_HOSTS.has(host)) continue;
      }

      const lineNum = lineOf(offsets, m.index);
      const lineContent = lines[lineNum - 1] ?? '';

      findings.push({
        file: file === '<inline>' ? file : path.relative(ROOT, file),
        line: lineNum,
        severity,
        pattern: name,
        match: m[0].slice(0, 80),
        context: lineContent.trim().slice(0, 120),
      });
    }
  }
  return findings;
}

async function main() {
  console.log('🔒 Personal OS — security audit\n');
  console.log(`Scanning: ${SCAN_PATHS.join(', ')}\n`);

  const allFindings = [];
  for (const p of SCAN_PATHS) {
    const abs = path.resolve(ROOT, p);
    const files = await walk(abs);
    for (const f of files) {
      const text = await fs.readFile(f, 'utf8');
      allFindings.push(...scanText(text, f));
    }
  }

  if (allFindings.length === 0) {
    console.log('✅ 0 hit — vault + JSON 全部 clean\n');
    process.exit(0);
  }

  // Group by severity
  const bySev = { P0: [], P1: [], P2: [] };
  for (const f of allFindings) bySev[f.severity ?? 'P2'].push(f);

  for (const sev of ['P0', 'P1']) {
    if (bySev[sev].length === 0) continue;
    console.log(`\n${sev === 'P0' ? '🚨' : '⚠️ '} ${sev} — ${bySev[sev].length} hit\n`);
    for (const f of bySev[sev]) {
      console.log(`  ${f.file}:${f.line}  [${f.pattern}]`);
      console.log(`    match: ${f.match}`);
      console.log(`    line : ${f.context}`);
      console.log('');
    }
  }

  const p0 = bySev.P0.length;
  const p1 = bySev.P1.length;
  console.log(`\nSummary: ${p0} P0 / ${p1} P1\n`);

  if (p0 > 0) {
    console.log('❌ P0 hit — block ship. 修咗再跑.\n');
    process.exit(1);
  }
  console.log('⚠️  P1 hit — review 過再 ship.\n');
  process.exit(0);
}

// Only run main if invoked directly (not when imported by tests)
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` ||
    process.argv[1].endsWith('security-audit.mjs')) {
  main().catch((e) => {
    console.error('Audit script error:', e);
    process.exit(2);
  });
}
