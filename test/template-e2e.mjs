// 端到端实测：复制模板 → 改占位符 → node --check → 真打包验证。
// 这是「复制出来的项目真的能用」的直接证据，不是推理。
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 仓库根：按本文件位置解析，不写死绝对路径（2026-11-13 修：仓库搬家后写死路径让本测试 ENOENT）。
import { fileURLToPath } from 'node:url';
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const TPL = join(ROOT, 'skills/plugin-kit/template');
const NAME = 'e2e-fresh';
// 宿主进程的 PATH 里可能没有 npm（宿主用包装脚本）。用绝对路径，Windows 上要 .cmd。
const NPM = process.platform === 'win32' ? 'C:\\Program Files\\nodejs\\npm.cmd' : 'npm';
const work = mkdtempSync(join(tmpdir(), 'tpl-e2e-'));
const proj = join(work, NAME);

let failed = 0;
const ok = (cond, msg) => {
  console.log('  ' + (cond ? 'PASS ' : 'FAIL ') + msg);
  if (!cond) failed += 1;
};

try {
  // 1. 模拟初始化：整目录复制（含隐藏文件）
  cpSync(TPL, proj, { recursive: true });
  const copied = [];
  (function walk(dir, rel) {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) walk(join(dir, ent.name), r);
      else copied.push(r);
    }
  })(proj, '');
  console.log('  复制出 ' + copied.length + ' 个文件: ' + copied.join(', '));
  ok(copied.includes('.stage-gate.json'), '隐藏文件 .stage-gate.json 复制到了');
  ok(copied.includes('stages/p0/.gitkeep'), 'stages/p0/ 结构复制到了');

  // 2. 占位符替换
  for (const rel of ['package.json', 'cordis.patch.yml', 'index.js']) {
    const p = join(proj, rel);
    writeFileSync(p, readFileSync(p, 'utf8').replaceAll('my-plugin', NAME));
  }
  let residue = 0;
  for (const rel of copied) {
    if (readFileSync(join(proj, rel), 'utf8').includes('my-plugin')) residue += 1;
  }
  ok(residue === 0, '占位符替换后零残留');

  // 3. 三处名字一致
  const pkg = JSON.parse(readFileSync(join(proj, 'package.json'), 'utf8'));
  ok(pkg.name === '@local/' + NAME, 'package.json name = @local/' + NAME);
  ok(readFileSync(join(proj, 'cordis.patch.yml'), 'utf8').includes(`name: '@local/${NAME}'`), 'patch 的 name 一致');
  ok(readFileSync(join(proj, 'index.js'), 'utf8').includes(`export const name = '${NAME}'`), 'index.js 的 name 一致');

  // 4. 语法
  execFileSync(process.execPath, ['--check', join(proj, 'index.js')], { stdio: 'pipe', timeout: 30000 });
  ok(true, 'index.js 语法合法');

  // 5. 真打包（在这个新项目里）
  // Windows 上 spawnSync 直接跑 .cmd 会 EINVAL（Node 已知限制），必须 shell: true。
  // shell 模式下整个命令行会被重解析，路径带空格所以要引号。
  const pack = (args) =>
    execFileSync(`"${NPM}" pack ${args}`, {
      cwd: proj, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000, shell: true,
    });
  const out = pack('--dry-run --json');
  const parsed = JSON.parse(out);
  const files = new Set(parsed[0].files.map((f) => f.path));
  ok(files.has('package.json') && files.has('cordis.patch.yml') && files.has('index.js'),
    '新项目 npm pack 出全部 3 个本体文件 (' + parsed[0].files.length + ' 文件)');

  // 6. Host 半真能 import（从解出的 tarball）
  pack('');
  // scoped 包（@local/xxx）打包后的文件名会剥掉 @ 和 /：@local/e2e-fresh → local-e2e-fresh-0.1.0.tgz
  const tgz = join(proj, `${NAME.startsWith('@') ? '' : ''}${'local-'}${NAME}-0.1.0.tgz`);
  ok(existsSync(tgz), 'tgz 存在: ' + tgz.split(/[\\/]/).pop());
  // tarball 在 proj 里；解到 work（proj 的父目录），得到 work/package/
  execFileSync('tar', ['-xzf', tgz, '-C', work], { timeout: 60000 });
  const mod = await import('file://' + join(work, 'package', 'index.js').replaceAll('\\', '/'));
  ok(mod.name === NAME, 'tarball 里的 index.js 可 import，name = ' + mod.name);
  ok(typeof mod.apply === 'function', 'apply 是函数');
  ok(Array.isArray(mod.inject) && mod.inject.length === 0, 'inject 是空数组');

  // 7. marker 可解析
  const marker = JSON.parse(readFileSync(join(proj, '.stage-gate.json'), 'utf8'));
  // 2026-11-12 审计改：原先是 `marker.enabled === true && marker.root === 'stages'`。
  // root 已从配置砍掉（readMarker 不读它），所以断言改成「只有 enabled，不许有 root」。
  ok(
    marker.enabled === true && marker.root === undefined,
    '.stage-gate.json 只有 enabled，没有废弃的 root',
  );

  // 清理 tgz
  rmSync(tgz, { force: true });
} catch (e) {
  console.log('  FAIL 异常: ' + (e.message ?? e).split('\n')[0]);
  failed += 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log(failed === 0 ? '\n端到端实测：复制出的项目真的能用。' : `\n${failed} 项失败。`);
process.exit(failed === 0 ? 0 : 1);
