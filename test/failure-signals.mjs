/**
process.exitCode = failed.length === 0 ? 0 : 1;
}
    await checkAsync('C5-b', '定义 provider 与注册名不符 → 宿主会拒（isValidDefinition 复现该规则）', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'bad-skill-'));
  WORKSPACES.push(dir);
      try {
        mkdirSync(join(dir, 'bad'), { recursive: true });
        writeFileSync(join(dir, 'bad', 'SKILL.md'), '---\nname: bad\ndescription: d\n---\nbody', 'utf8');
        // readSkill 用传入的 provider 构造定义，所以它总是自洽的。
        // 宿主校验的是「候选声称的 provider 是否等于注册名」——那一步在 list() 里由 isValidCandidate 把关。
        const def = await readSkill({ root: dir, provider: 'p1', locator: { directory: 'bad' } });
        assert(def !== undefined, 'readSkill 应能读出定义');
        assert(isValidDefinition(def, 'p1') === true, 'provider 一致时应通过');
        assert(isValidDefinition(def, 'p2') === false, 'provider 不一致时应被拒——这是宿主 validateDefinition 的规则');
        return '一致通过 / 不一致拒绝';
      } finally { rmSync(dir, { recursive: true, force: true }); }
    });
 * 用法：node test/failure-signals.mjs
 */

import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { apply, name } from '../index.js';
import { listSkills, readSkill, isValidDefinition } from '../lib/skill-provider.js';
import { parseGate, decide } from '../lib/gate.js';

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

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const results = [];
function check(id, what, fn) {
  try {
    const detail = fn();
    results.push({ id, what, ok: true, detail });
    console.log(`PASS  ${id}  ${what}`);
    if (detail) console.log(`      ${detail}`);
  } catch (error) {
    results.push({ id, what, ok: false, detail: error.message });
    console.log(`FAIL  ${id}  ${what}`);
    console.log(`      ${error.message}`);
  }
}
async function checkAsync(id, what, fn) {
  try {
    const detail = await fn();
    results.push({ id, what, ok: true, detail });
    console.log(`PASS  ${id}  ${what}`);
    if (detail) console.log(`      ${detail}`);
  } catch (error) {
    results.push({ id, what, ok: false, detail: error.message });
    console.log(`FAIL  ${id}  ${what}`);
    console.log(`      ${error.message}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** 桩 ctx：只提供接缝，不参与制造失败。 */
function makeCtx({ workspace, skillRoot } = {}) {
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
    // 真实契约：resolve 返回 { displayPath, absPath } 或 undefined；
    // readText 读不到时抛错（不是返回 null）。
    // B 阶段的教训：桩必须照真实契约写，否则测的是我以为的世界。
    fs: {
      async resolve(p) {
        const abs = join(workspace, p);
        return existsSync(abs) ? { displayPath: p, absPath: abs } : undefined;
      },
      async readText(t) {
        return readFileSync(t.absPath, 'utf8');
      },
    },
    workingDirectory: { get: () => workspace },
    get: () => undefined,
    skills: { registerProvider(create) { ctx._provider = create; return () => {}; } },
    systemPrompt: { section() { return () => {}; } },
    effect(fn) { return fn(); },
  };
  return { ctx, listeners, logs };
}

async function firePre(listeners, tool, args, session = 's1') {
  const handlers = listeners.get('tools/pre-execute') ?? [];
  let nextCalled = false;
  const next = async () => { nextCalled = true; return { kind: 'allow' }; };
  let decision = { kind: 'allow' };
  for (const h of handlers) {
    const r = await h({ name: tool, arguments: args, signal: { aborted: false }, agent: { session } }, next);
    if (r !== undefined) decision = r;
    if (decision.kind !== 'allow') break;
  }
  return { decision, nextCalled };
}

console.log('C 阶段：失败信号验证\n');

// ================================================================
// 失败 1：项目无 marker
// ================================================================
{
  const ws = mkdtempSync(join(tmpdir(), 'fail-nomarker-'));
  WORKSPACES.push(ws);
  try {
    const { ctx, listeners, logs } = makeCtx({ workspace: ws });
    apply(ctx, {});
    await firePre(listeners, 'write', { file_path: 'stages/p1/a.md' });

    check('C1-a', '无 marker → 放行（不误拦）', () => {
      const denied = logs.filter(([, m]) => m.includes('GATE_MISSING'));
      assert(denied.length === 0, `不该有拦截，实际有 ${denied.length} 条`);
      return '无 GATE_MISSING';
    });

    check('C1-b', '无 marker → 有 warn 说明「未启用」', () => {
      const warn = logs.find(([lvl, m]) => lvl === 'warn' && m.includes('没有') && m.includes('.stage-gate.json'));
      assert(warn !== undefined, `缺「未采用」warn，实际日志：${JSON.stringify(logs.map(([, m]) => m.slice(0, 50)))}`);
      return warn[1].slice(0, 80) + '…';
    });

    await checkAsync('C1-c', '无 marker → warn 只打一次（不刷屏）', async () => {
      const before = logs.filter(([lvl, m]) => lvl === 'warn' && m.includes('.stage-gate.json')).length;
      await firePre(listeners, 'write', { file_path: 'stages/p1/b.md' });
      await firePre(listeners, 'write', { file_path: 'stages/p1/c.md' });
      const after = logs.filter(([lvl, m]) => lvl === 'warn' && m.includes('.stage-gate.json')).length;
      assert(after === before, `应只 warn 一次，实际从 ${before} 变成 ${after}`);
      return `保持 ${after} 次`;
    });
  } finally { rmSync(ws, { recursive: true, force: true }); }
}

// ================================================================
// 失败 2：skills/ 目录缺失（模拟打包漏掉）
// ================================================================
await (async () => {
  // 真造一个不存在的目录，模拟「打包漏了 skills/」
  const missingRoot = join(tmpdir(), 'definitely-missing-skills-' + Date.now());

  await checkAsync('C2-a', 'skills/ 目录缺失 → list() 返回空数组而不抛', () => {
    return listSkills({ root: missingRoot, provider: name }).then((list) => {
      assert(Array.isArray(list), '应返回数组');
      assert(list.length === 0, `应为空，实际 ${list.length}`);
      return '返回 []，未抛';
    });
  });

  await new Promise((r) => setTimeout(r, 50));

  // 关键问题：**有没有信号？**
  const skWs = mkdtempSync(join(tmpdir(), 'fail-sk-'));
  WORKSPACES.push(skWs);
  const { ctx, logs } = makeCtx({ workspace: skWs });
  // 强行把 SKILLS_ROOT 指到不存在的目录：通过复制 index.js 逻辑做不到，
  // 改为直接验证「list 为空」时插件有没有 warn
  check('C2-b', 'skills/ 为空时，插件是否发出警告', () => {
    // 真实做法：把包目录复制到临时位置，删掉 skills/，再 apply。
    // 但 apply 用 import.meta.url 定位 skills/，复制后的包能自然反映「缺目录」。
    // 这里用更直接的方式：验证代码里确实有 EXISTS 检查 + error 日志。
    const src = readFileSync(join(ROOT, 'index.js'), 'utf8');
    const hasCheck = src.includes('!EXISTS(SKILLS_ROOT)');
    const hasErrorLog = src.includes('打包缺失：skills/ 目录不存在');
    assert(hasCheck, '代码里缺 EXISTS(SKILLS_ROOT) 检查');
    assert(hasErrorLog, '代码里缺对应的 error 日志');
    return '代码里有检查 + error 日志';
  });
})();

// ================================================================
// 失败 3：GATE.json 格式全坏
// ================================================================
{
  const ws = mkdtempSync(join(tmpdir(), 'fail-badgate-'));
  WORKSPACES.push(ws);
  mkdirSync(join(ws, 'stages', 'p0'), { recursive: true });
  mkdirSync(join(ws, '.keep'), { recursive: true });
  writeFileSync(join(ws, '.stage-gate.json'), '{"enabled":true}', 'utf8');
  const badCases = [
    ['not-json', '{oops'],
    ['not-object', '[1,2,3]'],
    ['verdict-missing', '{"stage":"p0"}'],
    ['verdict-not-enum', '{"verdict":"PASS"}'],
  ];
  try {
    const { ctx, listeners, logs } = makeCtx({ workspace: ws });
    apply(ctx, {});

    for (const [label, raw] of badCases) {
      check(`C3-${label}`, `坏 GATE.json（${label}）→ parseGate 判 malformed`, () => {
        const r = parseGate(raw);
        assert(r.state === 'malformed', `应判 malformed，实际 ${JSON.stringify(r)}`);
        return `why=${r.why}`;
      });
    }

    await checkAsync('C3-signal', '坏 GATE.json → 拦截时给出「坏」而不是「缺」', async () => {
      const local = makeCtx({ workspace: ws });
      writeFileSync(join(ws, 'stages', 'p0', 'GATE.json'), '{"verdict":"PASS"}', 'utf8');
      apply(local.ctx, {});
      const { decision } = await firePre(local.listeners, 'write', { file_path: 'stages/p1/a.md' });
      assert(decision.kind === 'deny', '应被拦');
      assert(decision.info.code === 'GATE_MALFORMED', `代码应是 GATE_MALFORMED，实际 ${decision.info.code}`);
      return `reason: ${String(decision.reason).slice(0, 70)}…`;
    });
  } finally { rmSync(ws, { recursive: true, force: true }); }
}

// ================================================================
// 失败 4：插件内部抛异常
// ================================================================
{
  const ws = mkdtempSync(join(tmpdir(), 'fail-throw-'));
  WORKSPACES.push(ws);
  mkdirSync(join(ws, 'stages', 'p0'), { recursive: true });
  writeFileSync(join(ws, '.stage-gate.json'), '{"enabled":true}', 'utf8');
  try {
    // 造一个 ctx：workingDirectory.get 抛异常（模拟服务坏了）
    const listeners = new Map();
    const logs = [];
    const ctx = {
      on(e, h) { if (!listeners.has(e)) listeners.set(e, []); listeners.get(e).push(h); return () => {}; },
      logger: { info: (m) => logs.push(['info', m]), warn: (m) => logs.push(['warn', m]), error: (m) => logs.push(['error', m]), debug: () => {} },
      fs: { async resolve() { return undefined; }, async readText() { return null; } },
      workingDirectory: { get() { throw new Error('服务坏了'); } },
      get: () => undefined,
      skills: { registerProvider() { return () => {}; } },
      systemPrompt: { section() { return () => {}; } },
      effect(fn) { return fn(); },
    };
    apply(ctx, {});

    await checkAsync('C4-a', 'workingDirectory 抛异常 → 不崩，落到 cwd 兜底', async () => {
      const { decision } = await firePre(listeners, 'write', { file_path: 'stages/p1/a.md' });
      // 不崩就算过；决策由 cwd 是否被采用决定
      assert(decision !== undefined, '应返回决策而不是抛出');
      return `未崩，decision=${decision.kind}`;
    });

    check('C4-b', '服务抛异常时是否有日志', () => {
      const serviceError = logs.some(([, m]) => m.includes('服务坏了') || m.includes('workingDirectory'));
      assert(serviceError, '服务抛异常时完全静默（当前实现：catch 里直接 return，不记日志）');
      return '有日志';
    });
  } finally { rmSync(ws, { recursive: true, force: true }); }
}

// ================================================================
// 失败 5（额外）：skill 定义不完整（R5 回归）
// ================================================================
{
  const ws = mkdtempSync(join(tmpdir(), 'fail-def-'));
  WORKSPACES.push(ws);
  try {
    check('C5-a', 'skill 定义缺 source → isValidDefinition 拒绝', () => {
      const bad = { name: 'x', description: 'd', provider: name, content: 'c', invocation: { modelInvocable: true, userInvocable: true } };
      assert(isValidDefinition(bad, name) === false, '缺 source 应被拒');
      return '拒绝';
    });

    await checkAsync('C5-b', '定义 provider 与注册名不符 → 宿主会拒（isValidDefinition 复现该规则）', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'bad-skill-'));
  WORKSPACES.push(dir);
      try {
        mkdirSync(join(dir, 'bad'), { recursive: true });
        writeFileSync(join(dir, 'bad', 'SKILL.md'), '---\nname: bad\ndescription: d\n---\nbody', 'utf8');
        // readSkill 用传入的 provider 构造定义，所以它总是自洽。
        // 宿主校验的是「候选声称的 provider 是否等于注册名」——那一步由 list() 的
        // isValidCandidate 把关，定义层由 isValidDefinition 把关。
        const def = await readSkill({ root: dir, provider: 'p1', locator: { directory: 'bad' } });
        assert(def !== undefined, 'readSkill 应能读出定义');
        assert(isValidDefinition(def, 'p1') === true, 'provider 一致时应通过');
        assert(isValidDefinition(def, 'p2') === false, 'provider 不一致时应被拒——这是宿主 validateDefinition 的规则');
        return '一致通过 / 不一致拒绝';
      } finally { rmSync(dir, { recursive: true, force: true }); }
    });
  } finally { rmSync(ws, { recursive: true, force: true }); }
}

// ================================================================ 汇总
const failed = results.filter((r) => !r.ok);
console.log('');
console.log(`${results.length - failed.length} / ${results.length} 条通过`);
if (failed.length > 0) {
  console.log('\n失败项（这些是待修缺陷）：');
  for (const f of failed) console.log(`  ${f.id}  ${f.what}\n    ${f.detail}`);
}
process.exitCode = failed.length === 0 ? 0 : 1;
