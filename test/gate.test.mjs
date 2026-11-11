import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizePath,
  relativize,
  locateStage,
  extractTarget,
  scanCommandText,
  parseGate,
  prevStage,
  decide,
  VERDICTS,
  DEFAULT_LAYOUT,
  REASONS,
} from '../lib/gate.js';

const ROOT = 'stages';

// ---------------------------------------------------------------- 归一化

test('normalizePath: 统一分隔符、去 ./、折叠斜杠', () => {
  assert.equal(normalizePath('stages\\p1\\GATE.json'), 'stages/p1/GATE.json');
  assert.equal(normalizePath('./stages//p1/'), 'stages/p1');
  assert.equal(normalizePath(''), '');
  assert.equal(normalizePath(null), '');
});

test('normalizePath: 不做 realpath（保留 ..）', () => {
  // 这是有意的：realpath 需要 I/O，内核保持纯函数
  assert.equal(normalizePath('stages/../src/a.js'), 'stages/../src/a.js');
});

// ---------------------------------------------------------------- 阶段定位

test('locateStage: 落在监控根下', () => {
  assert.deepEqual(locateStage('stages/p1/GATE.json', ROOT), {
    under: true,
    stage: 'p1',
    rest: 'GATE.json',
  });
});

test('locateStage: 不在监控根下', () => {
  assert.equal(locateStage('src/index.js', ROOT).under, false);
  // 前缀相似但不是子目录
  assert.equal(locateStage('stages-old/p1/a.md', ROOT).under, false);
});

test('locateStage: 目标是根本身', () => {
  assert.deepEqual(locateStage('stages', ROOT), { under: true, stage: null, rest: '' });
});

// ---------------------------------------------------------------- 路径抽取

test('extractTarget: write 取 file_path', () => {
  assert.deepEqual(extractTarget('write', { file_path: 'stages/p1/a.md', content: 'x' }), {
    kind: 'path',
    path: 'stages/p1/a.md',
  });
});

test('extractTarget: edit 取 path', () => {
  assert.deepEqual(extractTarget('edit', { path: 'stages/p2/b.md' }), {
    kind: 'path',
    path: 'stages/p2/b.md',
  });
});

test('extractTarget: bash 只拿命令文本', () => {
  assert.deepEqual(extractTarget('bash', { command: 'echo hi > stages/p1/a.md' }), {
    kind: 'text',
    text: 'echo hi > stages/p1/a.md',
  });
});

test('extractTarget: 未知工具仍返回 unknown（内核不猜它写什么）', () => {
  assert.deepEqual(extractTarget('some_future_tool', { path: 'stages/p1/a.md' }), { kind: 'unknown' });
});

// ---------------------------------------------------------------- 命令文本扫描

test('scanCommandText: 重定向写阶段目录判可疑', () => {
  assert.deepEqual(scanCommandText('echo x > stages/p1/a.md', ROOT), { suspect: true, stage: 'p1' });
});

test('scanCommandText: cp/mv 到阶段目录判可疑', () => {
  assert.equal(scanCommandText('cp /tmp/a.md stages/p2/a.md', ROOT).suspect, true);
  assert.equal(scanCommandText('mv /tmp/a.md stages/p2/a.md', ROOT).suspect, true);
});

test('scanCommandText: 只读不判可疑', () => {
  assert.equal(scanCommandText('cat stages/p1/a.md', ROOT).suspect, false);
  assert.equal(scanCommandText('ls stages/p1', ROOT).suspect, false);
});

test('scanCommandText: 不涉及阶段目录不判可疑', () => {
  assert.equal(scanCommandText('echo x > src/a.js', ROOT).suspect, false);
});

// ---------------------------------------------------------------- 门记录解析

test('parseGate: 不存在', () => {
  assert.deepEqual(parseGate(null), { state: 'missing' });
});

test('parseGate: 非 JSON', () => {
  assert.deepEqual(parseGate('{oops'), { state: 'malformed', why: 'not-json' });
});

test('parseGate: 非对象', () => {
  assert.deepEqual(parseGate('[1,2]'), { state: 'malformed', why: 'not-object' });
});

test('parseGate: 缺 verdict', () => {
  assert.deepEqual(parseGate('{"stage":"p0"}'), { state: 'malformed', why: 'verdict-missing' });
});

test('parseGate: verdict 不在枚举里', () => {
  assert.deepEqual(parseGate('{"verdict":"PASS"}'), { state: 'malformed', why: 'verdict-not-enum' });
  assert.deepEqual(parseGate('{"verdict":"ok"}'), { state: 'malformed', why: 'verdict-not-enum' });
});

test('parseGate: 合法', () => {
  const r = parseGate('{"verdict":"pass"}');
  assert.equal(r.state, 'ok');
  assert.equal(r.verdict, 'pass');
});

// ---------------------------------------------------------------- 上游阶段

test('prevStage: 正常推进', () => {
  assert.equal(prevStage('p1'), 'p0');
  assert.equal(prevStage('p2'), 'p1.5');
});

test('prevStage: 第一道门无上游', () => {
  assert.equal(prevStage('p0'), null);
});

// ---------------------------------------------------------------- 核心判定

const mkReader = (gates) => (stage) => (stage in gates ? gates[stage] : null);

test('decide: 不在 stages 下 → 放行', () => {
  const r = decide({ toolName: 'write', args: { file_path: 'src/index.js' }, root: ROOT, readGate: () => null });
  assert.deepEqual(r, { kind: 'allow' });
});

test('decide: 未知工具 → 放行（D1 裁定：不再按工具身份判罪）', () => {
  // 2026-11-11 D1 裁定前，这里断言的是 deny + UNKNOWN_WRITE_TOOL。
  // 那个行为被裁定删除，原因见 lib/gate.js 的注释：739 次真实调用里 77 次落到这个分支，
  // 被拦的 9 次全是只读工具、0 次真阳性，还拦掉了派独立审查员的 subagent 调用。
  const r = decide({ toolName: 'mystery_tool', args: {}, root: ROOT, readGate: () => null });
  assert.deepEqual(r, { kind: 'allow' });
});

test('decide: 9 个真实会话里被误拦的只读工具，现在全部放行', () => {
  // 这 9 条来自 session.v4.jsonl 的真实 tool/call 入参（seq 3075/3094/3458/3513/3525/
  // 3664/3957/5011/5037），不是编的。它们当时全被 UNKNOWN_WRITE_TOOL 拦掉。
  const REAL = [
    // read ×2（真实入参带 limit/offset）
    ['read', { file_path: 'C:\\Users\\Administrator\\Documents\\ProgramFilesCode\\_sandbox\\shanchu\\lib\\store.mjs', limit: 30, offset: 96 }],
    ['read', { file_path: 'C:\\Users\\Administrator\\Documents\\ProgramFilesCode\\_sandbox\\shanchu\\lib\\core.mjs', limit: 45, offset: 1 }],
    // ask_user_question ×2
    ['ask_user_question', { questions: [{ header: '数据修复', id: 'cleanup', multi_select: false, options: [{ label: '清掉全部 projcache 残留（推荐）', description: '删掉 199 条 projcache 缓存' }], question: '怎么处理？' }] }],
    ['ask_user_question', { questions: [{ header: '门的配置', id: 'allowed_tools', multi_select: false, options: [{ label: '不加白名单', description: '不改配置' }], question: '阶段门把 subagent / todo_write / skill 这些非文件写入工具也拦了，怎么处理？' }] }],
    ['list_subagent_models', { provider: '__none__' }],
    ['todo_write', { todos: [{ content: '定位根因：删除只清归档索引+工作区引用，子代理会话落入「未分组」', status: 'completed' }] }],
    ['skill', { name: 'kimi-webbridge' }],
    ['plugin_manager', { action: 'remove_bundle', target: '@local/shanchu' }],
    // 这条最重要：它一次被拦，等于「机制阻止了它自己声称要促进的事」——
    // 派独立审查员的子代理调用。它的 prompt 正文里还带着 stages/ 路径。
    ['subagent', {
      description: 'P3 独立审查删除功能',
      prompt: '你是独立审查员。只读产物，不写代码。判据来源：`C:\\Users\\Administrator\\Documents\\ProgramFilesCode\\_sandbox\\shanchu\\stages\\p0\\需求.md`',
    }],
  ];
  assert.equal(REAL.length, 9, '清单必须是真实被拦的那 9 条');
  for (const [toolName, args] of REAL) {
    const r = decide({ toolName, args, root: ROOT, readGate: () => null });
    assert.equal(r.kind, 'allow', `${toolName} 应放行，实际 ${JSON.stringify(r)}`);
  }
});

test('decide: 写工具仍然走门（deny 没被删，只删了「未知工具」那一层）', () => {
  // 这一条是「删对了」而不是「删多了」的守卫：
  // D1 只删 UNKNOWN 那一类，写阶段产物仍按 GATE.json 判定。
  const write = decide({ toolName: 'write', args: { file_path: 'stages/p1/plan.md' }, root: ROOT, readGate: () => null });
  assert.equal(write.kind, 'deny');
  assert.equal(write.code, REASONS.GATE_MISSING);

  const edit = decide({ toolName: 'edit', args: { file_path: 'stages/p1/plan.md', old_string: 'a', new_string: 'b' }, root: ROOT, readGate: () => null });
  assert.equal(edit.kind, 'deny');
  assert.equal(edit.code, REASONS.GATE_MISSING);
});

test('decide: 未知工具即使参数里带 stages 路径也放行（不靠名单兜底）', () => {
  // 未来宿主新增的写工具会命中这一条：它放行。这是裁定显式接受的 fail-open，
  // 写在这里是为了让「代价」可测、可见，而不是一句注释。
  const r = decide({ toolName: 'future_writer', args: { target_file: 'stages/p1/a.md' }, root: ROOT, readGate: () => null });
  assert.deepEqual(r, { kind: 'allow' });
});

test('decide: 第一道门 p0 无前置 → 放行', () => {
  const r = decide({ toolName: 'write', args: { file_path: 'stages/p0/req.md' }, root: ROOT, readGate: () => null });
  assert.deepEqual(r, { kind: 'allow' });
});

test('decide: 缺上游门 → deny GATE_MISSING，且理由含怎么解除', () => {
  const r = decide({ toolName: 'write', args: { file_path: 'stages/p1/plan.md' }, root: ROOT, readGate: () => null });
  assert.equal(r.kind, 'deny');
  assert.equal(r.code, REASONS.GATE_MISSING);
  assert.ok(r.hint.howToResolve.includes('GATE.json'), '理由里要写清怎么补');
});

test('decide: 上游 fail → deny GATE_FAILED', () => {
  const r = decide({
    toolName: 'write',
    args: { file_path: 'stages/p1/plan.md' },
    root: ROOT,
    readGate: mkReader({ p0: '{"verdict":"fail"}' }),
  });
  assert.equal(r.kind, 'deny');
  assert.equal(r.code, REASONS.GATE_FAILED);
});

test('decide: 上游 pass → 放行', () => {
  const r = decide({
    toolName: 'write',
    args: { file_path: 'stages/p1/plan.md' },
    root: ROOT,
    readGate: mkReader({ p0: '{"verdict":"pass"}' }),
  });
  assert.deepEqual(r, { kind: 'allow' });
});

test('decide: 上游 skip → 放行但标记 skip-noted', () => {
  const r = decide({
    toolName: 'write',
    args: { file_path: 'stages/p1/plan.md' },
    root: ROOT,
    readGate: mkReader({ p0: '{"verdict":"skip"}' }),
  });
  assert.deepEqual(r, { kind: 'skip-noted', stage: 'p0' });
});

test('decide: 上游门格式坏 → deny GATE_MALFORMED（默认分支不宽容）', () => {
  for (const raw of ['{"stage":"p0"}', '{"verdict":"PASS"}', '{"verdict":"whatever"}', 'not json']) {
    const r = decide({
      toolName: 'write',
      args: { file_path: 'stages/p1/plan.md' },
      root: ROOT,
      readGate: mkReader({ p0: raw }),
    });
    assert.equal(r.kind, 'deny', `期望 deny，实际 ${r.kind}（raw=${raw}）`);
    assert.equal(r.code, REASONS.GATE_MALFORMED);
  }
});

test('decide: bash 重定向到阶段目录 → 按阶段判定', () => {
  const denied = decide({
    toolName: 'bash',
    args: { command: 'echo x > stages/p1/a.md' },
    root: ROOT,
    readGate: () => null,
  });
  assert.equal(denied.kind, 'deny');
  assert.equal(denied.code, REASONS.GATE_MISSING);

  const allowed = decide({
    toolName: 'bash',
    args: { command: 'echo x > stages/p1/a.md' },
    root: ROOT,
    readGate: mkReader({ p0: '{"verdict":"pass"}' }),
  });
  assert.deepEqual(allowed, { kind: 'allow' });
});

test('decide: bash 只读阶段目录 → 放行', () => {
  const r = decide({
    toolName: 'bash',
    args: { command: 'cat stages/p1/a.md' },
    root: ROOT,
    readGate: () => null,
  });
  assert.deepEqual(r, { kind: 'allow' });
});

test('decide: 直接在 root 下写文件（认不出阶段）→ deny', () => {
  const r = decide({ toolName: 'write', args: { file_path: 'stages/loose.md' }, root: ROOT, readGate: () => null });
  assert.equal(r.kind, 'deny');
  assert.equal(r.code, REASONS.GATE_MISSING);
});

test('decide: 未知阶段目录 → deny', () => {
  const r = decide({ toolName: 'write', args: { file_path: 'stages/p9/a.md' }, root: ROOT, readGate: () => null });
  assert.equal(r.kind, 'deny');
});

test('decide: ledger 自身不被拦（自指不成立）', () => {
  const r = decide({ toolName: 'write', args: { file_path: 'stages/_ledger.jsonl' }, root: ROOT, readGate: () => null });
  // _ledger 不是已知阶段目录 → 会 deny；但审计说这条「自我担忧其实不存在」，
  // 因为写台账走的是插件内部的 storage，不是工具调用。
  // 保留此用例以钉住行为：如果将来改成用工具写台账，这条会红。
  assert.equal(r.kind, 'deny');
});

test('decide: 自定义 layout 生效', () => {
  const layout = ['00-需求', '01-计划', '02-执行'];
  const r = decide({
    toolName: 'write',
    args: { file_path: 'stages/01-计划/plan.md' },
    root: ROOT,
    layout,
    readGate: () => null,
  });
  assert.equal(r.kind, 'deny');
  assert.equal(r.code, REASONS.GATE_MISSING);

  const ok = decide({
    toolName: 'write',
    args: { file_path: 'stages/01-计划/plan.md' },
    root: ROOT,
    layout,
    readGate: mkReader({ '00-需求': '{"verdict":"pass"}' }),
  });
  assert.deepEqual(ok, { kind: 'allow' });
});

// ---------------------------------------------------------------- 绝对路径（真机暴露）

test('relativize: 剥掉工作区根', () => {
  assert.equal(
    relativize('C:\\ws\\proj\\stages\\p1\\a.md', 'C:\\ws\\proj'),
    'stages/p1/a.md',
  );
});

test('locateStage: 绝对路径 + baseDir 能认出阶段', () => {
  const loc = locateStage('C:\\ws\\proj\\stages\\p1\\a.md', 'stages', 'C:\\ws\\proj');
  assert.equal(loc.under, true);
  assert.equal(loc.stage, 'p1');
});

test('decide: 绝对路径（真实 write 工具的形态）也会被拦', () => {
  // 这是真机暴露的缺陷：早期版本只匹配相对路径，绝对路径全部漏判
  const r = decide({
    toolName: 'write',
    args: { file_path: 'C:\\ws\\proj\\stages\\p1\\plan.md' },
    root: 'stages',
    baseDir: 'C:\\ws\\proj',
    readGate: () => null,
  });
  assert.equal(r.kind, 'deny');
  assert.equal(r.code, REASONS.GATE_MISSING);
});
