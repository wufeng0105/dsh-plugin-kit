// 证明新增的守卫真会红：逐条注入缺陷 → 跑测试 → 必须红 → 复原
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';

const ROOT = 'C:/Users/Administrator/Documents/ProgramFilesCode/DshBundle/dsh-plugin-kit';

function run(cmd) {
  try {
    const out = execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000 });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: (e.stdout ?? '') + (e.stderr ?? '') };
  }
}

const results = [];

// ---- 变异 1：删掉 readSkill 的 resourceBase 行 → skill-provider.test 必须红
{
  const f = `${ROOT}/lib/skill-provider.js`;
  const orig = readFileSync(f, 'utf8');
  const patched = orig.replace(
    /\n\s*resourceBase: \{ kind: 'directory', path: join\(root, locator\.directory\) \},/,
    '',
  );
  const changed = patched !== orig;
  writeFileSync(f, patched, 'utf8');
  const r = run('node --test test/skill-provider.test.mjs');
  writeFileSync(f, orig, 'utf8');
  results.push({
    name: '删 readSkill 的 resourceBase',
    injected: changed,
    red: !r.ok,
    detail: changed ? (r.ok ? '仍绿 ← 空真' : '变红 ✓') : '注入失败',
  });
}

// ---- 变异 2：把 host-skills 里的一个文件挪走 → packed.mjs 必须红
{
  const victim = `${ROOT}/skills/plugin-kit/host-skills/cordis-plugin-development/templates/decoration/client.js`;
  const backup = `${victim}.mutbak`;
  let moved = false;
  if (existsSync(victim)) {
    writeFileSync(backup, readFileSync(victim));
    unlinkSync(victim);
    moved = true;
  }
  const r = run('node --test test/packed.mjs');
  if (moved) {
    writeFileSync(victim, readFileSync(backup));
    unlinkSync(backup);
  }
  results.push({
    name: '删 host-skills 内层文件',
    injected: moved,
    red: !r.ok,
    detail: moved ? (r.ok ? '仍绿 ← 空真' : '变红 ✓') : '注入失败',
  });
}

// ---- 变异 3：SKILL.md 链接一个不存在的文件 → packed.mjs 必须红
{
  const f = `${ROOT}/skills/plugin-kit/SKILL.md`;
  const orig = readFileSync(f, 'utf8');
  const patched = orig.replace(
    '## 按需读什么',
    '## 按需读什么\n\n[幽灵文件](references/ghost-does-not-exist.md)\n',
  );
  const changed = patched !== orig;
  writeFileSync(f, patched, 'utf8');
  const r = run('node --test test/packed.mjs');
  writeFileSync(f, orig, 'utf8');
  results.push({
    name: 'SKILL.md 链到包外文件',
    injected: changed,
    red: !r.ok,
    detail: changed ? (r.ok ? '仍绿 ← 空真' : '变红 ✓') : '注入失败',
  });
}

console.log('\n=== 变异结果 ===');
let allRed = true;
for (const r of results) {
  console.log('  ' + (r.red ? 'RED  ' : 'FAIL ') + r.name.padEnd(30) + r.detail);
  if (!r.red) allRed = false;
}
console.log(allRed ? '\n全部变红：新守卫确实在测东西。' : '\n有守卫是空的，需修。');
process.exit(allRed ? 0 : 1);
