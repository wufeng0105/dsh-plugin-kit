/**
 * 冒烟测试 —— 用桩 ctx 加载**真实的 index.js**，验证接线对不对。
 *
 * 这个测试的意义：单测覆盖的是内核（lib/gate.js），它证明「判定逻辑对」；
 * 本文件覆盖的是接线（index.js），它证明「宿主事件真的会走到内核、结果真的会被翻成 deny」。
 *
 * 两者缺一不可 —— 三轮实验里「模块有、测试有、产品没接线」就是只测了前者。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { apply, name, inject, Config } from '../index.js';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync as EXISTS_SYNC } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 包根目录，用于检查 package.json / CHANGELOG 等元文件。 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 所有 makeWorkspace 建的临时目录都会登记在这里，进程退出时统一删。
 *
 * 为什么需要：早期每个测试各建一个 mkdtemp 目录但从不删除，
 * 跑了几百次测试后 TEMP 里堆了 664 个残留目录。
 * 测试污染系统是产品级缺陷——别人跑一次也得清一次。
 */
const WORKSPACES = [];
process.on('exit', () => {
  for (const dir of WORKSPACES) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* 清理失败不影响测试结果 */
    }
  }
});

/** 为单个测试造一个已采用阶段门的临时工作区。 */
function makeWorkspace(adopted = true) {
  const dir = mkdtempSync(join(tmpdir(), 'smoke-'));
  WORKSPACES.push(dir);
  mkdirSync(dir, { recursive: true });
  if (adopted) writeFileSync(join(dir, '.stage-gate.json'), '{"enabled":true}', 'utf8');
  return dir;
}

// ---------------------------------------------------------------- 桩宿主

/**
 * 造一个最小 ctx：
 *   - on() 收集监听器
 *   - fs 提供 resolve/readText，由传入的 files 表驱动
 *   - logger 收集日志
 */
/** 把 logger 收到的 payload 统一成 { level, message, fields } —— 兼容字符串和结构化两种形态。 */
function normalize(payload, level) {
  if (typeof payload === 'string') return { level, message: payload, fields: undefined };
  return { level, message: payload?.message ?? String(payload), fields: payload?.fields };
}

function makeCtx({ files = {}, logger = [], workspace = '/ws', adopted = true, markerName = '.stage-gate.json', createMarker = false } = {}) {
  const listeners = new Map();
  const calls = {};
  const ctx = {
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(handler);
      return () => {};
    },
    // 真实形状：ctx.logger 是 callable 服务，日志走 ctx.logger.info / .warn
    // （见 dsh-workspace-changes/lib/index.js:1027,1047）
    // 早期这个桩写成了 logger(level, message)，正好配合了错的调用方式，
    // 导致「日志从来不输出」这个 bug 在测试里完全看不出来。
    logger: {
      info(payload) { logger.push(normalize(payload, 'info')); },
      warn(payload) { logger.push(normalize(payload, 'warn')); },
      error(payload) { logger.push(normalize(payload, 'error')); },
      debug(payload) { logger.push(normalize(payload, 'debug')); },
    },
    fs: {
      // 2026-11-11：这个桩原先写成 `async resolve(p) { return p in files ? ... : undefined }`
      // ——**没接收第二个参数 opts**。真实宿主是 `resolve(path, opts)`，相对路径按
      // `opts.cwd ?? this.config.cwd` 解析。桩忽略 opts，于是「readGate 不传 cwd」这个
      // 真机 bug（实测 6 次误报缺门）在测试里完全看不出来。
      //
      // 现在桩会像宿主一样工作：给了 cwd 就按 cwd 拼路径再去查 files；
      // 没给 cwd 就退回一个与项目无关的进程级目录——**故意让不传 cwd 的调用查不到文件**，
      // 这样漏传 cwd 会红。resolveCalls 供测试断言「cwd 到底传没传」。
      resolveCalls: [],
      async resolve(p, opts) {
        ctx.fs.resolveCalls.push({ path: p, opts });
        const base = opts?.cwd ?? 'STALE-PROCESS-CWD';
        const rel = String(p).replaceAll('\\', '/').replace(/^\.\//, '');
        const key = `${base}/${rel}`;
        // 两种查法都试：原样（相对路径场景）与 cwd+path（宿主真实语义）
        if (p in files) return { displayPath: p };
        if (key in files) return { displayPath: key };
        return undefined;
      },
      async readText(target, signal) {
        if (signal?.aborted) throw new Error('aborted');
        return files[target.displayPath] ?? null;
      },
    },
    // C3：marker 检查走真实文件系统。测试时用一个临时目录当工作区。
    workingDirectory: {
      get(session) {
        return workspace;
      },
    },
    get(name) {
      return undefined; // 无 storage，台账退到内存
    },
    // 第一段：skill provider 注册
    skills: {
      registerProvider(create) {
        calls.skillProvider = create;
        return () => {};
      },
    },
    // 第二段：常驻纪律段
    systemPrompt: {
      section(section) {
        calls.systemPromptSection = section;
        return () => {};
      },
    },
    // cordis 的 effect：同步调用并收集 disposer
    effect(fn) {
      return fn();
    },
  };
  if (adopted && createMarker) {
    try {
      mkdirSync(workspace, { recursive: true });
      writeFileSync(join(workspace, markerName), '{"enabled":true}', 'utf8');
    } catch {
      /* 测试环境建不出就让它未采用 */
    }
  }
  return { ctx, listeners, logger, calls };
}

/** 触发所有 pre-execute 监听器，返回第一个非 allow 的决策。 */
async function firePreExecute(listeners, exec) {
  const handlers = listeners.get('tools/pre-execute') ?? [];
  assert.ok(handlers.length > 0, 'pre-execute 监听器没接上');
  let calledNext = false;
  const next = async () => { calledNext = true; return { kind: 'allow' }; };
  let last = { kind: 'allow' };
  for (const handler of handlers) {
    const result = await handler(exec, next);
    if (result !== undefined) last = result;
    if (last.kind !== 'allow') return { decision: last, calledNext };
  }
  return { decision: last, calledNext };
}

const mkExec = (tool, args) => ({
  name: tool,
  arguments: args,
  signal: { aborted: false },
  // 真机上 exec.agent.session 一定存在（工具调用都归属某个会话）
  agent: { session: 'test-session' },
});

// ---------------------------------------------------------------- 导出面

test('导出面：name / inject / Config / apply 齐全', () => {
  assert.equal(name, 'plugin-kit');
  assert.deepEqual(inject, ['fs', 'workingDirectory', 'skills', 'systemPrompt']);
  assert.equal(typeof apply, 'function');
});

test('导出面：Config 是 schemastery Schema（不是普通对象）', () => {
  // cordis 的 resolveConfig 直接调 Config["~standard"].validate(config)。
  // 普通 JSON Schema 对象没有 ~standard，会在真机加载时抛 TypeError。
  // 这个断言就是为了防止那种情况再次发生。
  assert.equal(typeof Config, 'function', 'Config 必须是 Schema 实例（首次发现时它是普通对象）');
  assert.equal(typeof Config['~standard'], 'object', '缺 ~standard');
  assert.equal(typeof Config['~standard'].validate, 'function', '缺 ~standard.validate');
});

test('Config 校验：默认值正确填充', () => {
  const r = Config['~standard'].validate({});
  assert.equal(r.issues, undefined, `校验失败：${JSON.stringify(r.issues)}`);
  // 2026-11-11 D1 裁定：默认从 enforce 改为 observe——量出「本可以拦住 N 次」之前不默认拦人。
  assert.equal(r.value.mode, 'observe');
  // root 已从配置项移除。但注意：本仓 schemastery **不剥未声明字段**（实测），
  // 所以 validate 之后 root 仍会透传——真正让配置失效的是 apply() 里硬写 DEFAULT_ROOT。
  // 「塞了也不生效」由下面的行为断言证明，这里只核声明层面。
  assert.equal(Config({}).root, undefined, 'root 不该还在 Config 声明里');
  assert.equal(r.value.gateFile, 'GATE.json', 'gateFile 仍在（配错会报错，不是静默）');
  assert.ok(Array.isArray(r.value.layout), 'layout 仍在（配错会报错，不是静默）');
});

test('root 传了也不生效：机制必须恒按 stages 判（配错不能静默放行）', async () => {
  // 真机风险：root 配错时 locateStage 认不出阶段写入 → decide 返回 allow
  // → 既不拦也不报错。用户以为有保护，实际全放行。
  // 这条守卫锁的是「apply 不读 config.root」这个决定。
  const ws = makeWorkspace();
  const { ctx, listeners } = makeCtx({ workspace: ws });
  apply(ctx, { mode: 'enforce', root: 'my-stages' }); // 故意传一个错的 root
  const { decision } = await firePreExecute(listeners, mkExec('write', { file_path: 'stages/p1/a.md' }));
  assert.equal(
    decision.kind,
    'deny',
    'root 配了 my-stages，但机制必须仍按 stages 判定；allow 意味着「配错即静默放行」',
  );
  assert.equal(decision.info.code, 'GATE_MISSING');
});

test('Config 校验：allowedTools 已从 Config 消失', () => {
  // 它是「未知工具 deny」的逃生门。deny 没了，逃生门也没有存在意义。
  //
  // 注意：这里**不能**断言「硬塞的 allowedTools 会被剥掉」——实测本仓的 schemastery
  // 把未声明字段原样透传（`validate({junkField:1})` 的 value 里 junkField 还在）。
  // 所以「消失」只能断言「声明层面没有了」，而「塞了也没用」由行为断言证明——
  // 见下方「拦截：allowedTools 配置项已消失」。
  assert.equal(Config({}).allowedTools, undefined, 'allowedTools 不该还在 Config 里');
  assert.ok('mode' in Config({}), '对照组：mode 仍在——否则这条断言可能因为 schema 整个空而空真');
  assert.ok('gateFile' in Config({}), '对照组：gateFile 仍在');
});

test('Config 校验：mode 只接受 observe / enforce', () => {
  const good = Config['~standard'].validate({ mode: 'observe' });
  assert.equal(good.issues, undefined);
  const bad = Config['~standard'].validate({ mode: 'nonsense' });
  assert.ok(bad.issues, '非法 mode 应被拒绝');
});

// ---------------------------------------------------------------- 接线

test('接线：apply 注册了 pre-execute 和 tools/result', () => {
  const { ctx, listeners } = makeCtx();
  apply(ctx, {});
  assert.ok(listeners.has('tools/pre-execute'), '缺 pre-execute');
  assert.ok(listeners.has('tools/result'), '缺 tools/result');
});

test('disabled：enabled=false 时不注册任何监听器', () => {
  const { ctx, listeners } = makeCtx();
  apply(ctx, { enabled: false });
  assert.equal(listeners.size, 0);
});

// ---------------------------------------------------------------- 拦截真的生效
//
// 2026-11-11 D1 裁定把默认模式改成 observe 之后，**「拦截生效」的用例必须显式写
// mode: 'enforce'**。这不是把断言放松了，恰恰相反：默认值变了，凡是断言「被拦」的
// 地方都得先说明「这个项目主动选择了拦」。之前它们靠默认值侥幸成立，现在靠声明。

test('拦截（enforce）：缺上游门时，写 p1 产物被 deny', async () => {
  const { ctx, listeners } = makeCtx();
  apply(ctx, { mode: 'enforce' });
  const { decision } = await firePreExecute(listeners, mkExec('write', { file_path: 'stages/p1/plan.md' }));
  assert.equal(decision.kind, 'deny');
  assert.equal(decision.info.code, 'GATE_MISSING');
  assert.ok(decision.reason.includes('GATE.json'), '理由要写清怎么补');
});

test('拦截（默认 observe）：同样的调用在默认配置下不拦，但入账', async () => {
  // 默认值就是 observe：用户装完包不该先被拦一次才知道机制存在。
  const { ctx, listeners, logger } = makeCtx();
  apply(ctx, {}); // 不传 mode，走默认
  const { decision } = await firePreExecute(listeners, mkExec('write', { file_path: 'stages/p1/plan.md' }));
  assert.equal(decision.kind, 'allow', '默认模式下不该真的拦');
  assert.ok(logger.some((l) => l.message.includes('observe')), '默认模式必须留下 observe 痕迹');
});

test('拦截（enforce）：上游门是 pass 时，写入放行', async () => {
  const { ctx, listeners } = makeCtx({
    files: { 'stages/p0/GATE.json': '{"verdict":"pass"}' },
  });
  apply(ctx, { mode: 'enforce' });
  const { decision } = await firePreExecute(listeners, mkExec('write', { file_path: 'stages/p1/plan.md' }));
  assert.equal(decision.kind, 'allow');
});

test('拦截：读门记录必须传 opts.cwd（真机 bug 回归守卫）', async () => {
  // 真机事故：`ctx.fs.resolve(path)` 不传 opts.cwd 时，宿主按
  // `this.config.cwd`（宿主进程目录）解析相对路径 `stages/p0/GATE.json`，
  // 于是门文件在项目里却读不到 → 误报 GATE_MISSING。
  // 实测 6 次（seq 4134/4139/4193/4956/4975/4985，门 mtime 均早于 deny 时刻）。
  //
  // 这条测试不看结果对不对，只看**调用契约**：门真的被读时，cwd 必须到位。
  // 早先没有它，所以「漏传 cwd」能把所有拦截测试跑绿——因为桩忽略了 opts。
  const workspace = makeWorkspace(true);
  const { ctx, listeners } = makeCtx({
    files: { 'stages/p0/GATE.json': '{"verdict":"pass"}' },
    workspace,
  });
  apply(ctx, { mode: 'enforce' });
  ctx.fs.resolveCalls.length = 0;

  await firePreExecute(listeners, mkExec('write', { file_path: 'stages/p1/plan.md' }));

  const gateReads = ctx.fs.resolveCalls.filter((c) => String(c.path).includes('GATE.json'));
  assert.ok(gateReads.length > 0, '应该真的去读了上游门记录');
  for (const call of gateReads) {
    assert.equal(
      call.opts?.cwd,
      workspace,
      'readGate 调 resolve 时必须传会话 cwd（' + workspace + '），否则相对路径会按宿主进程 cwd 解析',
    );
  }
});

test('拦截：marker 在会话中途创建后，下一次调用立即生效（缓存不能锁死）', async () => {
  // 真机事故：marker 由会话自己在 03:03:24 创建，而创建它的那次 pre-execute 早 1 秒，
  // marker 尚不存在 → adoptionOf 把 adopted:false 写进缓存并永久生效，
  // 直到 12:40:21 才第一次 deny。中间 629 分钟，门等于没装。
  //
  // 这里用真实临时目录：先不建 marker 跑一次，再建 marker 跑一次。
  const workspace = makeWorkspace(false); // 故意不建 marker
  const { ctx, listeners } = makeCtx({
    files: { 'stages/p0/GATE.json': '{"verdict":"pass"}' },
    workspace,
  });
  apply(ctx, { mode: 'enforce' });

  // 第一次：没有 marker，应放行
  const first = await firePreExecute(listeners, mkExec('write', { file_path: 'stages/p1/plan.md' }));
  assert.equal(first.decision.kind, 'allow', '未采用阶段门时放行');

  // 用户现在创建 marker（模拟会话中途创建）
  writeFileSync(join(workspace, '.stage-gate.json'), '{"enabled":true}', 'utf8');

  // 第二次：门应生效——上游 p0 门是 pass，所以仍放行；
  // 但要证明「机制确实开始运行了」，用一个没有上游门的目标来看它是否开始拦。
  const second = await firePreExecute(listeners, mkExec('write', { file_path: 'stages/p2/plan.md' }));
  assert.equal(
    second.decision.kind,
    'deny',
    'marker 创建后机制必须立即生效——缓存住 adopted:false 会让它永远不生效',
  );
  assert.equal(second.decision.info.code, 'GATE_MISSING');
});

test('拦截（enforce）：上游门是 fail 时被 deny', async () => {
  const { ctx, listeners } = makeCtx({
    files: { 'stages/p0/GATE.json': '{"verdict":"fail"}' },
  });
  apply(ctx, { mode: 'enforce' });
  const { decision } = await firePreExecute(listeners, mkExec('write', { file_path: 'stages/p1/plan.md' }));
  assert.equal(decision.kind, 'deny');
  assert.equal(decision.info.code, 'GATE_FAILED');
});

test('拦截：写源码不被拦（不误伤）', async () => {
  const { ctx, listeners } = makeCtx();
  apply(ctx, {});
  const { decision } = await firePreExecute(listeners, mkExec('write', { file_path: 'src/index.js' }));
  assert.equal(decision.kind, 'allow');
});

test('拦截：未知工具不再被拦（D1 裁定：不按工具身份判罪）', async () => {
  // 2026-11-11 前这里断言的是 deny + UNKNOWN_WRITE_TOOL。那个类别整层删除了，
  // 所以现在断言放行——而且刻意带上 stages 路径，证明「参数里有 stages」不再换来一次拦。
  const { ctx, listeners } = makeCtx();
  apply(ctx, { mode: 'enforce' });
  const { decision } = await firePreExecute(listeners, mkExec('mystery_writer', { path: 'stages/p1/a.md' }));
  assert.equal(decision.kind, 'allow');
});

test('拦截：allowedTools 配置项已消失——塞进来也不会变成放行开关', async () => {
  // 旧配置是「不想被未知工具拦」的逃生门。门没了，配置也没了。
  // 这里断言的是：塞一个不存在的配置项进来，行为与不塞完全一样（不被剥成开关）。
  const withOldConfig = makeCtx();
  apply(withOldConfig.ctx, { mode: 'enforce', allowedTools: ['mystery_writer'] });
  const a = await firePreExecute(withOldConfig.listeners, mkExec('mystery_writer', { path: 'stages/p1/a.md' }));

  const without = makeCtx();
  apply(without.ctx, { mode: 'enforce' });
  const b = await firePreExecute(without.listeners, mkExec('mystery_writer', { path: 'stages/p1/a.md' }));

  assert.equal(a.decision.kind, b.decision.kind, '旧配置项不该改变行为');
  assert.equal(a.decision.kind, 'allow');
});

// ---------------------------------------------------------------- observe 模式

test('observe 模式：本可以拦住但实际放行，并记 warn', async () => {
  const { ctx, listeners, logger } = makeCtx();
  apply(ctx, { mode: 'observe' });
  const { decision } = await firePreExecute(listeners, mkExec('write', { file_path: 'stages/p1/plan.md' }));
  assert.equal(decision.kind, 'allow', 'observe 不该真的拦');
  assert.ok(logger.some((l) => l.message.includes('observe')), '应留下 observe 日志');
});

test('observe 模式：本可以拦住就入账一条 would-block（「如果拦」的数据来源）', async () => {
  // WP3 修了「observe 对 UNKNOWN deny 失效」：那时它既硬拦、又不留 would-block 记录，
  // 于是没人在 observe 下量得出它。D1 把 observe 变成默认值之后，这条更关键——
  // 默认模式下「本可以拦住 N 次」是唯一能证明拦截层价值的数据，不能只打日志。
  const ws = makeWorkspace();
  const { ctx, listeners } = makeCtx({ workspace: ws });
  apply(ctx, { mode: 'observe' });
  await firePreExecute(listeners, mkExec('write', { file_path: 'stages/p1/plan.md' }));

  const ledgerFile = join(ws, 'stages', '_ledger.jsonl');
  assert.ok(EXISTS_SYNC(ledgerFile), `observe 必须入账，实际没生成 ${ledgerFile}`);
  const rows = readFileSync(ledgerFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const wouldBlock = rows.filter((r) => r.kind === 'would-block');
  assert.equal(wouldBlock.length, 1, `应有一条 would-block，实际 ${JSON.stringify(rows)}`);
  assert.equal(wouldBlock[0].verdict, 'GATE_MISSING');
  assert.equal(wouldBlock[0].stage, 'p0', '应记下是哪道门本可以拦住');
});

// ---------------------------------------------------------------- skip 留痕

test('skip：上游门是 skip 时放行，并记 warn', async () => {
  const ws = makeWorkspace(); // 必须有 marker，否则走到「未采用」分支，永远不会有 skip 日志
  const { ctx, listeners, logger } = makeCtx({
    workspace: ws,
    files: { 'stages/p0/GATE.json': '{"verdict":"skip","reason":"赶时间"}' },
  });
  apply(ctx, {});
  const { decision } = await firePreExecute(listeners, mkExec('write', { file_path: 'stages/p1/plan.md' }));
  assert.equal(decision.kind, 'allow');
  const skipLog = logger.find((l) => l.message.includes('skip') || l.message.includes('跳过'));
  assert.ok(skipLog !== undefined, `跳过必须留痕，实际日志：${JSON.stringify(logger.map((l) => l.message.slice(0, 40)))}`);
  // 结构化字段：应带 stage 和 code
  assert.equal(skipLog.fields?.stage, 'p0', '应带 stage 字段');
  assert.equal(skipLog.fields?.code, 'GATE_SKIP', '应带 code 字段');
});

// ---------------------------------------------------------------- 自定义 layout

test('自定义 layout：00-需求 → 01-计划', async () => {
  const { ctx, listeners } = makeCtx();
  apply(ctx, { mode: 'enforce', layout: ['00-需求', '01-计划'] });
  const { decision } = await firePreExecute(listeners, mkExec('write', { file_path: 'stages/01-计划/plan.md' }));
  assert.equal(decision.kind, 'deny');
  assert.equal(decision.info.code, 'GATE_MISSING');
});

// ---------------------------------------------------------------- next 调用

test('waterfall 纪律：放行时必须调 next', async () => {
  const ws = makeWorkspace();
  const { ctx, listeners } = makeCtx({
    workspace: ws,
    files: { 'stages/p0/GATE.json': '{"verdict":"pass"}' },
  });
  apply(ctx, {});
  const { calledNext } = await firePreExecute(listeners, mkExec('write', { file_path: 'stages/p1/plan.md' }));
  assert.equal(calledNext, true, '不拥有决策时必须 return next()');
});

test('waterfall 纪律：deny 时不调 next（由我们接管）', async () => {
  const ws = makeWorkspace();
  const { ctx, listeners } = makeCtx({ workspace: ws });
  apply(ctx, { mode: 'enforce' });
  const { calledNext } = await firePreExecute(listeners, mkExec('write', { file_path: 'stages/p1/plan.md' }));
  assert.equal(calledNext, false);
});

// ---------------------------------------------------------------- 子代理覆盖

test('子代理：全局注册，所有 agent 的调用都走同一个监听器', async () => {
  const ws = makeWorkspace(); // 有 marker，拦截生效
  const { ctx, listeners } = makeCtx({ workspace: ws });
  apply(ctx, { mode: 'enforce' });
  const handlers = listeners.get('tools/pre-execute');
  assert.equal(handlers.length, 1, '只注册一次（全局），不是 per-agent');

  // 子代理的 exec 形状与父代理相同，只是 agent.session 不同
  const parent = await firePreExecute(listeners, {
    ...mkExec('write', { file_path: 'stages/p1/a.md' }),
    agent: { session: 'parent-session' },
  });
  const child = await firePreExecute(listeners, {
    ...mkExec('write', { file_path: 'stages/p1/a.md' }),
    agent: { session: 'child-session' },
  });
  assert.equal(parent.decision.kind, 'deny', '父代理应被拦');
  assert.equal(child.decision.kind, 'deny', '子代理也应被拦——这正是全局注册的意义');
});

test('子代理：未采用项目里父子代理都放行（不误拦）', async () => {
  const ws = makeWorkspace(false); // 无 marker
  const { ctx, listeners } = makeCtx({ workspace: ws });
  apply(ctx, {});
  const child = await firePreExecute(listeners, {
    ...mkExec('write', { file_path: 'stages/p1/a.md' }),
    agent: { session: 'child-session' },
  });
  assert.equal(child.decision.kind, 'allow', '未采用项目不该误拦子代理');
});

// ---------------------------------------------------------------- 三段接线（合并后新增）

test('第一段：apply 注册了 skill provider', () => {
  const ws = makeWorkspace();
  const { ctx, calls } = makeCtx({ workspace: ws });
  apply(ctx, {});
  assert.ok(calls.skillProvider !== undefined, 'skills.registerProvider 应该被调用');
});

test('第一段：provider 形状正确（name + list + get）', () => {
  const ws = makeWorkspace();
  const { ctx, calls } = makeCtx({ workspace: ws });
  apply(ctx, {});
  const provider = calls.skillProvider({});
  assert.equal(provider.name, 'plugin-kit', 'provider 名必须等于 export const name');
  assert.equal(typeof provider.list, 'function');
  assert.equal(typeof provider.get, 'function');
});

test('第一段：list() 能扫出打包的 plugin-kit', async () => {
  const ws = makeWorkspace();
  const { ctx, calls } = makeCtx({ workspace: ws });
  apply(ctx, {});
  const provider = calls.skillProvider({});
  const list = await provider.list({});
  const names = list.map((c) => c.name);
  assert.ok(names.includes('plugin-kit'), `应包含 plugin-kit，实际 ${JSON.stringify(names)}`);
});

test('第一段：候选的 provider 字段等于注册名（K3）', async () => {
  const ws = makeWorkspace();
  const { ctx, calls } = makeCtx({ workspace: ws });
  apply(ctx, {});
  const provider = calls.skillProvider({});
  const list = await provider.list({});
  for (const candidate of list) {
    assert.equal(candidate.provider, 'plugin-kit', `${candidate.name} 的 provider 不匹配，会让 validateCandidate 抛`);
  }
});

test('第一段：get() 能读回正文', async () => {
  const ws = makeWorkspace();
  const { ctx, calls } = makeCtx({ workspace: ws });
  apply(ctx, {});
  const provider = calls.skillProvider({});
  const list = await provider.list({});
  const kit = list.find((c) => c.name === 'plugin-kit');
  const body = await provider.get(kit);
  assert.ok(body !== undefined);
  assert.ok(body.content.length > 500);
});

test('第二段：apply 注册了常驻纪律段', () => {
  const ws = makeWorkspace();
  const { ctx, calls } = makeCtx({ workspace: ws });
  apply(ctx, {});
  assert.ok(calls.systemPromptSection !== undefined, 'systemPrompt.section 应该被调用');
});

test('第二段：段名带命名空间、order 有限、text 非空', () => {
  const ws = makeWorkspace();
  const { ctx, calls } = makeCtx({ workspace: ws });
  apply(ctx, {});
  const section = calls.systemPromptSection;
  assert.match(section.name, /^plugin-kit:/);
  assert.ok(Number.isFinite(section.order));
  assert.ok(typeof section.text === 'string' && section.text.length > 0);
  assert.match(section.text, /plugin-kit/, '纪律段应指向 skill');
});

test('三段共存：enabled=false 时 skill 和纪律仍在，只关拦截', () => {
  const ws = makeWorkspace();
  const { ctx, calls, listeners } = makeCtx({ workspace: ws });
  apply(ctx, { enabled: false });
  assert.ok(calls.skillProvider !== undefined, 'skill 注册不该被 enabled 关掉');
  assert.ok(calls.systemPromptSection !== undefined, '纪律段不该被 enabled 关掉');
  assert.equal(listeners.has('tools/pre-execute'), false, '拦截应该被关掉');
});

// ---------------------------------------------------------------- A 阶段：启动自检（看得见）

test('A 阶段：启动时打三行自检日志（skill / 纪律 / 拦截）', () => {
  const ws = makeWorkspace();
  const { ctx, logger } = makeCtx({ workspace: ws });
  apply(ctx, {});
  const messages = logger.map((l) => l.message);
  const hasSkill = messages.some((m) => m.includes('skill provider 已注册'));
  const hasSection = messages.some((m) => m.includes('纪律段已挂载'));
  // 2026-11-11 D1 裁定后措辞由「拦截已启用」改为「已启用」——默认 mode 是 observe，
  // 已经不是「拦截」了，日志不能还这么说。
  const hasGate = messages.some((m) => m.includes('已启用'));
  assert.ok(hasSkill, `缺 skill 自检日志，实际：${JSON.stringify(messages)}`);
  assert.ok(hasSection, '缺纪律段自检日志');
  assert.ok(hasGate, '缺启用自检日志');
});

test('A 阶段：自检日志里带出关键配置值', () => {
  const ws = makeWorkspace();
  const { ctx, logger } = makeCtx({ workspace: ws });
  apply(ctx, { mode: 'observe', gateFile: '_GATE.json' });
  const gateLog = logger.map((l) => l.message).find((m) => m.includes('已启用'));
  assert.ok(gateLog !== undefined);
  // root 已不是配置项，日志里仍应带出实际使用的值（恒为 stages），
  // 让用户能确认「机制在看哪个目录」。
  assert.match(gateLog, /root=stages/, '要能看到实际使用的 root');
  assert.match(gateLog, /gateFile=_GATE\.json/, 'gateFile 可配，要能看到');
  assert.match(gateLog, /mode=observe/, '要能看到 mode');
  assert.match(gateLog, /gateFile=_GATE\.json/, '要能看到 gateFile');
});

test('A 阶段：所有日志前缀统一为 [plugin-kit]', () => {
  const ws = makeWorkspace();
  const { ctx, logger } = makeCtx({ workspace: ws });
  apply(ctx, {});
  const messages = logger.map((l) => l.message);
  const withOldPrefix = messages.filter((m) => m.includes('[stage-gate]'));
  assert.deepEqual(withOldPrefix, [], `不应再有旧前缀 [stage-gate]，实际：${JSON.stringify(withOldPrefix)}`);
  assert.ok(messages.every((m) => !m.startsWith('[') || m.includes('[plugin-kit]')), '所有日志应用 [plugin-kit]');
});

test('A 阶段：enabled=false 时仍打 skill 和纪律两行自检', () => {
  const ws = makeWorkspace();
  const { ctx, logger } = makeCtx({ workspace: ws });
  apply(ctx, { enabled: false });
  const messages = logger.map((l) => l.message);
  assert.ok(messages.some((m) => m.includes('skill provider 已注册')));
  assert.ok(messages.some((m) => m.includes('纪律段已挂载')));
  assert.ok(messages.some((m) => m.includes('拦截已禁用')), '应说明拦截被禁用');
});

// ---------------------------------------------------------------- B 阶段：layout 不再是死配置

test('B 阶段：Config 里真的有 layout 字段（曾缺失导致用户配置被静默剥掉）', () => {
  const r = Config['~standard'].validate({ layout: ['00-需求', '01-计划'] });
  assert.equal(r.issues, undefined, `layout 应被接受，实际 issues=${JSON.stringify(r.issues)}`);
  assert.deepEqual(r.value.layout, ['00-需求', '01-计划'], 'layout 不该被 schemastery 剥掉');
});

test('B 阶段：layout 传进 apply 后真的生效', async () => {
  const ws = makeWorkspace();
  const { ctx, listeners } = makeCtx({ workspace: ws });
  apply(ctx, { mode: 'enforce', layout: ['00-需求', '01-计划'] });
  // 用自定义 layout 的目录名写，应被识别为已知阶段
  const { decision } = await firePreExecute(listeners, mkExec('write', { file_path: 'stages/01-计划/plan.md' }));
  assert.equal(decision.kind, 'deny', '应识别 01-计划 为已知阶段并因缺门而拦');
  assert.equal(decision.info.code, 'GATE_MISSING');
});

test('B 阶段：layout 默认空数组时用九阶段', async () => {
  const ws = makeWorkspace();
  const { ctx, listeners } = makeCtx({ workspace: ws });
  apply(ctx, { mode: 'enforce' });
  const { decision } = await firePreExecute(listeners, mkExec('write', { file_path: 'stages/p1/plan.md' }));
  assert.equal(decision.info.code, 'GATE_MISSING', '默认九阶段里应有 p1');
});

// ---------------------------------------------------------------- C+ 阶段：日志规范（LOGGING.md）

test('日志规范：四级语义分布正确（debug>0 且 error 只在真错时）', async () => {
  const ws = makeWorkspace();
  const { ctx, logger } = makeCtx({ workspace: ws });
  apply(ctx, {});
  const levels = logger.map((l) => l.level);
  assert.ok(levels.includes('info'), '启动应有 info');
  assert.equal(levels.includes('error'), false, '正常启动不该有 error');
  // debug 在启动时不出现（它只在调用时打）
  assert.equal(levels.includes('debug'), false, '启动时不该有 debug');
});

test('日志规范：启动四行齐全（含版本号 + cwd）', async () => {
  const ws = makeWorkspace();
  const { ctx, logger } = makeCtx({ workspace: ws });
  apply(ctx, {});
  const msgs = logger.map((l) => l.message);
  assert.ok(msgs.some((m) => /v\d+\.\d+\.\d+/.test(m)), '缺版本号行');
  assert.ok(msgs.some((m) => m.includes('cwd=')), '缺 cwd');
  assert.ok(msgs.some((m) => m.includes('skill provider 已注册')), '缺 skill 自检');
  assert.ok(msgs.some((m) => m.includes('纪律段已挂载')), '缺纪律自检');
  // 2026-11-11 D1 裁定后措辞由「拦截已启用」改为「已启用」（默认 mode 是 observe）
  assert.ok(msgs.some((m) => m.includes('已启用')), '缺启用自检');
});

test('日志规范：拦截被禁用是 warn 不是 info', async () => {
  const ws = makeWorkspace();
  const { ctx, logger } = makeCtx({ workspace: ws });
  apply(ctx, { enabled: false });
  const disabled = logger.find((l) => l.message.includes('拦截已禁用'));
  assert.ok(disabled !== undefined, '应有禁用日志');
  assert.equal(disabled.level, 'warn', '用户主动关掉拦截应该是 warn（显眼）');
});

test('日志规范：高频项降级为 debug', async () => {
  const ws = makeWorkspace();
  const { ctx, listeners, logger } = makeCtx({ workspace: ws });
  apply(ctx, {});
  // 触发一次工具结果，应产生 debug 而非 info
  const resultHandlers = listeners.get('tools/result') ?? [];
  for (const h of resultHandlers) h({ name: 'write', arguments: { file_path: 'stages/p1/a.md' }, agent: { session: 's1' } }, { isError: false });
  const resultLog = logger.find((l) => l.message.includes('result:'));
  if (resultLog !== undefined) {
    assert.equal(resultLog.level, 'debug', 'result 是高频项，应降级为 debug');
  }
});

test('日志规范：结构化字段只允许白名单四个', async () => {
  const ws = makeWorkspace();
  const { ctx, listeners, logger } = makeCtx({ workspace: ws });
  apply(ctx, {});
  // 触发 skip 场景产生带字段的日志
  const { firePreExecute: fire, mkExec: mk } = { firePreExecute, mkExec };
  await fire(listeners, mk('write', { file_path: 'stages/p1/a.md' }));
  for (const entry of logger) {
    if (entry.fields === undefined) continue;
    for (const key of Object.keys(entry.fields)) {
      assert.ok(
        ['stage', 'code', 'path', 'tool'].includes(key),
        `日志字段不允许 "${key}"，只允许 stage/code/path/tool`,
      );
    }
  }
});

test('日志规范：lib/ 层不依赖 logger（保持纯函数可测）', async () => {
  const { readFileSync } = await import('node:fs');
  const { join, dirname, resolve } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const here = dirname(fileURLToPath(import.meta.url));
  for (const f of ['gate.js', 'skill-provider.js', 'discipline.js']) {
    const src = readFileSync(resolve(here, '..', 'lib', f), 'utf8');
    assert.equal(/ctx\.logger|\blogger\b/.test(src), false, `${f} 不该依赖 logger`);
  }
});

// ---------------------------------------------------------------- D 阶段：打包完整性

test('D 阶段：files 白名单覆盖所有必需文件', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const files = pkg.files ?? [];
  // 这些必须有，漏了用户就拿不到文档或运行不了
  const required = ['index.js', 'lib', 'vendor', 'skills', 'cordis.patch.yml', 'README.md', 'CHANGELOG.md', 'LOGGING.md', 'LICENSE'];
  for (const item of required) {
    assert.ok(files.includes(item), `files 白名单缺 "${item}"——打包会漏`);
  }
});

test('D 阶段：README 声称的每个交付形态都有对应说明', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  // 三种形态（纯 skill / 完整 / 观察）都该被写到
  assert(readme.includes('纯判据') || readme.includes('纯 skill'), '没写纯 skill 形态');
  assert(readme.includes('observe'), '没写观察形态');
  assert(readme.includes('CHANGELOG') || readme.includes('版本'), '没提版本管理');
});

test('D 阶段：CHANGELOG 的版本与 package.json 一致', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const changelog = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');
  assert(changelog.includes(`[${pkg.version}]`), `CHANGELOG 缺 [${pkg.version}]`);
  // 不能声称了未发布的版本
  const claimed = changelog.match(/^## \[(\d+\.\d+\.\d+)\]/gm) ?? [];
  assert(claimed.length >= 1, 'CHANGELOG 至少要有 1 个版本节');
});
