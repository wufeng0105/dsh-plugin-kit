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
    'skills/plugin-kit/references/process.md',
    'skills/plugin-kit/references/tools.md',
    'skills/plugin-kit/references/reviewer.md',
    'skills/plugin-kit/references/evidence.md',
    'skills/plugin-kit/references/walkthrough.md',
    'skills/plugin-kit/assets/touchpoints.sample.json',
    'skills/plugin-kit/assets/host-snapshot.sample.json',
    'skills/plugin-kit/scripts/recheck.mjs',
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
    `${prefix}.stage-gate.json`,
    `${prefix}stages/p0/.gitkeep`,
  ]) {
    assert.ok(files.has(required), `骨架缺 ${required}——复制出来的项目不完整`);
  }
});

test('打包守卫：host-skills 的 4 份宿主文档必须整份进包', () => {
  const { files } = packed();
  const prefix = 'skills/plugin-kit/host-skills/';
  const inPack = [...files].filter((p) => p.startsWith(prefix));

  // 审计点名的三个「删掉也全绿」的文件，逐个钉死。
  const must = [
    `${prefix}VERSION.json`,
    `${prefix}README.md`,
    // cordis-plugin-development
    `${prefix}cordis-plugin-development/SKILL.md`,
    `${prefix}cordis-plugin-development/references/practices.md`,
    `${prefix}cordis-plugin-development/references/host-plugin.md`,
    `${prefix}cordis-plugin-development/templates/decoration/client.js`,
    `${prefix}cordis-plugin-development/templates/decoration/package.json`,
    `${prefix}cordis-plugin-development/templates/decoration/cordis.patch.yml`,
    `${prefix}cordis-plugin-development/templates/decoration/locale/en.json`,
    `${prefix}cordis-plugin-development/templates/mcp/cordis.patch.yml`,
    // cordis-composition-reference
    `${prefix}cordis-composition-reference/SKILL.md`,
    `${prefix}cordis-composition-reference/references/packages.md`,
    // 另外两份
    `${prefix}editing-cordis-compositions/SKILL.md`,
    `${prefix}agent-experience/SKILL.md`,
  ];
  for (const f of must) {
    assert.ok(files.has(f), `包内缺 ${f}`);
  }

  // 数量守卫：宿主文档副本的实际文件数由 host-skills/VERSION.json 的 dsh 字段
  // （当前 0.2.2-rc.1）决定，重解 rc.2 后数量会变——下界 35 只防「整份丢失」。
  // 精确数量不在这里断言：那是「随宿主升级变化的事实」，写死就会在每次重解时假红。
  assert.ok(
    inPack.length >= 35,
    `host-skills 只有 ${inPack.length} 个文件进包，少于 35（4 份宿主文档的完整副本）`,
  );
});

test('打包守卫：判据里的相对链接，指向的文件必须在 tarball 里', () => {
  const { files } = packed();
  const skillDirRel = 'skills/plugin-kit';
  const skillMdPath = join(ROOT, skillDirRel, 'SKILL.md');
  assert.ok(existsSync(skillMdPath), 'SKILL.md 不在工作区，本测试无法进行');

  const skillMd = readFileSync(skillMdPath, 'utf8');
  const hrefs = [...skillMd.matchAll(/\]\(([^)#][^)]*)\)/g)]
    .map((m) => m[1])
    .filter((href) => !/^[a-z][a-z0-9+.-]*:/i.test(href)); // 排除 http: / https: / mailto:

  assert.ok(hrefs.length > 0, 'SKILL.md 里一个相对链接都没有——解析器或文档出问题了');

  // 关键区别：判断依据是 **tarball 里有**，不是「工作区里有」。
  // 目录链接（以 / 结尾）tarball 里没有条目，判据改成「该目录下至少有一个文件在包里」。
  const missing = hrefs.filter((href) => {
    const normalized = `${skillDirRel}/${href}`.replaceAll('\\', '/');
    if (normalized.endsWith('/')) {
      return ![...files].some((p) => p.startsWith(normalized));
    }
    return !files.has(normalized);
  });

  assert.deepEqual(missing, [], `SKILL.md 链接了这些文件，但它们不在 tarball 里：${JSON.stringify(missing)}`);
});

// ---------------------------------------------------------------- 证据不进包

test('打包守卫：evidence/ 与 test/e2e 不进包（证据与真机脚本不属于发布物）', () => {
  const { files } = packed();
  const leaked = [...files].filter((p) => p.startsWith('evidence/') || p.startsWith('test/e2e/'));
  assert.deepEqual(leaked, [], `这些不该进包：${JSON.stringify(leaked)}`);
});

test('打包守卫：lib/ 与 vendor/ 进包（Host 半要能跑）', () => {
  const { files } = packed();
  for (const required of [
    'index.js',
    'cordis.patch.yml',
    'lib/gate.js',
    'lib/ledger.js',
    'lib/skill-provider.js',
    'lib/discipline.js',
    'vendor/config.js',
    'vendor/schemastery.mjs',
    'vendor/cosmockit.mjs'.replace('cosmockit', 'cosmokit'),
  ]) {
    assert.ok(files.has(required), `包内缺 ${required}——装完 Host 半跑不起来`);
  }

  // LICENSE 与 locale 是发布物的必备项
  for (const required of ['LICENSE', 'locale/en.json', 'locale/zh.json']) {
    assert.ok(files.has(required), `包内缺 ${required}`);
  }
});
