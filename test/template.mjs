/**
 * 骨架守卫：`template/` 自洽。
 *
 * ## 为什么单独一个文件
 *
 * `template/` 是「复制出去就能用」的骨架。它内部一旦不一致，**每一个由它生出的项目都是坏的**，
 * 而且坏法很隐蔽：
 *
 * - `package.json` 的 `name` 与 `cordis.patch.yml` 的 `name` 不一致 → patch 那行指向不存在的包
 * - `index.js` 的 `name` 与目录/包名不一致 → 日志前缀和注册名对不上，排查时找不到来源
 * - 占位符不统一（一会儿 `my-plugin` 一会儿 `demo`）→ 初始化时「搜占位符确认零残留」这一步失效
 *
 * 这些都不会让 `node --check` 报错，也不会让 `npm pack` 报错。**只能靠断言。**
 *
 * ## 2026-11-13 重定义
 *
 * 骨架从 6 文件减为 4 文件：`.stage-gate.json`（marker，阶段门 marker 已随拦截层退役）与
 * `stages/p0/.gitkeep`（产物目录约定已退役）删除。骨架服务的是「新插件项目怎么起步」，
 * 与阶段门无关。preflight 是新骨架的装前检查（本文件核它与骨架兼容）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const TPL = join(ROOT, 'skills/plugin-kit/template');
const PREFLIGHT = join(ROOT, 'skills/plugin-kit/scripts/preflight.mjs');

/** 占位符。改这里等于改骨架的命名约定——三处必须跟着改。 */
const PLACEHOLDER = 'my-plugin';
const PACKAGE_NAME = `@local/${PLACEHOLDER}`;

const read = (rel) => readFileSync(join(TPL, rel), 'utf8');

// ---------------------------------------------------------------- 文件齐全

test('骨架：4 个文件齐全（package.json / patch / index.js / AGENTS.md）', () => {
  for (const rel of ['package.json', 'cordis.patch.yml', 'index.js', 'AGENTS.md']) {
    assert.ok(existsSync(join(TPL, rel)), `骨架缺 ${rel}`);
  }
  // 退役文件不许回来
  for (const banned of ['.stage-gate.json', 'stages', '.gitignore', '.npmignore']) {
    assert.ok(
      !existsSync(join(TPL, banned)),
      `骨架不该有 ${banned}——marker 与 stages/ 约定已随拦截层退役；.gitignore npm 打包总排除`,
    );
  }
});

// ---------------------------------------------------------------- package.json

test('骨架：package.json 是合法 JSON，且能被宿主认成插件', () => {
  let pkg;
  assert.doesNotThrow(() => {
    pkg = JSON.parse(read('package.json'));
  }, 'package.json 不是合法 JSON');

  assert.equal(pkg.name, PACKAGE_NAME, `name 必须是占位符 ${PACKAGE_NAME}`);

  // 没有这个字段，宿主不认它是插件——`dsh: warning: ... declares no dsh.bundle` 就是它。
  assert.equal(
    pkg.dsh?.bundle?.patch,
    './cordis.patch.yml',
    '缺 dsh.bundle.patch，宿主不会把它当插件',
  );

  // 用 exports 而不是 main。写 main 会和 exports 打架，且 ESM 项目里 main 是历史包袱。
  assert.equal(pkg.main, undefined, '骨架不该有 main 字段——用 exports');
  assert.equal(pkg.type, 'module', '必须是 ESM，否则 index.js 的 export 语法会被当 CJS');

  // files 里列的必须真实存在，否则打包后是空包
  assert.ok(Array.isArray(pkg.files) && pkg.files.length > 0, 'files 不能为空');
  for (const f of pkg.files) {
    assert.ok(existsSync(join(TPL, f)), `files 里列了 ${f}，但骨架里没有这个文件`);
  }
});

// ---------------------------------------------------------------- 三处名字一致

test('骨架：三处占位符一致（package.json / patch / index.js）', () => {
  const pkg = JSON.parse(read('package.json'));
  const patch = read('cordis.patch.yml');
  const index = read('index.js');

  // package.json
  assert.equal(pkg.name, PACKAGE_NAME);

  // cordis.patch.yml：id 是行 id，name 是包名。漏改 name 会让这一行指向不存在的包。
  assert.ok(
    new RegExp(`^\\s*- id:\\s*${PLACEHOLDER}\\s*$`, 'm').test(patch),
    `cordis.patch.yml 里缺 "id: ${PLACEHOLDER}"`,
  );
  assert.ok(
    patch.includes(`name: '${PACKAGE_NAME}'`),
    `cordis.patch.yml 里缺 "name: '${PACKAGE_NAME}'"`,
  );

  // index.js：export const name 必须与上面同名
  assert.ok(
    new RegExp(`export const name = '${PLACEHOLDER}'`).test(index),
    `index.js 的 name 常量必须是 '${PLACEHOLDER}'`,
  );
});

test('骨架：占位符唯一，不存在第二套名字', () => {
  // 初始化时靠「搜 my-plugin 是否零残留」判断改名做全了。
  // 如果骨架里还混着 demo / example / test-plugin，那条检查就失效了。
  const files = ['package.json', 'cordis.patch.yml', 'index.js', 'AGENTS.md'];
  const others = ['@local/demo', '@local/example', 'test-plugin', 'my-decoration', "name = 'demo'"];

  for (const rel of files) {
    const text = read(rel);
    for (const other of others) {
      assert.ok(
        !text.includes(other),
        `${rel} 里混进了第二个占位符 "${other}"——初始化时的「零残留」检查会失效`,
      );
    }
  }
});

// ---------------------------------------------------------------- index.js 形状

test('骨架：index.js 不导出普通 Config，inject 显式列出', () => {
  const index = read('index.js');

  // 真机踩过：export const Config = {} → activate 崩在
  // TypeError: Cannot read properties of undefined (reading 'validate')
  // 因为 cordis 要求 Config 是 schemastery Schema（有 ~standard.validate）。
  assert.ok(
    !/export\s+const\s+Config\s*=\s*\{\s*\}/.test(index),
    'export const Config = {} 会让 activate 崩——要配置就用 Schema.object(...)，不需要就不导出',
  );

  // inject 必须显式存在（可以是空数组）。猜服务名会让插件永远 pending，
  // 而宿主把「有 entry 未激活」当成 web boot 失败。
  assert.ok(
    /export\s+(const|let)\s+inject\s*=/.test(index),
    'index.js 必须导出 inject（不确定就先给空数组——不确定就别猜）',
  );

  // apply 三件套
  assert.ok(/export\s+(async\s+)?function\s+apply\s*\(/.test(index), '缺 apply 导出');
});

test('骨架：index.js 语法合法', () => {
  // 在 template/ 目录里跑，这样 node 会读到 template/package.json 的 "type": "module"
  assert.doesNotThrow(() => {
    execFileSync(process.execPath, ['--check', join(TPL, 'index.js')], {
      cwd: TPL,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    });
  }, 'index.js 语法不合法');
});

// ---------------------------------------------------------------- preflight 兼容

test('骨架：preflight 对骨架跑出 0 FAIL（占位符形态不假红）', () => {
  const out = execFileSync(process.execPath, [PREFLIGHT, TPL], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60_000,
  });
  // 骨架未初始化（占位符）→ 相关项应判 UNVERIFIABLE 而不是 FAIL
  assert.ok(!/\[FAIL\]/.test(out), `preflight 对未初始化骨架报了 FAIL（应判 UNVERIFIABLE）：\n${out}`);
});

// ---------------------------------------------------------------- AGENTS.md 内容

test('骨架：AGENTS.md 指向 plugin-kit skill 与 preflight 自检脚本', () => {
  const agents = read('AGENTS.md');

  // 丢第一条 = AI 不知道有判据，会凭记忆干
  assert.ok(agents.includes('plugin-kit'), 'AGENTS.md 必须让 AI 去加载 plugin-kit skill');

  // 装前自检是新产品的主判据。断言锚定**具体脚本路径**（scripts/preflight.mjs）而不是
  // 裸词「preflight」——裸词在文首总结里也会出现，只删指路行时断言不会红（2026-11-13
  // mutate 抓到的空真：删了指路行、总结行还在，旧断言仍绿）。
  assert.ok(
    agents.includes('scripts/preflight.mjs'),
    'AGENTS.md 必须给出 scripts/preflight.mjs 的具体指路——装前自检是骨架交付流程的一步',
  );
});

test('骨架：AGENTS.md 不声称旧机制（拦截/台账/marker 已退役）', () => {
  const agents = read('AGENTS.md');
  assert.ok(!agents.includes('.stage-gate.json'), 'AGENTS.md 还在提退役的 marker');
  assert.ok(!agents.includes('GATE.json'), 'AGENTS.md 还在提退役的门记录');
  assert.ok(!agents.includes('台账'), 'AGENTS.md 还在提退役的台账');
});
