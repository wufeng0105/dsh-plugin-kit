/**
 * 真机验证：在**已安装的 profile 副本**上加载插件，喂一个模拟的宿主事件，
 * 验证拦截是否真的发生。
 *
 * 这比冒烟测试强在哪：
 *   - 冒烟用的是工作区里的源码；这里用的是 **profile 里已安装的那份**
 *   - 冒烟用的 fs 桩是我写的；这里用**真实的 fs 语义**（读不到就返回 undefined）
 *
 * 但仍然不是完整的 L1：真实的 `tools/pre-execute` 由宿主派发，
 * 这里是我手工调监听器。所以结论等级是 **L2+**，不是纯 L1。
 */

import { readFileSync, mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const PLUGIN = process.argv[2];
if (PLUGIN === undefined) {
  console.error('用法：node real-host-check.mjs <已安装插件目录>');
  process.exit(2);
}

const { apply } = await import(`file:///${PLUGIN.replace(/\\/g, '/')}/index.js`);

// ---------------------------------------------------------------- 真机式 ctx

/**
 * 这次不用「我编的桩」了，改成尽量贴近真实契约：
 *   - fs.resolve：真机里返回一个对象或 undefined
 *   - fs.readText：读到就返回文本，读不到抛错
 * 用一个真实的临时目录当「工作区」，让 fs 真的读盘。
 */
function makeRealishCtx(workspace) {
  const listeners = new Map();
  const logs = [];
  const reads = [];

  const ctx = {
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(handler);
      return () => {};
    },
    logger(level, message) {
      logs.push(`${level}: ${message}`);
    },
    fs: {
      async resolve(p) {
        const abs = join(workspace, p);
        return existsSync(abs) ? { displayPath: p, absPath: abs } : undefined;
      },
      async readText(target) {
        const text = readFileSync(target.absPath, 'utf8');
        reads.push(target.displayPath);
        return text;
      },
    },
  };
  return { ctx, listeners, logs, reads };
}

async function firePreExecute(listeners, exec) {
  const handlers = listeners.get('tools/pre-execute') ?? [];
  if (handlers.length === 0) throw new Error('没有 pre-execute 监听器');
  let nextCalled = false;
  const next = async () => { nextCalled = true; return { kind: 'allow' }; };
  let decision = { kind: 'allow' };
  for (const h of handlers) {
    const r = await h(exec, next);
    if (r !== undefined) decision = r;
    if (decision.kind !== 'allow') break;
  }
  return { decision, nextCalled };
}

const exec = (tool, args) => ({ name: tool, arguments: args, signal: { aborted: false } });

// ---------------------------------------------------------------- 场景

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}`);
  if (detail !== undefined) console.log(`      ${detail}`);
}

async function run() {
  const ws = join(tmpdir(), `sg-real-${Date.now()}`);
  mkdirSync(join(ws, 'stages', 'p0'), { recursive: true });
  mkdirSync(join(ws, 'src'), { recursive: true });
  writeFileSync(join(ws, 'src', 'a.js'), '// src', 'utf8');

  try {
    // 场景 1：缺上游门 → 应拦
    {
      const { ctx, listeners, logs } = makeRealishCtx(ws);
      apply(ctx, {});
      const { decision } = await firePreExecute(listeners, exec('write', { file_path: 'stages/p1/plan.md' }));
      check(
        '缺上游门时，写 p1 被拦',
        decision.kind === 'deny' && decision.info?.code === 'GATE_MISSING',
        `decision=${decision.kind} code=${decision.info?.code} reason=${String(decision.reason).slice(0, 60)}…`,
      );
      check('拦下时理由里写了怎么补', String(decision.reason).includes('GATE.json'), 'reason 含 GATE.json');
      check('拦下时有 logger 记录', logs.some((l) => l.includes('GATE_MISSING')), logs.slice(0, 1).join(''));
    }

    // 场景 2：补上 pass 门 → 应放行
    {
      writeFileSync(join(ws, 'stages', 'p0', 'GATE.json'), '{"stage":"p0","verdict":"pass","by":"human","at":"2026-11-09T12:00:00Z"}', 'utf8');
      const { ctx, listeners, reads } = makeRealishCtx(ws);
      apply(ctx, {});
      const { decision, nextCalled } = await firePreExecute(listeners, exec('write', { file_path: 'stages/p1/plan.md' }));
      check('补上 pass 门后放行', decision.kind === 'allow', `decision=${decision.kind}`);
      check('放行时调了 next（waterfall 纪律）', nextCalled === true, `nextCalled=${nextCalled}`);
      check('真读了 GATE.json 文件（不是桩）', reads.includes('stages/p0/GATE.json'), `reads=${JSON.stringify(reads)}`);
    }

    // 场景 3：写源码不拦、且不读盘
    {
      const { ctx, listeners, reads } = makeRealishCtx(ws);
      apply(ctx, {});
      const { decision } = await firePreExecute(listeners, exec('write', { file_path: 'src/b.js' }));
      check('写源码放行', decision.kind === 'allow', `decision=${decision.kind}`);
      check('写源码时零 I/O（没有读任何 GATE.json）', reads.length === 0, `reads=${JSON.stringify(reads)}`);
    }

    // 场景 4：observe 模式不拦
    // 注意：要制造「本该拦」的状态，observe 才有意义。
    // 前一个场景把 p0 门写成了 fail，这里先删掉让它变成「缺门」。
    {
      rmSync(join(ws, 'stages', 'p0', 'GATE.json'), { force: true });
      const { ctx, listeners, logs } = makeRealishCtx(ws);
      apply(ctx, { mode: 'observe' });
      const { decision } = await firePreExecute(listeners, exec('write', { file_path: 'stages/p1/plan.md' }));
      check('observe 模式放行', decision.kind === 'allow', `decision=${decision.kind}`);
      check('observe 模式留下 warn', logs.some((l) => l.includes('observe')), logs.join(' | ').slice(0, 80));
    }

    // 场景 5：未知工具默认 deny
    {
      const { ctx, listeners } = makeRealishCtx(ws);
      apply(ctx, {});
      const { decision } = await firePreExecute(listeners, exec('future_writer', { path: 'stages/p1/a.md' }));
      check('未知工具默认 deny', decision.kind === 'deny' && decision.info?.code === 'UNKNOWN_WRITE_TOOL', `code=${decision.info?.code}`);
    }

    // 场景 6：skip 门放行但留痕
    {
      writeFileSync(join(ws, 'stages', 'p0', 'GATE.json'), '{"verdict":"skip","reason":"赶时间"}', 'utf8');
      const { ctx, listeners, logs } = makeRealishCtx(ws);
      apply(ctx, {});
      const { decision } = await firePreExecute(listeners, exec('write', { file_path: 'stages/p1/plan.md' }));
      check('skip 门放行', decision.kind === 'allow', `decision=${decision.kind}`);
      check('skip 留痕', logs.some((l) => l.includes('skip')), logs.join(' | ').slice(0, 80));
    }

    // 场景 7：fail 门阻断
    {
      writeFileSync(join(ws, 'stages', 'p0', 'GATE.json'), '{"verdict":"fail"}', 'utf8');
      const { ctx, listeners } = makeRealishCtx(ws);
      apply(ctx, {});
      const { decision } = await firePreExecute(listeners, exec('write', { file_path: 'stages/p1/plan.md' }));
      check('fail 门阻断', decision.kind === 'deny' && decision.info?.code === 'GATE_FAILED', `code=${decision.info?.code}`);
    }
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }

  const failed = results.filter((r) => !r.pass);
  console.log('');
  console.log(failed.length === 0 ? `全部 ${results.length} 项通过。` : `${failed.length} / ${results.length} 项失败。`);
  return failed.length === 0 ? 0 : 1;
}

process.exitCode = await run();
