/**
 * 打包守卫：**按 `npm pack` 的真实文件表**判定包是否自足。
 *
 * ## 为什么单独一个文件，为什么不复用 skill-provider.test.mjs
 *
 * 2026-11-10 独立审计实测出的失效链：
 *
 * 1. 往 `skills/plugin-kit/references/` 加一个 `extra.log`，SKILL.md 链接它；
 *    链接存在性测试 **通过**（工作区里文件真在），但 `npm pack` 里 **没有它**——
 *    因为 npm 尊重嵌套 `.gitignore`，而 `skills/plugin-kit/.gitignore` 有 `*.log`。
 * 2. 删 `host-skills/cordis-plugin-development/templates/decoration/client.js`、
 *    删 `host-skills/README.md`、删 `cordis-composition-reference/references/packages.md`
 *    —— 当时的测试 **全绿**，因为那 33 个内层文件根本没有断言。
 *
 * 共同根因：**测试看的是工作区，用户拿到的是 tarball。** 两者可以不一致。
 *
 * 所以这个文件不看工作区，**只看 `npm pack --dry-run --json` 的输出**。
 * 判据变成：「tarball 里必须有这些文件」，而不是「我目录里还留着它们」。
 *
 * ## 为什么必须能红
 *
 * 铁律：任何检查先证明它会红。`test/mutate.mjs` 里有对应变异
 * （从 files 白名单里去掉 `skills` → 本文件必须红）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

/** 跑一次真实 `npm pack --dry-run --json`，返回 tarball 内的路径集合。 */
function packedFiles() {
  const out = execSync('npm pack --dry-run --json', {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120_000,
  });
  const parsed = JSON.parse(out);
  if (!Array.isArray(parsed) || parsed.length === 0 || !Array.isArray(parsed[0].files)) {
    throw new Error('npm pack --dry-run --json 输出形状变了，本测试需要更新');
  }
  return {
    files: new Set(parsed[0].files.map((f) => f.path.replaceAll('\\', '/'))),
    size: parsed[0].size,
  };
}

// npm pack 每次约 1–2 秒。整个文件只跑一次，各组断言共用。
let CACHE;
function packed() {
  CACHE ??= packedFiles();
  return CACHE;
}

// ---------------------------------------------------------------- 包必须自足

test('打包守卫：skills/ 整个目录必须进包（判据不在包外）', () => {
  const { files } = packed();
  const inPack = [...files].filter((p) => p.startsWith('skills/'));

  // 这是本包的立身之本：判据全在 skills/plugin-kit/。它不进包，装了也没判据。
  assert.ok(inPack.length > 0, 'skills/ 一个文件都没进包——安装后不会有任何 skill');

  for (const required of [
    'skills/plugin-kit/SKILL.md',
    'skills/plugin-kit/scripts/preflight.mjs',
    'skills/plugin-kit/scripts/recheck.mjs',
    'skills/plugin-kit/assets/touchpoints.sample.json',
    'skills/plugin-kit/assets/host-snapshot.sample.json',
    // host-skills 重解产物（dsh-doc 副本 + 三份元文件）
    'skills/plugin-kit/host-skills/README.md',
    'skills/plugin-kit/host-skills/VERSION.json',
    'skills/plugin-kit/host-skills/PATHS-README.md',
    'skills/plugin-kit/host-skills/dsh-doc/SKILL.md',
    'skills/plugin-kit/host-skills/dsh-doc/references/packages.md',
  ]) {
    assert.ok(files.has(required), `包内缺 ${required}——SKILL.md 提到它，用户装完却是死链`);
  }
});

test('打包守卫：项目骨架 template/ 的每个文件都必须进包', () => {
  const { files } = packed();
  const prefix = 'skills/plugin-kit/template/';

  // 判据不是「列表里的都在」，而是「工作区里有的一律都在」。
  // 后者能自动抓住新增文件被 npm 悄悄排除的情况——2026-11-11 就抓到一次：
  // 模板里放了 `.gitignore`，工作区有，但 npm 总会排除 `.gitignore`，
  // 于是「仓库里的模板」和「包里的模板」不一致，而所有断言都是绿的。
  const tplDir = join(ROOT, 'skills/plugin-kit/template');
  const onDisk = [];
  (function walk(dir, rel) {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) walk(join(dir, ent.name), r);
      else onDisk.push(`${prefix}${r}`);
    }
  })(tplDir, '');

  assert.ok(onDisk.length > 0, '骨架是空目录');
  const missing = onDisk.filter((p) => !files.has(p));
  assert.deepEqual(
    missing,
    [],
    `这些文件在工作区有、但没进包（npm 会排除 .gitignore 等）：${JSON.stringify(missing)}`,
  );

  // 关键文件逐个点名，防「整个目录被移走但恰好还剩一个文件」蒙过上面那条。
  for (const required of [
    `${prefix}package.json`,
    `${prefix}cordis.patch.yml`,
    `${prefix}index.js`,
    `${prefix}AGENTS.md`,
  ]) {
    assert.ok(files.has(required), `骨架缺 ${required}——复制出来的项目不完整`);
  }
});

test('打包守卫：host-skills 的宿主文档副本必须整份进包（dsh-doc，rc.2 起）', () => {
  const { files } = packed();
  const prefix = 'skills/plugin-kit/host-skills/';
  const inPack = [...files].filter((p) => p.startsWith(prefix));

  // 2026-11-13 重解后副本 = dsh-doc 一份（43 文件，rc.1 的四份已被宿主合并）。
  const must = [
    `${prefix}VERSION.json`,
    `${prefix}README.md`,
    `${prefix}PATHS-README.md`,
    `${prefix}dsh-doc/SKILL.md`,
    `${prefix}dsh-doc/references/practices.md`,
    `${prefix}dsh-doc/references/host-plugin.md`,
    `${prefix}dsh-doc/references/plugin-development.md`,
    `${prefix}dsh-doc/references/packages.md`,
    `${prefix}dsh-doc/references/upgrading.md`,
    `${prefix}dsh-doc/references/composition-reference.md`,
    `${prefix}dsh-doc/templates/decoration/client.js`,
    `${prefix}dsh-doc/templates/decoration/package.json`,
    `${prefix}dsh-doc/templates/mcp/cordis.patch.yml`,
  ];
  for (const f of must) {
    assert.ok(files.has(f), `包内缺 ${f}`);
  }

  // 数量守卫：dsh-doc 实际文件数随宿主升级变化（当前 43 + 3 元文件）。
  // 下界 40 只防「整份丢失」；精确数量写死会在每次重解时假红。
  assert.ok(
    inPack.length >= 40,
    `host-skills 只有 ${inPack.length} 个文件进包，少于 40（dsh-doc 完整副本 + 3 元文件）`,
  );
  // 旧四份目录不许残留在包里（已归档进 git / evidence）
  for (const legacy of ['cordis-plugin-development/', 'cordis-composition-reference/', 'editing-cordis-compositions/', 'agent-experience/']) {
    assert.ok(
      ![...files].some((p) => p.startsWith(prefix + legacy)),
      `包里还有已归档的旧副本 ${legacy}——重解后应只剩 dsh-doc`,
    );
  }
});

test('打包守卫：判据里的引用，指向的文件必须在 tarball 里', () => {
  const { files } = packed();
  const skillDirRel = 'skills/plugin-kit';
  const skillMdPath = join(ROOT, skillDirRel, 'SKILL.md');
  assert.ok(existsSync(skillMdPath), 'SKILL.md 不在工作区，本测试无法进行');

  const skillMd = readFileSync(skillMdPath, 'utf8');
  // 两类引用都查：markdown 链接 [x](path) 与反引号路径 `dir/file.ext`
  const hrefs = [...skillMd.matchAll(/\]\(([^)#][^)]*)\)/g)]
    .map((m) => m[1])
    .filter((href) => !/^[a-z][a-z0-9+.-]*:/i.test(href)); // 排除 http: / https: / mailto:
  const backticks = [...skillMd.matchAll(/`((?:template|scripts|assets|host-skills)\/[a-zA-Z0-9_\-./]+\.(?:mjs|md|json|yml))`/g)].map((m) => m[1]);
  const all = [...hrefs, ...backticks];

  assert.ok(all.length > 0, 'SKILL.md 里一个文件引用都没有——解析器或文档出问题了');

  // 关键区别：判断依据是 **tarball 里有**，不是「工作区里有」。
  // 目录链接（以 / 结尾）tarball 里没有条目，判据改成「该目录下至少有一个文件在包里」。
  const missing = all.filter((href) => {
    const normalized = `${skillDirRel}/${href}`.replaceAll('\\', '/');
    if (normalized.endsWith('/')) {
      return ![...files].some((p) => p.startsWith(normalized));
    }
    return !files.has(normalized);
  });

  assert.deepEqual(missing, [], `SKILL.md 引用了这些文件，但它们不在 tarball 里：${JSON.stringify(missing)}`);
});

// ---------------------------------------------------------------- 证据不进包

test('打包守卫：evidence/ 与 test/e2e 不进包（证据与真机脚本不属于发布物）', () => {
  const { files } = packed();
  const leaked = [...files].filter((p) => p.startsWith('evidence/') || p.startsWith('test/e2e/'));
  assert.deepEqual(leaked, [], `这些不该进包：${JSON.stringify(leaked)}`);
});

test('打包守卫：lib/ 进包（Host 半要能跑），退役文件不进包', () => {
  const { files } = packed();
  for (const required of [
    'index.js',
    'cordis.patch.yml',
    'lib/skill-provider.js',
  ]) {
    assert.ok(files.has(required), `包内缺 ${required}——装完 Host 半跑不起来`);
  }
  // 退役实现不许再进包（ADR 0002/0003）
  for (const banned of ['lib/gate.js', 'lib/ledger.js', 'lib/discipline.js', 'vendor/config.js', 'vendor/schemastery.mjs']) {
    assert.ok(!files.has(banned), `包里不该有已退役的 ${banned}`);
  }

  // LICENSE 与 locale 是发布物的必备项
  for (const required of ['LICENSE', 'locale/en.json', 'locale/zh.json']) {
    assert.ok(files.has(required), `包内缺 ${required}`);
  }
});
