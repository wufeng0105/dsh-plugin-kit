#!/usr/bin/env node
/**
 * 变红证明 —— 证明测试不是摆设。
 *
 * 做三件事：
 *   1. 把内核复制到临时目录
 *   2. 逐个施加「应该让测试变红」的变异
 *   3. 断言每种变异都真的让测试失败
 *
 * 如果一个变异施加后测试仍然全绿，说明那条测试是空的。
 *
 * 用法：node test/mutate.mjs
 * 退出码：0 全部变异都变红了 / 1 有变异没变红（测试有洞）
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SOURCE = join(ROOT, 'lib', 'gate.js');

/** 每项：[名字, 找什么, 换成什么] */
const MUTATIONS = [
  [
    '未知工具改成放行（I5 的绕过通道）',
    `  if (target.kind === 'unknown') {\n    return denyOf(REASONS.UNKNOWN_WRITE_TOOL,`,
    `  if (false) {\n    return denyOf(REASONS.UNKNOWN_WRITE_TOOL,`,
  ],
  [
    '缺上游门改成放行（G2 的核心）',
    `  if (gate.state === 'missing') {\n    return denyOf(REASONS.GATE_MISSING,`,
    `  if (false) {\n    return denyOf(REASONS.GATE_MISSING,`,
  ],
  [
    '上游 fail 改成放行',
    `  if (gate.verdict === 'fail') {\n    return denyOf(REASONS.GATE_FAILED,`,
    `  if (false) {\n    return denyOf(REASONS.GATE_FAILED,`,
  ],
  [
    '格式坏的门改成宽容放过（M1 默认分支）',
    `  if (gate.state === 'malformed') {\n    return denyOf(REASONS.GATE_MALFORMED,`,
    `  if (false) {\n    return denyOf(REASONS.GATE_MALFORMED,`,
  ],
  [
    'verdict 枚举校验去掉（大小写混用会漏过）',
    `  if (!VERDICTS.includes(verdict)) return { state: 'malformed', why: 'verdict-not-enum' };`,
    `  // enum check removed`,
  ],
  [
    'bash 文本扫描改成从不命中',
    `  const writeIntent = /\\b(>|>>|tee|cp|mv|touch|mkdir|rm|sed\\s+-i|install|truncate|dd)\\b|>\\s*[^\\s|&]/;`,
    `  const writeIntent = /NEVER_MATCH_ANYTHING_XYZ/;`,
  ],
];

function runTests(dir) {
  const result = spawnSync(process.execPath, ['--test', 'test/gate.test.mjs'], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 60_000,
  });
  return { code: result.status, out: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

function main() {
  const original = readFileSync(SOURCE, 'utf8');
  console.log('变红证明：每个变异都必须让测试失败\n');

  // 基线：未变异时测试必须全绿
  const base = runTests(ROOT);
  if (base.code !== 0) {
    console.log('基线就不绿，先修测试再谈变红。');
    console.log(base.out.slice(-1500));
    return 1;
  }
  console.log(`基线  → exit=${base.code}（全绿）\n`);

  let failed = 0;
  for (const [name, find, replace] of MUTATIONS) {
    if (!original.includes(find)) {
      console.log(`SKIP  ${name}`);
      console.log(`      注入点未命中（源码形状变了，更新本脚本）`);
      failed += 1;
      continue;
    }
    const dir = mkdtempSync(join(tmpdir(), 'gate-mutate-'));
    try {
      mkdirSync(join(dir, 'lib'), { recursive: true });
      mkdirSync(join(dir, 'test'), { recursive: true });
      cpSync(join(ROOT, 'test', 'gate.test.mjs'), join(dir, 'test', 'gate.test.mjs'));
      writeFileSync(join(dir, 'lib', 'gate.js'), original.replace(find, replace), 'utf8');

      const result = runTests(dir);
      const red = result.code !== 0;
      console.log(`${red ? 'RED  ' : 'GREEN'} ${name}`);
      if (!red) {
        console.log(`      ← 变异后测试仍全绿，说明这条测试是空的`);
        failed += 1;
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  console.log('');
  if (failed === 0) {
    console.log(`全部 ${MUTATIONS.length} 个变异都变红了：测试确实在测东西。`);
    return 0;
  }
  console.log(`${failed} 个变异没能变红 —— 测试有洞。`);
  return 1;
}

process.exitCode = main();
