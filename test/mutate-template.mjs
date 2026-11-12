// 变红证明：template.mjs 的守卫各自回退一次，确认每一处都能抓到自己那类错。
// 2026-11-13 重写：骨架改为 4 文件（marker/stages 退役），变异集随新守卫更新。
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const TPL = ROOT + '/skills/plugin-kit/template';

const run = () => {
  try {
    execFileSync(process.execPath, ['--test', 'test/template.mjs'], { cwd: ROOT, stdio: 'pipe', timeout: 120000 });
    return { ok: true, out: '' };
  } catch (e) {
    return { ok: false, out: String(e.stdout ?? '') + String(e.stderr ?? '') };
  }
};

const muts = [
  {
    name: 'package.json 删掉 dsh.bundle.patch',
    file: TPL + '/package.json',
    find: '"dsh": { "bundle": { "patch": "./cordis.patch.yml" } },',
    replace: '',
    expect: 'dsh.bundle.patch',
  },
  {
    name: 'patch 的 name 改成不一致的包名',
    file: TPL + '/cordis.patch.yml',
    find: "name: '@local/my-plugin'",
    replace: "name: '@local/somewhere-else'",
    expect: "name: '@local/my-plugin'",
  },
  {
    name: 'index.js 加回普通 Config = {}',
    file: TPL + '/index.js',
    find: 'export const inject = [];',
    replace: 'export const inject = [];\nexport const Config = {};',
    expect: 'Config',
  },
  {
    name: 'AGENTS.md 删掉 preflight 指路',
    file: TPL + '/AGENTS.md',
    find: '1. `node <plugin-kit包>/skills/plugin-kit/scripts/preflight.mjs <项目根>` —— 0 FAIL 才算预检过',
    replace: '1. 装前不用检查',
    expect: 'scripts/preflight.mjs',
  },
  {
    name: 'AGENTS.md 加回退役 marker 提法',
    file: TPL + '/AGENTS.md',
    find: '## 不要做',
    replace: '## 不要做\n- 记得维护 .stage-gate.json marker',
    expect: '.stage-gate.json',
  },
];

const results = [];
const base = run();
console.log('基线 → ' + (base.ok ? 'exit=0（全绿）' : 'exit!=0 ← 基线不绿'));
if (!base.ok) process.exit(1);

// 复原约定：每个变异跑完**立即**写回（try/finally），任何一步退出都不会留下变异态。
// （教训：复原集中放在循环后，一旦中途 process.exit 或异常，骨架文件就停在变异态——
// 2026-11-13 实际发生过：AGENTS.md 被留在「1. 装前不用检查」污染了后续所有验证。）
let everRestored = true;
for (const m of muts) {
  const orig = readFileSync(m.file, 'utf8');
  if (!orig.includes(m.find)) {
    console.log('  SKIP  ' + m.name + '（注入点没找到）');
    results.push({ name: m.name, ok: false });
    continue;
  }
  writeFileSync(m.file, orig.replace(m.find, m.replace), 'utf8');
  let red = false;
  let hit = false;
  try {
    const r = run();
    red = !r.ok;
    hit = r.out.split('\n').filter((l) => l.includes(m.expect)).length > 0;
  } finally {
    writeFileSync(m.file, orig, 'utf8');
    if (readFileSync(m.file, 'utf8') !== orig) everRestored = false;
  }
  console.log('  ' + (red ? 'RED  ' : 'FAIL ') + m.name.padEnd(38) +
    (red ? '变红 ✓' : '仍绿 ← 空真') + (red && hit ? '  报了「' + m.expect + '」' : ''));
  results.push({ name: m.name, ok: red });
}

const final = run();
console.log('\n复原核验: ' + (everRestored && final.ok ? '✓ 每步即时复原，基线仍绿' : `✗ ${everRestored ? '基线不绿' : '有变异态残留（已尽力写回）'}`));

const allRed = results.every((r) => r.ok);
console.log(allRed ? '全部变红：守卫都在测东西。' : '有断言是空的，需修。');
process.exit(allRed && everRestored && final.ok ? 0 : 1);
