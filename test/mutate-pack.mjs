// 证明新增的守卫真会红：逐条注入缺陷 → 跑测试 → 必须红 → 复原
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function run(cmd) {
  try {
    execFileSync('node', cmd.split(' '), {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000,
    });
    return { ok: true, out: '' };
  } catch (e) {
    return { ok: false, out: String(e.stdout ?? '') + String(e.stderr ?? '') };
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

// ---- 变异 2：把 dsh-doc 副本里的一个文件挪走 → packed.mjs 必须红
{
  const victim = `${ROOT}/skills/plugin-kit/host-skills/dsh-doc/references/practices.md`;
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
    name: '删 dsh-doc 内层文件',
    injected: moved,
    red: !r.ok,
    detail: moved ? (r.ok ? '仍绿 ← 空真' : '变红 ✓') : '注入失败',
  });
}

// ---- 变异 3：SKILL.md 引用一个不存在的文件 → packed.mjs 必须红
{
  const f = `${ROOT}/skills/plugin-kit/SKILL.md`;
  const orig = readFileSync(f, 'utf8');
  const patched = orig.replace(
    '## 二、完成验证',
    '## 二、完成验证\n\n参见 `scripts/ghost-does-not-exist.mjs`。\n',
  );
  const changed = patched !== orig;
  writeFileSync(f, patched, 'utf8');
  const r = run('node --test test/packed.mjs');
  writeFileSync(f, orig, 'utf8');
  results.push({
    name: 'SKILL.md 引到包外文件',
    injected: changed,
    red: !r.ok,
    detail: changed ? (r.ok ? '仍绿 ← 空真' : '变红 ✓') : '注入失败',
  });
}

// ---- 变异 3b（2026-11-13 审查 D1 回归守卫）：保鲜命令占位符路径改坏 → readme-claims 必须红
{
  // D1：SKILL.md 的 `<本skill目录>/...` 占位符命令曾指向不存在的文件，
  // 三个引用检查器的正则都抓不到这种形态。readme-claims 的「保鲜:命令占位符逐条解析」
  // 是补上的守卫——本变异证明它确实会红。
  const f = `${ROOT}/skills/plugin-kit/SKILL.md`;
  const orig = readFileSync(f, 'utf8');
  const patched = orig.replace(
    'node <本skill目录>/scripts/recheck.mjs --touchpoints',
    'node <本skill目录>/../elsewhere/recheck.mjs --touchpoints',
  );
  const changed = patched !== orig;
  writeFileSync(f, patched, 'utf8');
  const r = run('node --test test/readme-claims.mjs');
  writeFileSync(f, orig, 'utf8');
  results.push({
    name: '保鲜命令占位符指坏路径',
    injected: changed,
    red: !r.ok,
    detail: changed ? (r.ok ? '仍绿 ← 空真' : '变红 ✓') : '注入失败',
  });
}

// ---- 变异 4：骨架里改名一处、忘另一处 → template.mjs 必须红
{
  // 这是骨架最可能的坏法：有人改 package.json 的 name，忘了 cordis.patch.yml。
  // 后果是那一行指向不存在的包，插件装不上——而 node --check 和 npm pack 都不报错。
  const f = `${ROOT}/skills/plugin-kit/template/cordis.patch.yml`;
  const orig = readFileSync(f, 'utf8');
  const patched = orig.replace(
    `name: '@local/my-plugin'`,
    `name: '@local/some-other-name'`,
  );
  const changed = patched !== orig;
  writeFileSync(f, patched, 'utf8');
  const r = run('node --test test/template.mjs');
  writeFileSync(f, orig, 'utf8');
  results.push({
    name: '骨架改名只改一半',
    injected: changed,
    red: !r.ok,
    detail: changed ? (r.ok ? '仍绿 ← 空真' : '变红 ✓') : '注入失败',
  });
}

// ---- 变异 5：骨架漏一个本体文件 → packed.mjs 必须红
{
  const victim = `${ROOT}/skills/plugin-kit/template/AGENTS.md`;
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
    name: '骨架漏 AGENTS.md',
    injected: moved,
    red: !r.ok,
    detail: moved ? (r.ok ? '仍绿 ← 空真' : '变红 ✓') : '注入失败',
  });
}

console.log('\n=== 变异结果 ===');
let allRed = true;
for (const r of results) {
  console.log('  ' + (r.red ? 'RED  ' : 'FAIL ') + r.name.padEnd(30) + r.detail);
  if (!r.red) allRed = false;
}
console.log(allRed ? '\n全部变红：守卫确实在测东西。' : '\n有守卫是空的，需修。');
process.exit(allRed ? 0 : 1);
