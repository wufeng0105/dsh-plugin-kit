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
claim('副本:VERSION', 'host-skills/VERSION.json 声明 rc.2 且 asarBytes 有值', () => {
  const v = JSON.parse(readFileSync(join(SKILL_DIR, 'host-skills', 'VERSION.json'), 'utf8'));
  assert.equal(v.dsh, '0.2.2-rc.2', `dsh=${v.dsh}`);
  assert.ok(typeof v.extractedAt === 'string' && v.extractedAt.length > 0, '缺 extractedAt');
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

// ---- ADR 与退役
claim('ADR:三份在位', 'docs/adr/ 有 0001-0003 三份决策记录', () => {
  for (const f of ['0001-核心目标重定义.md', '0002-拦截层废弃.md', '0003-作证台账搁置.md']) {
    assert.ok(existsSync(join(ROOT, 'docs', 'adr', f)), `缺 ${f}`);
  }
  return '成立';
});

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
claim('D:版本号', 'CHANGELOG 声称的版本与实际 package.json 一致', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.version, '0.2.0', `version=${pkg.version}（重定义后的首个版本）`);
  const changelog = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');
  assert.ok(changelog.includes(`[${pkg.version}]`), `CHANGELOG 里没有 [${pkg.version}] 这一节`);
  return `v${pkg.version}`;
});

claim('D:engines', 'package.json 声明了 dsh 版本范围（>=0.2.2-rc.1）', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.engines?.dsh?.includes('0.2.2-rc.1'), `engines.dsh=${pkg.engines?.dsh}`);
  return pkg.engines.dsh;
});

claim('D:骨架文件数', 'README/SKILL 说骨架 4 个文件，与 template/ 实际一致', () => {
  const skill = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');
  const m = /骨架[^。\n]*?(\d+)\s*文件|4 文件/.exec(skill);
  assert.ok(m !== null, 'SKILL.md 找不到骨架文件数');
  const dir = join(SKILL_DIR, 'template');
  let n = 0;
  (function walk(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name));
      else n += 1;
    }
  })(dir);
  assert.equal(n, 4, `template/ 实际 ${n} 个文件`);
  return `${n} 个一致`;
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

// ================================================================ 汇总

const failed = results.filter((r) => !r.ok);
console.log('');
console.log(`${results.length - failed.length} / ${results.length} 条成立`);
if (failed.length > 0) {
  console.log('\n不成立的断言：');
  for (const f of failed) console.log(`  ${f.id}  ${f.text}\n    ${f.detail}`);
}
process.exitCode = failed.length === 0 ? 0 : 1;
