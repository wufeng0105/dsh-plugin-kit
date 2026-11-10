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
import { readFileSync, existsSync } from 'node:fs';
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
    'skills/plugin-kit/assets/AGENTS.template.md',
    'skills/plugin-kit/assets/touchpoints.sample.json',
    'skills/plugin-kit/assets/host-snapshot.sample.json',
    'skills/plugin-kit/scripts/recheck.mjs',
  ]) {
    assert.ok(files.has(required), `包内缺 ${required}——SKILL.md 提到它，用户装完却是死链`);
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

  // 数量守卫：4 份文档 + 2 个元文件 = 35。少一个就是漏。
  // 只增不减是安全的（宿主升级会加文件）；这里守下界，不守等号。
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
  const missing = hrefs.filter((href) => {
    const normalized = `${skillDirRel}/${href}`.replaceAll('\\', '/');
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
