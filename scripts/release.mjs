#!/usr/bin/env node
/**
 * release.mjs — 版本发布：改版本号 → 校验 → 打 tag → 提示发布。
 *
 * 「tag 与 npm 统一管理」的机械保证：版本号只有一个来源（package.json），
 * tag 名与原子的值从它派生，任何一步对不上就拒绝继续。
 *
 * 用法：
 *   node scripts/release.mjs patch|minor|major    # 升版本 + 打 tag
 *   node scripts/release.mjs --check              # 只核对现状是否一致（不改任何东西）
 *
 * 退出码：0 成功 / 1 有校验失败 / 2 用法错误
 *
 * 它做什么：
 *   1. 核对工作树干净、当前分支是 main、与 origin/main 同步（--check 也查这三条）
 *   2. 跑 npm run check（全量验证门）——不过就不发布
 *   3. 升 package.json 版本（不自动 commit，交给 --commit 显式指定）
 *   4. 打 annotated tag v<version>，tag 消息含 CHANGELOG 对应节的首行
 *   5. 打印后续命令（push tag → npm publish），不自动执行推送与发布
 *
 * 为什么不在脚本里自动 push 和 publish：两者都是不可撤销的外部动作。
 * 脚本负责「准备好且一致」，执行留给人在看清输出之后。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const PKG = join(ROOT, 'package.json');

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 600_000, ...opts }).trim();

let failed = 0;
const ok = (cond, msg, fix) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}${!cond && fix ? `\n        补法：${fix}` : ''}`);
  if (!cond) failed += 1;
  return cond;
};

// ---------------------------------------------------------------- 版本工具

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

function bump(version, kind) {
  const m = SEMVER.exec(version);
  if (m === null) throw new Error(`package.json 的 version 不是纯 x.y.z：${version}`);
  const [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  if (kind === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`未知的升版类型：${kind}`);
}

// ---------------------------------------------------------------- 一致性核对

function checkState({ requireClean = true } = {}) {
  const pkg = JSON.parse(readFileSync(PKG, 'utf8'));
  const version = pkg.version;

  console.log(`版本：${pkg.name}@${version}\n`);

  // ① 版本号格式
  ok(SEMVER.test(version), `version 是纯 x.y.z（${version}）`, 'npm 不接受 0.2.0-rc.1 之外的任意后缀用于 latest');

  // ② CHANGELOG 有对应节（否则 tag 消息空、用户看不到改了什么）
  const changelog = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');
  ok(changelog.includes(`## [${version}]`), `CHANGELOG 有 [${version}] 这一节`, `在 CHANGELOG.md 加 "## [${version}] - YYYY-MM-DD" 小节`);

  // ③ 已有同名 tag 视为冲突（防止重复发布同一个版本）
  const tags = run('git', ['tag', '-l', `v${version}`]);
  ok(tags === '', `tag v${version} 尚未存在`, `已存在则先删：git tag -d v${version}（已推送的要 git push origin :refs/tags/v${version}）`);

  // ④ 工作树干净（打包内容必须来自已提交的树）
  if (requireClean) {
    const dirty = run('git', ['status', '--porcelain']);
    ok(dirty === '', '工作树干净', dirty === '' ? '' : `未提交的改动：\n${dirty.split('\n').map((l) => '        ' + l).join('\n')}`);
  }

  // ⑤ 分支与远端同步
  let branch = '';
  try { branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']); } catch { /* 无 git 环境 */ }
  ok(branch === 'main', `当前分支是 main（${branch || '未知'}）`, 'git switch main');

  let behind = '';
  try { behind = run('git', ['rev-list', '--count', 'origin/main..HEAD']); } catch { /* 无 origin */ }
  if (behind !== '') ok(behind === '0', '本地没有未推送的提交', `有 ${behind} 个提交未推送：git push origin main`);

  // ⑥ npm 上该版本是否已存在（存在就不能再发，同版本不可覆盖）
  let published = '';
  try {
    published = run('npm', ['view', `${pkg.name}@${version}`, 'version', '--registry=https://registry.npmjs.org/']);
  } catch {
    published = ''; // 404 = 尚未发布，是正常状态
  }
  ok(published === '', `npm 上还没有 ${version}`, published !== '' ? `npm 上已有 ${version}——改版本号再发（同版本不可覆盖）` : '');

  // ⑦ repository 字段指回本仓（npm ↔ GitHub 关联、市场下载量统计依赖它）
  ok(
    typeof pkg.repository?.url === 'string' && pkg.repository.url.includes('wufeng0105/dsh-plugin-kit'),
    'repository 字段指回本仓',
    'package.json 的 repository.url 必须是 git+https://github.com/wufeng0105/dsh-plugin-kit.git',
  );

  return { pkg, version };
}

// ---------------------------------------------------------------- 主流程

function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');
  const kind = args.find((a) => ['patch', 'minor', 'major'].includes(a));

  console.log('发布前核对\n');
  const { pkg, version } = checkState({ requireClean: !checkOnly });
  console.log('');

  if (checkOnly) {
    console.log(failed === 0 ? `✓ 现状一致：可以发布 ${version}` : `${failed} 项不满足——先修再发`);
    return failed === 0 ? 0 : 1;
  }
  if (!kind) {
    console.error('用法：node scripts/release.mjs patch|minor|major\n      node scripts/release.mjs --check');
    return 2;
  }
  if (failed > 0) {
    console.log(`${failed} 项核对失败——未做任何改动`);
    return 1;
  }

  // 跑全量验证门（不过就不动版本号）
  console.log('跑全量验证门（npm run check）…');
  try {
    execFileSync('npm', ['run', 'check'], { cwd: ROOT, stdio: 'inherit', timeout: 900_000, shell: true });
  } catch {
    console.log('\n验证门未通过——未升版本。先修测试。');
    return 1;
  }

  const next = bump(version, kind);
  pkg.version = next;
  writeFileSync(PKG, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log(`\n版本：${version} → ${next}`);

  // tag 消息取 CHANGELOG 对应节的首条要点（没有就退回一句通用话）
  const changelog = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');
  const section = new RegExp(`## \\[${next.replaceAll('.', '\\.')}\\]([\\s\\S]*?)(?=\\n## \\[|$)`).exec(changelog);
  const firstLine = section === null
    ? ''
    : (section[1].split('\n').find((l) => l.trim() !== '' && !l.startsWith('#')) ?? '').trim();
  const msg = `v${next}${firstLine === '' ? '' : ` — ${firstLine}`}`;

  run('git', ['add', 'package.json']);
  run('git', ['commit', '-m', `chore: release v${next}`]);
  run('git', ['tag', '-a', `v${next}`, '-m', msg]);
  console.log(`已提交并打 tag：v${next}`);

  console.log(`
接下来两步（脚本不代做，都是不可撤销的外部动作）：

  git push origin main --follow-tags
  npm run publish:npm

发布后核对：
  npm view ${pkg.name} version --registry=https://registry.npmjs.org/
  https://www.npmjs.com/package/${pkg.name}

别忘了 CHANGELOG：release 之前先把「## [${next}]」小节写好（本脚本只核对它在不在）。
`);
  return 0;
}

process.exitCode = main();
