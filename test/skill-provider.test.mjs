import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseFrontmatter,
  isValidCandidate,
  isValidDefinition,
  listSkills,
  readSkill,
  SKILL_NAME,
  DESCRIPTION_LIMIT,
  PACKAGED_SKILL_RANK,
} from '../lib/skill-provider.js';

/** 测试建的临时目录统一登记，进程退出时清理（防止 TEMP 堆积）。 */
const WORKSPACES = [];
process.on('exit', () => {
  for (const dir of WORKSPACES) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* 清理失败不影响测试 */
    }
  }
});

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, '..');
const PACKAGED_SKILLS = join(PACKAGE_ROOT, 'skills');

// ---------------------------------------------------------------- frontmatter

test('parseFrontmatter: 正常解析 name/description', () => {
  const text = '---\nname: my-skill\ndescription: does things\n---\nbody here';
  const r = parseFrontmatter(text);
  assert.equal(r.metadata.name, 'my-skill');
  assert.equal(r.metadata.description, 'does things');
  assert.equal(r.body.trim(), 'body here');
});

test('parseFrontmatter: 没有 frontmatter 返回 null', () => {
  assert.equal(parseFrontmatter('no frontmatter'), null);
});

test('parseFrontmatter: 未闭合返回 null', () => {
  assert.equal(parseFrontmatter('---\nname: x\n'), null);
});

test('parseFrontmatter: 去引号', () => {
  const r = parseFrontmatter('---\nname: "quoted"\n---\nx');
  assert.equal(r.metadata.name, 'quoted');
});

// ---------------------------------------------------------------- 候选校验（K3 第二重防线）

const baseCandidate = {
  name: 'demo',
  description: 'a demo skill',
  invocation: { modelInvocable: true, userInvocable: true },
  provider: 'plugin-kit',
  rank: PACKAGED_SKILL_RANK,
};

test('isValidCandidate: 合法候选通过', () => {
  assert.equal(isValidCandidate(baseCandidate, 'plugin-kit'), true);
});

test('isValidCandidate: name 不合语法被拒（K4）', () => {
  for (const bad of ['Demo', 'demo_skill', 'demo skill', '', '-demo', 'demo-']) {
    assert.equal(isValidCandidate({ ...baseCandidate, name: bad }, 'plugin-kit'), false, `应拒绝 name=${JSON.stringify(bad)}`);
  }
});

test('isValidCandidate: description 为空被拒', () => {
  assert.equal(isValidCandidate({ ...baseCandidate, description: '' }, 'plugin-kit'), false);
});

test('isValidCandidate: description 超 500 被拒（防回退）', () => {
  const long = 'x'.repeat(DESCRIPTION_LIMIT + 1);
  assert.equal(isValidCandidate({ ...baseCandidate, description: long }, 'plugin-kit'), false);
  const exact = 'x'.repeat(DESCRIPTION_LIMIT);
  assert.equal(isValidCandidate({ ...baseCandidate, description: exact }, 'plugin-kit'), true, '恰好 500 应通过');
});

test('isValidCandidate: provider 不等于注册名被拒（K3）', () => {
  assert.equal(isValidCandidate({ ...baseCandidate, provider: 'other' }, 'plugin-kit'), false);
});

test('isValidCandidate: rank 缺失或非有限数被拒', () => {
  assert.equal(isValidCandidate({ ...baseCandidate, rank: undefined }, 'plugin-kit'), false);
  assert.equal(isValidCandidate({ ...baseCandidate, rank: Number.NaN }, 'plugin-kit'), false);
});

test('isValidCandidate: invocation 缺失被拒', () => {
  assert.equal(isValidCandidate({ ...baseCandidate, invocation: undefined }, 'plugin-kit'), false);
});

test('isValidCandidate: null/非对象被拒，不抛', () => {
  assert.equal(isValidCandidate(null, 'plugin-kit'), false);
  assert.equal(isValidCandidate('x', 'plugin-kit'), false);
  assert.equal(isValidCandidate(undefined, 'plugin-kit'), false);
});

// ---------------------------------------------------------------- listSkills

function makeSkillsDir(layout) {
  const root = mkdtempSync(join(tmpdir(), 'skills-'));
  WORKSPACES.push(root);
  for (const [dir, content] of Object.entries(layout)) {
    mkdirSync(join(root, dir), { recursive: true });
    if (content !== null) writeFileSync(join(root, dir, 'SKILL.md'), content, 'utf8');
  }
  return root;
}

test('listSkills: 正常扫出一个 skill', async () => {
  const root = makeSkillsDir({
    'good': '---\nname: good\ndescription: a good skill\n---\nbody',
  });
  try {
    const list = await listSkills({ root, provider: 'plugin-kit' });
    assert.equal(list.length, 1);
    assert.equal(list[0].name, 'good');
    assert.equal(list[0].provider, 'plugin-kit');
    assert.equal(list[0].rank, PACKAGED_SKILL_RANK);
    assert.equal(list[0].source, 'custom');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('listSkills: 缺 SKILL.md 的目录被跳过（第一重防线）', async () => {
  const root = makeSkillsDir({ 'empty': null });
  try {
    const list = await listSkills({ root, provider: 'plugin-kit' });
    assert.equal(list.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('listSkills: name 不合语法的被跳过（K4）', async () => {
  const root = makeSkillsDir({
    'Bad_Name': '---\nname: Bad_Name\ndescription: x\n---\nbody',
  });
  try {
    const list = await listSkills({ root, provider: 'plugin-kit' });
    assert.equal(list.length, 0, '不合语法的应被静默跳过，不能让注册表抛');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('listSkills: description 为空的被跳过', async () => {
  const root = makeSkillsDir({ 'nodesc': '---\nname: nodesc\n---\nbody' });
  try {
    const list = await listSkills({ root, provider: 'plugin-kit' });
    assert.equal(list.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('listSkills: _ 和 . 开头的目录不算 skill', async () => {
  const root = makeSkillsDir({
    '_private': '---\nname: private\ndescription: x\n---\nb',
    '.hidden': '---\nname: hidden\ndescription: x\n---\nb',
  });
  try {
    const list = await listSkills({ root, provider: 'plugin-kit' });
    assert.equal(list.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('listSkills: 根目录不存在返回空数组（不抛）', async () => {
  const list = await listSkills({ root: join(tmpdir(), 'definitely-not-exist-' + Date.now()), provider: 'plugin-kit' });
  assert.deepEqual(list, []);
});

test('listSkills: 按 name 排序', async () => {
  const root = makeSkillsDir({
    'zeta': '---\nname: zeta\ndescription: z\n---\nb',
    'alpha': '---\nname: alpha\ndescription: a\n---\nb',
  });
  try {
    const list = await listSkills({ root, provider: 'plugin-kit' });
    assert.deepEqual(list.map((c) => c.name), ['alpha', 'zeta']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- readSkill

test('readSkill: 读出正文', async () => {
  const root = makeSkillsDir({ 'demo': '---\nname: demo\ndescription: d\n---\nTHE BODY' });
  try {
    const r = await readSkill({ root, provider: 'plugin-kit', locator: { directory: 'demo' } });
    assert.ok(r !== undefined);
    assert.match(r.content, /THE BODY/);
    assert.equal(r.name, 'demo');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('readSkill: 目录穿越被拒', async () => {
  for (const bad of ['..', '../etc', 'a/b', 'a\\b', '']) {
    const r = await readSkill({ root: '/tmp', provider: 'plugin-kit', locator: { directory: bad } });
    assert.equal(r, undefined, `应拒绝 directory=${JSON.stringify(bad)}`);
  }
});

test('readSkill: locator 形状坏返回 undefined，不抛', async () => {
  assert.equal(await readSkill({ root: '/tmp', provider: 'plugin-kit', locator: null }), undefined);
  assert.equal(await readSkill({ root: '/tmp', provider: 'plugin-kit', locator: {} }), undefined);
});

// （纪律段相关测试已随 lib/discipline.js 退役删除——ADR 0001。）

// （SECTION_NAME / SECTION_ORDER 相关断言已随 lib/discipline.js 退役删除——ADR 0001。）

// ---------------------------------------------------------------- 打包的 skill（真文件）

test('打包的 skills/ 目录存在', () => {
  assert.equal(existsSync(PACKAGED_SKILLS), true, `${PACKAGED_SKILLS} 应存在`);
});

test('打包的 plugin-kit 能被扫出来', async () => {
  const list = await listSkills({ root: PACKAGED_SKILLS, provider: 'plugin-kit' });
  const names = list.map((c) => c.name);
  assert.ok(names.includes('plugin-kit'), `应包含 plugin-kit，实际 ${JSON.stringify(names)}`);
});

test('打包的 plugin-kit description 不超 500 字符（防回退）', async () => {
  const list = await listSkills({ root: PACKAGED_SKILLS, provider: 'plugin-kit' });
  const kit = list.find((c) => c.name === 'plugin-kit');
  assert.ok(kit !== undefined);
  assert.ok(kit.description.length <= DESCRIPTION_LIMIT, `实际 ${kit.description.length} 字符`);
  assert.ok(kit.description.length > 100, 'description 不该短到失去触发力');
});

test('打包的 plugin-kit 正文可读且非空', async () => {
  const r = await readSkill({ root: PACKAGED_SKILLS, provider: 'plugin-kit', locator: { directory: 'plugin-kit' } });
  assert.ok(r !== undefined);
  assert.ok(r.content.length > 500, `正文应足够长，实际 ${r.content.length} 字符`);
});

// ---------------------------------------------------------------- 包内自足（原「双树一致性」，2026-11-10 改写）

test('skill 自足：包内 skills/plugin-kit 的引用文件全部存在', () => {
  // 2026-11-10 变更：原先这条守的是「包内 = .dsh/skills/plugin-kit 的双树一致性」。
  // 那个约束已取消——`.dsh/skills/plugin-kit` 当初只是本地开发现场，
  // 现在源只有一处：包内 skills/plugin-kit/。
  //
  // 但「双树一致性」原本守的东西仍然要守，换成了更本质的问法：
  // **这个包被单独安装时，SKILL.md 里提到的每个文件都必须真的在包里。**
  // 否则用户装完点开 skill，一半链接是死的——而测试全绿。

  const skillDir = join(PACKAGED_SKILLS, 'plugin-kit');
  const skillMd = readFileSync(join(skillDir, 'SKILL.md'), 'utf8');

  // 抓 SKILL.md 里所有 markdown 相对链接 + 反引号路径引用（新 SKILL.md 用反引号指路）
  const mdLinks = [...skillMd.matchAll(/\]\(([^)#][^)]*)\)/g)]
    .map((m) => m[1])
    .filter((href) => !/^[a-z]+:/i.test(href)); // 排除 http: / https:
  const backtickRefs = [...skillMd.matchAll(/`((?:template|scripts|assets|host-skills)\/[a-zA-Z0-9_\-./]+\.(?:mjs|md|json|yml))`/g)].map((m) => m[1]);
  const links = [...mdLinks, ...backtickRefs];
  assert.ok(links.length > 0, 'SKILL.md 里一个引用都没有——解析器或文档出问题了');

  const missing = [];
  for (const href of links) {
    const target = resolve(skillDir, href);
    if (!existsSync(target)) missing.push(href);
  }
  assert.deepEqual(missing, [], `SKILL.md 引用了包里不存在的文件：${JSON.stringify(missing)}`);

  // host-skills 是宿主文档副本（2026-11-13 重解为 dsh-doc），必须在包里且可读。
  const hostSkills = join(skillDir, 'host-skills');
  assert.ok(existsSync(hostSkills), 'host-skills/ 不在包内——宿主文档副本丢了');
  assert.ok(
    existsSync(join(hostSkills, 'VERSION.json')),
    'host-skills/VERSION.json 缺失，无法判断副本是否过期',
  );
  assert.ok(
    existsSync(join(hostSkills, 'dsh-doc', 'SKILL.md')),
    'host-skills/dsh-doc/SKILL.md 缺失（rc.2 起宿主文档唯一入口）',
  );
});

// ---------------------------------------------------------------- SkillDefinition 完整性（真机踩过的 bug）

test('readSkill: 返回完整 SkillDefinition，七个必需字段齐全', async () => {
  // 真机踩过：早期只返回 { content, name, description }，
  // list() 成功（名字可见）但 skill 工具加载报 "source must be a string"。
  // 这条测试钉住完整形状。
  const root = makeSkillsDir({ 'demo': '---\nname: demo\ndescription: a demo\n---\nBODY' });
  try {
    const def = await readSkill({ root, provider: 'plugin-kit', locator: { directory: 'demo' } });
    assert.ok(def !== undefined, '应返回定义');

    // 宿主 validateDefinition 逐字段查的七个
    assert.equal(typeof def.name, 'string', 'name 必须是 string');
    assert.equal(typeof def.description, 'string', 'description 必须是 string');
    assert.ok(def.description.length > 0, 'description 不能为空');
    assert.equal(typeof def.source, 'string', 'source 必须是 string ← 这个漏过');
    assert.ok(def.source.length > 0, 'source 不能为空');
    assert.equal(typeof def.provider, 'string', 'provider 必须是 string');
    assert.equal(def.provider, 'plugin-kit', 'provider 必须等于注册名');
    assert.equal(typeof def.content, 'string', 'content 必须是 string');
    assert.ok(def.content.length > 0, 'content 不能为空');

    // invocation 的两条 boolean
    assert.equal(typeof def.invocation.modelInvocable, 'boolean');
    assert.equal(typeof def.invocation.userInvocable, 'boolean');

    // path 可选，但给了就得是 string
    assert.equal(typeof def.path, 'string');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('isValidDefinition: 缺 source 被拒（真机 bug 的回归）', () => {
  const good = {
    name: 'demo',
    description: 'd',
    source: 'custom',
    provider: 'plugin-kit',
    content: 'body',
    invocation: { modelInvocable: true, userInvocable: true },
  };
  assert.equal(isValidDefinition(good, 'plugin-kit'), true);
  const { source, ...noSource } = good;
  assert.equal(isValidDefinition(noSource, 'plugin-kit'), false, '缺 source 必须被拒');
});

test('isValidDefinition: content 非 string 被拒', () => {
  const bad = {
    name: 'demo', description: 'd', source: 'custom', provider: 'plugin-kit',
    content: undefined, invocation: { modelInvocable: true, userInvocable: true },
  };
  assert.equal(isValidDefinition(bad, 'plugin-kit'), false);
});

test('isValidDefinition: invocation 字段非 boolean 被拒', () => {
  const bad = {
    name: 'demo', description: 'd', source: 'custom', provider: 'plugin-kit',
    content: 'x', invocation: { modelInvocable: 'yes', userInvocable: true },
  };
  assert.equal(isValidDefinition(bad, 'plugin-kit'), false);
});

// ---------------------------------------------------------------- resourceBase（2026-11-10 实测缺口）
//
// 宿主 `dsh-skill/lib/index.js` 的 renderResourceHint 分两支：
//   有 resourceBase(kind:'directory') → 注入「Base directory for this skill: <绝对路径>」
//                                       +「相对路径按这个 base 解析」
//   没有                              → 只说「Resources for this skill are managed by provider X」
//
// 而宿主渲染用的是 **readSkill** 的返回值（不是 listSkills 的）。
// 2026-11-10 之前 readSkill 没给这个字段，模型拿到 SKILL.md 正文却不知道
// references/、host-skills/ 在哪——只能猜，或去翻打不开的 app.asar。
//
// 这条测试钉住它，否则下次静默消失（独立审计实证：删掉那一行，全部测试仍绿）。

test('readSkill: 必须带 resourceBase（否则模型不知道文件在哪）', async () => {
  const root = makeSkillsDir({ 'demo': '---\nname: demo\ndescription: a demo\n---\nBODY' });
  try {
    const def = await readSkill({ root, provider: 'plugin-kit', locator: { directory: 'demo' } });
    assert.ok(def !== undefined, '应返回定义');

    assert.ok('resourceBase' in def, 'readSkill 必须返回 resourceBase——缺了宿主不会告诉模型 base directory');
    assert.equal(def.resourceBase.kind, 'directory', 'kind 必须是 directory（宿主 switch 的第一支）');
    assert.equal(typeof def.resourceBase.path, 'string', 'path 必须是 string');
    assert.ok(def.resourceBase.path.length > 0, 'path 不能为空');

    // 关键：必须是**绝对路径**，且指向这个 skill 自己的目录。
    // 宿主会把它原样注入「Base directory for this skill: <path>」，
    // 模型据此解析 SKILL.md 里的 host-skills/、references/。
    assert.ok(
      isAbsolute(def.resourceBase.path),
      `path 必须是绝对路径，实际是 ${def.resourceBase.path}`,
    );
    assert.equal(
      resolve(def.resourceBase.path),
      resolve(join(root, 'demo')),
      'path 必须指向 root/<directory>，否则相对链接解析到错的地方',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('readSkill: resourceBase 与 listSkills 报的是同一个目录', async () => {
  // 两条路径都描述同一个 skill，报的 base 必须一致。
  // 不一致会让「按 listSkills 看到的」和「按 readSkill 解析的」落到不同目录。
  const root = makeSkillsDir({ 'demo': '---\nname: demo\ndescription: a demo\n---\nBODY' });
  try {
    const listed = await listSkills({ root, provider: 'plugin-kit' });
    const def = await readSkill({ root, provider: 'plugin-kit', locator: { directory: 'demo' } });
    assert.equal(listed.length, 1);
    assert.ok(def !== undefined);

    assert.equal(
      resolve(listed[0].resourceBase.path),
      resolve(def.resourceBase.path),
      'listSkills 与 readSkill 报的 base directory 必须一致',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
