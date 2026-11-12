// 变红证明（A5）：对合成项目逐个注入四大失败家族的缺陷 → preflight 必须逐项红 → 复原绿。
//
// 覆盖 P0 需求 A5 的五个注入点：
//   装不上①  删 dsh.bundle.patch
//   装不上②  patch name 改一半（与 package.json 不一致）
//   装不上③  Config 改普通对象
//   一加载就崩  client.js 加 export
//   看不见    skill 缺 resourceBase（frontmatter 空 description）
// 「环境相关」家族 UNVERIFIABLE 留痕（good 项目输出里必含该字样）。
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const PREFLIGHT = join(ROOT, 'skills', 'plugin-kit', 'scripts', 'preflight.mjs');

const work = mkdtempSync(join(tmpdir(), 'mutate-preflight-'));
const proj = join(work, 'proj');

let failed = 0;
const ok = (cond, msg) => {
  console.log('  ' + (cond ? 'PASS ' : 'FAIL ') + msg);
  if (!cond) failed += 1;
};

const GOOD_INDEX = `export const name = 'proj';\nexport const inject = [];\nexport function apply() {}\n`;
const GOOD_PATCH = `- insert:\n    - id: proj\n      name: '@local/proj'\n`;
const GOOD_PKG = JSON.stringify({ name: '@local/proj', type: 'module', dsh: { bundle: { patch: './cordis.patch.yml' } } });

function build(files = {}) {
  rmSync(proj, { recursive: true, force: true });
  const all = { 'package.json': GOOD_PKG, 'cordis.patch.yml': GOOD_PATCH, 'index.js': GOOD_INDEX, ...files };
  for (const [rel, content] of Object.entries(all)) {
    const p = join(proj, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
}

function run() {
  try {
    const out = execFileSync(process.execPath, [PREFLIGHT, proj, '--json'], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000,
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

function statusOf(jsonOut, id) {
  const parsed = JSON.parse(jsonOut.slice(jsonOut.indexOf('{')));
  const row = parsed.results.find((r) => r.id === id);
  return row?.status ?? 'MISSING-ROW';
}

try {
  // 基线：好项目全绿
  build();
  let r = run();
  ok(r.code === 0, '基线（无缺陷）退出码 0');
  const baseJson = r.out;

  // 注入 1：删 dsh.bundle.patch（家族①）
  build({ 'package.json': JSON.stringify({ name: '@local/proj', type: 'module' }) });
  r = run();
  ok(r.code === 1 && statusOf(r.out, 'install.bundle-patch') === 'FAIL', '注入① 缺 bundle.patch → install.bundle-patch FAIL');

  // 注入 2：patch name 改一半（家族①）
  build({ 'cordis.patch.yml': "- insert:\n    - id: proj\n      name: '@local/wrong'\n" });
  r = run();
  ok(r.code === 1 && statusOf(r.out, 'install.name-consistency') === 'FAIL', '注入② patch name 不一致 → install.name-consistency FAIL');

  // 注入 3：Config 普通对象（家族①）
  build({ 'index.js': `export const name = 'proj';\nexport const inject = [];\nexport const Config = {};\nexport function apply() {}\n` });
  r = run();
  ok(r.code === 1 && statusOf(r.out, 'install.config-shape') === 'FAIL', '注入③ Config = {} → install.config-shape FAIL');

  // 注入 4：client.js 加 export（家族③）
  build({ 'client.js': `export const x = 1;\nwindow.__ModuleLoader__.load({ id: 'proj', factory: () => ({}) });\n` });
  r = run();
  ok(r.code === 1 && statusOf(r.out, 'crash.client-esm') === 'FAIL', '注入④ client.js ESM → crash.client-esm FAIL');

  // 注入 5：skill 缺 description（家族②）
  build({ 'skills/demo/SKILL.md': '---\nname: demo\ndescription:\n---\nbody' });
  r = run();
  ok(r.code === 1 && statusOf(r.out, 'visible.skill-resourceBase') === 'FAIL', '注入⑤ skill 空 description → visible.skill-resourceBase FAIL');

  // 复原：全绿
  build();
  r = run();
  const parsed = JSON.parse(r.out.slice(r.out.indexOf('{')));
  const fails = parsed.results.filter((x) => x.status === 'FAIL');
  ok(r.code === 0 && fails.length === 0, `复原后零 FAIL（实际 ${fails.map((f) => f.id).join(', ') || '无'}）`);
  ok(r.out.includes('UNVERIFIABLE'), 'UNVERIFIABLE 留痕（家族④环境相关，本机判不了）');
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log(failed === 0 ? '\nA5 变红证明：5 注入点全部逐项红 + 复原绿 + UNVERIFIABLE 留痕。' : `\n${failed} 项失败。`);
process.exit(failed === 0 ? 0 : 1);
