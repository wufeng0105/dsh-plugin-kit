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

// ---------------------------------------------------------------- 2026-11-12 审计新增
//
// 三条反向断言。它们的共同点：**守的是「文档不许说什么」，不是「代码做了什么」**。
// 起因是一次独立审计查出我（Lead）自立的 12 条骨架判据里 7 条立错了靶——
// 其中最坏的一条是「骨架该有 scripts」，实测 `node --test` 零测试 **exit=0**，
// 补上去等于给每个新项目造一台假绿机。

test('骨架：marker 里不许有 root 字段（它是假开关的说明书）', () => {
  // 2026-11-11 D1 裁定把 root 从配置里砍掉，理由：配错会**静默失效**
  // （认不出阶段写入 → allow，既不拦也不报错）。
  // `readMarker` 更是完全不看内容，只判文件在不在。
  //
  // 所以 marker 里留一个 `"root": "stages"` 的后果不是「无效」，
  // 是**教人用废弃字段**——下一个人改成 `my-stages` 就以为生效了。
  const marker = JSON.parse(read(' .stage-gate.json'.trim()));
  assert.equal(
    marker.root,
    undefined,
    'marker 里不该有 root——readMarker 不读它，真实 root 恒为 stages（写它就是假开关的说明书）',
  );
  assert.equal(marker.enabled, true, 'marker 应保留 enabled: true');
});

test('骨架：AGENTS.md 必须说产物落在 stages/ 下（漏了台账静默全空）', () => {
  // 这是唯一会让整条产品线空转的一条。
  // 台账的 isStageWrite 只认落在 `stages/` 下的写入：
  //   path 形态 → locateStage(...).under
  //   text 形态 → 命令文本 includes(`stages/`)
  // 所以产物写到 `docs/` 或仓库根 → **不进台账，也不报错**。
  // 用户会得到一本空台账，且没有任何信号说「记漏了」。
  //
  // 断言怎么写才不空真（2026-11-12 踩过）：
  // 第一版写的是「文本里含 `stages/`」，结果把标题改成「产物落哪都行」后，
  // 正文里还有别的 `stages/` 字样，测试照样绿 —— 那测的是「文件提到过这个词」，
  // 不是「它给了正确的落点」。所以改成**按节抽**：只在那节里找。
  const agents = read('AGENTS.md');

  // ① 必须有一节专门讲落点
  const sectionMatch = /### 产物必须落在[^\n]*\n([\s\S]*?)(?=\n## |\n### |$)/.exec(agents);
  assert.ok(
    sectionMatch !== null,
    'AGENTS.md 没有「产物必须落在 stages/」那一节——产物写别处会让台账静默全空',
  );

  // ② 那一节里必须给出具体路径形式
  const body = sectionMatch[1];
  assert.ok(
    /`stages\/p0\/`/.test(body),
    '落点那节没给具体路径（应写出 `stages/p0/` 这样的例子）',
  );

  // ③ 必须解释「不这么做的后果是静默的」，否则读者会把它当成风格建议
  assert.ok(
    /不(会)?报错|没有(任何)?信号|静默/.test(body),
    '落点那节没说清「写别处不会报错」——不说清它就像风格建议',
  );

  // ④ 台账这个词必须出现（它是这条规矩存在的原因）
  assert.ok(/台账|_ledger/.test(body), '落点那节没提台账——那是这条规矩存在的唯一原因');
});

test('骨架：AGENTS.md 不许声称机制能挡住自签 GATE.json', () => {
  // 实测（2026-11-12）：
  //   无门时写 stages/p0/GATE.json → allow
  //   p0 已自签，写 stages/p1/GATE.json → allow
  // 所以任何「不能自签 / 自己造等于作废机制」的说法都是**假话**。
  //
  // 正确写法必须承认机制挡不住它，把这条降级为纪律。
  const agents = read('AGENTS.md');
  assert.ok(
    !/自己造等于把审查机制作废/.test(agents),
    'AGENTS.md 仍说「自己造等于作废机制」——实测自签会 allow，这是假话',
  );
  assert.ok(
    !/可以自签的通行证|不能自签/.test(agents),
    'AGENTS.md 仍暗示机制能挡自签——实测能自签',
  );
  // 正面：它必须承认机制挡不住
  assert.ok(
    /机制挡不住/.test(agents),
    'AGENTS.md 必须明说「机制挡不住你」——否则读者以为有技术约束',
  );
});

test('骨架：不许给空项目配 npm test（零测试 exit=0 = 假绿机）', () => {
  // 实测 `node --test` 在没有任何测试文件时 **exit=0**。
  // 骨架是「功能未定」状态，此刻加 `"test": "node --test"` 的后果是：
  // 新项目第一天就有一个永远绿、且永远不会红的目标。
  // 这直接撞铁律「任何检查先证明它会红」。
  const pkg = JSON.parse(read('package.json'));
  assert.equal(
    pkg.scripts?.test,
    undefined,
    '骨架阶段不该有 test 脚本——零测试 exit=0，那是假绿机。等有真测试再加。',
  );
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
  // 2026-11-12 审计改：原先这里断言 `marker.root === 'stages'`。
  // 那条和新语义冲突——root 已从配置砍掉，readMarker 根本不读它。
  // 「marker 不许有 root」由上方的专门断言守，这里不再重复。
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
