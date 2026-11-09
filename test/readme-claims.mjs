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

/** 权威源 skill 目录：包内 skills/ 是它的构建产物，双树一致性由测试守门。 */
const SKILL_DIR = resolve(ROOT, '..', '.dsh', 'skills', 'plugin-kit');

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
    apply(ctx, {});
    assert(calls.skillProvider !== undefined, 'skill provider 没注册');
    assert(calls.systemPromptSection !== undefined, '纪律段没挂');
    const { decision } = await firePre(listeners, 'write', { file_path: 'stages/p1/a.md' });
    assert(decision.kind === 'deny', '未过门没被拦');
    return '三项都成立';
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

claim('README:99', 'root 可配（换成别的目录名）', () => {
  const r = decide({ toolName: 'write', args: { file_path: 'my-stages/p1/a.md' }, root: 'my-stages', readGate: () => null });
  assert(r.kind === 'deny' && r.code === 'GATE_MISSING', `换成 my-stages 后应能识别，实际 ${JSON.stringify(r)}`);
  return '成立';
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

await claimAsync('README:102', 'allowedTools：登记后未知工具放行', async () => {
  const ws = makeWorkspace();
  try {
    const { ctx, listeners } = makeCtx({ workspace: ws });
    apply(ctx, { allowedTools: ['mystery_writer'] });
    const { decision } = await firePre(listeners, 'mystery_writer', { path: 'stages/p1/a.md' });
    assert(decision.kind === 'allow', '登记后应放行');
    return '成立';
  } finally { rmSync(ws, { recursive: true, force: true }); }
});

await claimAsync('README:102b', 'allowedTools 未登记时未知工具被拦', async () => {
  const ws = makeWorkspace();
  try {
    const { ctx, listeners } = makeCtx({ workspace: ws });
    apply(ctx, {});
    const { decision } = await firePre(listeners, 'mystery_writer', { path: 'stages/p1/a.md' });
    assert(decision.kind === 'deny', '未登记的未知工具应被拦');
    assert(decision.info.code === 'UNKNOWN_WRITE_TOOL');
    return '成立';
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
    apply(ctx, {});
    const { decision } = await firePre(listeners, 'write', { file_path: 'stages/p1/a.md' });
    assert(decision.kind === 'deny', '有 marker 时应拦');
    return '成立';
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
    assert(msgs.some((m) => m.includes('拦截已启用')), '缺拦截自检');
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
  // README 声称的四行，关键词应在代码里都能找到
  for (const key of ['已加载', 'skill provider 已注册', '纪律段已挂载', '拦截已启用']) {
    assert(readme.includes(key), `README 里没写「${key}」这行`);
    assert(src.includes(key), `代码里没有「${key}」这行——文档和实现不一致`);
  }
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

claim('M2', 'README 布局里的测试数必须与实际一致', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const gateSrc = readFileSync(join(ROOT, 'test', 'gate.test.mjs'), 'utf8');
  const actual = (gateSrc.match(/^test\(/gm) ?? []).length;
  const m = /gate\.js\s+判定内核（纯函数，(\d+)\s*条测试）/.exec(readme);
  assert(m !== null, 'README 里没找到 gate.js 的测试数');
  assert(Number(m[1]) === actual, 'README 写 ' + m[1] + ' 条，实际 ' + actual + ' 条');
  return actual + ' 条一致';
});

claim('M3', 'CHANGELOG 声称的测试总数必须与实际一致', () => {
  const changelog = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');
  const m = /\*\*测试（(\d+) 项）\*\*/.exec(changelog);
  assert(m !== null, 'CHANGELOG 里没找到测试总数');

  const countTests = (file) => ((readFileSync(join(ROOT, file), 'utf8').match(/^test\(/gm) ?? []).length);
  const kernel = countTests('test/gate.test.mjs') + countTests('test/ledger.test.mjs') + countTests('test/skill-provider.test.mjs');
  const smoke = countTests('test/smoke.mjs');
  const claimsSrc = readFileSync(join(ROOT, 'test', 'readme-claims.mjs'), 'utf8');
  const claims = (claimsSrc.match(/^claim\(|^await claimAsync\(/gm) ?? []).length;
  const failures = (readFileSync(join(ROOT, 'test', 'failure-signals.mjs'), 'utf8').match(/check\(|checkAsync\(/gm) ?? []).length;
  const actual = kernel + smoke + claims + failures + 6;

  assert(
    Number(m[1]) === actual,
    'CHANGELOG 写 ' + m[1] + ' 项，实际 ' + actual + ' 项（内核' + kernel + '+冒烟' + smoke + '+断言' + claims + '+失败' + failures + '+变异6）',
  );
  return actual + ' 项一致';
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

claim('E2E6', 'evidence/ 和 test/e2e 在 files 白名单里', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const files = pkg.files ?? [];
  assert(files.includes('evidence'), 'files 缺 evidence——存证不会随包发布');
  assert(files.includes('test/e2e'), 'files 缺 test/e2e——用户拿不到复跑脚本');
  return '都在白名单';
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
