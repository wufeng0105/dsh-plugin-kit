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

const PLUGIN = process.argv[2] ?? new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
if (process.argv[2] === undefined) {
  // 2026-11-11：本文件此前**从不自动执行**——它要一个「已安装插件目录」参数，
  // 而它又不在 `npm run check` 链里，于是没人发现它从来没真跑过（桩还缺 4 个服务，
  // 一跑就 `ctx.effect is not a function`）。不传参时退回仓库根，让它进自动链。
  console.log('[real-host-check] 未传插件目录，使用仓库根（自动模式）');
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
    // 2026-11-11 补：这个桩原先写 `logger(level, message)`（普通函数）。
    // 真实宿主里 `ctx.logger` 是 **callable 服务**：`ctx.logger.warn(msg)`。
    // 插件的 log() 会先找 `logger[level]`，找不到才退回 `logger(level, payload)`——
    // 而带结构化字段时 payload 是对象，`String(payload)` 会变成 "[object Object]"，
    // 于是「skip 留痕」这类按文本找日志的断言永远找不到。
    // 桩按真实形状写，才能测到插件真的输出的东西。
    logger: {
      info(payload) { logs.push(`info: ${typeof payload === 'string' ? payload : payload?.message}`); },
      warn(payload) { logs.push(`warn: ${typeof payload === 'string' ? payload : payload?.message}`); },
      error(payload) { logs.push(`error: ${typeof payload === 'string' ? payload : payload?.message}`); },
      debug(payload) { logs.push(`debug: ${typeof payload === 'string' ? payload : payload?.message}`); },
    },
    fs: {
      async resolve(p, opts) {
        // 2026-11-11 补：这个桩原先写 `async resolve(p)`，**不收 opts**。
        // 真实宿主是 resolve(path, {cwd}) —— 桩忽略它，就等于把 WP3 刚修的
        // 「readGate 漏传 cwd」那个真机 bug 又隐形了一次。
        // 现在给了 cwd 就按 cwd 拼路径，没给就按 workspace 拼（宿主默认值的替身）。
        const base = typeof opts?.cwd === 'string' && opts.cwd !== '' ? opts.cwd : workspace;
        const abs = join(base, p);
        return existsSync(abs) ? { displayPath: p, absPath: abs } : undefined;
      },
      async readText(target) {
        const text = readFileSync(target.absPath, 'utf8');
        reads.push(target.displayPath);
        return text;
      },
    },
    // 下面四个服务本文件原先没有：脚本在 `ctx.effect is not a function` 处直接崩，
    // 于是「未知工具默认 deny」那条断言从来没真跑过（它在 npm run check 之外，所以没人发现）。
    // 补上桩，让场景真的执行。
    workingDirectory: { get: () => workspace },
    get() {
      return undefined; // 无 storage，台账退到内存 + 文件镜像
    },
    skills: {
      registerProvider() {
        return () => {};
      },
    },
    systemPrompt: {
      section() {
        return () => {};
      },
    },
    effect(fn) {
      return fn();
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

// 2026-11-11 补：`agent.session` 原本没给。
//
// 没有它，`baseDirOf()` 只能退到 `process.cwd()`，于是 marker 检查看的是插件仓库
// 而不是临时工作区 → 永远是「未采用」→ 所有场景都走 `return next()`，
// 「缺上游门时被拦」之类断言**根本没机会成立**。这个文件在 WP4 之前就因为
// `ctx.effect is not a function` 先崩了，所以谁都没发现它其实测不到门。
const exec = (tool, args) => ({
  name: tool,
  arguments: args,
  signal: { aborted: false },
  agent: { session: 'real-host-check-session' },
});

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
  // 必须先「采用」阶段门（marker），否则机制按设计完全不生效——那是另一条语义。
  writeFileSync(join(ws, '.stage-gate.json'), '{"enabled":true}', 'utf8');

  try {
    // 场景 1：缺上游门 → 应拦
    //
    // 2026-11-11 D1 裁定后默认模式是 observe，所以每个「应拦」的场景都要显式
    // mode: 'enforce'。这不是放宽断言：默认值变了，断言必须说清「谁选择了拦」。
    {
      const { ctx, listeners, logs } = makeRealishCtx(ws);
      apply(ctx, { mode: 'enforce' });
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
      apply(ctx, { mode: 'enforce' });
      const { decision, nextCalled } = await firePreExecute(listeners, exec('write', { file_path: 'stages/p1/plan.md' }));
      check('补上 pass 门后放行', decision.kind === 'allow', `decision=${decision.kind}`);
      check('放行时调了 next（waterfall 纪律）', nextCalled === true, `nextCalled=${nextCalled}`);
      check('真读了 GATE.json 文件（不是桩）', reads.includes('stages/p0/GATE.json'), `reads=${JSON.stringify(reads)}`);
    }

    // 场景 3：写源码不拦、且不读盘
    {
      const { ctx, listeners, reads } = makeRealishCtx(ws);
      apply(ctx, { mode: 'enforce' });
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

    // 场景 5：未知工具不再被拦（D1 裁定：不按工具身份判罪）
    //
    // 这里用 enforce 跑，才能证明「放行」不是 observe 造成的，而是 UNKNOWN 那一层真的没了。
    {
      const { ctx, listeners } = makeRealishCtx(ws);
      apply(ctx, { mode: 'enforce' });
      const { decision } = await firePreExecute(listeners, exec('future_writer', { path: 'stages/p1/a.md' }));
      check(
        '未知工具放行（enforce 下也不拦）',
        decision.kind === 'allow',
        `decision=${decision.kind} code=${decision.info?.code}`,
      );
    }

    // 场景 5b：真实会话里被误拦的 9 个只读工具，在真 fs 上全部放行
    {
      const { ctx, listeners } = makeRealishCtx(ws);
      apply(ctx, { mode: 'enforce' });
      const NINE = ['read', 'ask_user_question', 'list_subagent_models', 'todo_write', 'read', 'skill', 'plugin_manager', 'subagent', 'ask_user_question'];
      const blocked = [];
      for (const tool of NINE) {
        const { decision } = await firePreExecute(listeners, exec(tool, { file_path: 'stages/p1/a.md', prompt: 'stages/p1 只读审查' }));
        if (decision.kind !== 'allow') blocked.push(`${tool}→${decision.info?.code}`);
      }
      check('9 个曾被误拦的只读工具全部放行', blocked.length === 0, blocked.join(', ') || '0 个被拦');
    }

    // 场景 6：skip 门放行但留痕
    {
      writeFileSync(join(ws, 'stages', 'p0', 'GATE.json'), '{"verdict":"skip","reason":"赶时间"}', 'utf8');
      const { ctx, listeners, logs } = makeRealishCtx(ws);
      apply(ctx, { mode: 'enforce' });
      const { decision } = await firePreExecute(listeners, exec('write', { file_path: 'stages/p1/plan.md' }));
      check('skip 门放行', decision.kind === 'allow', `decision=${decision.kind}`);
      check('skip 留痕', logs.some((l) => l.includes('skip')), logs.join(' | ').slice(0, 80));
    }

    // 场景 7：fail 门阻断
    {
      writeFileSync(join(ws, 'stages', 'p0', 'GATE.json'), '{"verdict":"fail"}', 'utf8');
      const { ctx, listeners } = makeRealishCtx(ws);
      apply(ctx, { mode: 'enforce' });
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
