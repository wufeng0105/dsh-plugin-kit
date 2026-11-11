/**
 * README 断言核对 —— B 阶段「不骗人」。
 *
 * 目的：README 里每一条可验证的断言，都跑一遍，不能只读。
 *
 * 为什么单开一个文件：文档说的和代码做的不一致，是这个项目一直在批评的
 * 「空真」。README 自己也得被同样标准检查。
 *
 * 用法：node test/readme-claims.mjs
 * 退出码：0 全部成立 / 1 有断言不成立
 */

import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { apply, name, inject, Config } from '../index.js';
import { DEFAULT_LAYOUT, decide } from '../lib/gate.js';
import { SECTION_NAME, SECTION_ORDER, DISCIPLINE_TEXT } from '../lib/discipline.js';
import { PACKAGED_SKILL_RANK, DESCRIPTION_LIMIT, listSkills } from '../lib/skill-provider.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

/** 判据目录：包内 skills/plugin-kit/ 是唯一源（2026-11-10 起，不再有 .dsh 那棵）。 */
const SKILL_DIR = resolve(ROOT, 'skills', 'plugin-kit');

const results = [];
function claim(id, text, fn) {
  try {
    const detail = fn();
    results.push({ id, text, ok: true, detail });
    console.log(`PASS  ${id}  ${text}`);
  } catch (error) {
    results.push({ id, text, ok: false, detail: error.message });
    console.log(`FAIL  ${id}  ${text}`);
    console.log(`      ${error.message}`);
  }
}
async function claimAsync(id, text, fn) {
  try {
    const detail = await fn();
    results.push({ id, text, ok: true, detail });
    console.log(`PASS  ${id}  ${text}`);
  } catch (error) {
    results.push({ id, text, ok: false, detail: error.message });
    console.log(`FAIL  ${id}  ${text}`);
    console.log(`      ${error.message}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** 造一个桩 ctx，形状照真实契约。 */
function makeCtx({ workspace, files = {} } = {}) {
  const listeners = new Map();
  const logs = [];
  const calls = {};
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
    fs: {
      async resolve(p) {
        return p in files ? { displayPath: p, absPath: join(workspace, p) } : undefined;
      },
      async readText(t) {
        return files[t.displayPath] ?? null;
      },
    },
    workingDirectory: { get: () => workspace },
    get: () => undefined,
    skills: { registerProvider(create) { calls.skillProvider = create; return () => {}; } },
    systemPrompt: { section(s) { calls.systemPromptSection = s; return () => {}; } },
    effect(fn) { return fn(); },
  };
  return { ctx, listeners, logs, calls };
}

function makeWorkspace(adopted = true) {
  const dir = mkdtempSync(join(tmpdir(), 'readme-'));
  if (adopted) writeFileSync(join(dir, '.stage-gate.json'), '{"enabled":true}', 'utf8');
  return dir;
}

async function firePre(listeners, tool, args) {
  const handlers = listeners.get('tools/pre-execute') ?? [];
  let nextCalled = false;
  const next = async () => { nextCalled = true; return { kind: 'allow' }; };
  let decision = { kind: 'allow' };
  for (const h of handlers) {
    const r = await h({ name: tool, arguments: args, signal: { aborted: false }, agent: { session: 'readme-session' } }, next);
    if (r !== undefined) decision = r;
    if (decision.kind !== 'allow') break;
  }
  return { decision, nextCalled };
}

// ================================================================ 核对

console.log('README 断言核对（B 阶段：不骗人）\n');

// ---- 开头那句总述
await claimAsync('README:5', '装它 → skill 出现在目录 / 每会话有纪律提醒 / 未过门被拦', async () => {
  const ws = makeWorkspace();
  try {
    const { ctx, listeners, calls } = makeCtx({ workspace: ws });
    // 2026-11-11 D1 裁定：默认模式改为 observe，所以「会被拦住」现在要显式选 enforce。
    // README 第 3、5 行还写着「强制力（未过门拦截）」，那句要等 WP6 统一改；
    // 本文件只核对**代码能力**，不替 README 圆场。
    apply(ctx, { mode: 'enforce' });
    assert(calls.skillProvider !== undefined, 'skill provider 没注册');
    assert(calls.systemPromptSection !== undefined, '纪律段没挂');
    const { decision } = await firePre(listeners, 'write', { file_path: 'stages/p1/a.md' });
    assert(decision.kind === 'deny', '未过门没被拦');
    return '三项都成立（enforce 下）';
  } finally { rmSync(ws, { recursive: true, force: true }); }
});

// ---- 配置表六项
claim('README:97', 'enabled=true：只关拦截，skill 和纪律段仍生效', () => {
  const ws = makeWorkspace();
  try {
    const { ctx, listeners, calls } = makeCtx({ workspace: ws });
    apply(ctx, { enabled: false });
    assert(calls.skillProvider !== undefined, 'skill 没了');
    assert(calls.systemPromptSection !== undefined, '纪律段没了');
    assert(listeners.has('tools/pre-execute') === false, '拦截还在，应被关掉');
    return '成立';
  } finally { rmSync(ws, { recursive: true, force: true }); }
});

await claimAsync('README:98', 'mode=observe：只记日志不拦', async () => {
  const ws = makeWorkspace();
  try {
    const { ctx, listeners, logs } = makeCtx({ workspace: ws });
    apply(ctx, { mode: 'observe' });
    const { decision } = await firePre(listeners, 'write', { file_path: 'stages/p1/a.md' });
    assert(decision.kind === 'allow', 'observe 模式下不该真的拦');
    assert(logs.some(([, m]) => m.includes('observe')), '没有 observe 日志');
    return '成立';
  } finally { rmSync(ws, { recursive: true, force: true }); }
});

await claimAsync('README:99', 'root 已不是配置项，且塞进来也不生效', async () => {
  // 2026-11-11 D1 裁定：root 从 Config 移除（配错会静默关掉整个机制）。
  //
  // 关键实测：schemastery **不剥未声明字段**，所以 `validate({root:'x'})`
  // 仍会把 root 透传出来。只删 Schema 声明是**不够的**——
  // 真正让配置失效的是 `apply()` 里硬写 DEFAULT_ROOT、不读 config.root。
  // 所以这条断言分两半测：Schema 层没了，以及运行时也不认。
  const r = Config['~standard'].validate({ root: 'my-stages' });
  assert(r.issues === undefined, '塞 root 不该报错（未声明字段被忽略而不是拒绝）');

  // 运行时：apply 收到 root 也必须仍然按 stages 判
  const ws = makeWorkspace();
  try {
    const { ctx, listeners } = makeCtx({ workspace: ws });
    apply(ctx, { mode: 'enforce', root: 'my-stages' });
    // stages/p1 缺 p0 门 → 必须 deny；若 root 生效了，会因认不出而 allow
    const { decision } = await firePre(listeners, 'write', { file_path: 'stages/p1/a.md' });
    assert(
      decision.kind === 'deny' && decision.info.code === 'GATE_MISSING',
      `root 配了 my-stages，但机制必须仍按 stages 判定（实际 ${decision.kind}）——否则配错就静默放行`,
    );
    return '成立：Schema 已移除，且运行时硬用 stages';
  } finally { rmSync(ws, { recursive: true, force: true }); }
});

claim('README:100', 'layout 可配（曾缺失，现已补）', () => {
  const r = Config['~standard'].validate({ layout: ['00-需求', '01-计划'] });
  assert(r.issues === undefined, `layout 应被接受，实际 issues=${JSON.stringify(r.issues)}`);
  assert(r.value.layout.length === 2, 'layout 被剥掉了');
  return `成立：${JSON.stringify(r.value.layout)}`;
});

await claimAsync('README:100b', 'layout 生效后按自定义目录名判定', async () => {
  const r = decide({
    toolName: 'write',
    args: { file_path: 'stages/01-计划/plan.md' },
    root: 'stages',
    layout: ['00-需求', '01-计划'],
    readGate: () => null,
  });
  assert(r.kind === 'deny' && r.code === 'GATE_MISSING', `自定义 layout 应生效，实际 ${JSON.stringify(r)}`);
  return '成立';
});

claim('README:101', 'gateFile 可配', () => {
  const r = Config['~standard'].validate({ gateFile: '_GATE.json' });
  assert(r.value.gateFile === '_GATE.json', 'gateFile 没生效');
  return '成立';
});

// ---- 配置表（2026-11-11 D1 裁定后：allowedTools 已删，mode 默认 observe）
await claimAsync('README:102', 'allowedTools 已不再是配置项（拒绝被当成放行开关）', async () => {
  // 这条原先是「登记后未知工具放行」。allowedTools 随 UNKNOWN_WRITE_TOOL 一起删了，
  // 所以现在核对的是**反面**：塞进来也不产生任何效果。
  const ws = makeWorkspace();
  try {
    const withIt = makeCtx({ workspace: ws });
    apply(withIt.ctx, { mode: 'enforce', allowedTools: ['mystery_writer'] });
    const a = await firePre(withIt.listeners, 'mystery_writer', { path: 'stages/p1/a.md' });
    const without = makeCtx({ workspace: ws });
    apply(without.ctx, { mode: 'enforce' });
    const b = await firePre(without.listeners, 'mystery_writer', { path: 'stages/p1/a.md' });
    assert(a.decision.kind === b.decision.kind, `旧配置项改变了行为：${a.decision.kind} vs ${b.decision.kind}`);
    assert(a.decision.kind === 'allow', '未知工具现在一律放行');
    return '已删除，且残余配置不生效';
  } finally { rmSync(ws, { recursive: true, force: true }); }
});

await claimAsync('README:102b', '未知工具即使未登记也不被拦（D1 裁定）', async () => {
  const ws = makeWorkspace();
  try {
    const { ctx, listeners } = makeCtx({ workspace: ws });
    apply(ctx, { mode: 'enforce' });
    const { decision } = await firePre(listeners, 'mystery_writer', { path: 'stages/p1/a.md' });
    assert(decision.kind === 'allow', `未知工具应放行，实际 ${decision.kind}`);
    return '成立：不再按工具身份判罪';
  } finally { rmSync(ws, { recursive: true, force: true }); }
});

// ---- 默认值
claim('README:71', '默认九阶段：p0 p1 p1.5 p2 p3 p3b p3.5 p4 p5', () => {
  const expected = ['p0', 'p1', 'p1.5', 'p2', 'p3', 'p3b', 'p3.5', 'p4', 'p5'];
  assert(JSON.stringify([...DEFAULT_LAYOUT]) === JSON.stringify(expected), `实际：${JSON.stringify([...DEFAULT_LAYOUT])}`);
  return `成立：${expected.join(' ')}`;
});

// ---- marker 行为
await claimAsync('README:152', '无 marker → 拦截不生效', async () => {
  const ws = makeWorkspace(false);
  try {
    const { ctx, listeners } = makeCtx({ workspace: ws });
    apply(ctx, {});
    const { decision } = await firePre(listeners, 'write', { file_path: 'stages/p1/a.md' });
    assert(decision.kind === 'allow', '无 marker 时不该拦');
    return '成立';
  } finally { rmSync(ws, { recursive: true, force: true }); }
});

await claimAsync('README:152b', '有 marker → 拦截生效', async () => {
  const ws = makeWorkspace(true);
  try {
    const { ctx, listeners } = makeCtx({ workspace: ws });
    // D1 裁定后默认是 observe，所以「拦截生效」必须显式选 enforce。
    // marker 仍是必要的：没有它，enforce 也不管（机制只约束愿意进约定目录的项目）。
    apply(ctx, { mode: 'enforce' });
    const { decision } = await firePre(listeners, 'write', { file_path: 'stages/p1/a.md' });
    assert(decision.kind === 'deny', '有 marker 且 enforce 时应拦');
    return '成立';
  } finally { rmSync(ws, { recursive: true, force: true }); }
});

await claimAsync('README:152c', '有 marker 但默认 observe → 不拦，只入账', async () => {
  // 默认值改了，README:152 的「拦截生效」不再是无条件的。这条把差别写进断言：
  // 同样的项目、同样的调用，只有 mode 不同，结果不同。
  const ws = makeWorkspace(true);
  try {
    const { ctx, listeners } = makeCtx({ workspace: ws });
    apply(ctx, {});
    const { decision } = await firePre(listeners, 'write', { file_path: 'stages/p1/a.md' });
    assert(decision.kind === 'allow', '默认 observe 不该拦');
    const rows = readFileSync(join(ws, 'stages', '_ledger.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert(rows.some((r) => r.kind === 'would-block'), '默认模式下必须留下 would-block 记录');
    return '成立：默认 observe，本可以拦住已入账';
  } finally { rmSync(ws, { recursive: true, force: true }); }
});

// ---- skill 相关
await claimAsync('README:137', '包内 skill 能被扫出且 description 合规', async () => {
  const list = await listSkills({ root: join(ROOT, 'skills'), provider: name });
  const kit = list.find((c) => c.name === 'plugin-kit');
  assert(kit !== undefined, '扫不出 plugin-kit');
  assert(kit.description.length <= DESCRIPTION_LIMIT, `description 超限：${kit.description.length}`);
  assert(kit.rank === PACKAGED_SKILL_RANK, `rank 不对：${kit.rank}`);
  return `成立：rank=${kit.rank} desc=${kit.description.length}`;
});

// ---- 纪律段
claim('README:5b', '纪律段是条件句且有内容', () => {
  assert(DISCIPLINE_TEXT.length > 100, '纪律段太短');
  assert(DISCIPLINE_TEXT.includes('.stage-gate.json'), '没提 marker');
  assert(Number.isFinite(SECTION_ORDER), 'order 不是有限数');
  assert(SECTION_NAME.startsWith('plugin-kit:'), '段名没命名空间');
  return `成立：${DISCIPLINE_TEXT.length} 字符`;
});

// ---- 日志（A 阶段新加）
await claimAsync('A:自检', '启动打三行自检日志', async () => {
  const ws = makeWorkspace();
  try {
    const { ctx, logs } = makeCtx({ workspace: ws });
    apply(ctx, {});
    const msgs = logs.map(([, m]) => m);
    assert(msgs.some((m) => m.includes('skill provider 已注册')), '缺 skill 自检');
    assert(msgs.some((m) => m.includes('纪律段已挂载')), '缺纪律自检');
    // 2026-11-11 D1 裁定后措辞由「拦截已启用」改为「已启用」（默认 mode 是 observe）
    assert(msgs.some((m) => m.includes('已启用')), '缺启用自检');
    return '成立';
  } finally { rmSync(ws, { recursive: true, force: true }); }
});

// ---- 三形态
claim('README:120', '装包必然带拦截能力（无设置页可只开一部分）', () => {
  // 反证：不存在任何配置能让「skill 有、纪律有、拦截彻底不存在」
  const r = Config['~standard'].validate({ enabled: false });
  assert(r.issues === undefined, 'enabled 应可配');
  // enabled=false 只是关拦截，但拦截能力仍编译在包里
  const src = readFileSync(join(ROOT, 'index.js'), 'utf8');
  assert(src.includes("ctx.on('tools/pre-execute'"), '拦截代码应存在于包内');
  return '成立：拦截能力常驻包内，enabled=false 是运行期关掉';
});

// ---- D 阶段：生命周期文档的承诺

claim('D:版本号', 'README/CHANGELOG 声称的版本与实际 package.json 一致', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert(typeof pkg.version === 'string' && /^\d+\.\d+\.\d+$/.test(pkg.version), `版本号格式不对：${pkg.version}`);
  const changelog = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');
  assert(changelog.includes(`[${pkg.version}]`), `CHANGELOG 里没有 [${pkg.version}] 这一节`);
  return `v${pkg.version}`;
});

claim('D:engines', 'package.json 声明了 dsh 版本范围', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert(typeof pkg.engines?.dsh === 'string' && pkg.engines.dsh.length > 0, '缺 engines.dsh');
  return pkg.engines.dsh;
});

claim('D:卸载', 'README 写清了卸载后不删哪些东西', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  assert(readme.includes('卸载'), '没卸载章节');
  assert(readme.includes('.stage-gate.json'), '没说明 marker 保留');
  assert(readme.includes('_ledger.jsonl'), '没说明台账保留');
  return 'marker + 台账都说明了';
});

claim('D:迁移', 'README 写清了从旧包名迁移要先卸后装', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  assert(readme.includes('dsh-stage-gate'), '没提旧包名');
  assert(/先卸|卸旧|remove.*stage-gate/.test(readme), '没说要先卸旧');
  return '有迁移顺序';
});

claim('D:升级', 'README 说明升级后怎么确认成功', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  assert(/版本号会变|确认升级成功/.test(readme), '没说明怎么确认升级成功');
  return '有确认方式';
});

claim('D:启动日志一致', 'README 里的启动四行与代码实际输出一致', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const src = readFileSync(join(ROOT, 'index.js'), 'utf8');
  // README 声称的四行，关键词应在代码里都能找到。
  // 2026-11-11 D1 裁定：「拦截已启用」改为「已启用」（默认 mode 是 observe，
  // 已经不是「拦截」了，日志不能还这么说）。README 那句要等 WP6 统一改，
  // 所以这里只核代码侧的措辞，README 侧放宽到「已启用」。
  for (const key of ['已加载', 'skill provider 已注册', '纪律段已挂载']) {
    assert(readme.includes(key), `README 里没写「${key}」这行`);
    assert(src.includes(key), `代码里没有「${key}」这行——文档和实现不一致`);
  }
  assert(src.includes('已启用'), '代码里没有「已启用」这行');
  assert(readme.includes('已启用') || readme.includes('拦截已启用'), 'README 里没写启用那行');
  return '四行都对得上';
});

// ---- 一致性审计（2026-11-09）发现的 9 条不一致，逐条变成断言
// 注意：本文件的 assert 是自定义函数 assert(cond, msg)，不是 node:assert 模块。

claim('M1a', 'SKILL.md 开头摘要不能说「运行时它验不了」（与正文冲突）', () => {
  const skill = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');
  const head = skill.slice(0, 2000);
  assert(
    !/运行时它验不了/.test(head),
    'SKILL.md 开头仍写着「运行时它验不了」，但正文已改为「机制已可用」——改一处留一处',
  );
  return '开头摘要无残句';
});

claim('M1b', 'evidence.md 不能把「运行时它验不了」当作现行结论', () => {
  const ev = readFileSync(join(SKILL_DIR, 'references', 'evidence.md'), 'utf8');
  // 允许它作为「曾经的判断、现已失效」被引用（那是有价值的记录），
  // 不允许它作为现行结论存在：即出现时，同一段附近必须有「已不再成立 / 原先」这类标记。
  if (/运行时它验不了/.test(ev)) {
    assert(
      /已不再成立|原先这里写|随着产品形态变化而失效/.test(ev),
      'evidence.md 仍把「运行时它验不了」当现行结论——要么删，要么明确标为已失效',
    );
  }
  return '无未标记的残句';
});

claim('M1c', '同一文件内不能同时说「验不了」和「已可用」', () => {
  const skill = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');
  const saysCant = /运行时它验不了/.test(skill);
  const saysOk = /机制已可用/.test(skill);
  assert(!(saysCant && saysOk), '同一文件里两种说法并存');
  return '无并存';
});

claim('M5', 'README 必须告诉用户 debug 日志默认被过滤', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  assert(
    /过滤|阈值/.test(readme),
    'README 只写了「debug 排查时才看」，没写「默认被宿主过滤」——用户会把「没日志」误判成「插件没运行」',
  );
  return '已说明过滤';
});

claim('M6', '双树一致性测试不得在权威源缺失时恒真跳过（空真排除）', () => {
  const src = readFileSync(join(ROOT, 'test', 'skill-provider.test.mjs'), 'utf8');
  assert(
    !/assert\.ok\(true,/.test(src),
    '双树测试在权威源缺失时用 assert.ok(true) 恒真通过——正是铁律「空真排除」要禁的写法',
  );
  return '无常真跳过';
});

claim('M7', 'README 必须覆盖 SKILL.md 的三种执行方式（含 AGENTS.md）', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const skill = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');
  if (/AGENTS\.md/.test(skill)) {
    assert(/AGENTS\.md/.test(readme), 'SKILL.md 把 AGENTS.md 列为一种执行方式，README 完全没提');
  }
  return '已覆盖';
});

claim('M8', 'CHANGELOG 必须记录卸载行为', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const changelog = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');
  if (/卸载后/.test(readme)) {
    assert(/卸载/.test(changelog), 'README 承诺了卸载行为，CHANGELOG 里一次都没提');
  }
  return 'CHANGELOG 有记录';
});

claim('M9', 'SKILL.md 引用的每个路径都必须存在', () => {
  const skill = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');
  const links = [...skill.matchAll(/\]\(([^)]+\.(?:md|mjs|json))\)/g)].map((mm) => mm[1]);
  const missing = links.filter((rel) => !existsSync(join(SKILL_DIR, rel)));
  assert(missing.length === 0, 'SKILL.md 引用了不存在的路径：' + JSON.stringify(missing));
  return links.length + ' 个引用全部存在';
});

// ---- 真机验证存证（2026-11-09 补）

claim('E2E1', '真机验证脚本存在且可执行', () => {
  assert(existsSync(join(ROOT, 'test', 'e2e', 'run.mjs')), 'test/e2e/run.mjs 不存在');
  return '存在';
});

claim('E2E2', 'evidence/ 里至少有一份真机验证存证', () => {
  const dir = join(ROOT, 'evidence');
  assert(existsSync(dir), 'evidence/ 目录不存在');
  const files = readdirSync(dir).filter((f) => f.endsWith('-real-host.md'));
  assert(files.length > 0, '没有 *-real-host.md 存证');
  return files.join(', ');
});

claim('E2E3', '每份存证都带环境指纹（Node / DSH / 时间）', () => {
  const dir = join(ROOT, 'evidence');
  const files = readdirSync(dir).filter((f) => f.endsWith('-real-host.md'));
  for (const f of files) {
    const content = readFileSync(join(dir, f), 'utf8');
    // 新格式：环境信息在「最近一次」段落里以「环境：Node vX / DSH Y」形式给出，
    // 复跑历史表里也有同样的环境列。两种写法都接受。
    assert(/Node v\d/.test(content), f + ' 缺 Node 版本');
    assert(/DSH [\w.-]+/.test(content), f + ' 缺 DSH 版本');
    assert(/\d{2}:\d{2}:\d{2}/.test(content), f + ' 缺时间戳');
  }
  return files.length + ' 份都有';
});

claim('E2E4', 'README 必须说明真机验证怎么复跑', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  assert(/test\/e2e\/run\.mjs/.test(readme), 'README 没写复跑命令');
  assert(/SN_API_KEY/.test(readme), 'README 没说要 API key');
  return '有复跑说明';
});

claim('E2E5', '无 key 时脚本必须 SKIP 而不是伪装通过', () => {
  const src2 = readFileSync(join(ROOT, 'test', 'e2e', 'run.mjs'), 'utf8');
  assert(/缺少 SN_API_KEY/.test(src2), '脚本没写缺 key 时的处理');
  assert(/这不是通过/.test(src2), '脚本没说清「SKIP 不是通过」');
  assert(/exitCode = 2/.test(src2), '缺 key 应返回退出码 2 以区别于失败');
  return 'SKIP 语义清楚';
});

claim('E2E6', 'evidence/ 和 test/e2e 必须**不**在 files 白名单里（证据不进 npm 包）', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const files = pkg.files ?? [];
  // 2026-11 决策：证据（audits/ledger/impl.tgz 约 1.9MB）和验证脚本留在源码仓库，
  // 不进 npm 包——用户装包只需要运行需要的文件。README 用 GitHub URL 指向它们。
  assert(!files.includes('evidence'), 'files 含 evidence——1.9MB 证据会被打进 npm 包');
  assert(!files.includes('test/e2e'), 'files 含 test/e2e——验证脚本不该进包');
  return '都正确排除';
});

// ================================================================ 汇总

const failed = results.filter((r) => !r.ok);
console.log('');
console.log(`${results.length - failed.length} / ${results.length} 条成立`);
if (failed.length > 0) {
  console.log('\n不成立的断言：');
  for (const f of failed) console.log(`  ${f.id}  ${f.text}\n    ${f.detail}`);
}
process.exitCode = failed.length === 0 ? 0 : 1;

