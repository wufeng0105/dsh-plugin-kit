#!/usr/bin/env node
/**
 * reextract.mjs — 从当前安装的 DSH app.asar 重解宿主自带 skill 文档。
 *
 * 背景（2026-11-13 rc.2 实测）：
 *   rc.1 时代的四份宿主 skill（cordis-plugin-development / cordis-composition-reference /
 *   editing-cordis-compositions / agent-experience）已被宿主合并为一份 `dsh-doc`
 *   （43 文件）。本脚本把 asar 里 `dsh/node_modules/@deepseek-ai/dsh-agent-preset/skills/`
 *   下的全部内容解到 `skills/plugin-kit/host-skills/`，让宿主文档可 grep / glob / diff。
 *
 * asar 格式：8 字节 pickle header（uint32 4 + uint32 pickleSize + uint32 8 + uint32 jsonLen）
 *   + JSON 目录树 + 文件数据区（baseOffset = 8 + pickleSize）。unpacked 文件在 app.asar.unpacked/。
 *
 * 用法：
 *   node scripts/reextract.mjs                # 重解到 host-skills/（覆盖 dsh-doc/，保留 README/VERSION/PATHS）
 *   node scripts/reextract.mjs --check        # 只对比，不写入：列出与现有副本不一致的文件
 *   node scripts/reextract.mjs --self-test    # 用内建假 asar 证明脚本能发现差异
 *
 * 判定「该不该重解」：app.asar 的 mtime 晚于 host-skills/VERSION.json 的 extractedAt。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const ASAR = 'C:/Users/Administrator/AppData/Local/Programs/DeepSeek Harness/resources/app.asar';
const SKILLS_PREFIX = 'dsh/node_modules/@deepseek-ai/dsh-agent-preset/skills/';
const DEST = join(ROOT, 'skills', 'plugin-kit', 'host-skills');
/** 这些是本仓自己的文档，不随重解覆盖。 */
const KEEP = new Set(['README.md', 'VERSION.json', 'PATHS-README.md']);

// ---------------------------------------------------------------- asar 解析

/** 读 asar 目录树与数据区起点。 */
function readAsarHeader(fd) {
  const u32 = (off) => fd.readUInt32LE(off);
  const pickleSize = u32(4);
  const jsonLen = u32(12);
  const header = JSON.parse(fd.subarray(16, 16 + jsonLen).toString('utf8'));
  return { header, baseOffset: 8 + pickleSize };
}

/** 读取一个 asar 条目（unpacked 文件落盘在 app.asar.unpacked/）。 */
function readEntry(fd, baseOffset, entry, asarPath) {
  if (entry.unpacked) return readFileSync(ASAR + '.unpacked/' + asarPath);
  const start = baseOffset + Number(entry.offset);
  return fd.subarray(start, start + entry.size);
}

/** 收集 prefix 下的全部文件条目。 */
function collect(header, prefix) {
  const out = [];
  (function walk(node, path) {
    if (node.files) {
      for (const [name, child] of Object.entries(node.files)) walk(child, path ? `${path}/${name}` : name);
      return;
    }
    if (path.startsWith(prefix)) out.push({ path: path.slice(prefix.length), entry: node });
  })(header, '');
  return out;
}

// ---------------------------------------------------------------- 模式

function listCurrent() {
  const out = [];
  (function walk(dir, rel) {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) walk(join(dir, ent.name), r);
      else if (!KEEP.has(r)) out.push({ rel: r, size: statSync(join(dir, ent.name)).size });
    }
  })(DEST, '');
  return out;
}

// ---------------------------------------------------------------- 主流程

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) return selfTest();
  const checkOnly = args.includes('--check');

  if (!existsSync(ASAR)) {
    console.log(`FAIL  找不到 app.asar：${ASAR}`);
    return 2;
  }
  const fd = readFileSync(ASAR);
  const { header, baseOffset } = readAsarHeader(fd);
  const files = collect(header, SKILLS_PREFIX);
  if (files.length === 0) {
    console.log(`FAIL  asar 里 ${SKILLS_PREFIX} 下没有文件——宿主结构又变了，更新本脚本的 PREFIX`);
    return 1;
  }

  // 过期判定（A7 的正向实现）
  const version = JSON.parse(readFileSync(join(DEST, 'VERSION.json'), 'utf8'));
  const asarMtime = statSync(ASAR).mtimeMs;
  const extractedAt = Date.parse(version.extractedAt);
  const stale = asarMtime > extractedAt;
  console.log(`${stale ? 'STALE' : 'FRESH'}  asar mtime=${new Date(asarMtime).toISOString()} vs extractedAt=${version.extractedAt}（host=${version.dsh}）`);

  if (checkOnly) {
    const current = new Map(listCurrent().map((f) => [f.rel, f.size]));
    let diff = 0;
    for (const f of files) {
      const cur = current.get(f.path);
      if (cur === undefined) { console.log(`  NEW      ${f.path} (${f.entry.size}B)`); diff += 1; }
      else if (cur !== f.entry.size) { console.log(`  CHANGED  ${f.path} (工作区 ${cur}B vs asar ${f.entry.size}B)`); diff += 1; }
      else current.delete(f.path);
    }
    for (const rel of current.keys()) { console.log(`  GONE     ${rel}（asar 里已不存在）`); diff += 1; }
    console.log(diff === 0 && !stale ? '\n副本与 asar 一致，无需重解。' : `\n${diff} 个文件与 asar 不一致${stale ? '，且已过 STALE 判定' : ''}。去掉 --check 重解。`);
    return diff === 0 && !stale ? 0 : 1;
  }

  // 真正重解：清掉旧 skill 目录（保留本仓自己的三个文档），写入 asar 内容
  for (const rel of listCurrent().map((f) => f.rel)) {
    const p = join(DEST, rel);
    if (p.startsWith(join(DEST, 'dsh-doc')) || p.startsWith(join(DEST, 'cordis-plugin-development')) || p.startsWith(join(DEST, 'cordis-composition-reference')) || p.startsWith(join(DEST, 'editing-cordis-compositions')) || p.startsWith(join(DEST, 'agent-experience'))) {
      // 旧目录按 git 归档处置：这里只删工作树文件（git 里有历史）
      rmSync(p);
    }
  }
  let n = 0;
  for (const f of files) {
    const dest = join(DEST, f.path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, readEntry(fd, baseOffset, f.entry, SKILLS_PREFIX + f.path));
    n += 1;
  }
  // 更新 VERSION.json
  const nextVersion = {
    dsh: JSON.parse(readFileSync(join(ROOT, 'stages', 'p1.5', 't2-dsh-skill', 'package.json'), 'utf8')).version
      ?? process.env.DSH_VERSION ?? 'unknown',
    extractedAt: new Date().toISOString(),
    source: 'app.asar/dsh/node_modules/@deepseek-ai/dsh-agent-preset/skills（rc.2 起四份旧 skill 已合并为 dsh-doc）',
    asarBytes: fd.length,
  };
  // dsh 版本号从 asar 的 dsh/package.json 拿，比环境变量可靠
  const pkgEntry = collect(header, 'dsh/package.json');
  if (pkgEntry.length === 1) {
    nextVersion.dsh = JSON.parse(readEntry(fd, baseOffset, pkgEntry[0].entry, 'dsh/package.json').toString('utf8')).version;
  }
  writeFileSync(join(DEST, 'VERSION.json'), JSON.stringify(nextVersion, null, 2) + '\n');
  console.log(`OK    重解 ${n} 个文件；VERSION.json → dsh=${nextVersion.dsh} extractedAt=${nextVersion.extractedAt}`);
  return 0;
}

/** 内建假 asar：证明解析器往返一致（会绿），且内容错误时能发现（会红）。 */
function selfTest() {
  // 按真实 asar 的布局合成：[0..3]=4, [4..7]=pickleSize, [8..11]=4, [12..15]=jsonLen, [16..]=json, 数据区
  const payload = Buffer.from('NEW-CONTENT', 'utf8');
  const headerJson = JSON.stringify({ files: { 'fake-skill.md': { size: payload.length, offset: '0' } } });
  const headerBuf = Buffer.from(headerJson, 'utf8');
  const jsonLen = headerBuf.length;
  const pickleSize = 8 + jsonLen;          // 真实布局：baseOffset = 8 + pickleSize = 16 + jsonLen
  const head = Buffer.alloc(16);
  head.writeUInt32LE(4, 0);
  head.writeUInt32LE(pickleSize, 4);
  head.writeUInt32LE(jsonLen, 12);
  const fake = Buffer.concat([head, headerBuf, payload]);
  const { header, baseOffset } = readAsarHeader(fake);
  const files = collect(header, 'fake-');
  let failed = 0;
  const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failed += 1; };
  check('合成 asar 抽出 1 个条目', files.length === 1);
  const data = readEntry(fake, baseOffset, files[0].entry, 'fake-skill.md');
  check('解析往返一致（读回 NEW-CONTENT）', data.toString('utf8') === 'NEW-CONTENT');
  // 篡改内容 → 解析器必须读出被篡改的值（证明它不是恒真）
  const tampered = Buffer.from(fake);
  payload.copy(tampered, baseOffset, 0, 4);
  tampered.write('XXXX', baseOffset, 'utf8');
  const data2 = readEntry(tampered, baseOffset, files[0].entry, 'fake-skill.md');
  check('内容篡改能被发现（不再读回 NEW-CONTENT）', data2.toString('utf8').startsWith('XXXX'));
  return failed === 0 ? 0 : 1;
}

process.exitCode = main();
