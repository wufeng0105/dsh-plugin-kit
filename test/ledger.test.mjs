import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readMarker, reconcile, createLedger, MARKER_FILE, LEDGER_FILE } from '../lib/ledger.js';

/** 测试建的临时目录统一登记，进程退出时清理（防止 TEMP 堆积）。 */
const WORKSPACES = [];
process.on('exit', () => {
  for (const dir of WORKSPACES) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* 清理失败不影响测试 */
    }
  }
});

// ---------------------------------------------------------------- marker

test('readMarker: 没有 marker → 未采用', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ledger-m-'));
  WORKSPACES.push(dir);
  try {
    const r = readMarker(dir);
    assert.equal(r.adopted, false);
    assert.equal(r.marker, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('readMarker: 有合法 marker → 已采用', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ledger-m-'));
  WORKSPACES.push(dir);
  try {
    writeFileSync(join(dir, MARKER_FILE), '{"enabled":true,"root":"stages"}', 'utf8');
    const r = readMarker(dir);
    assert.equal(r.adopted, true);
    assert.equal(r.marker.root, 'stages');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('readMarker: marker 坏了 → 仍算已采用（用户意图明确）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ledger-m-'));
  WORKSPACES.push(dir);
  try {
    writeFileSync(join(dir, MARKER_FILE), '{broken', 'utf8');
    const r = readMarker(dir);
    assert.equal(r.adopted, true);
    assert.equal(r.marker.malformed, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('readMarker: baseDir 为空 → 未采用（不猜）', () => {
  assert.equal(readMarker(undefined).adopted, false);
  assert.equal(readMarker('').adopted, false);
});

// ---------------------------------------------------------------- reconcile

test('reconcile: 扫出人手写但台账没记的门', () => {
  const files = {
    'stages/p0/GATE.json': '{"stage":"p0","verdict":"pass","by":"human","at":"2026-11-09T12:00:00Z","reason":"手动"}',
    'stages/p1/GATE.json': '{"stage":"p1","verdict":"skip","reason":"赶时间"}',
  };
  const found = reconcile({
    baseDir: '.',
    root: 'stages',
    layout: ['p0', 'p1', 'p2'],
    gateFile: 'GATE.json',
    readText: (rel) => files[rel] ?? null,
    hasEntry: () => false,
  });
  assert.equal(found.length, 2);
  assert.equal(found[0].stage, 'p0');
  assert.equal(found[0].kind, 'reconciled');
  assert.equal(found[0].by, 'human');
  assert.equal(found[1].stage, 'p1');
  assert.equal(found[1].verdict, 'skip');
});

test('reconcile: 台账已有的不重复记', () => {
  const files = { 'stages/p0/GATE.json': '{"verdict":"pass"}' };
  const found = reconcile({
    baseDir: '.',
    root: 'stages',
    layout: ['p0'],
    gateFile: 'GATE.json',
    readText: (rel) => files[rel] ?? null,
    hasEntry: (e) => e.stage === 'p0',
  });
  assert.equal(found.length, 0);
});

test('reconcile: 坏 JSON 跳过（不记垃圾）', () => {
  const files = { 'stages/p0/GATE.json': 'not json' };
  const found = reconcile({
    baseDir: '.',
    root: 'stages',
    layout: ['p0'],
    gateFile: 'GATE.json',
    readText: (rel) => files[rel] ?? null,
    hasEntry: () => false,
  });
  assert.equal(found.length, 0);
});

test('reconcile: 缺 by/at 时给安全默认值，不编造', () => {
  const files = { 'stages/p0/GATE.json': '{"verdict":"pass"}' };
  const [entry] = reconcile({
    baseDir: '.',
    root: 'stages',
    layout: ['p0'],
    gateFile: 'GATE.json',
    readText: (rel) => files[rel] ?? null,
    hasEntry: () => false,
  });
  assert.equal(entry.by, 'unknown', '没有可靠来源就写 unknown，不猜');
  assert.equal(entry.at, null);
});

// ---------------------------------------------------------------- ledger

test('ledger: 没有 storage 时退到内存 + 文件镜像', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ledger-l-'));
  WORKSPACES.push(dir);
  try {
    mkdirSync(join(dir, 'stages'), { recursive: true });
    const ledger = createLedger({ storage: undefined, root: 'stages', baseDir: dir });
    const attached = await ledger.attach();
    assert.equal(attached, false);

    await ledger.append({ stage: 'p0', kind: 'gate', verdict: 'pass' });
    assert.equal(ledger.all().length, 1);

    const mirror = join(dir, 'stages', LEDGER_FILE);
    assert.equal(existsSync(mirror), true, '应有文件镜像');
    const line = readFileSync(mirror, 'utf8').trim();
    assert.equal(JSON.parse(line).stage, 'p0');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ledger: 追加多条，镜像累积', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ledger-l-'));
  WORKSPACES.push(dir);
  try {
    mkdirSync(join(dir, 'stages'), { recursive: true });
    const ledger = createLedger({ storage: undefined, root: 'stages', baseDir: dir });
    await ledger.attach();
    await ledger.append({ stage: 'p0', kind: 'gate', verdict: 'pass' });
    await ledger.append({ stage: 'p0', kind: 'skip' });
    const lines = readFileSync(join(dir, 'stages', LEDGER_FILE), 'utf8').trim().split('\n');
    assert.equal(lines.length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ledger: has() 按 stage + kind 判重', async () => {
  const ledger = createLedger({ storage: undefined, root: 'stages', baseDir: undefined });
  await ledger.attach();
  assert.equal(ledger.has({ stage: 'p0', kind: 'gate' }), false);
  await ledger.append({ stage: 'p0', kind: 'gate', verdict: 'pass' });
  assert.equal(ledger.has({ stage: 'p0', kind: 'gate' }), true);
  assert.equal(ledger.has({ stage: 'p1', kind: 'gate' }), false);
});

test('ledger: 每条自动带 ISO 时间戳', async () => {
  const ledger = createLedger({ storage: undefined, root: 'stages', baseDir: undefined });
  await ledger.attach();
  const row = await ledger.append({ stage: 'p0', kind: 'gate' });
  assert.match(row.at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
});

test('ledger: append 传的 baseDir 覆盖构造时的 undefined', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ledger-l-'));
  WORKSPACES.push(dir);
  try {
    // 构造时 baseDir: undefined —— 模拟插件里的真实情况
    const ledger = createLedger({ storage: undefined, root: 'stages', baseDir: undefined });
    await ledger.attach();
    // append 时才拿到真实工作区
    await ledger.append({ stage: 'p0', kind: 'blocked', verdict: 'GATE_MISSING', baseDir: dir });
    const mirror = join(dir, 'stages', LEDGER_FILE);
    assert.equal(existsSync(mirror), true, 'append 的 baseDir 应生效，否则台账永远是空的');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
