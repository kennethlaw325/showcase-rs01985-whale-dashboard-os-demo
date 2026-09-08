#!/usr/bin/env node
// Unit tests for security-audit.mjs
// Uses node:test (built-in, no deps required).
// Run: npm test  or  node --test scripts/security-audit.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, scanText, hasAuditSkipFlag } from './security-audit.mjs';

// --- Coverage assertions on RULES catalog ---

test('RULES catalog: every entry has regex + severity', () => {
  for (const [name, rule] of Object.entries(RULES)) {
    assert.ok(rule.regex instanceof RegExp, `${name} regex must be RegExp`);
    assert.ok(['P0', 'P1', 'P2'].includes(rule.severity), `${name} severity must be P0/P1/P2`);
    assert.ok(rule.regex.flags.includes('g'), `${name} regex must have /g flag`);
  }
});

test('RULES catalog: at least 6 P0 rules + 2 P1 rules', () => {
  const sev = Object.values(RULES).map((r) => r.severity);
  assert.ok(sev.filter((s) => s === 'P0').length >= 6, 'expect 6+ P0 rules');
  assert.ok(sev.filter((s) => s === 'P1').length >= 2, 'expect 2+ P1 rules');
});

// --- Hit-or-miss per rule ---

test('openai-key: catches sk- prefix with 20+ chars', () => {
  const findings = scanText('config has sk-abc123def456ghi789xyz');
  assert.equal(findings.filter((f) => f.pattern === 'openai-key').length, 1);
});

test('openai-key: does not flag sk- with fewer than 20 chars', () => {
  const findings = scanText('text sk-short here');
  assert.equal(findings.filter((f) => f.pattern === 'openai-key').length, 0);
});

test('anthropic-key: catches sk-ant- prefix', () => {
  const findings = scanText('ANTHROPIC=sk-ant-abc12345678901234567');
  assert.ok(findings.some((f) => f.pattern === 'anthropic-key'));
});

test('huggingface-token: catches hf_ prefix', () => {
  const findings = scanText('token: hf_abcdefghij1234567890');
  assert.equal(findings.filter((f) => f.pattern === 'huggingface-token').length, 1);
});

test('aws-access-key: catches AKIA prefix + 16 chars', () => {
  const findings = scanText('AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE');
  assert.ok(findings.some((f) => f.pattern === 'aws-access-key'));
});

test('generic-secret-assign: catches PASSWORD=value', () => {
  const findings = scanText('SITE_PASSWORD=p0B4RcdJx0Em74vUkiWQ');
  assert.ok(findings.some((f) => f.pattern === 'generic-secret-assign'));
});

test('private-key-block: catches RSA private key header', () => {
  const findings = scanText('-----BEGIN RSA PRIVATE KEY-----\nMIIE...');
  assert.equal(findings.filter((f) => f.pattern === 'private-key-block').length, 1);
});

test('hkid: catches A123456(7) format', () => {
  const findings = scanText('ID: A123456(7)');
  assert.ok(findings.some((f) => f.pattern === 'hkid'));
});

test('markdown-outbound-image: catches outbound https image', () => {
  const findings = scanText('![alt](https://attacker.com/track?id=1)');
  assert.equal(findings.filter((f) => f.pattern === 'markdown-outbound-image').length, 1);
  assert.equal(findings[0].severity, 'P0');
});

test('markdown-outbound-image: does not flag relative path image', () => {
  const findings = scanText('![alt](/local/path.png)');
  assert.equal(findings.filter((f) => f.pattern === 'markdown-outbound-image').length, 0);
});

test('markdown-outbound-link: catches outbound https link (lower severity)', () => {
  const findings = scanText('[click](https://example.com)');
  const f = findings.filter((x) => x.pattern === 'markdown-outbound-link');
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'P1');
});

test('markdown-outbound-link: image syntax not double-counted', () => {
  const findings = scanText('![alt](https://example.com)');
  assert.equal(findings.filter((f) => f.pattern === 'markdown-outbound-link').length, 0);
});

test('email: catches standard pattern', () => {
  const findings = scanText('contact user@example.com today');
  assert.ok(findings.some((f) => f.pattern === 'email'));
});

test('hk-phone: catches 8-digit starting 5-9', () => {
  const findings = scanText('call 9123 4567 for booking');
  assert.ok(findings.some((f) => f.pattern === 'hk-phone'));
});

test('hk-phone: ignores 8-digit starting 1-4', () => {
  const findings = scanText('reference 12345678');
  assert.equal(findings.filter((f) => f.pattern === 'hk-phone').length, 0);
});

// --- Frontmatter skip (L7) ---

test('hasAuditSkipFlag: true when audit_skip: true present', () => {
  const text = '---\ntitle: test\naudit_skip: true\n---\nsk-abc123def456ghi789xyz';
  assert.equal(hasAuditSkipFlag(text), true);
});

test('hasAuditSkipFlag: false without frontmatter', () => {
  const text = 'sk-abc123def456ghi789xyz';
  assert.equal(hasAuditSkipFlag(text), false);
});

test('hasAuditSkipFlag: false when audit_skip: false', () => {
  const text = '---\naudit_skip: false\n---\ntext';
  assert.equal(hasAuditSkipFlag(text), false);
});

test('scanText: respects audit_skip flag — skips entire file', () => {
  const text = '---\naudit_skip: true\n---\nsk-abc123def456ghi789xyz';
  const findings = scanText(text);
  assert.equal(findings.length, 0);
});

// --- Line number accuracy (L4 regression) ---

test('scanText: line number is correct for match on later line', () => {
  const text = 'line 1\nline 2\n![p](https://attacker.com/x)';
  const findings = scanText(text);
  const f = findings.find((x) => x.pattern === 'markdown-outbound-image');
  assert.equal(f.line, 3);
});

test('scanText: multiple matches on same line yield same line number', () => {
  const text = 'sk-abc123def456ghi789xyz hf_abcdefghij1234567890';
  const findings = scanText(text);
  assert.ok(findings.every((f) => f.line === 1));
});

// --- URL with escaped paren (L5) ---

test('markdown-outbound-image: URL with escaped close paren still captured', () => {
  const text = '![alt](https://example.com/path_\\)stuff)';
  const findings = scanText(text);
  const f = findings.find((x) => x.pattern === 'markdown-outbound-image');
  assert.ok(f, 'should still detect outbound URL containing escaped paren');
});
