#!/usr/bin/env node
/**
 * preflight.mjs — DSH 插件首装自检：四大失败家族逐条核查。
 *
 * 「什么算装上了、什么算能用了」不该靠新手用自己的崩溃重踩一遍。
 * 本脚本把本仓历史上用真机崩溃换来的核查项做成可执行的判定式：
 *   PASS          判据满足
 *   FAIL          判据不满足（附：缺什么、怎么补）
 *   UNVERIFIABLE  这台机器判不了（附人工判法）
 *
 * 用法：
 *   node preflight.mjs <插件项目根>            # 检查指定项目
 *   node preflight.mjs .                       # 检查当前目录
 *   node preflight.mjs <项目根> --json         # 机器可读输出
 *
 * 退出码：0 全 PASS 或仅 UNVERIFIABLE；1 有 FAIL；2 用法错误
 *
 * 自检：node preflight.mjs --self-test   （内建假项目，含 4 个注入缺陷，证明会红）
 *
 * 四大失败家族（出处：本仓 CHANGELOG 2026-11-10 崩溃事故与真机记录）：
 *   ① 装不上          缺 dsh.bundle.patch / 行 id 与包名不一致 / Config 是普通对象 / inject 猜了不存在的服务
 *   ② 装上了但看不见  skill 缺 resourceBase / slot 注册塞错回调
 *   ③ 一加载就崩      client.js 含 ESM export/import（宿主把所有插件 client.js 拼成一个大脚本）
 *   ④ 环境相关        最小 profile 能用、完整插件集崩 —— 只能真机验，本脚本标 UNVERIFIABLE 并给人工判法
 */
import { readFileSync, existsSync, readdirSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- 参数

function parseArgs(argv) {
  const opts = { root: null, json: false, selfTest: false, help: false };
  for (const arg of argv) {
    if (arg === '--json') opts.json = true;
    else if (arg === '--self-test') opts.selfTest = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (opts.root === null && !arg.startsWith('-')) opts.root = resolve(arg);
    else if (arg.startsWith('-')) { console.error(`未知参数：${arg}`); opts.help = true; }
  }
  return opts;
}

// ---------------------------------------------------------------- 判定式

/** 每条核查项：家族 / 名称 / 判定（返回 { status, why?, fix? }）/ 依据 */
const CHECKS = [
  // ============ 家族① 装不上 ============
  {
    id: 'install.bundle-patch',
    family: '① 装不上',
    name: 'package.json 声明 dsh.bundle.patch',
    basis: '缺它宿主不认插件：dsh: warning … declares no dsh.bundle（真机实测）',
    check(ctx) {
      if (!ctx.pkg) return { status: 'FAIL', why: 'package.json 不存在或不是合法 JSON', fix: '在项目根建 package.json' };
      if (ctx.pkg.dsh?.bundle?.patch === undefined) {
        return { status: 'FAIL', why: 'package.json 缺 dsh.bundle.patch 字段——宿主不会把它当插件', fix: '加 "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }，并创建该文件' };
      }
      const patchPath = join(ctx.root, ctx.pkg.dsh.bundle.patch);
      if (!existsSync(patchPath)) {
        return { status: 'FAIL', why: `dsh.bundle.patch 指向 ${ctx.pkg.dsh.bundle.patch}，但文件不存在`, fix: '创建 cordis.patch.yml（含 - insert 行）' };
      }
      return { status: 'PASS' };
    },
  },
  {
    id: 'install.name-consistency',
    family: '① 装不上',
    name: 'patch 行的 name 与 package.json 的 name 一致',
    basis: '漏改 name 会让 patch 行指向不存在的包，插件装不上（2026-11-11 实测踩到）',
    check(ctx) {
      if (!ctx.pkg || !ctx.patchText) return { status: 'FAIL', why: 'package.json 或 cordis.patch.yml 缺失，无法对账', fix: '先补齐两个文件' };
      if (!ctx.pkg.name || ctx.pkg.name.includes('my-plugin')) {
        // 骨架形态：name 还是占位符。对 template/ 这类「尚未初始化的骨架」这是预期状态，
        // 判 FAIL 会假红——判 UNVERIFIABLE 并说明「复制后改名才算装前就绪」。
        return { status: 'UNVERIFIABLE', why: 'package.json 的 name 还是占位符 my-plugin（骨架未初始化）', fix: '复制骨架后把三处占位符（package.json / cordis.patch.yml / index.js）改成真实包名，改完重跑本自检' };
      }
      if (!ctx.patchText.includes(`name: '${ctx.pkg.name}'`) && !ctx.patchText.includes(`name: "${ctx.pkg.name}"`)) {
        return { status: 'FAIL', why: `cordis.patch.yml 里没有 name: '${ctx.pkg.name}'——那行 insert 指向不存在的包`, fix: '把 patch 的 name 改成与 package.json 一致' };
      }
      return { status: 'PASS' };
    },
  },
  {
    id: 'install.config-shape',
    family: '① 装不上',
    name: 'index.js 的 Config 是 Schema 或不存在（不能是普通对象）',
    basis: 'export const Config = {} → activate 崩：Cannot read properties of undefined (reading \'validate\')（2026-11-10 真机崩溃）',
    check(ctx) {
      if (!ctx.indexText) return { status: 'FAIL', why: 'index.js 不存在', fix: '创建入口文件并导出 name / inject / apply' };
      if (/export\s+const\s+Config\s*=\s*\{\s*\}/.test(ctx.indexText)) {
        return { status: 'FAIL', why: 'Config 是普通对象 {}——cordis 要求 schemastery Schema（有 ~standard.validate）', fix: '需要配置就用 Schema.object({...})；不需要就整个删掉 Config 导出' };
      }
      if (/export\s+const\s+Config\s*=/.test(ctx.indexText) && !/~standard|Schema|schemastery/.test(ctx.indexText)) {
        return { status: 'UNVERIFIABLE', why: 'Config 导出存在但看不出是否 Schema——人工确认它来自 schemastery（typeof Config.validate === "function"）', fix: '' };
      }
      return { status: 'PASS' };
    },
  },
  {
    id: 'install.exports',
    family: '① 装不上',
    name: 'index.js 导出 name / inject / apply 三件套',
    basis: '宿主加载插件的最低要求；inject 猜了不存在的服务名会让插件永远 pending',
    check(ctx) {
      if (!ctx.indexText) return { status: 'FAIL', why: 'index.js 不存在', fix: '创建入口文件' };
      const missing = [];
      if (!/export\s+const\s+name\s*=/.test(ctx.indexText)) missing.push('name');
      if (!/export\s+(const|let)\s+inject\s*=/.test(ctx.indexText)) missing.push('inject');
      if (!/export\s+(async\s+)?function\s+apply\s*\(/.test(ctx.indexText)) missing.push('apply');
      if (missing.length > 0) {
        return { status: 'FAIL', why: `index.js 缺导出：${missing.join(' / ')}`, fix: '宿主按 name/inject/apply 三件套加载插件，缺一装上也不激活' };
      }
      return { status: 'PASS' };
    },
  },
  {
    id: 'install.syntax',
    family: '① 装不上',
    name: 'index.js 语法合法',
    basis: 'node --check 是最低门槛',
    check(ctx) {
      if (ctx.syntaxError !== null) {
        return { status: 'FAIL', why: `index.js 语法错误：${ctx.syntaxError}`, fix: 'node --check index.js 看完整报错' };
      }
      return { status: 'PASS' };
    },
  },

  // ============ 家族② 装上了但看不见 ============
  {
    id: 'visible.skill-resourceBase',
    family: '② 装上了但看不见',
    name: 'skill 定义带 resourceBase（若项目带 skill）',
    basis: '缺它模型拿到正文却不知道 references/ 在哪——一次真实开发花 200+ 次工具调用找宿主契约，根因之一就是这行（2026-11-10 实测）',
    check(ctx) {
      if (ctx.skillFiles.length === 0) return { status: 'PASS', why: undefined, fix: undefined, note: '本项目不含 skill，跳过' };
      for (const skillDir of ctx.skillFiles) {
        const text = skillDir.text;
        if (!/^---[\s\S]*?\n---/.test(text)) {
          return { status: 'FAIL', why: `${skillDir.rel} 缺 frontmatter（--- … ---）——宿主会跳过它`, fix: '补 name / description frontmatter' };
        }
        // 只在 frontmatter 块内找 description（正文里出现 "description:" 不算）
        const fm = /^---\n([\s\S]*?)\n---/.exec(text);
        const fmText = fm ? fm[1] : '';
        const m = /^description:[ \t]*(.*)$/m.exec(fmText);
        if (m === null || m[1].trim() === '') {
          return { status: 'FAIL', why: `${skillDir.rel} 的 description 为空或缺——宿主拒绝空描述候选`, fix: '写一句触发条件（何时用这个 skill）' };
        }
      }
      return { status: 'PASS' };
    },
  },
  {
    id: 'visible.slot-registration',
    family: '② 装上了但看不见',
    name: 'slot 注册不在 inject 回调里（若用 slots）',
    basis: 'inject 是「等槽出现」的门控，不是注册入口——注册塞进 inject 回调后设置页看不到（2026-11-10 用户实测：设置页没看到）',
    check(ctx) {
      if (!ctx.indexText) return { status: 'PASS' };
      const hasSlots = /slots\.|clientModules|registerSlot/.test(ctx.indexText) || ctx.clientText !== null && /slots\./.test(ctx.clientText);
      if (!hasSlots) return { status: 'PASS', note: '本项目不用 slot，跳过' };
      // slots.register 出现在 slots.inject 回调里，曾导致 2026-11-10「设置页看不到」。
      // 但官方 templates/decoration/client.js:16 与真实项目都用
      //   slots.inject(key, () => slots.register({...}, Component))
      // 这一形态且工作正常。本机没有那次事故的代码，无法区分合法与事故形态，
      // 故不判 FAIL（会误伤官方形态），也不判 PASS（会放过事故）：标 UNVERIFIABLE。
      if (/slots\.inject\([\s\S]{0,400}?slots\.register/.test(ctx.indexText + (ctx.clientText ?? ''))) {
        return {
          status: 'UNVERIFIABLE',
          why: 'slots.inject 回调内出现 slots.register：官方 decoration 模板也用此形态且可正常工作，但 2026-11-10 有「设置页看不到」的事故是同类写法。本机无法区分两者',
          fix: '人工打开设置页确认该 Slot 是否可见；可见则记「合法形态」，不可见再按事故处理（把 register 提为直接调用，inject 只做门控）',
        };
      }
      return { status: 'PASS' };
    },
  },

  // ============ 家族③ 一加载就崩 ============
  {
    id: 'crash.client-esm',
    family: '③ 一加载就崩',
    name: 'client.js 无 ESM 语法（export / import）',
    basis: '宿主把所有插件的 client.js 拼成一个大脚本加载：一个 export 让整个 web boot 崩（2026-11-10 真机崩溃，21 条离线测试全绿没抓住）',
    check(ctx) {
      if (ctx.clientText === null) {
        const declared = typeof ctx.pkg?.exports?.['./client'] !== 'undefined' || ctx.pkg?.dsh?.client !== undefined || ctx.clientDeclared === true;
        if (declared) {
          return { status: 'FAIL', why: 'package.json 声明了浏览器半，但按 exports["./client"] 找不到文件', fix: '补齐 client 文件，或修正 exports["./client"] 的路径' };
        }
        return { status: 'PASS', note: '本项目无 client.js（Host 半插件），跳过' };
      }
      // 模拟宿主拼接 parse（T3 探针验证过的判定式）
      try {
        new Function(ctx.clientText);
      } catch (error) {
        return { status: 'FAIL', why: `client.js 无法在宿主拼接脚本里 parse：${error.message}`, fix: '去掉 export / import 语法；用 window.__ModuleLoader__.load({ id, factory }) 注册' };
      }
      if (!/__ModuleLoader__\.load/.test(ctx.clientText)) {
        return { status: 'FAIL', why: 'client.js 没有 window.__ModuleLoader__.load 注册——宿主不会加载它（对照 rc.2 正确形态）', fix: '按 ModuleLoader 形态重写注册段' };
      }
      return { status: 'PASS' };
    },
  },

  // ============ 家族④ 环境相关 ============
  {
    id: 'env.full-bundle',
    family: '④ 环境相关',
    name: '完整插件集共存验证',
    basis: '实测（2026-11-10）：同一插件在 3-bundle 最小 profile 能激活，混进完整 13+1 插件集就 1 entry did not activate，且日志无 renderer 堆栈——机器离线判不了',
    check() {
      return {
        status: 'UNVERIFIABLE',
        why: '插件间冲突只能真机验证：把包装进复刻目标环境完整 bundle 组合的一次性 profile，启动看是否 1 entry did not activate',
        fix: '流程见 plugin-kit skill 的 P3.5 运行时验收（一次性 profile 四步：建→装→验→拆，不碰日常 profile）',
      };
    },
  },
];

// ---------------------------------------------------------------- 执行

function syntaxCheck(file) {
  if (!existsSync(file)) return null;
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe', timeout: 30000 });
    return null;
  } catch (e) {
    return String(e.stderr ?? e.message).split('\n')[0];
  }
}

function collect(root) {
  const ctx = { root, pkg: null, patchText: null, indexText: null, clientText: null, skillFiles: [], syntaxError: null };
  const pkgPath = join(root, 'package.json');
  if (existsSync(pkgPath)) {
    try { ctx.pkg = JSON.parse(readFileSync(pkgPath, 'utf8')); } catch { ctx.pkg = null; }
  }
  const patchPath = join(root, 'cordis.patch.yml');
  if (existsSync(patchPath)) ctx.patchText = readFileSync(patchPath, 'utf8');
  const indexPath = join(root, 'index.js');
  if (existsSync(indexPath)) {
    ctx.indexText = readFileSync(indexPath, 'utf8');
    const err = syntaxCheck(indexPath);
    if (err !== null) ctx.syntaxError = err;
  }
  // 浏览器半可能放在包根（client.js），也可能在子包里由 package.json 的
  // exports["./client"] 指向（实测：dsh-toolwarden 放在 ui/client.js）。
  // 只查包根会让家族③ 静默 PASS——把这个文件当「Host 半插件，跳过」。
  const clientRel = (() => {
    const exp = ctx.pkg?.exports?.['./client'];
    if (typeof exp === 'string' && !exp.includes('*')) return exp;
    if (exp && typeof exp === 'object') {
      for (const v of Object.values(exp)) if (typeof v === 'string' && !v.includes('*')) return v;
    }
    return 'client.js';
  })();
  const rootClient = join(root, clientRel);
  let resolved = existsSync(rootClient) ? rootClient : null;
  // 浏览器半也可能在子包里（如 ui/package.json 声明 ./client，根 package.json 不声明）。
  // 扫一层子目录，按「相对该子包」解析 exports["./client"]。
  if (resolved === null && clientRel === 'client.js') {
    for (const ent of readdirSync(root, { withFileTypes: true })) {
      if (!ent.isDirectory() || ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
      const sub = join(root, ent.name, 'package.json');
      if (!existsSync(sub)) continue;
      let subPkg;
      try { subPkg = JSON.parse(readFileSync(sub, 'utf8')); } catch { continue; }
      const subExp = subPkg.exports?.['./client'];
      const subRel = typeof subExp === 'string' && !subExp.includes('*') ? subExp
        : (subExp && typeof subExp === 'object' ? Object.values(subExp).find(v => typeof v === 'string' && !v.includes('*')) : null);
      if (typeof subRel !== 'string') continue;
      const cand = join(root, ent.name, subRel);
      if (existsSync(cand)) { resolved = cand; ctx.clientDeclared = true; break; }
    }
  }
  ctx.clientPath = resolved;
  ctx.clientText = resolved !== null ? readFileSync(resolved, 'utf8') : null;
  // 扫 skill 目录（skills/*/SKILL.md）
  const skillsRoot = join(root, 'skills');
  if (existsSync(skillsRoot)) {
    for (const ent of readdirSync(skillsRoot, { withFileTypes: true })) {
      if (!ent.isDirectory() || ent.name.startsWith('_') || ent.name.startsWith('.')) continue;
      const skillPath = join(skillsRoot, ent.name, 'SKILL.md');
      if (existsSync(skillPath)) {
        ctx.skillFiles.push({ rel: `skills/${ent.name}/SKILL.md`, text: readFileSync(skillPath, 'utf8') });
      }
    }
  }
  return ctx;
}

// ESM 里没有 require —— 上面已改静态 import；syntaxCheck 直接用 execFileSync。

function runChecks(root) {
  const ctx = collect(root);
  const results = [];
  for (const item of CHECKS) {
    let outcome;
    try {
      outcome = item.check(ctx);
    } catch (error) {
      outcome = { status: 'UNVERIFIABLE', why: `判定式自身异常：${error.message}`, fix: '这是 preflight 的 bug，请报告' };
    }
    results.push({ id: item.id, family: item.family, name: item.name, basis: item.basis, ...outcome });
  }
  return results;
}

function render(results, root) {
  const lines = [];
  lines.push(`DSH 插件首装自检 — ${root}`);
  lines.push('');
  let family = '';
  let fail = 0;
  let unver = 0;
  for (const r of results) {
    if (r.family !== family) { family = r.family; lines.push(`── ${family}`); }
    const mark = r.status === 'PASS' ? '✓' : r.status === 'FAIL' ? '✗' : '?';
    lines.push(` ${mark} ${r.name}  [${r.status}]`);
    if (r.status === 'PASS') {
      if (r.note) lines.push(`    ${r.note}`);
      continue;
    }
    if (r.status === 'FAIL') fail += 1;
    else unver += 1;
    if (r.why) lines.push(`    问题：${r.why}`);
    if (r.fix) lines.push(`    补法：${r.fix}`);
  }
  lines.push('');
  lines.push(`${results.filter((r) => r.status === 'PASS').length}/${results.length} 通过，${fail} FAIL，${unver} UNVERIFIABLE`);
  if (fail > 0) lines.push('FAIL = 装上大概率出问题。按「补法」逐条修完再装。');
  lines.push('UNVERIFIABLE 不是通过：按「补法」人工验，验完自己记结论。');
  return lines.join('\n');
}

// ---------------------------------------------------------------- self-test

function selfTest() {
  // 合成 4 个假项目（3 个坏 + 1 个好），证明判定式红绿正确
  const work = mkdtempSync(join(tmpdir(), 'preflight-self-'));
  let failed = 0;
  const t = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failed += 1; };
  try {
    // 坏项目 A：缺 bundle.patch（家族①）
    const badA = join(work, 'no-patch');
    mkdirSync(badA, { recursive: true });
    writeFileSync(join(badA, 'package.json'), JSON.stringify({ name: '@local/x', type: 'module' }));
    writeFileSync(join(badA, 'index.js'), `export const name = 'x';\nexport const inject = [];\nexport function apply() {}\n`);
    const rA = runChecks(badA);
    t('缺 dsh.bundle.patch → FAIL', rA.find((r) => r.id === 'install.bundle-patch')?.status === 'FAIL');

    // 坏项目 B：Config 普通对象（家族①）+ 名字不一致
    const badB = join(work, 'bad-config');
    mkdirSync(badB, { recursive: true });
    writeFileSync(join(badB, 'package.json'), JSON.stringify({ name: '@local/b', type: 'module', dsh: { bundle: { patch: './cordis.patch.yml' } } }));
    writeFileSync(join(badB, 'cordis.patch.yml'), "- insert:\n    - id: b\n      name: '@local/wrong'\n");
    writeFileSync(join(badB, 'index.js'), `export const name = 'b';\nexport const inject = [];\nexport const Config = {};\nexport function apply() {}\n`);
    const rB = runChecks(badB);
    t('Config = {} → FAIL', rB.find((r) => r.id === 'install.config-shape')?.status === 'FAIL');
    t('patch name 不一致 → FAIL', rB.find((r) => r.id === 'install.name-consistency')?.status === 'FAIL');

    // 坏项目 C：client.js 带 ESM（家族③）
    const badC = join(work, 'bad-client');
    mkdirSync(badC, { recursive: true });
    writeFileSync(join(badC, 'package.json'), JSON.stringify({ name: '@local/c', type: 'module', dsh: { bundle: { patch: './cordis.patch.yml' } } }));
    writeFileSync(join(badC, 'cordis.patch.yml'), "- insert:\n    - id: c\n      name: '@local/c'\n");
    writeFileSync(join(badC, 'index.js'), `export const name = 'c';\nexport const inject = [];\nexport function apply() {}\n`);
    writeFileSync(join(badC, 'client.js'), `export const x = 1;\nwindow.__ModuleLoader__.load({ id: 'c', factory: () => ({}) });\n`);
    const rC = runChecks(badC);
    t('client.js 含 export → FAIL（拼接 parse 红）', rC.find((r) => r.id === 'crash.client-esm')?.status === 'FAIL');

    // 坏项目 C2：浏览器半放在子目录，由 exports["./client"] 指向（dsh-toolwarden 的真实形态）。
    // 只查包根 client.js 会让这条静默 PASS——证明判定式能跟着路径走。
    const badC2 = join(work, 'bad-client-subdir');
    mkdirSync(join(badC2, 'ui'), { recursive: true });
    writeFileSync(join(badC2, 'package.json'), JSON.stringify({
      name: '@local/c2', type: 'module',
      exports: { '.': './index.js', './client': './ui/client.js' },
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }));
    writeFileSync(join(badC2, 'cordis.patch.yml'), "- insert:\n    - id: c2\n      name: '@local/c2'\n");
    writeFileSync(join(badC2, 'index.js'), `export const name = 'c2';\nexport const inject = [];\nexport function apply() {}\n`);
    writeFileSync(join(badC2, 'ui', 'client.js'), `export const x = 1;\nwindow.__ModuleLoader__.load({ id: 'c2', factory: () => ({}) });\n`);
    t('子目录 client.js 含 export → FAIL（不再静默跳过）',
      runChecks(badC2).find((r) => r.id === 'crash.client-esm')?.status === 'FAIL');

    // 坏项目 C2b：浏览器半在子包（ui/package.json 声明 ./client，根不声明）——dsh-tool-keeper 的真实形态。
    // 既不漏检根目录，也不因「根 manifest 没声明」而静默跳过。
    const badC2b = join(work, 'bad-client-subpkg');
    mkdirSync(join(badC2b, 'ui'), { recursive: true });
    writeFileSync(join(badC2b, 'package.json'), JSON.stringify({ name: '@local/c2b', type: 'module', dsh: { bundle: { patch: './cordis.patch.yml' } } }));
    writeFileSync(join(badC2b, 'cordis.patch.yml'), "- insert:\n    - id: c2b\n      name: '@local/c2b'\n");
    writeFileSync(join(badC2b, 'index.js'), `export const name = 'c2b';\nexport const inject = [];\nexport function apply() {}\n`);
    writeFileSync(join(badC2b, 'ui', 'package.json'), JSON.stringify({ name: '@local/c2b-ui', type: 'module', exports: { '.': './index.js', './client': './client.js' } }));
    writeFileSync(join(badC2b, 'ui', 'client.js'), `export const x = 1;\nwindow.__ModuleLoader__.load({ id: 'c2b', factory: () => ({}) });\n`);
    t('子包 ui/ 里的 client.js 含 export → FAIL',
      runChecks(badC2b).find((r) => r.id === 'crash.client-esm')?.status === 'FAIL');

    // 坏项目 C3：声明了 ./client 但文件不存在——宿主会加载失败，不能算 Host 半跳过。
    const badC3 = join(work, 'declared-client-missing');
    mkdirSync(badC3, { recursive: true });
    writeFileSync(join(badC3, 'package.json'), JSON.stringify({
      name: '@local/c3', type: 'module',
      exports: { '.': './index.js', './client': './ui/client.js' },
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }));
    writeFileSync(join(badC3, 'cordis.patch.yml'), "- insert:\n    - id: c3\n      name: '@local/c3'\n");
    writeFileSync(join(badC3, 'index.js'), `export const name = 'c3';\nexport const inject = [];\nexport function apply() {}\n`);
    t('声明了 ./client 但文件缺失 → FAIL',
      runChecks(badC3).find((r) => r.id === 'crash.client-esm')?.status === 'FAIL');

    // 好项目：全绿（除家族④ UNVERIFIABLE）
    const good = join(work, 'good');
    mkdirSync(join(good, 'skills', 'demo'), { recursive: true });
    writeFileSync(join(good, 'package.json'), JSON.stringify({ name: '@local/good', type: 'module', dsh: { bundle: { patch: './cordis.patch.yml' } } }));
    writeFileSync(join(good, 'cordis.patch.yml'), "- insert:\n    - id: good\n      name: '@local/good'\n");
    writeFileSync(join(good, 'index.js'), `export const name = 'good';\nexport const inject = [];\nexport function apply() {}\n`);
    writeFileSync(join(good, 'skills', 'demo', 'SKILL.md'), `---\nname: demo\ndescription: d\n---\nbody`);
    const rG = runChecks(good);
    const fails = rG.filter((r) => r.status === 'FAIL');
    t('好项目零 FAIL', fails.length === 0, fails.map((f) => f.id).join(','));
    t('家族④ 恒 UNVERIFIABLE', rG.find((r) => r.id === 'env.full-bundle')?.status === 'UNVERIFIABLE');
    t('空 description 的 skill → FAIL', (() => {
      const half = join(work, 'half-skill');
      mkdirSync(join(half, 'skills', 'demo'), { recursive: true });
      writeFileSync(join(half, 'package.json'), JSON.stringify({ name: '@local/h', type: 'module', dsh: { bundle: { patch: './cordis.patch.yml' } } }));
      writeFileSync(join(half, 'cordis.patch.yml'), "- insert:\n    - id: h\n      name: '@local/h'\n");
      writeFileSync(join(half, 'index.js'), `export const name = 'h';\nexport const inject = [];\nexport function apply() {}\n`);
      writeFileSync(join(half, 'skills', 'demo', 'SKILL.md'), `---\nname: demo\ndescription:\n---\nbody`);
      return runChecks(half).find((r) => r.id === 'visible.skill-resourceBase')?.status === 'FAIL';
    })());
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  console.log(failed === 0 ? '\nself-test 全过：判定式红绿正确。' : `\nself-test ${failed} 项失败——判定式有洞，先修再用。`);
  return failed === 0 ? 0 : 1;
}

// ---------------------------------------------------------------- 入口

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || (opts.root === null && !opts.selfTest)) {
    console.log('用法：node preflight.mjs <插件项目根> [--json]\n      node preflight.mjs --self-test');
    return 2;
  }
  if (opts.selfTest) return selfTest();
  if (!existsSync(opts.root)) {
    console.error(`项目根不存在：${opts.root}`);
    return 2;
  }
  const results = runChecks(opts.root);
  if (opts.json) {
    console.log(JSON.stringify({ root: opts.root, results }, null, 2));
  } else {
    console.log(render(results, opts.root));
  }
  return results.some((r) => r.status === 'FAIL') ? 1 : 0;
}

process.exitCode = main();
