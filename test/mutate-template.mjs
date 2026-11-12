// 变红证明：4 条新断言各自回退一次，确认每一处都能抓到自己那类错
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// 仓库根：按本文件位置解析，不写死绝对路径（2026-11-13 修：仓库搬家后写死路径让本测试 ENOENT）。
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
    name: 'marker 加回 root 字段',
    file: TPL + '/.stage-gate.json',
    find: '{"enabled": true}',
    replace: '{"enabled": true, "root": "stages"}',
    expect: 'marker 里不该有 root',
  },
  {
    name: 'AGENTS.md 删掉所有 stages/ 提法',
    file: TPL + '/AGENTS.md',
    find: '### 产物必须落在 `stages/<阶段>/` 下',
    replace: '### 产物落哪都行',
    expect: 'stages/',
  },
  {
    name: 'AGENTS.md 退回假话「自己造等于作废机制」',
    file: TPL + '/AGENTS.md',
    find: '**机制挡不住你**：实测自签',
    replace: '自己造等于把审查机制作废。实测自签',
    expect: '假话',
  },
  {
    name: 'package.json 加空的 test 脚本',
    file: TPL + '/package.json',
    find: '"exports": { ".": "./index.js" },',
    replace: '"exports": { ".": "./index.js" },\n  "scripts": { "test": "node --test" },',
    expect: '假绿机',
  },
];

const results = [];
const base = run();
console.log('基线 → ' + (base.ok ? 'exit=0（全绿）' : 'exit!=0 ← 基线不绿'));
if (!base.ok) process.exit(1);

for (const m of muts) {
  const orig = readFileSync(m.file, 'utf8');
  if (!orig.includes(m.find)) {
    console.log('  SKIP  ' + m.name + '（注入点没找到）');
    results.push({ name: m.name, ok: false });
    continue;
  }
  writeFileSync(m.file, orig.replace(m.find, m.replace), 'utf8');
  const r = run();
  writeFileSync(m.file, orig, 'utf8');
  const red = !r.ok;
  const hit = r.out.split('\n').filter((l) => l.includes(m.expect)).length > 0;
  console.log('  ' + (red ? 'RED  ' : 'FAIL ') + m.name.padEnd(38) +
    (red ? '变红 ✓' : '仍绿 ← 空真') + (red && hit ? '  报了「' + m.expect + '」' : ''));
  results.push({ name: m.name, ok: red });
}

// 复原核验
const restored =
  readFileSync(TPL + '/.stage-gate.json', 'utf8').trim() === '{"enabled": true}' &&
  readFileSync(TPL + '/AGENTS.md', 'utf8').includes('机制挡不住你') &&
  !readFileSync(TPL + '/package.json', 'utf8').includes('"test"');
console.log('\n复原核验: ' + (restored ? '✓ 四处都回到原状' : '✗ 有文件没复原'));

const allRed = results.every((r) => r.ok);
console.log(allRed ? '全部变红：4 条新断言都在测东西。' : '有断言是空的，需修。');
process.exit(allRed && restored ? 0 : 1);
