// 包外自足实测：把 tarball 解到包外一处，在那里验证判据齐全、Host 半能 import。
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 仓库根：按本文件位置解析，不写死绝对路径（2026-11-13 修：仓库搬家后写死路径让本测试 ENOENT）。
import { fileURLToPath } from 'node:url';
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const work = mkdtempSync(join(tmpdir(), 'selfcontained-'));
let failed = 0;

function ok(cond, msg) {
  console.log('  ' + (cond ? 'PASS ' : 'FAIL ') + msg);
  if (!cond) failed += 1;
}

try {
  // 1. 真打一次 tgz（不是 dry-run）
  const out = execSync('npm pack --json', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000 });
  const tgzName = JSON.parse(out)[0].filename;
  const tgzPath = join(ROOT, tgzName);

  // 2. 解到包外
  execSync(`tar -xzf "${tgzPath}" -C "${work}"`, { encoding: 'utf8', timeout: 120000 });
  const pkg = join(work, 'package');
  console.log('  解出: ' + pkg);

  // 3. 判据必须在
  for (const rel of [
    'skills/plugin-kit/SKILL.md',
    'skills/plugin-kit/references/process.md',
    'skills/plugin-kit/host-skills/VERSION.json',
    'skills/plugin-kit/host-skills/PATHS-README.md',
    'skills/plugin-kit/host-skills/cordis-plugin-development/SKILL.md',
    'skills/plugin-kit/host-skills/cordis-plugin-development/references/practices.md',
    'skills/plugin-kit/host-skills/cordis-composition-reference/references/packages.md',
    'lib/gate.js',
    'vendor/config.js',
    'index.js',
  ]) {
    ok(existsSync(join(pkg, rel)), '解出后有 ' + rel);
  }

  // 4. VERSION.json 可解析
  const ver = JSON.parse(readFileSync(join(pkg, 'skills/plugin-kit/host-skills/VERSION.json'), 'utf8'));
  ok(typeof ver.dsh === 'string' && ver.dsh.length > 0, 'VERSION.json 有 dsh 字段: ' + ver.dsh);

  // 5. Host 半能 import（真跑一次 apply 存在性检查）
  const hostMod = await import('file://' + join(pkg, 'index.js').replaceAll('\\', '/'));
  ok(typeof hostMod.apply === 'function', 'Host 半导出 apply');
  ok(typeof hostMod.name === 'string', 'Host 半导出 name');
  ok(Array.isArray(hostMod.inject), 'Host 半导出 inject');

  // 6. skill-provider 能在这个包里列出 skill（证明判据真的可被注册）
  const sp = await import('file://' + join(pkg, 'lib/skill-provider.js').replaceAll('\\', '/'));
  const skills = await sp.listSkills({ root: join(pkg, 'skills'), provider: 'plugin-kit' });
  ok(skills.length === 1 && skills[0].name === 'plugin-kit', '从解出的包里能列出 plugin-kit skill');
  ok(typeof skills[0].resourceBase?.path === 'string', 'listSkills 报出 resourceBase.path');

  const def = await sp.readSkill({ root: join(pkg, 'skills'), provider: 'plugin-kit', locator: { directory: 'plugin-kit' } });
  ok(def !== undefined && typeof def.resourceBase?.path === 'string', 'readSkill 报出 resourceBase.path');
  ok(
    existsSync(join(def.resourceBase.path, 'host-skills', 'VERSION.json')),
    'readSkill 报的 base 下真的能读到 host-skills/VERSION.json ← 模型照它解析能找到文件',
  );

  // 7. 清理 tgz
  rmSync(tgzPath, { force: true });
} catch (e) {
  console.log('  FAIL 异常: ' + (e.message ?? e).split('\n')[0]);
  failed += 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log(failed === 0 ? '\n包外自足实测：全部通过。' : `\n有 ${failed} 项失败。`);
process.exit(failed === 0 ? 0 : 1);
