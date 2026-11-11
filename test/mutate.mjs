#!/usr/bin/env node
/**
 * 变红证明 —— 证明测试不是摆设。
 *
 * 做三件事：
 *   1. 把代码复制到临时目录
 *   2. 逐个施加「应该让测试变红」的变异
 *   3. 断言每种变异都真的让测试失败
 *
 * 如果一个变异施加后测试仍然全绿，说明那条测试是空的。
 *
 * 用法：node test/mutate.mjs
 * 退出码：0 全部变异都变红了 / 1 有变异没变红（测试有洞）
 *
 * ## 2026-11-11 WP5：两种测试台
 *
 * 原先前 7 个变异只把 `lib/gate.js` + `test/gate.test.mjs` 复制进临时目录，
 * 那测的是**内核**。但本批修的那个洞有一半在**接线**上：`index.js` 拿到
 * `kind:'skip-noted'` 就 `next()` 放行。只变异内核、只跑内核测试，
 * 证明不了「enforce 下 skip 真的拦得住」——那正是本项目一直批评的
 * 「离线全绿、真机失效」。
 *
 * 所以变异分成两台：
 *   - `kernel`：只复制 lib/gate.js + gate.test.mjs。快，测判定逻辑。
 *   - `full`  ：整仓复制（去掉 .git/.zhll/evidence），可以跑 smoke.mjs。测接线。
 *
 * 后两个变异（skip 改回放行 / detail 改固定串）用 `full`，因为它们要证明的
 * 是「宿主层真的拦了」和「台账真的写清了为什么」。
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, cpSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

/** 整仓复制时跳过的东西（体积大、与测试无关）。 */
const SKIP_DIRS = new Set(['.git', '.zhll', 'evidence', 'node_modules']);

/** 每个变异：[名字, 找什么, 换成什么, 测试台, 要跑的测试, 改哪个文件?] */
const MUTATIONS = [
  [
    // 2026-11-11 D1 裁定：原先这里有一个「未知工具改成放行」的变异。
    // 它测的行为**已被反转**（现在 unknown 本来就是放行），留着它只有两种结局：
    //   - 注入点失配 → SKIP，变异数虚高但什么都没测
    //   - 注入点命中 → 把放行改回 deny，测的是被裁定废止的旧行为，方向反了
    // 删掉它，换成下面两条测**新风险**的变异。
    '写阶段产物被拦（认不出是阶段写）改成放行',
    `    if (!loc.under) return { kind: 'allow' };`,
    `    if (true) return { kind: 'allow' };`,
    'kernel',
    ['test/gate.test.mjs'],
  ],
  [
    // 第二条新变异，测的是删掉 UNKNOWN deny 之后**唯一的**「这是不是写工具」判据。
    //
    // 删除之前，`extractTarget` 认不出 write 时会被 unknown→deny 意外兜住；
    // 删除之后同样的退化会**静默放行**写阶段产物。也就是说这条测的是一个
    // 「以前不可能发生、现在可能发生」的失效——正是「为了通过而改测试」的反面。
    '写工具认不出写（extractTarget 退化成 unknown → 静默放行）',
    `  if (name === 'write' || name === 'edit' || name === 'apply_patch' || name === 'str_replace_editor' || name === 'create' || name === 'write_file') {`,
    `  if (false) {`,
    'kernel',
    ['test/gate.test.mjs'],
  ],
  [
    '缺上游门改成放行（G2 的核心）',
    `  if (gate.state === 'missing') {\n    return denyOf(REASONS.GATE_MISSING,`,
    `  if (false) {\n    return denyOf(REASONS.GATE_MISSING,`,
    'kernel',
    ['test/gate.test.mjs'],
  ],
  [
    '上游 fail 改成放行',
    `  if (gate.verdict === 'fail') {\n    return denyOf(REASONS.GATE_FAILED,`,
    `  if (false) {\n    return denyOf(REASONS.GATE_FAILED,`,
    'kernel',
    ['test/gate.test.mjs'],
  ],
  [
    '格式坏的门改成宽容放过（M1 默认分支）',
    `  if (gate.state === 'malformed') {\n    return denyOf(REASONS.GATE_MALFORMED,`,
    `  if (false) {\n    return denyOf(REASONS.GATE_MALFORMED,`,
    'kernel',
    ['test/gate.test.mjs'],
  ],
  [
    'verdict 枚举校验去掉（大小写混用会漏过）',
    `  if (!VERDICTS.includes(verdict)) return { state: 'malformed', why: 'verdict-not-enum' };`,
    `  // enum check removed`,
    'kernel',
    ['test/gate.test.mjs'],
  ],
  [
    // 这个变异测的是「扫描失效则 gate 不再拦 shell 写入」。
    // 2026-11-11：原注入点写死了旧正则字面量，正则一改就 SKIP（注入点失配），
    // 而 SKIP 不会被算作失败 —— 于是「有洞」被藏在一个看起来通过的输出里。
    // 现在改成锚定**函数名与判定语句**，不锚定正则字面量：正则怎么改都不影响注入。
    'bash 文本扫描改成从不命中',
    `    if (writeIntent.test(t)) return { suspect: true, stage };`,
    `    if (false && writeIntent.test(t)) return { suspect: true, stage };`,
    'kernel',
    ['test/gate.test.mjs'],
  ],
  // ================================================================ WP5 新增
  [
    // ★ 本批的核心变异 ★
    //
    // 把 `skip` 在 enforce 下改回放行 —— 也就是**把那个洞重新打开**。
    // 这是 `dfd70b6` 的真实形状：skip 有一个专属放行出口。
    //
    // 必须让「enforce 下 skip → deny」变红。而且这里刻意跑**两台**：
    //   - gate.test.mjs：内核层（decide 返回什么）
    //   - smoke.mjs    ：接线层（宿主事件真的被拦了吗）
    // 只跑内核的话，「内核说 deny 但 index.js 还是 next()」这种退化测不出来。
    'skip 改回放行（重开那个洞：enforce 下 skip 不再拦）',
    `  if (gate.verdict === 'skip') {\n    return denyOf(REASONS.GATE_UNVERIFIED,`,
    `  if (gate.verdict === 'skip') {\n    return { kind: 'allow' };\n    return denyOf(REASONS.GATE_UNVERIFIED,`,
    'full',
    ['test/gate.test.mjs', 'test/smoke.mjs'],
  ],
  [
    // 台账 `detail` 改成固定字符串 —— 也就是「记了，但没记清为什么」。
    //
    // 这正是 764 分钟会话的旧状态：台账只有 allow，事后没人能说出那次为什么放行。
    // 必须让「detail 能区分四种原因」变红。
    '台账 detail 改成固定字符串（记了但没记为什么）',
    `export function composeDetail(cause, stage, extra = {}) {\n  const base = \`\${cause} \${stage}\`;`,
    `export function composeDetail(cause, stage, extra = {}) {\n  const base = 'gate-denied';`,
    'full',
    ['test/gate.test.mjs', 'test/smoke.mjs'],
  ],
  [
    // ★ 接线层的那个洞 ★
    //
    // 内核把 skip 报成 deny 了，但**如果 index.js 又给 deny 开一条放行支路**，
    // 洞就还在。这个变异模拟的正是「修了内核、忘了接线」——
    // 本项目历史上反复出现的那类失败（离线全绿、真机失效）。
    //
    // 关键：它**只跑 smoke.mjs**。gate.test.mjs 在这个变异下必须仍然全绿
    // （内核确实没变），所以只有接线测试能抓住它。
    'enforce 分支被改成对 deny 放行（只修内核、忘了接线）',
    `      ledger.append({ ...entry, kind: 'blocked' });\n      return toDecision(final, log);`,
    `      ledger.append({ ...entry, kind: 'blocked' });\n      return next();`,
    'full',
    ['test/smoke.mjs'],
    'index.js',
  ],
];

function runTests(dir, files, timeout = 120_000) {
  const result = spawnSync(process.execPath, ['--test', ...files], {
    cwd: dir,
    encoding: 'utf8',
    timeout,
  });
  return { code: result.status, out: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

/** 整仓复制（跳过 .git/.zhll/evidence/node_modules），供 full 测试台用。 */
function copyRepo(dest) {
  for (const entry of readdirSync(ROOT)) {
    if (SKIP_DIRS.has(entry)) continue;
    const from = join(ROOT, entry);
    if (!statSync(from).isDirectory()) {
      cpSync(from, join(dest, entry));
      continue;
    }
    cpSync(from, join(dest, entry), { recursive: true });
  }
}

/** 在临时目录里建好测试台，返回目录。 */
function makeBench(platform) {
  const dir = mkdtempSync(join(tmpdir(), 'gate-mutate-'));
  if (platform === 'full') {
    copyRepo(dir);
    return dir;
  }
  mkdirSync(join(dir, 'lib'), { recursive: true });
  mkdirSync(join(dir, 'test'), { recursive: true });
  cpSync(join(ROOT, 'test', 'gate.test.mjs'), join(dir, 'test', 'gate.test.mjs'));
  return dir;
}

/** 摘出失败断言的名字，用来证明「红的正是该红的那条」。 */
function failingNames(out) {
  return [...out.matchAll(/^\s*✖\s+(.+?)\s+\(\d/gm)].map((m) => m[1].trim());
}

function main() {
  // 变异只施加到 lib/gate.js（前 9 个）或 index.js（接线那一个）。
  // 按文件读一次原件，循环里按 `file` 取。
  const SOURCES = {
    'lib/gate.js': readFileSync(join(ROOT, 'lib', 'gate.js'), 'utf8'),
    'index.js': readFileSync(join(ROOT, 'index.js'), 'utf8'),
  };
  console.log('变红证明：每个变异都必须让测试失败\n');

  // 基线：未变异时测试必须全绿
  const base = runTests(ROOT, ['test/gate.test.mjs']);
  if (base.code !== 0) {
    console.log('基线就不绿，先修测试再谈变红。');
    console.log(base.out.slice(-1500));
    return 1;
  }
  const baseSmoke = runTests(ROOT, ['test/smoke.mjs']);
  if (baseSmoke.code !== 0) {
    console.log('基线 smoke 就不绿，先修测试再谈变红。');
    console.log(baseSmoke.out.slice(-1500));
    return 1;
  }
  console.log(`基线  → gate exit=${base.code} / smoke exit=${baseSmoke.code}（全绿）\n`);

  let failed = 0;
  for (const [name, find, replace, platform, tests, file = 'lib/gate.js'] of MUTATIONS) {
    const original = SOURCES[file];
    // index.js 在磁盘上是 CRLF（Windows 仓库），而变异点在源码里写成 `\n`。
    // 不做归一化的话，`includes()` 永远失配 → SKIP → 「有洞」被藏在一个
    // 看起来通过的输出里（这个坑本文件早年踩过一次，注释见上面 bash 那条变异）。
    // 这里统一：找的时候两种换行都试，写回去的时候保持原文件的换行风格。
    const eol = original.includes('\r\n') ? '\r\n' : '\n';
    const normalize = (s) => (eol === '\n' ? s : s.replace(/\n/g, '\r\n'));
    const findN = normalize(find);
    if (!original.includes(findN)) {
      console.log(`SKIP  ${name}`);
      console.log(`      注入点未命中（${file} 的形状变了，更新本脚本）`);
      failed += 1;
      continue;
    }
    const dir = makeBench(platform);
    try {
      writeFileSync(join(dir, file), original.replace(findN, normalize(replace)), 'utf8');

      const result = runTests(dir, tests);
      const red = result.code !== 0;
      console.log(`${red ? 'RED  ' : 'GREEN'} ${name}   [${platform} / ${file}]`);
      if (!red) {
        console.log(`      ← 变异后测试仍全绿，说明这条测试是空的`);
        failed += 1;
      } else {
        // 把变红的断言名列出来：只证明「exit!=0」是不够的，
        // 得看见红的是**该红的那一条**。
        const names = [...new Set(failingNames(result.out))];
        for (const n of names) console.log(`      ✖ ${n}`);
        if (names.length === 0) console.log('      （未摘到断言名，见下方输出尾部）');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  console.log('');
  if (failed === 0) {
    console.log(`全部 ${MUTATIONS.length} 个变异都变红了：测试确实在测东西。`);
    return 0;
  }
  console.log(`${failed} 个变异没能变红 —— 测试有洞。`);
  return 1;
}

process.exitCode = main();
