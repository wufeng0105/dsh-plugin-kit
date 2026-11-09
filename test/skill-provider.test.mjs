import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
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
import { SECTION_NAME, SECTION_ORDER, DISCIPLINE_TEXT } from '../lib/discipline.js';

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

// ---------------------------------------------------------------- 纪律段

test('DISCIPLINE_TEXT: 是条件句，不是无条件断言', () => {
  // 审计 I1：非插件项目里不能出现假指令
  assert.match(DISCIPLINE_TEXT, /如果/, '必须以条件句开头');
  assert.match(DISCIPLINE_TEXT, /\.stage-gate\.json/, '必须说明判断依据');
  assert.match(DISCIPLINE_TEXT, /忽略本段/, '必须给出不相关时的处理方式');
});

test('DISCIPLINE_TEXT: 第一条是「去加载判据」', () => {
  // 审计 I5：最需要说服的动作要排第一
  const firstItem = DISCIPLINE_TEXT.split('\n').find((l) => l.trim().startsWith('1.'));
  assert.ok(firstItem !== undefined, '应有第 1 条');
  assert.match(firstItem, /plugin-kit/, '第 1 条应指向 skill');
});

test('DISCIPLINE_TEXT: 不注入 skill 全文（长度可控）', () => {
  assert.ok(DISCIPLINE_TEXT.length < 800, `纪律段应短小，实际 ${DISCIPLINE_TEXT.length} 字符`);
});

test('DISCIPLINE_TEXT: 明写权威源，不复述门规则', () => {
  assert.match(DISCIPLINE_TEXT, /唯一的判据来源|不复述/, '应声明权威源在 skill 里');
});

test('SECTION_ORDER 是有限数', () => {
  assert.equal(typeof SECTION_ORDER, 'number');
  assert.ok(Number.isFinite(SECTION_ORDER));
});

test('SECTION_NAME 带命名空间前缀', () => {
  assert.match(SECTION_NAME, /^plugin-kit:/);
});

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

// ---------------------------------------------------------------- 双树一致性（审计 C3b）

/** 递归列出目录下所有文件的相对路径 + sha256。 */
function hashTree(root) {
  const out = new Map();
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) walk(abs, rel);
      else if (entry.isFile()) out.set(rel, createHash('sha256').update(readFileSync(abs)).digest('hex'));
    }
  };
  walk(root, '');
  return out;
}

test('双树一致性：包内 skills/plugin-kit 与 .dsh/skills/plugin-kit 哈希相等', () => {
  // 审计 C3 (方案 A)：.dsh/skills/plugin-kit 是权威源，包内是构建产物。
  // 漂移必须让测试变红，而不是靠人记得同步。
  const authoritative = resolve(PACKAGE_ROOT, '..', '.dsh', 'skills', 'plugin-kit');
  if (!existsSync(authoritative)) {
    // 权威源不在（比如这个包被单独下载）。
    // 铁律「空真排除」：不能用 assert.ok(true) 恒真通过——那等于这条测试从没跑过。
    // 正确做法是显式跳过（node:test 的 skip），跳过会出现在测试报告里，不是伪装成通过。
    t.skip(`权威源不存在，无法比对：${authoritative}`);
    return;
  }
  const packaged = hashTree(join(PACKAGED_SKILLS, 'plugin-kit'));
  const source = hashTree(authoritative);

  const onlyInSource = [...source.keys()].filter((k) => !packaged.has(k));
  const onlyInPackage = [...packaged.keys()].filter((k) => !source.has(k));
  const differing = [...source.keys()].filter((k) => packaged.has(k) && packaged.get(k) !== source.get(k));

  assert.deepEqual(onlyInSource, [], `权威源有但包里没有：${JSON.stringify(onlyInSource)}`);
  assert.deepEqual(onlyInPackage, [], `包里有但权威源没有：${JSON.stringify(onlyInPackage)}`);
  assert.deepEqual(differing, [], `内容不一致：${JSON.stringify(differing)}`);
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
