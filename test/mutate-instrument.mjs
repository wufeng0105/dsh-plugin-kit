// 变红证明：分别回退两个仪表修复，确认 smoke 会红
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const ROOT = 'C:/Users/Administrator/Documents/ProgramFilesCode/DshBundle/dsh-plugin-kit';
const IDX = ROOT + '/index.js';

const run = () => {
  try {
    execFileSync(process.execPath, ['--test', 'test/smoke.mjs'], {
      cwd: ROOT, stdio: 'pipe', timeout: 120000,
    });
    return { ok: true, out: '' };
  } catch (e) {
    return { ok: false, out: String(e.stdout ?? '') + String(e.stderr ?? '') };
  }
};

const mutations = [
  {
    name: '变异 A：readGate 不传 cwd',
    find: 'gateCache.set(upstream, await readGate(upstream, { cwd: baseDir, signal: exec.signal }));',
    replace: 'gateCache.set(upstream, await readGate(upstream));',
  },
  {
    name: '变异 B：markerCache 无条件缓存',
    find: 'if (result.adopted) markerCache.set(baseDir, result);',
    replace: 'markerCache.set(baseDir, result);',
  },
  {
    // 2026-11-11 D1 裁定：root 从配置项移除，理由是「配错即静默放行」。
    // 这个变异把 config.root 读回来，验证守卫能抓到「配错就静默放行」。
    name: '变异 C：root 恢复成可配置（配错即静默放行）',
    find: 'const root = normalizePath(DEFAULT_ROOT);',
    replace: 'const root = normalizePath(config.root ?? DEFAULT_ROOT);',
  },
];

const results = [];

// 基线
{
  const r = run();
  console.log('基线 → ' + (r.ok ? 'exit=0（全绿）' : 'exit!=0 ← 基线就不绿，无法做变红证明'));
  results.push({ name: '基线', red: false, baselineOk: r.ok });
}

for (const m of mutations) {
  const orig = readFileSync(IDX, 'utf8');
  const patched = orig.replace(m.find, m.replace);
  const injected = patched !== orig && patched !== undefined;
  if (!injected) {
    console.log('  ' + m.name + '  → 注入失败（源码形状变了）');
    results.push({ name: m.name, injected: false, red: false });
    continue;
  }
  writeFileSync(IDX, patched, 'utf8');
  const r = run();
  writeFileSync(IDX, orig, 'utf8');
  const red = !r.ok;
  console.log('  ' + (red ? 'RED  ' : 'FAIL ') + m.name + '  ' + (red ? '变红 ✓' : '仍绿 ← 空真'));
  results.push({ name: m.name, injected: true, red });
}

// 复原核验
const restored = readFileSync(IDX, 'utf8').includes('if (result.adopted) markerCache.set(baseDir, result);')
  && readFileSync(IDX, 'utf8').includes('readGate(upstream, { cwd: baseDir, signal: exec.signal })');
console.log('\n复原核验: ' + (restored ? '两处修复都在 ✓' : '✗ 源码未正确复原'));

const allRed = results.filter((r) => r.name !== '基线').every((r) => r.red);
console.log(allRed ? '全部变红：新守卫确实在测东西。' : '有守卫是空的，需修。');
process.exit(allRed && restored ? 0 : 1);
