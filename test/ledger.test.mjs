import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readMarker, reconcile, createLedger, dedupeKey, MARKER_FILE, LEDGER_FILE } from '../lib/ledger.js';
import { apply } from '../index.js';

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

test('ledger: has() 与 append 用同一个去重键——不能「明明没重复却被判重复」', async () => {
  // ★ WP6 修的那个 bug ★
  //
  // 改之前：`append` 的键是 `stage|kind|at`，`has` 只比 `stage + kind`。
  // 也就是说 `has` 的口径**永远比 append 宽**，宽出来的部分全落在「被判重复」上。
  //
  // 这不是「多记一条」那种小毛病，是**静默丢记录**：同一阶段的门记录从
  // `{"verdict":"pass"}` 改成 `{"verdict":"fail"}`，`has` 仍说「这条记过了」，
  // 于是那次真实的审查结论永远进不了台账——事后查「谁在什么时候判了什么」查不到。
  const ledger = createLedger({ storage: undefined, root: 'stages', baseDir: undefined, runId: 'run-key' });
  await ledger.attach();

  const first = { stage: 'p0', kind: 'reconciled', verdict: 'pass', by: 'human', at: '2026-11-11T10:00:00.000Z' };
  const second = { stage: 'p0', kind: 'reconciled', verdict: 'fail', by: 'human', at: '2026-11-11T11:00:00.000Z' };

  assert.equal(ledger.has(first), false, '还没记过，不该说是重复');
  await ledger.append(first);
  assert.equal(ledger.has(first), true, '记过之后，同一条必须能被认出来');

  assert.equal(
    ledger.has(second),
    false,
    '同一 stage+kind 但 at 与结论都不同 → 这是**另一条事实**，has 不该说记过',
  );
  await ledger.append(second);
  assert.equal(ledger.all().length, 2, '两条事实必须都在台账里');

  // 反过来也要成立：键真的把 at 算进去了，而不是恰好放行了所有东西。
  assert.notEqual(dedupeKey('run-key', first), dedupeKey('run-key', second), '两条的键必须不同');
});

test('ledger: 每行带 runId，且同一次运行内一致', async () => {
  // 为什么要 runId：真实台账 14 行里有 5 组重复键，而「重复行」与
  // 「两次运行各记一次」在数据上无法区分。运行身份是判重的前提。
  const ledger = createLedger({ storage: undefined, root: 'stages', baseDir: undefined, runId: 'run-abc' });
  await ledger.attach();
  const a = await ledger.append({ stage: 'p0', kind: 'gate' });
  const b = await ledger.append({ stage: 'p1', kind: 'gate' });
  assert.equal(a.runId, 'run-abc');
  assert.equal(b.runId, 'run-abc');
  assert.equal(ledger.runId, 'run-abc', 'ledger.runId 应可读——日志里要打它');
});

test('ledger: 缺省 runId 时自动生成本次进程身份（非空且稳定）', async () => {
  const a = createLedger({ storage: undefined, root: 'stages', baseDir: undefined });
  const b = createLedger({ storage: undefined, root: 'stages', baseDir: undefined });
  assert.equal(typeof a.runId, 'string');
  assert.ok(a.runId.length >= 8, `runId 太短，不像身份：${a.runId}`);
  assert.equal(a.runId, b.runId, '同一次进程内，两个台账实例必须是同一个运行身份');
});

test('ledger: 同一 {runId, stage, kind, at} 重复 append 只留一行', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ledger-d-'));
  WORKSPACES.push(dir);
  try {
    mkdirSync(join(dir, 'stages'), { recursive: true });
    const ledger = createLedger({ storage: undefined, root: 'stages', baseDir: dir, runId: 'run-dup' });
    await ledger.attach();
    const entry = { stage: 'p0', kind: 'reconciled', verdict: 'pass', by: 'human', at: '2026-11-11T10:00:00.000Z' };

    const first = await ledger.append({ ...entry });
    const second = await ledger.append({ ...entry });

    assert.equal(ledger.all().length, 1, `重复 append 必须只留一行，实际 ${ledger.all().length}`);
    // 跳过而不是覆盖：返回的是台账里那一行（同一个对象引用即可证明没被重建）
    assert.equal(second, first, '重复时应返回已在台账里的那一行，而不是覆盖成新行');
    const lines = readFileSync(join(dir, 'stages', LEDGER_FILE), 'utf8').trim().split('\n');
    assert.equal(lines.length, 1, '镜像也不该写第二行');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ledger: 同一毫秒内的两次事件各自独立（时间戳分辨率不该决定计数）', async () => {
  // 「本可以拦住 N 次」的 N 全靠事件行。若拿毫秒时间戳当身份，
  // 两次真实发生在同一毫秒内会被静默合并，N 就少算了。
  const ledger = createLedger({ storage: undefined, root: 'stages', baseDir: undefined, runId: 'run-ev' });
  await ledger.attach();
  await ledger.append({ stage: 'p0', kind: 'would-block', verdict: 'GATE_MISSING' });
  await ledger.append({ stage: 'p0', kind: 'would-block', verdict: 'GATE_MISSING' });
  assert.equal(ledger.all().length, 2, '两次真实发生必须记两条');
});

test('ledger: 没写 at 的门记录按内容判重——结论变了要记新的一条', async () => {
  // reconcile 读到的 GATE.json 可能没写 `at`（README 标必填，手写文件不遵守）。
  // 没有时间戳就用内容指纹：同一份内容反复扫到只记一条，结论一变就是新的。
  const ledger = createLedger({ storage: undefined, root: 'stages', baseDir: undefined, runId: 'run-null' });
  await ledger.attach();
  const passing = { stage: 'p0', kind: 'reconciled', verdict: 'pass', by: 'unknown', at: null, reason: null };
  const failing = { stage: 'p0', kind: 'reconciled', verdict: 'fail', by: 'unknown', at: null, reason: null };

  await ledger.append(passing);
  await ledger.append({ ...passing });
  assert.equal(ledger.all().length, 1, '同一份无 at 的内容扫两次只记一条');

  await ledger.append(failing);
  assert.equal(ledger.all().length, 2, '结论从 pass 改成 fail 必须记新的一条（旧实现会丢这一条）');
});

test('ledger: attach() 是幂等的——重复挂载不会把历史行灌两遍', async () => {
  const persisted = { 'k1': { stage: 'p0', kind: 'reconciled', verdict: 'pass', by: 'h', at: '2026-11-11T09:00:00.000Z', runId: 'old-run' } };
  let opened = 0;
  const storage = {
    form() {
      return {
        async open() {
          opened += 1;
          return {
            async loadAll() {
              return { tables: { entries: persisted } };
            },
            async putRecord() {},
          };
        },
      };
    },
  };
  const ledger = createLedger({ storage, root: 'stages', baseDir: undefined, runId: 'run-idem' });
  assert.equal(await ledger.attach(), true, '有 storage 时必须挂上');
  assert.equal(await ledger.attach(), true, '第二次 attach 仍报已挂');
  assert.equal(opened, 1, 'open 只该发生一次——重复挂载会把历史行灌两遍');
  assert.equal(ledger.all().length, 1, `历史行应只有 1 行，实际 ${ledger.all().length}`);
});

test('ledger: storage 挂载失败走 onWarn，不抛（降级到内存）', async () => {
  const warnings = [];
  const storage = {
    form() {
      return {
        async open() {
          throw new Error('domain storage 不可用');
        },
      };
    },
  };
  const ledger = createLedger({
    storage,
    root: 'stages',
    baseDir: undefined,
    runId: 'run-warn',
    onWarn: (m) => warnings.push(m),
  });
  assert.equal(await ledger.attach(), false);
  assert.equal(warnings.length, 1, '降级必须有人知道——静默降级就是「用户以为在 storage 里，其实每次重启都丢」');
  assert.match(warnings[0], /storage/);
});

// ---------------------------------------------------------------- 接线：apply 真的挂了

/** 造一个能记录 createLedger 调用的桩 ctx。 */
function makeCtxFor(storage) {
  const listeners = new Map();
  const logs = [];
  const ctx = {
    on(e, h) {
      if (!listeners.has(e)) listeners.set(e, []);
      listeners.get(e).push(h);
      return () => {};
    },
    logger: {
      info: (m) => logs.push(['info', m]),
      warn: (m) => logs.push(['warn', m]),
      error: (m) => logs.push(['error', m]),
      debug: (m) => logs.push(['debug', m]),
    },
    get: (n) => (n === 'storage' ? storage : undefined),
    workingDirectory: { get: () => undefined },
    skills: { registerProvider: () => () => {} },
    systemPrompt: { section: () => () => {} },
    effect: (fn) => fn(),
  };
  return { ctx, listeners, logs };
}

test('apply(): 真的调用了 attach()——它曾经是定义了但零调用的死代码', async () => {
  // ★ WP6 / N3 的核心断言 ★
  //
  // 改之前：`lib/ledger.js:98` 有 `attach()`，`index.js` 调用 0 次。
  // 后果是 `createLedger` 里的 `unit` 恒为 null，storage 分支永远不执行，
  // `loadAll()` 一次没跑过——台账从来没跨会话持久过。
  //
  // 这里给一个**会记账的假 storage**：只要 attach 真的被调用，open 就一定会发生。
  let opened = 0;
  let loaded = 0;
  const storage = {
    form() {
      return {
        async open() {
          opened += 1;
          return {
            async loadAll() {
              loaded += 1;
              return { tables: { entries: {} } };
            },
            async putRecord() {},
          };
        },
      };
    },
  };

  const { ctx, logs } = makeCtxFor(storage);
  apply(ctx, { mode: 'observe' });

  // attach 是异步挂载、不阻塞 apply —— 所以这里排队等它完成。
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(opened, 1, 'apply() 必须真的调 createLedger 并 attach——open 一次都没发生说明还是死代码');
  assert.equal(loaded, 1, 'loadAll 必须被调用——不调用等于跨会话历史从来没读回来');
  assert.ok(
    logs.some(([, m]) => String(m).includes('台账') && String(m).includes('storage')),
    `挂载结果必须留一行日志，实际：${JSON.stringify(logs.map(([, m]) => m))}`,
  );
});

test('apply(): 没有 storage 时 attach 降级，但仍有日志说明落在内存', async () => {
  const { ctx, logs } = makeCtxFor(undefined);
  apply(ctx, { mode: 'observe' });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(
    logs.some(([, m]) => String(m).includes('内存')),
    `无 storage 时必须说清台账落在哪，实际：${JSON.stringify(logs.map(([, m]) => m))}`,
  );
});

test('apply(): 从真实阶段写产生的台账行带 runId', async () => {
  // 端到端一点点：走真实的 pre-execute → ledger.append → 文件镜像。
  const dir = mkdtempSync(join(tmpdir(), 'ledger-e2e-'));
  WORKSPACES.push(dir);
  try {
    mkdirSync(join(dir, 'stages'), { recursive: true });
    writeFileSync(join(dir, '.stage-gate.json'), '{"enabled":true}', 'utf8');

    const listeners = new Map();
    const ctx = {
      on(e, h) {
        if (!listeners.has(e)) listeners.set(e, []);
        listeners.get(e).push(h);
        return () => {};
      },
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
      get: () => undefined,
      fs: {
        async resolve() {
          return undefined;
        },
        async readText() {
          return null;
        },
      },
      workingDirectory: { get: () => dir },
      skills: { registerProvider: () => () => {} },
      systemPrompt: { section: () => () => {} },
      effect: (fn) => fn(),
    };
    apply(ctx, { mode: 'observe' });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const handlers = listeners.get('tools/pre-execute') ?? [];
    const next = async () => ({ kind: 'allow' });
    for (const h of handlers) {
      await h({ name: 'write', arguments: { file_path: 'stages/p1/a.md' }, signal: { aborted: false }, agent: { session: 's' } }, next);
    }

    const mirror = join(dir, 'stages', LEDGER_FILE);
    assert.equal(existsSync(mirror), true, 'observe 下应留下台账镜像');
    const row = JSON.parse(readFileSync(mirror, 'utf8').trim().split('\n')[0]);
    assert.equal(typeof row.runId, 'string', `每条台账行都必须带 runId，实际：${JSON.stringify(row)}`);
    assert.ok(row.runId.length >= 8, 'runId 不能是占位符');
    assert.equal(row.kind, 'would-block');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
