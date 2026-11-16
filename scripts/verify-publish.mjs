#!/usr/bin/env node
/**
 * verify-publish.mjs — 发布后核实：npm 上真的有这个版本吗。
 *
 * 为什么单独一个脚本：2026-11-17 踩过——`npm publish` 打印了
 * `+ @wufeng0105/dsh-plugin-kit@0.3.0` 且 exit 0，但紧接着的查询连续 404，
 * 一度被误判成「发布失败」。真相是：
 *   - 本机全局 registry 是 npmmirror 镜像，查询读到的是镜像的旧索引；
 *   - 官方源 CDN 传播需要几分钟，期间 packument 与 tarball 直链都可能 404。
 * 所以「发布成功」的唯一判据是**官方源版本端点**能查到，不是 publish 的退出码，
 * 也不是 `npm view` 不带 --registry 的结果。
 *
 * 用法：
 *   node scripts/verify-publish.mjs              # 核当前 package.json 的版本
 *   node scripts/verify-publish.mjs 0.3.0        # 核指定版本
 *   node scripts/verify-publish.mjs --wait       # 等传播（默认最多 8 分钟）
 *
 * 退出码：0 已确认 / 1 未确认或超时 / 2 用法错误
 */
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = 'https://registry.npmjs.org/';
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

const args = process.argv.slice(2);
const shouldWait = args.includes('--wait');
const version = args.find((a) => /^\d+\.\d+\.\d+/.test(a)) ?? PKG.version;

if (args.includes('--help') || args.includes('-h')) {
  console.log('用法：node scripts/verify-publish.mjs [版本] [--wait]');
  process.exit(2);
}

const url = `${REGISTRY}${PKG.name.replace('/', '%2f')}`;

async function fetchPackument() {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} 读取 packument 失败`);
  return res.json();
}

function check(packument) {
  const present = packument.versions?.[version] !== undefined;
  const latest = packument['dist-tags']?.latest;
  return { present, latest, tarball: packument.versions?.[version]?.dist?.tarball };
}

const started = Date.now();
const LIMIT_MS = 8 * 60 * 1000;
const INTERVAL_MS = 15 * 1000;

console.log(`核实 ${PKG.name}@${version} 是否已在官方源`);
console.log(`  registry: ${REGISTRY}`);

for (;;) {
  let state = null;
  let error = null;
  try {
    const packument = await fetchPackument();
    state = check(packument);
  } catch (e) {
    error = e.message;
  }

  const elapsed = Math.round((Date.now() - started) / 1000);

  if (state?.present === true) {
    console.log(`  ✓ 版本在官方源上（耗时 ${elapsed}s）`);
    console.log(`    dist-tags.latest = ${state.latest}`);
    console.log(`    tarball = ${state.tarball}`);
    if (state.latest !== version) {
      console.log(`    注意：latest 指向 ${state.latest}，不是 ${version}——本版本未占用 latest 标签`);
    }
    process.exit(0);
  }

  if (!shouldWait) {
    console.log(`  ✗ 官方源还没有 ${version}（耗时 ${elapsed}s）`);
    if (error !== null) console.log(`    ${error}`);
    console.log('');
    console.log('可能原因（按概率）：');
    console.log('  1. CDN 还在传播——刚发布后常见，等 1–5 分钟。用 --wait 重试本脚本。');
    console.log('  2. 发布根本没发出——查 publish 日志里有没有 `http fetch PUT 202`。');
    console.log('     只看到 GET、没有 PUT 才是真没发；有 PUT 202 就是传播。');
    console.log('  3. 查的不是官方源——本仓 .npmrc 已固定 registry，别用别处的配置来判。');
    process.exit(1);
  }

  if (Date.now() - started > LIMIT_MS) {
    console.log(`  ✗ 等待超时（${elapsed}s）仍未在官方源上确认 ${version}`);
    if (error !== null) console.log(`    ${error}`);
    process.exit(1);
  }

  console.log(`  … 尚未出现（${elapsed}s），15s 后重试`);
  await new Promise((r) => setTimeout(r, INTERVAL_MS));
}
