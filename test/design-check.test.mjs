// design-check 测试：合规项目零 FAIL、各类缺陷必红、模板种子首跑必红、本仓自举零 FAIL。
// 纪律：每条断言先证明会红（见 mutate-template 的种子变异与本文件的红用例）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SCRIPT = join(ROOT, 'skills/plugin-kit/scripts/design-check.mjs');
const TPL = join(ROOT, 'skills/plugin-kit/template');

function fixture(name, files) {
  const dir = mkdtempSync(join(tmpdir(), `design-test-${name}-`));
  for (const [rel, text] of Object.entries(files)) {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text, 'utf8');
  }
  return dir;
}

function run(root, extraArgs = []) {
  try {
    const out = execFileSync(process.execPath, [SCRIPT, root, ...extraArgs], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000,
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: String(e.stdout ?? '') + String(e.stderr ?? '') };
  }
}

test('design-check --self-test 全过（判定式会红）', () => {
  const r = run(join(ROOT, 'skills/plugin-kit/scripts'), ['--self-test']);
  assert.equal(r.code, 0, r.out);
  assert.ok(r.out.includes('自检通过'), r.out);
});

test('合规项目：未初始化骨架之外的项目零 FAIL（含普通弃用词不误伤）', () => {
  const dir = fixture('good', {
    'CONTEXT.md': [
      '# Shop', '', '订单与发票。', '', '## Language', '',
      '**Order**：', '一个订单。', '_Avoid_: purchase, transaction', '',
      '**Invoice**：', '一张发票。', '_Avoid_: bill', '',
    ].join('\n'),
    'README.md': '# Demo\n\n这是 API 文档，业务会同步状态。\n',
    'docs/adr/0001-手动建表.md': '# 手动建表\n\n因为 X，所以不用 ORM。\n',
  });
  try {
    const r = run(dir);
    assert.equal(r.code, 0, r.out);
    assert.ok(!/FAIL/.test(r.out), r.out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('空项目：lexicon.file 必红', () => {
  const dir = fixture('empty', { 'package.json': '{"name":"x"}' });
  try {
    const r = run(dir);
    assert.equal(r.code, 1, r.out);
    assert.ok(r.out.includes('lexicon.file'), r.out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('特征词漂移：_ledger.jsonl 出现在正文必红', () => {
  const dir = fixture('drift', {
    'CONTEXT.md': '# X\n\n## Language\n\n**Order**：一个订单。\n_Avoid_: `_ledger.jsonl`\n',
    'README.md': '# X\n\n旧台账在 _ledger.jsonl 里。\n',
  });
  try {
    const r = run(dir);
    assert.equal(r.code, 1, r.out);
    assert.ok(r.out.includes('lexicon.drift'), r.out);
    assert.ok(r.out.includes('_ledger.jsonl'), r.out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('多上下文布局（根只有 CONTEXT-MAP）不误判', () => {
  const dir = fixture('map', {
    'CONTEXT-MAP.md': '# Map\n\n- [Ordering](./src/ordering/CONTEXT.md): 订单\n',
    'src/ordering/CONTEXT.md': '# Ordering\n\n## Language\n\n**Order**：一个订单。\n',
  });
  try {
    const r = run(dir);
    assert.equal(r.code, 0, r.out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('模板种子：未改动的骨架首跑必红（设计期第一步）', () => {
  const r = run(TPL);
  assert.equal(r.code, 1, r.out);
  assert.ok(r.out.includes('lexicon.'), r.out);
  assert.ok(r.out.includes('示例'), r.out);
});

test('本仓自举：design-check 对本仓零 FAIL（README 词汇表节可用）', () => {
  const r = run(ROOT);
  assert.equal(r.code, 0, r.out);
  assert.ok(!/FAIL/.test(r.out), r.out);
});
