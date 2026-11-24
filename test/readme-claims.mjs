/**
 * README 断言核对 —— 文档说的和代码做的一致。
 *
 * 目的：README 里每一条可验证的断言，都跑一遍，不能只读。
 *
 * 用法：node test/readme-claims.mjs
 * 退出码：0 全部成立 / 1 有断言不成立
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import { apply, name, inject } from '../index.js';
import { PACKAGED_SKILL_RANK, DESCRIPTION_LIMIT, listSkills } from '../lib/skill-provider.js';

const assert = {
  ok(cond, msg) { if (!cond) throw new Error(msg); },
  equal(a, b, msg) { if (a !== b) throw new Error(msg ?? `${a} !== ${b}`); },
  deepEqual(a, b, msg) {
    const ja = JSON.stringify(a);
    const jb = JSON.stringify(b);
    if (ja !== jb) throw new Error(msg ?? `${ja} !== ${jb}`);
  },
};

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
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

function makeCtx() {
  const calls = {};
  const ctx = {
    on() { throw new Error('新形态不注册任何事件监听器——这个 ctx.on 不该被调用'); },
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    workingDirectory: { get: () => undefined },
    get: () => undefined,
    skills: { registerProvider(create) { calls.skillProvider = create; return () => {}; } },
    systemPrompt: { section() { throw new Error('纪律段已退役——systemPrompt.section 不该被调用'); } },
    effect(fn) { return fn(); },
  };
  return { ctx, calls };
}

console.log('README 断言核对\n');

// ---- 骨架技术契约（2026-11-24：模板的 engines 曾比本包自己的下界还旧）
claim('模板:engines 不低于本包', 'template/package.json 的 dsh 下界不得低于根 package.json', () => {
  const root = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const tpl = JSON.parse(readFileSync(join(SKILL_DIR, 'template', 'package.json'), 'utf8'));
  const verOf = (range) => {
    const m = /^>=(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)/.exec(String(range ?? ''));
    return m === null ? null : m[1];
  };
  const rootVer = verOf(root.engines?.dsh);
  const tplVer = verOf(tpl.engines?.dsh);
  assert.ok(rootVer !== null, `根 engines.dsh 无法解析：${root.engines?.dsh}`);
  assert.ok(tplVer !== null, `模板 engines.dsh 无法解析：${tpl.engines?.dsh}`);
  // 骨架是本包分发的产物，不该承诺本包自己都不支持的宿主版本。
  const cmp = (a, b) => {
    const pa = a.split(/[.-]/).map((x) => (/^\d+$/.test(x) ? Number(x) : x));
    const pb = b.split(/[.-]/).map((x) => (/^\d+$/.test(x) ? Number(x) : x));
    for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
      const x = pa[i] ?? 0;
      const y = pb[i] ?? 0;
      if (x === y) continue;
      if (typeof x === 'number' && typeof y === 'number') return x < y ? -1 : 1;
      return String(x) < String(y) ? -1 : 1;
    }
    return 0;
  };
  assert.ok(cmp(tplVer, rootVer) >= 0, `模板要求 dsh >=${tplVer}，低于本包的 >=${rootVer}`);
  return `模板 >=${tplVer} ≥ 本包 >=${rootVer}`;
});

// ---- 脚本指路可解析（2026-11-24：preflight 曾把用户指向已退役的 P3.5 章节）
claim('保鲜:脚本指路可解析', '随包脚本里「见 plugin-kit skill 的 X」必须能在 SKILL.md 找到同名节', () => {
  const skill = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');
  const scriptsDir = join(SKILL_DIR, 'scripts');
  const bad = [];
  for (const f of readdirSync(scriptsDir).filter((n) => n.endsWith('.mjs'))) {
    const src = readFileSync(join(scriptsDir, f), 'utf8');
    for (const m of src.matchAll(/plugin-kit skill 的[「']?([\u4e00-\u9fa5A-Za-z0-9._]+)/g)) {
      const section = m[1];
      if (!skill.includes(section)) bad.push(`${f} → 「${section}」`);
    }
  }
  assert.ok(bad.length === 0, '脚本把用户指向 SKILL.md 里不存在的章节：' + JSON.stringify(bad));
  return '全部可解析';
});

// ---- 导出面
claim('导出面', 'index.js 导出 name=plugin-kit / inject=[skills] / apply', () => {
  assert.equal(name, 'plugin-kit');
  assert.deepEqual(inject, ['skills']);
  assert.equal(typeof apply, 'function');
  return '成立';
});

// ---- 接线形态
claim('接线:skill', 'apply 注册 skill provider（唯一接缝）', () => {
  const { ctx, calls } = makeCtx();
  apply(ctx);
  assert.ok(calls.skillProvider !== undefined, 'skill provider 没注册');
  const provider = calls.skillProvider({});
  assert.equal(provider.name, 'plugin-kit');
  assert.equal(typeof provider.list, 'function');
  assert.equal(typeof provider.get, 'function');
  return '成立';
});

claim('接线:零监听', '新形态不挂 pre-execute / tools-result / systemPrompt（ADR 0001-0003）', () => {
  const { ctx } = makeCtx();
  // makeCtx 的 on / systemPrompt.section 会 throw——apply 正常返回 = 没调用它们
  apply(ctx);
  return '成立（on 与 section 未被触发）';
});

// ---- 判据完整性
await claimAsync('判据:可扫出', '包内 skill 能被扫出且 description 合规', async () => {
  const list = await listSkills({ root: join(ROOT, 'skills'), provider: name });
  const kit = list.find((c) => c.name === 'plugin-kit');
  assert.ok(kit !== undefined, '扫不出 plugin-kit');
  assert.ok(kit.description.length > 0 && kit.description.length <= DESCRIPTION_LIMIT, `description 长度 ${kit.description.length}`);
  assert.equal(kit.rank, PACKAGED_SKILL_RANK);
  return `成立：rank=${kit.rank} desc=${kit.description.length}`;
});

claim('判据:零旧词', 'SKILL.md 不再宣称退役机制（拦截/台账/纪律段/marker）', () => {
  const skill = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');
  const banned = [
    [/tools\/pre-execute/, '拦截接缝'],
    [/_ledger\.jsonl/, '台账文件'],
    [/systemPrompt/, '纪律段接缝'],
    [/.stage-gate\.json/, 'marker'],
    [/GATE\.json/, '门记录'],
  ];
  for (const [re, label] of banned) {
    assert.ok(!re.test(skill), `SKILL.md 还在提退役的${label}（CONTEXT.md 标退役的词不该出现在现行判据正文）`);
  }
  return '五个退役词清零';
});

claim('判据:新词在位', 'SKILL.md 含新核心目标的三要素（契约三步/preflight/保鲜）', () => {
  const skill = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');
  assert.ok(/cordis_inspect_query/.test(skill), '缺 inspect 权威源表述');
  assert.ok(/host-skills\/dsh-doc/.test(skill), '缺文档副本指路');
  assert.ok(/preflight\.mjs/.test(skill), '缺 preflight 指路');
  assert.ok(/recheck\.mjs/.test(skill), '缺 recheck 指路');
  assert.ok(/reextract\.mjs/.test(skill), '缺重解脚本指路');
  return '五锚点在位';
});

claim('判据:M9', 'SKILL.md 引用的每个相对路径都必须真实存在', () => {
  const skill = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');
  const refs = [...skill.matchAll(/`((?:template|scripts|assets|host-skills)\/[a-zA-Z0-9_\-./]+\.(?:mjs|md|json|yml))`/g)].map((m) => m[1]);
  const links = [...skill.matchAll(/\]\(([^)#][^)]*)\)/g)].map((m) => m[1]).filter((h) => !/^[a-z][a-z0-9+.-]*:/i.test(h));
  const all = [...refs, ...links];
  assert.ok(all.length > 0, '一个引用都没有——锚点失效');
  const missing = all.filter((rel) => !existsSync(join(SKILL_DIR, rel)));
  assert.ok(missing.length === 0, 'SKILL.md 引用了不存在的路径：' + JSON.stringify(missing));
  return `${all.length} 个引用全部存在`;
});

claim('保鲜:命令占位符逐条解析（D1 回归守卫）', 'SKILL.md 命令块里 `<本skill目录>/...` 指向的脚本在包里真实存在', () => {
  const skill = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');
  // 抓命令块里的占位符路径：<本skill目录>/xxx/yyy.mjs
  const cmds = [...skill.matchAll(/<本skill目录>\/([a-zA-Z0-9_\-./]+\.(?:mjs|md|json))/g)].map((m) => m[1]);
  assert.ok(cmds.length > 0, 'SKILL.md 命令块里没有 <本skill目录> 占位符——锚点失效');
  const missing = cmds.filter((rel) => !existsSync(join(SKILL_DIR, rel)));
  assert.ok(missing.length === 0, '占位符命令指向不存在的文件（安装形态下必然 No such file）：' + JSON.stringify(missing));
  // 反向：占位符不得试图跳出 skill 目录（../ 开头的形态 2026-11-13 审查抓到过）
  const escapees = cmds.filter((rel) => rel.startsWith('..'));
  assert.ok(escapees.length === 0, '占位符命令试图跳出 skill 目录（../）：' + JSON.stringify(escapees));
  return `${cmds.length} 条占位符命令全部可解析`;
});

claim('保鲜:重解脚本归属声明', 'SKILL.md 必须写明重解脚本在源码仓、不随包分发', () => {
  const skill = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');
  assert.ok(/只在\*\*源码仓\*\*有|不随 npm 包分发|源码仓根跑/.test(skill), 'SKILL.md 没写清 reextract 的归属——用户会照包内路径跑然后 No such file');
  return '归属声明在位';
});

// ---- 失败家族
claim('家族:preflight 自证', 'preflight --self-test 全过（判定式会红）', () => {
  const out = execFileSync(process.execPath, [join(SKILL_DIR, 'scripts', 'preflight.mjs'), '--self-test'], {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000,
  });
  assert.ok(!/FAIL/.test(out.split('\n').filter((l) => l.startsWith('FAIL')).join('')), 'self-test 有失败项');
  return '成立';
});

claim('家族:四家族在文档', 'SKILL.md 载明四大失败家族', () => {
  const skill = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');
  for (const family of ['装不上', '装上了但看不见', '一加载就崩', '环境相关']) {
    assert.ok(skill.includes(family), `缺失败家族「${family}」`);
  }
  return '四家族齐';
});

// ---- host-skills
// 断言的是「VERSION.json 的结构与自洽」，不是某个具体宿主版本号。
// 硬写 rc.2 会让每次宿主升级都把这条守卫打红——那不是发现缺陷，只是把版本号当成了常量。
// 真正要与 asar 对齐的判定在 scripts/reextract.mjs --check（它读本机 asar 实测）。
claim('副本:VERSION', 'host-skills/VERSION.json 结构完整（dsh 版本号 / extractedAt / asarBytes）', () => {
  const v = JSON.parse(readFileSync(join(SKILL_DIR, 'host-skills', 'VERSION.json'), 'utf8'));
  assert.ok(/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(String(v.dsh)), `dsh=${v.dsh} 不是合法版本号`);
  assert.ok(typeof v.extractedAt === 'string' && v.extractedAt.length > 0, '缺 extractedAt');
  assert.ok(!Number.isNaN(Date.parse(v.extractedAt)), `extractedAt=${v.extractedAt} 不是合法时间`);
  assert.ok(Number.isFinite(v.asarBytes) && v.asarBytes > 0, '缺 asarBytes');
  return `dsh=${v.dsh} extractedAt=${v.extractedAt}`;
});

claim('副本:dsh-doc', 'dsh-doc 副本关键文件在位（SKILL.md / practices / packages）', () => {
  for (const rel of ['dsh-doc/SKILL.md', 'dsh-doc/references/practices.md', 'dsh-doc/references/packages.md', 'dsh-doc/references/upgrading.md']) {
    assert.ok(existsSync(join(SKILL_DIR, 'host-skills', rel)), `缺 ${rel}`);
  }
  return '成立';
});

claim('副本:inspect 权威源条款', 'practices.md 载明「confirm every Service method, Event name … through cordis_inspect_query」', () => {
  const practices = readFileSync(join(SKILL_DIR, 'host-skills', 'dsh-doc', 'references', 'practices.md'), 'utf8');
  assert.ok(/Confirm every Service method, Event name/.test(practices), '权威源条款不在位——A2 的判定依据');
  return '成立';
});

// ---- 交付面与退役
claim('退役:代码清零', '产品代码无拦截/台账/纪律段残留（A9 六模式）', () => {
  const src = ['index.js', 'lib/skill-provider.js'].map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n');
  for (const pattern of ['tools/pre-execute', 'tools/result', 'enforce', 'createLedger', 'systemPrompt.section', 'GATE_MISSING']) {
    assert.ok(!src.includes(pattern), `产品代码还有退役残留：${pattern}`);
  }
  return '六模式零命中';
});

claim('退役:lib 只剩 skill-provider', 'lib/ 目录只有 skill-provider.js', () => {
  const entries = readdirSync(join(ROOT, 'lib'));
  assert.deepEqual(entries, ['skill-provider.js'], `lib/ 实际：${JSON.stringify(entries)}`);
  return '成立';
});

// ---- D 阶段：生命周期文档的承诺
// 断言「package.json 与 CHANGELOG 彼此一致」，不是「版本号等于某个常量」。
// 硬写 0.2.0 会让每次升版都把这条守卫打红——升版是正确的，守卫不该拦它。
claim('D:版本号', 'CHANGELOG 声称的版本与实际 package.json 一致', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.ok(/^\d+\.\d+\.\d+$/.test(pkg.version), `version=${pkg.version} 不是纯 x.y.z`);
  const changelog = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');
  assert.ok(changelog.includes(`[${pkg.version}]`), `CHANGELOG 里没有 [${pkg.version}] 这一节`);
  return `v${pkg.version}`;
});

claim('D:engines', 'package.json 声明了 dsh 版本范围（>=0.2.2-rc.1）', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.ok(/dsh"?\s*:\s*[^]*0\.2\.2-rc\.1/.test(JSON.stringify(pkg.engines)) && pkg.engines?.dsh?.startsWith('>=0.2.2-rc.1'), `engines.dsh=${pkg.engines?.dsh}（下界必须是 >=0.2.2-rc.1，子串误命中 rc.10 也不行）`);
  return pkg.engines.dsh;
});

claim('D:骨架文件数', 'SKILL.md 宣称的骨架文件数与 template/ 实际一致（宣称值与实测值双向核对）', () => {
  const skill = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');
  const dir = join(SKILL_DIR, 'template');
  let n = 0;
  (function walk(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name));
      else n += 1;
    }
  })(dir);
  // 2026-11-13 终审 F 系空真修复：原断言只查「文档里有数字」和「目录等于 4」两件事，
  // 两者互不比较——文档改称 7 文件时测试照绿。现在抽取的宣称值必须与实测值相等。
  const claimed = [...skill.matchAll(/复制骨架[：:]\s*`?template\/`?（(\d+)\s*文件/g)]
    .map((m) => Number(m[1]));
  assert.ok(claimed.length > 0, 'SKILL.md 找不到「复制骨架：template/（N 文件）」的宣称——锚点失效');
  const mismatched = claimed.filter((c) => c !== n);
  assert.ok(mismatched.length === 0, `SKILL.md 宣称骨架 ${claimed.join('/')} 文件，实际 ${n} 个——文档与实际不一致`);
  return `宣称 ${claimed.join('/')} = 实际 ${n}`;
});

claim('D:N4:表格完整性', 'README 每行表格都是合法表格行（防两行并成一行）', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const lines = readme.split('\n');
  const bad = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].replace(/\r$/, '');
    if (!l.trimStart().startsWith('|')) continue;
    if (/^\s*\|[\s:|-]+\|\s*$/.test(l)) continue;
    if (/\|\|/.test(l)) bad.push(i + 1);
  }
  assert.ok(bad.length === 0, `这些行疑有两行表格被缝在一起：L${bad.join(', L')}`);
  return '无粘连';
});

claim('D:description', 'package.json description 写清契约+验证定位、无退役词', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const desc = String(pkg.description ?? '');
  assert.ok(desc.includes('契约'), 'description 没写契约');
  assert.ok(desc.includes('验证'), 'description 没写验证');
  for (const banned of ['台账', '纪律', '拦截', '阶段门']) {
    assert.ok(!desc.includes(banned), `description 还含退役词「${banned}」`);
  }
  return desc.slice(0, 50) + '…';
});

// ---- 验证脚本
claim('E2E1', 'reextract --self-test 可执行', () => {
  const out = execFileSync(process.execPath, [join(ROOT, 'scripts', 'reextract.mjs'), '--self-test'], {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000,
  });
  assert.ok(out.includes('PASS'), 'self-test 无 PASS 输出');
  return '成立';
});

claim('E2E4', 'README 写明重解与 preflight 怎么跑', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  assert.ok(/reextract\.mjs/.test(readme), 'README 没写重解命令');
  assert.ok(/preflight\.mjs/.test(readme), 'README 没写 preflight');
  assert.ok(/recheck\.mjs/.test(readme), 'README 没写 recheck');
  return '有复跑说明';
});

// ---- 文档收敛（2026-11-15：CONTEXT.md / docs/reviewer.md 并入 README 后的守卫）
// 这组断言看守「唯一现状文档」的完整性——四家族 / 退役词 / 证据等级 / 链接。
// CONTEXT.md 与 reviewer.md 已删，README 是它们内容的唯一现行住址，漂移即失守。

claim('面:四家族正典', '四大失败家族的正典在 SKILL.md，README 按名指路不复述', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const skill = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');
  for (const family of ['装不上', '装上了但看不见', '一加载就崩', '环境相关']) {
    assert.ok(skill.includes(family), `SKILL.md 缺失败家族「${family}」`);
  }
  // README 指到 SKILL.md 的「首装验证」节即可；不得整表复述（一体成文：一处说清）。
  // 锚用节名而不是 §编号：编号会随排版变，节名是语义。
  assert.ok(/首装验证/.test(readme), 'README 必须按名指路 SKILL.md 的「首装验证」节');
  return '正典在 SKILL.md，README 按名指路';
});

claim('面:证据等级双落点', 'L1–L4 定义在 SKILL.md（随包，模型要读），CONTRIBUTING 留可读副本', () => {
  const skill = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');
  const contributing = readFileSync(join(ROOT, 'CONTRIBUTING.md'), 'utf8');
  // SKILL.md 是唯一随包分发的、使用这些等级的文件——定义必须在这里，
  // 否则模型读到「标 L3」却不知道 L3 是什么（包内无定义 = 死引用）。
  for (const level of ['L1 运行时', 'L2 行为复现', 'L3 源码', 'L4 自述']) {
    assert.ok(skill.includes(level), `SKILL.md 缺证据等级定义「${level}」`);
  }
  assert.ok(/什么都不能证明/.test(skill), 'SKILL.md 缺「L4 自述什么都不能证明」这条硬约束');
  assert.ok(/L3 不能冒充/.test(skill), 'SKILL.md 缺「L3 不能冒充」硬要求');
  // 维护者侧保留，便于派审查员时直接照抄
  for (const level of ['L1 运行时', 'L2 行为复现', 'L3 源码', 'L4 自述']) {
    assert.ok(contributing.includes(level), `CONTRIBUTING 缺证据等级「${level}」`);
  }
  return '定义在 SKILL.md，副本在 CONTRIBUTING';
});

claim('面:纪律单源', '六条纪律锚点在 SKILL.md，README 按名指路不复述', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const skill = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');
  const anchors = ['能判真假', '必须带出处', '证明它会红', '产品在用', '无法判定', '必须真跑过'];
  for (const a of anchors) {
    assert.ok(skill.includes(a), `SKILL.md 缺纪律锚点「${a}」`);
  }
  // README 正文不展开六条；只要它在讲失败家族时指向 SKILL.md 即可。
  // 锚用文件名而不是 §编号。
  assert.ok(/SKILL\.md/.test(readme), 'README 必须指路 SKILL.md');
  return '正典在 SKILL.md，README 指路';
});

claim('面:链接存在', 'README 的每个仓库内相对链接都真实存在（不出死链）', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const links = [...readme.matchAll(/\]\(([^)#][^)]*)\)/g)].map((m) => m[1]).filter((h) => !/^[a-z][a-z0-9+.-]*:/i.test(h));
  assert.ok(links.length > 0, 'README 一个仓库内链接都没有——锚点失效');
  const missing = links.filter((rel) => !existsSync(join(ROOT, rel)));
  assert.ok(missing.length === 0, 'README 引用了不存在的路径：' + JSON.stringify(missing));
  return `${links.length} 个链接全部存在`;
});

// ---- 交付面：README 只承诺，判据在 SKILL.md
claim('面:README 定位', 'README 含「不做什么」硬边界（拦截/台账/常驻提示三条）', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  for (const [re, label] of [
    [/不拦截任何调用/, '不拦截'],
    [/不记台账/, '不记台账'],
    [/不注入常驻提示/, '不注入常驻提示'],
  ]) {
    assert.ok(re.test(readme), `README 缺硬边界「${label}」——这是唯一有约束力的历史改写成的现行约束`);
  }
  return '三条边界在位';
});

claim('面:无跨面链接', 'README 不得链接到面 C 文件（那些文件不进 npm 包）', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const links = [...readme.matchAll(/\]\(([^)#][^)]*)\)/g)].map((m) => m[1]).filter((h) => !/^[a-z][a-z0-9+.-]*:/i.test(h));
  // 面 C：不进 npm 包的文件。README 在包内，指向它们等于让读者拿到空引用。
  const offSurface = links.filter((rel) => /^(docs\/|evidence\/|test\/)/.test(rel) || rel === 'CONTRIBUTING.md');
  assert.ok(offSurface.length === 0, `README 链接了不进包的文件：${JSON.stringify(offSurface)}`);
  return `${links.length} 个链接全在包内`;
});

// ---- 设计期落点（2026-11-17：两个 skill 的工件成为可机判落点）
claim('设计期:SKILL 指路', 'SKILL.md 载明设计期两个 skill 与 design-check 脚本', () => {
  const skill = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');
  for (const anchor of ['domain-modeling', 'codebase-design', 'design-check.mjs']) {
    assert.ok(skill.includes(anchor), `SKILL.md 缺设计期锚点「${anchor}」`);
  }
  return '三锚点在位';
});

claim('设计期:骨架种子', 'template/CONTEXT.md 是词汇表种子（含示例占位与 _Avoid_ 示范）', () => {
  const seed = readFileSync(join(SKILL_DIR, 'template', 'CONTEXT.md'), 'utf8');
  assert.ok(seed.includes('**示例术语**'), '种子缺「示例术语」占位标记——首跑必红依赖它');
  assert.ok(seed.includes('_Avoid_'), '种子缺 _Avoid_ 示范');
  assert.ok(/## Language/.test(seed), '种子缺 ## Language 节');
  return '种子在位';
});

claim('设计期:README 骨架计数', 'README 宣称的骨架文件数与 template/ 实际一致', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const m = /template\/[^\n]*?（(\d+)\s*文件/.exec(readme);
  assert.ok(m !== null, 'README 找不到「template/…（N 文件）」的宣称');
  const claimed = Number(m[1]);
  let actual = 0;
  (function walk(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name));
      else actual += 1;
    }
  })(join(SKILL_DIR, 'template'));
  assert.equal(claimed, actual, `README 宣称骨架 ${claimed} 文件，实际 ${actual} 个`);
  return `宣称 ${claimed} = 实际 ${actual}`;
});

claim('发布:操作卡在位', 'CONTRIBUTING.md 载明 registry 分层与「发布成功」判据', () => {
  const p = join(ROOT, 'CONTRIBUTING.md');
  assert.ok(existsSync(p), '缺 CONTRIBUTING.md（维护者入口）');
  const card = readFileSync(p, 'utf8');
  for (const [re, label] of [
    [/registry\.npmjs\.org/, 'registry 分层（官方层）'],
    [/PUT 202/, '「真没发出去」的判定依据'],
    [/verify-publish\.mjs/, '发布后核实脚本'],
    [/不要.*token/i, 'token 不外泄纪律'],
  ]) {
    assert.ok(re.test(card), `维护者指南缺「${label}」`);
  }
  return '四锚点在位';
});


claim('发布:脚本接线', 'publish:npm 带发布后核实，且 verify-publish.mjs 在 node --check 门里', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.ok(/verify-publish\.mjs/.test(pkg.scripts?.['publish:npm'] ?? ''), 'publish:npm 没接发布后核实');
  assert.ok(/verify-publish\.mjs/.test(pkg.scripts?.['publish:verify'] ?? ''), '缺 publish:verify 脚本');
  assert.ok(/verify-publish\.mjs/.test(pkg.scripts?.check ?? ''), 'verify-publish.mjs 不在 node --check 门里');
  assert.equal(pkg.publishConfig?.registry, 'https://registry.npmjs.org/', 'publishConfig.registry 必须是官方源');
  return '接线完整';
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
