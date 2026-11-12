/**
 * preflight 判定式测试 —— 与 self-test 互补。
 *
 * self-test（脚本内建）验证「判定式会红」；本文件把它接进 npm test，
 * 让 `npm run check` 在 preflight 回归时也红。断言与脚本 self-test 相同的用例，
 * 外加：JSON 输出形态、退出码语义。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const PREFLIGHT = join(ROOT, 'skills', 'plugin-kit', 'scripts', 'preflight.mjs');

const WORKSPACES = [];
process.on('exit', () => {
  for (const dir of WORKSPACES) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* 清理失败不影响结果 */ }
  }
});

function makeProject(name, files) {
  const dir = mkdtempSync(join(tmpdir(), `pf-${name}-`));
  WORKSPACES.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
  return dir;
}

function run(dir, args = []) {
  try {
    const out = execFileSync(process.execPath, [PREFLIGHT, dir, ...args], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000,
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

const GOOD_INDEX = `export const name = 'good';\nexport const inject = [];\nexport function apply() {}\n`;
const GOOD_PATCH = `- insert:\n    - id: good\n      name: '@local/good'\n`;
const GOOD_PKG = JSON.stringify({ name: '@local/good', type: 'module', dsh: { bundle: { patch: './cordis.patch.yml' } } });

test('preflight：好项目零 FAIL，退出码 0', () => {
  const dir = makeProject('good', {
    'package.json': GOOD_PKG,
    'cordis.patch.yml': GOOD_PATCH,
    'index.js': GOOD_INDEX,
  });
  const { code } = run(dir);
  assert.equal(code, 0);
});

test('preflight：缺 dsh.bundle.patch → FAIL + 退出码 1 + 补法提示', () => {
  const dir = makeProject('nopatch', {
    'package.json': JSON.stringify({ name: '@local/x', type: 'module' }),
    'index.js': GOOD_INDEX,
  });
  const { code, out } = run(dir);
  assert.equal(code, 1);
  assert.match(out, /\[FAIL\]/);
  assert.match(out, /dsh\.bundle\.patch/);
  assert.match(out, /补法/, 'FAIL 行必须带补法');
});

test('preflight：client.js 含 export → FAIL（拼接 parse 抓 ESM）', () => {
  const dir = makeProject('esm', {
    'package.json': GOOD_PKG,
    'cordis.patch.yml': GOOD_PATCH,
    'index.js': GOOD_INDEX,
    'client.js': `export const x = 1;\nwindow.__ModuleLoader__.load({ id: 'good', factory: () => ({}) });\n`,
  });
  const { code, out } = run(dir);
  assert.equal(code, 1);
  assert.match(out, /无法在宿主拼接脚本里 parse/);
});

test('preflight：client.js 缺 ModuleLoader 注册 → FAIL', () => {
  const dir = makeProject('no-loader', {
    'package.json': GOOD_PKG,
    'cordis.patch.yml': GOOD_PATCH,
    'index.js': GOOD_INDEX,
    'client.js': `window.myThing = 1;\n`,
  });
  const { out } = run(dir);
  assert.match(out, /__ModuleLoader__\.load/);
});

test('preflight：--json 输出可解析且带全部家族', () => {
  const dir = makeProject('json', {
    'package.json': GOOD_PKG,
    'cordis.patch.yml': GOOD_PATCH,
    'index.js': GOOD_INDEX,
  });
  const { out } = run(dir, ['--json']);
  const parsed = JSON.parse(out);
  assert.equal(parsed.root, dir);
  const families = new Set(parsed.results.map((r) => r.family));
  for (const family of ['① 装不上', '② 装上了但看不见', '③ 一加载就崩', '④ 环境相关']) {
    assert.ok(families.has(family), `缺家族 ${family}`);
  }
});

test('preflight：家族④ 恒 UNVERIFIABLE 且退出码不受它影响', () => {
  const dir = makeProject('env', {
    'package.json': GOOD_PKG,
    'cordis.patch.yml': GOOD_PATCH,
    'index.js': GOOD_INDEX,
  });
  const { code, out } = run(dir);
  assert.match(out, /env\.full-bundle|完整插件集共存验证/);
  assert.match(out, /UNVERIFIABLE/);
  assert.equal(code, 0, 'UNVERIFIABLE 不算失败——只有 FAIL 让退出码非 0');
});
