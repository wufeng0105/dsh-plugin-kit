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
 * ## 判据
 *
 * 全部围绕一件事：**占位符 `my-plugin` 是唯一的名字来源，且三处一致。**
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

/** 占位符。改这里等于改骨架的命名约定——三处必须跟着改。 */
const PLACEHOLDER = 'my-plugin';
const PACKAGE_NAME = `@local/${PLACEHOLDER}`;

const read = (rel) => readFileSync(join(TPL, rel), 'utf8');

// ---------------------------------------------------------------- 文件齐全

test('骨架：6 个文件齐全（隐藏文件最容易在复制时漏）', () => {
  // `.stage-gate.json` 是隐藏文件。复制时不带「含隐藏项」的选项就丢，
  // 而丢了它 = 阶段门永远不启用，用户却以为启用了。
  //
  // 这里**故意不含 `.gitignore`**：npm 打包时总会排除它（2026-11-11 实测），
  // 所以骨架里放一份，会让「仓库里的骨架」与「包里的骨架」不一致。
  // 需要的项目自己建。
  for (const rel of [
    'package.json',
    'cordis.patch.yml',
    'index.js',
    'AGENTS.md',
    '.stage-gate.json',
    'stages/p0/.gitkeep',
  ]) {
    assert.ok(existsSync(join(TPL, rel)), `骨架缺 ${rel}`);
  }
});

test('骨架：不含 npm 装不进包的文件', () => {
  // 反向守卫：加回 `.gitignore`（或 `.npmignore`）会让仓库与包不一致。
  for (const banned of ['.gitignore', '.npmignore']) {
    assert.ok(
      !existsSync(join(TPL, banned)),
      `骨架不该有 ${banned}——npm 打包时总会排除它，仓库里有而包里没有`,
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
  assert.ok(
    index.includes(`[${PLACEHOLDER}]`),
    `index.js 的日志前缀必须带 [${PLACEHOLDER}]`,
  );
});

test('骨架：占位符唯一，不存在第二套名字', () => {
  // 初始化时靠「搜 my-plugin 是否零残留」判断改名做全了。
  // 如果骨架里还混着 demo / example / test-plugin，那条检查就失效了。
  const files = ['package.json', 'cordis.patch.yml', 'index.js', 'AGENTS.md', '.stage-gate.json'];
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

test('骨架：index.js 不导出普通 Config，inject 为空', () => {
  const index = read('index.js');

  // 真机踩过：export const Config = {} → activate 崩在
  // TypeError: Cannot read properties of undefined (reading 'validate')
  // 因为 cordis 要求 Config 是 schemastery Schema（有 ~standard.validate）。
  assert.ok(
    !/export\s+const\s+Config\s*=\s*\{\s*\}/.test(index),
    'export const Config = {} 会让 activate 崩——要配置就用 Schema.object(...)，不需要就不导出',
  );

  // 骨架阶段 inject 必须为空：猜服务名会让插件永远 pending，
  // 而宿主把「有 entry 未激活」当成 web boot 失败。
  assert.ok(
    /export const inject = \[\s*\]/.test(index),
    '骨架的 inject 必须是空数组——不确定就别猜',
  );
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

// ---------------------------------------------------------------- 阶段门 marker

test('骨架：.stage-gate.json 启用阶段门', () => {
  let marker;
  assert.doesNotThrow(() => {
    marker = JSON.parse(read('.stage-gate.json'));
  }, '.stage-gate.json 不是合法 JSON');

  // 只看存在性也算「已采用」（readMarker 的判定），但内容要能被解析，
  // 否则台账里会记成 malformed。
  assert.equal(marker.enabled, true, 'marker 必须 enabled: true，否则等于没启用');
  assert.equal(marker.root, 'stages', 'marker 的 root 要和默认一致');
});

// ---------------------------------------------------------------- AGENTS.md 内容

test('骨架：AGENTS.md 含两条不能丢的指路', () => {
  const agents = read('AGENTS.md');

  // 丢第一条 = AI 不知道有判据，会凭记忆干
  assert.ok(agents.includes('plugin-kit'), 'AGENTS.md 必须让 AI 去加载 plugin-kit skill');

  // 丢第二条 = AI 照宿主文档里的相对路径解析，落到 23 处不存在的文件。
  // 这是 2026-11-10 独立审计实测出来的坑，不是假设。
  assert.ok(
    agents.includes('PATHS-README'),
    'AGENTS.md 必须提醒先读 host-skills/PATHS-README.md（相对路径基准不同）',
  );

  // 自造门记录会把审查机制作废——这是被「自己捏 GATE.json」踩过之后加的话
  assert.ok(
    agents.includes('GATE.json'),
    'AGENTS.md 必须写明不要自己创建 GATE.json',
  );
});
