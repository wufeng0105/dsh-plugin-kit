#!/usr/bin/env node
/**
 * recheck.mjs — 「DSH 升级后，我依赖的触点还成立吗？」
 *
 * 这是一个**模板**，来自三轮实验里实际用过的复检脚本。用之前：
 *   1. 把 `touchpoints.json` 换成你项目的触点清单（结构见 templates/touchpoints.sample.json）
 *   2. 用 cordis_inspect_query 导出宿主快照（结构见 templates/host-snapshot.sample.json）
 *   3. 用 `--scan-dir` 指向你的源码目录，开启漂移扫描
 *
 * 四种结论：
 *   OK           能找到，且签名/内容与清单期望一致
 *   MISSING      整个不见了（服务/方法/事件/类型/文件/清单键缺失）
 *   CHANGED      还在，但形状变了（签名不含期望片段、类型声明变了、文件 hash 变了）
 *   UNVERIFIABLE 机器判不了（清单标 probe.kind=none，或快照缺该小节）
 *
 * 用法：
 *   node recheck.mjs --touchpoints touchpoints.json --snapshot host-snapshot.json
 *   node recheck.mjs --touchpoints touchpoints.json --snapshot host-snapshot.json --scan-dir src
 *   node recheck.mjs --touchpoints touchpoints.json --snapshot host-snapshot.json --strict
 *   node recheck.mjs --self-test        # 自造反例，证明脚本会变红（不读任何外部文件）
 *   node recheck.mjs --help
 *
 * 退出码：0 全部 OK（或仅 UNVERIFIABLE）；1 有 MISSING/CHANGED/DRIFT；2 用法或文件错误
 *        --strict 时 UNVERIFIABLE 也算失败。
 *
 * 约束：不联网、不安装、不读写 $DSH_HOME。
 */

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

// ---------------------------------------------------------------- 参数

function parseArgs(argv) {
  const opts = {
    touchpoints: null,
    snapshot: null,
    scanDir: null,
    json: false,
    strict: false,
    selfTest: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--touchpoints') opts.touchpoints = path.resolve(argv[++i] ?? '');
    else if (arg === '--snapshot') opts.snapshot = path.resolve(argv[++i] ?? '');
    else if (arg === '--scan-dir') opts.scanDir = path.resolve(argv[++i] ?? '');
    else if (arg === '--json') opts.json = true;
    else if (arg === '--strict') opts.strict = true;
    else if (arg === '--self-test') opts.selfTest = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else throw new Error(`未知参数：${arg}（--help 看用法）`);
  }
  return opts;
}

// ---------------------------------------------------------------- 工具

const norm = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

function readJson(file) {
  if (!file) throw new Error('缺少 --touchpoints 或 --snapshot');
  if (!existsSync(file)) throw new Error(`文件不存在：${file}`);
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`不是合法 JSON：${file}（${error.message}）`);
  }
}

function typeDeclaration(holder, name) {
  const raw = holder?.types?.[name];
  if (raw === undefined || raw === null) return undefined;
  return Array.isArray(raw) ? raw.join('\n') : String(raw);
}

// ---------------------------------------------------------------- 单条判定

function checkTouchpoint(tp, snapshot, root) {
  const probe = tp.probe ?? {};
  const kind = probe.kind ?? 'none';

  if (kind === 'none') {
    return { code: 'UNVERIFIABLE', detail: probe.manual ?? '清单未给出可机器判定的探针' };
  }

  if (kind === 'service') {
    const service = snapshot?.services?.[probe.service];
    if (service === undefined) {
      return { code: 'MISSING', detail: `快照里没有服务 ${probe.service}（宿主可能改名/移除）` };
    }
    if (probe.method === undefined) return { code: 'OK', detail: `服务 ${probe.service} 存在` };
    const actual = service?.methods?.[probe.method];
    if (actual === undefined) {
      return { code: 'MISSING', detail: `服务 ${probe.service} 上没有方法 ${probe.method}()` };
    }
    for (const want of probe.signatureIncludes ?? []) {
      if (!norm(actual).includes(norm(want))) {
        return { code: 'CHANGED', detail: `${probe.service}.${probe.method} 签名不含「${want}」；实际：${norm(actual)}` };
      }
    }
    return { code: 'OK', detail: `${probe.service}.${probe.method}() 存在且签名匹配` };
  }

  if (kind === 'event') {
    const event = snapshot?.events?.[probe.event];
    if (event === undefined) {
      return { code: 'MISSING', detail: `快照里没有事件 ${probe.event}` };
    }
    if (probe.mode !== undefined && event.mode !== probe.mode) {
      return { code: 'CHANGED', detail: `${probe.event} 的 mode 从 ${probe.mode} 变成 ${event.mode}` };
    }
    for (const want of probe.signatureIncludes ?? []) {
      if (!norm(event.signature).includes(norm(want))) {
        return { code: 'CHANGED', detail: `${probe.event} 签名不含「${want}」；实际：${norm(event.signature)}` };
      }
    }
    return { code: 'OK', detail: `${probe.event} 存在（mode=${event.mode}）且签名匹配` };
  }

  if (kind === 'type') {
    const via = probe.via ?? {};
    const holder = via.event !== undefined
      ? snapshot?.events?.[via.event]
      : via.service !== undefined
        ? snapshot?.services?.[via.service]
        : undefined;
    if (holder === undefined) {
      return { code: 'MISSING', detail: `找不到类型 ${probe.type} 的来源（via=${JSON.stringify(via)}）` };
    }
    const declaration = typeDeclaration(holder, probe.type);
    if (declaration === undefined) {
      return { code: 'MISSING', detail: `来源里没有类型 ${probe.type}` };
    }
    for (const want of probe.contains ?? []) {
      if (!norm(declaration).includes(norm(want))) {
        return { code: 'CHANGED', detail: `${probe.type} 不再含「${want}」；实际：${norm(declaration).slice(0, 240)}` };
      }
    }
    for (const bad of probe.absent ?? []) {
      if (norm(declaration).includes(norm(bad))) {
        return { code: 'CHANGED', detail: `${probe.type} 现在含「${bad}」——宿主补了这个字段` };
      }
    }
    return { code: 'OK', detail: `${probe.type} 形状符合期望` };
  }

  if (kind === 'file') {
    const file = path.resolve(root ?? process.cwd(), probe.path);
    if (!existsSync(file) || !statSync(file).isFile()) {
      return { code: 'MISSING', detail: `文件不存在：${probe.path}` };
    }
    const bytes = readFileSync(file);
    if (probe.sizeBytes !== undefined && bytes.length !== probe.sizeBytes) {
      return { code: 'CHANGED', detail: `${probe.path} 大小 ${bytes.length}B ≠ 期望 ${probe.sizeBytes}B` };
    }
    if (probe.sha1 !== undefined) {
      const actual = createHash('sha1').update(bytes).digest('hex');
      if (actual !== probe.sha1) {
        return { code: 'CHANGED', detail: `${probe.path} sha1 ${actual} ≠ 期望 ${probe.sha1}` };
      }
    }
    const text = bytes.toString('utf8');
    for (const want of probe.contains ?? []) {
      if (!norm(text).includes(norm(want))) {
        return { code: 'CHANGED', detail: `${probe.path} 里找不到「${want}」` };
      }
    }
    return { code: 'OK', detail: `${probe.path} 存在${probe.sha1 ? '且 sha1 匹配' : '且内容匹配'}` };
  }

  if (kind === 'package') {
    const file = path.resolve(root ?? process.cwd(), probe.file ?? 'package.json');
    if (!existsSync(file)) return { code: 'MISSING', detail: `包清单不存在：${probe.file ?? 'package.json'}` };
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(file, 'utf8'));
    } catch (error) {
      return { code: 'CHANGED', detail: `包清单不是合法 JSON（${error.message}）` };
    }
    let cursor = manifest;
    for (const key of probe.path ?? []) {
      if (cursor === null || typeof cursor !== 'object' || !(key in cursor)) {
        return { code: 'MISSING', detail: `package.json 缺少 ${(probe.path ?? []).join('.')}` };
      }
      cursor = cursor[key];
    }
    if (probe.equals !== undefined && cursor !== probe.equals) {
      return { code: 'CHANGED', detail: `${(probe.path ?? []).join('.')} = ${JSON.stringify(cursor)} ≠ ${JSON.stringify(probe.equals)}` };
    }
    return { code: 'OK', detail: `package.json ${(probe.path ?? []).join('.')} = ${JSON.stringify(cursor)}` };
  }

  throw new Error(`触点 ${tp.id} 的 probe.kind "${kind}" 不认识（清单写错了）`);
}

// ---------------------------------------------------------------- 漂移扫描（可选）

/** 递归收集源码文件（只收 .js/.mjs/.cjs/.ts）。 */
function sourceFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, acc);
    else if (/\.(mjs|cjs|js|ts)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

/** 从生产代码里抽出宿主引用字面量，找出清单没写到的那些。 */
export function scanDrift(touchpoints, root) {
  if (!root) return [];
  const haystack = norm(touchpoints.map((tp) => `${tp.ref} ${tp.code} ${tp.why}`).join('  '));
  const found = new Set();
  for (const file of sourceFiles(root)) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/ctx\.get\(\s*'([^']+)'/g)) found.add(`ctx.get('${match[1]}'`);
    for (const match of text.matchAll(/ctx\.on\(\s*'([^']+)'/g)) found.add(`ctx.on('${match[1]}'`);
    const inject = text.match(/export const inject\s*=\s*\[([^\]]*)\]/);
    if (inject) {
      for (const match of inject[1].matchAll(/'([^']+)'/g)) found.add(`inject:${match[1]}`);
    }
    if (/ctx\.slots\./.test(text)) found.add('ctx.slots.*');
    if (/ctx\.remote\./.test(text)) found.add('ctx.remote.*');
  }
  const missingFromList = [];
  for (const ref of found) {
    if (ref.startsWith('inject:')) {
      const name = ref.slice('inject:'.length);
      if (!haystack.includes(`'${name}'`)) missingFromList.push(ref);
    } else if (ref === 'ctx.slots.*') {
      if (!haystack.includes('ctx.slots')) missingFromList.push(ref);
    } else if (ref === 'ctx.remote.*') {
      if (!haystack.includes('ctx.remote')) missingFromList.push(ref);
    } else if (!haystack.includes(ref)) {
      missingFromList.push(ref);
    }
  }
  return missingFromList;
}

// ---------------------------------------------------------------- 主流程

const ORDER = { MISSING: 0, CHANGED: 1, UNVERIFIABLE: 2, OK: 3 };

function run(touchpoints, snapshot, { root = null, scan = false } = {}) {
  const rows = touchpoints.map((tp) => {
    const { code, detail } = checkTouchpoint(tp, snapshot, root);
    return { id: tp.id, surface: tp.surface, declared: tp.status, code, detail, ref: tp.ref, fallback: tp.fallback };
  });
  const counts = { OK: 0, MISSING: 0, CHANGED: 0, UNVERIFIABLE: 0 };
  for (const row of rows) counts[row.code] += 1;
  const drift = scan ? scanDrift(touchpoints, root) : [];
  const exitCode = counts.MISSING + counts.CHANGED + drift.length > 0 ? 1 : 0;
  return { rows, counts, drift, exitCode, total: rows.length };
}

function strictExit(result) {
  return result.exitCode === 1 || result.counts.UNVERIFIABLE > 0 ? 1 : 0;
}

function printHuman(result, { strict, snapshotPath, touchpointsPath, hostHeader }) {
  console.log(`触点复检 — 宿主 ${hostHeader ?? '未知版本'}`);
  console.log(`清单：${touchpointsPath}`);
  console.log(`快照：${snapshotPath}`);
  console.log('');
  const width = Math.max(...result.rows.map((row) => row.id.length), 4);
  for (const row of [...result.rows].sort((a, b) => ORDER[a.code] - ORDER[b.code])) {
    console.log(`${row.code.padEnd(13)} ${row.id.padEnd(width)}  ${row.detail}`);
  }
  if (result.drift.length > 0) {
    console.log('');
    console.log('DRIFT（代码里有引用，清单没写）');
    for (const ref of result.drift) console.log(`  - ${ref}`);
  }
  console.log('');
  console.log(
    `合计 ${result.total} 条：OK ${result.counts.OK} / MISSING ${result.counts.MISSING} / CHANGED ${result.counts.CHANGED} / UNVERIFIABLE ${result.counts.UNVERIFIABLE}` +
      `（DRIFT ${result.drift.length}）→ 退出码 ${strict ? strictExit(result) : result.exitCode}${strict ? '（strict）' : ''}`,
  );
}

// ---------------------------------------------------------------- 自检：内建 fixture，不读外部文件

function selfTest() {
  const fixture = {
    touchpoints: [
      { id: 'fixture.service', surface: 'service', ref: "ctx.tools.guard()", probe: { kind: 'service', service: 'tools', method: 'guard', signatureIncludes: ['guard: ToolGuard'] } },
      { id: 'fixture.event', surface: 'event', ref: 'agent/created', probe: { kind: 'event', event: 'agent/created', mode: 'serial', signatureIncludes: ["'agent/created'"] } },
    ],
    snapshot: {
      host: { version: 'fixture-0.0.0' },
      services: { tools: { methods: { guard: 'guard(guard: ToolGuard): () => void' } } },
      events: { 'agent/created': { mode: 'serial', signature: "'agent/created'(payload): undefined" } },
    },
  };
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const results = [];

  const base = run(fixture.touchpoints, fixture.snapshot);
  results.push({
    name: '基线（不改快照）',
    expect: 'exit=0，无 MISSING/CHANGED',
    pass: base.exitCode === 0 && base.counts.MISSING === 0 && base.counts.CHANGED === 0,
    detail: `exit=${base.exitCode} MISSING=${base.counts.MISSING} CHANGED=${base.counts.CHANGED}`,
  });

  const deleted = clone(fixture.snapshot);
  delete deleted.services.tools.methods.guard;
  const afterDelete = run(fixture.touchpoints, deleted);
  const deleteRow = afterDelete.rows.find((row) => row.id === 'fixture.service');
  results.push({
    name: '反例 1：删掉 services.tools.methods.guard',
    expect: 'fixture.service = MISSING，整体 exit=1',
    pass: deleteRow?.code === 'MISSING' && afterDelete.exitCode === 1,
    detail: `该条=${deleteRow?.code} exit=${afterDelete.exitCode}`,
  });

  const renamed = clone(fixture.snapshot);
  renamed.events['agent/created'].mode = 'waterfall';
  const afterRename = run(fixture.touchpoints, renamed);
  const renameRow = afterRename.rows.find((row) => row.id === 'fixture.event');
  results.push({
    name: '反例 2：agent/created 的 mode 从 serial 改成 waterfall',
    expect: 'fixture.event = CHANGED，整体 exit=1',
    pass: renameRow?.code === 'CHANGED' && afterRename.exitCode === 1,
    detail: `该条=${renameRow?.code} exit=${afterRename.exitCode}`,
  });

  const dropped = clone(fixture.snapshot);
  delete dropped.services.tools.methods.guard;
  delete dropped.events['agent/created'];
  const afterDrop = run(fixture.touchpoints, dropped);
  results.push({
    name: '反例 3：整个事件消失',
    expect: 'fixture.event = MISSING，整体 exit=1',
    pass: afterDrop.rows.find((row) => row.id === 'fixture.event')?.code === 'MISSING' && afterDrop.exitCode === 1,
    detail: `该条=${afterDrop.rows.find((row) => row.id === 'fixture.event')?.code} exit=${afterDrop.exitCode}`,
  });

  const allPass = results.every((row) => row.pass);
  console.log('recheck 自检（内建 fixture，反例证明）');
  for (const row of results) {
    console.log(`${row.pass ? 'PASS' : 'FAIL'}  ${row.name}`);
    console.log(`      期望：${row.expect}`);
    console.log(`      实际：${row.detail}`);
  }
  console.log('');
  console.log(allPass ? '自检通过：脚本确实会变红。' : '自检失败：脚本没有按预期变红。');
  return allPass ? 0 : 1;
}

// ---------------------------------------------------------------- 入口

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log('用法：node recheck.mjs --touchpoints <清单> --snapshot <快照> [--scan-dir <源码目录>] [--json] [--strict]');
    console.log('      node recheck.mjs --self-test    # 内建 fixture，证明会变红');
    return 0;
  }
  if (opts.selfTest) return selfTest();

  const doc = readJson(opts.touchpoints);
  const touchpoints = doc.touchpoints ?? doc;
  if (!Array.isArray(touchpoints) || touchpoints.length === 0) {
    throw new Error(`清单里没有 touchpoints 数组：${opts.touchpoints}`);
  }
  const snapshot = readJson(opts.snapshot);

  const result = run(touchpoints, snapshot, { root: opts.scanDir, scan: Boolean(opts.scanDir) });
  if (opts.json) {
    console.log(JSON.stringify({ host: snapshot.host, ...result, exitCode: opts.strict ? strictExit(result) : result.exitCode }, null, 2));
  } else {
    printHuman(result, {
      strict: opts.strict,
      snapshotPath: opts.snapshot,
      touchpointsPath: opts.touchpoints,
      hostHeader: snapshot?.host?.version,
    });
  }
  return opts.strict ? strictExit(result) : result.exitCode;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(`recheck 失败：${error.message}`);
  process.exitCode = 2;
}
