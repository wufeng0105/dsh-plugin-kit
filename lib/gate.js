/**
 * 阶段门判定内核 —— 纯逻辑，无 I/O，无宿主依赖。
 *
 * 这个文件的价值在于：整个 G2 的判定规则都在这里，可以完整单测。
 * 上层（index.js）只负责把宿主的工具调用翻译成这里的入参，然后把结果翻译回 deny。
 *
 * @module lib/gate
 */

/** 门记录的合法 verdict。 */
export const VERDICTS = Object.freeze(['pass', 'fail', 'skip']);

/** 默认的阶段序列（与 plugin-kit 的九张阶段卡对齐）。 */
export const DEFAULT_LAYOUT = Object.freeze([
  'p0', 'p1', 'p1.5', 'p2', 'p3', 'p3b', 'p3.5', 'p4', 'p5',
]);

/**
 * 归一化路径：统一分隔符、去掉 `./`、折叠重复斜杠。
 * 不做 realpath（那需要 I/O），只做字符串层的确定性变换。
 * @param {string} p
 * @returns {string}
 */
export function normalizePath(p) {
  if (typeof p !== 'string') return '';
  return p
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '');
}

/**
 * 把绝对路径剥成相对工作区根的路径。
 *
 * 为什么需要：真实 `write` 工具收到的是**绝对路径**
 * （实测：`C:\Users\...\stages\p1\plan.md`），不是相对路径。
 * 早期版本只匹配以 `stages/` 开头的路径，导致绝对路径全部漏判 —— 这是真机才暴露的缺陷。
 *
 * @param {string} target
 * @param {string} [baseDir] 会话工作目录（绝对路径）；不给则原样返回
 * @returns {string} 相对 baseDir 的路径（用 / 分隔）
 */
export function relativize(target, baseDir) {
  const t = normalizePath(target);
  if (baseDir === undefined || baseDir === null || baseDir === '') return t;
  const b = normalizePath(baseDir);
  if (b === '') return t;
  if (t === b) return '';
  if (t.startsWith(`${b}/`)) return t.slice(b.length + 1);
  return t;
}

/**
 * 判断目标路径是否落在监控根下，并取出阶段目录名。
 *
 * @param {string} target 目标路径（相对或绝对）
 * @param {string} root 监控根，如 `stages`
 * @param {string} [baseDir] 会话工作目录；给了就能处理绝对路径
 * @returns {{ under: false } | { under: true, stage: string | null, rest: string }}
 */
export function locateStage(target, root, baseDir) {
  const t = relativize(target, baseDir);
  const r = normalizePath(root);
  if (r === '' || t === '') return { under: false };
  if (t !== r && !t.startsWith(`${r}/`)) return { under: false };
  if (t === r) return { under: true, stage: null, rest: '' };
  const rest = t.slice(r.length + 1);
  const [first, ...others] = rest.split('/');
  return { under: true, stage: first ?? null, rest: others.join('/') };
}

/**
 * 从工具名与参数里抽取「它要写哪个路径」。
 *
 * 原则：宁可能认出更多、也不要漏认——漏认等于放行。
 *
 * @param {string} toolName
 * @param {unknown} args 解析后的参数对象
 * @returns {{ kind: 'path', path: string } | { kind: 'text', text: string } | { kind: 'unknown' }}
 */
export function extractTarget(toolName, args) {
  const name = String(toolName ?? '').toLowerCase();
  const a = args !== null && typeof args === 'object' ? args : {};

  // 已知的精确写工具：参数里有明确的路径字段
  const PATH_KEYS = ['file_path', 'filePath', 'path', 'target_file', 'notebook_path'];
  if (name === 'write' || name === 'edit' || name === 'apply_patch' || name === 'str_replace_editor' || name === 'create' || name === 'write_file') {
    for (const key of PATH_KEYS) {
      if (typeof a[key] === 'string' && a[key] !== '') return { kind: 'path', path: a[key] };
    }
    // apply_patch 用 patch 文本表达路径
    if (typeof a.patch === 'string') return { kind: 'text', text: a.patch };
    return { kind: 'unknown' };
  }

  // shell 类：只能拿到命令文本，做保守的文本判定
  if (name === 'bash' || name === 'pwsh' || name === 'shell' || name === 'run' || name === 'run_command') {
    const cmd = a.command ?? a.script ?? a.cmd;
    if (typeof cmd === 'string' && cmd !== '') return { kind: 'text', text: cmd };
    return { kind: 'unknown' };
  }

  // 未知工具：交给上层决定（默认 deny）
  return { kind: 'unknown' };
}

/**
 * 从一段命令文本里判断它是否在写监控根下的内容。
 *
 * 不解析 shell——只做保守匹配：命令里出现 `<root>/<stage>` 形状的片段即可疑。
 * 误报代价是「多拦一次」，漏报代价是「绕过」，所以宁可误报。
 *
 * @param {string} text
 * @param {string} root
 * @param {readonly string[]} layout
 * @returns {{ suspect: true, stage: string } | { suspect: false }}
 */
export function scanCommandText(text, root, layout = DEFAULT_LAYOUT) {
  const t = normalizePath(String(text ?? ''));
  const r = normalizePath(root);
  if (r === '' || t === '') return { suspect: false };
  // 只匹配「写」的意图，避免把 read/cat/ls 也拦下
  const writeIntent = /\b(>|>>|tee|cp|mv|touch|mkdir|rm|sed\s+-i|install|truncate|dd)\b|>\s*[^\s|&]/;
  for (const stage of layout) {
    const needle = `${r}/${stage}`;
    if (!t.includes(needle)) continue;
    if (writeIntent.test(t)) return { suspect: true, stage };
  }
  return { suspect: false };
}

/**
 * 读一个门记录的 JSON 并校验形状。
 *
 * @param {string | null | undefined} raw 文件内容；null 表示不存在
 * @returns {{ state: 'missing' } | { state: 'malformed', why: string } | { state: 'ok', verdict: string, gate: object }}
 */
export function parseGate(raw) {
  if (raw === null || raw === undefined) return { state: 'missing' };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { state: 'malformed', why: 'not-json' };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { state: 'malformed', why: 'not-object' };
  }
  const verdict = parsed.verdict;
  if (typeof verdict !== 'string') return { state: 'malformed', why: 'verdict-missing' };
  if (!VERDICTS.includes(verdict)) return { state: 'malformed', why: 'verdict-not-enum' };
  return { state: 'ok', verdict, gate: parsed };
}

/** deny 的理由码。 */
export const REASONS = Object.freeze({
  GATE_MISSING: 'GATE_MISSING',
  GATE_FAILED: 'GATE_FAILED',
  GATE_MALFORMED: 'GATE_MALFORMED',
  UNKNOWN_WRITE_TOOL: 'UNKNOWN_WRITE_TOOL',
  COMMAND_SUSPECT: 'COMMAND_SUSPECT',
});

/**
 * 生成 deny 的结果对象（形状由上层翻译成宿主的 deny 决策）。
 * @param {string} code
 * @param {string} message
 * @param {object} [hint]
 */
export function denyOf(code, message, hint) {
  return { kind: 'deny', code, message, ...(hint === undefined ? {} : { hint }) };
}

/** 把阶段名翻成它的上游阶段名；第一道门返回 null。 */
export function prevStage(stage, layout = DEFAULT_LAYOUT) {
  const i = layout.indexOf(stage);
  if (i <= 0) return null;
  return layout[i - 1];
}

/**
 * 核心判定。
 *
 * @param {object} input
 * @param {string} input.toolName       调用的工具名
 * @param {unknown} input.args          解析后的参数
 * @param {string} input.root           监控根，如 `stages`
 * @param {readonly string[]} [input.layout]
 * @param {(stage: string) => string | null} input.readGate  读上游门的原始文本
 * @returns {{ kind: 'allow' } | { kind: 'deny', code: string, message: string, hint?: object } | { kind: 'skip-noted', stage: string }}
 */
export function decide({ toolName, args, root, layout = DEFAULT_LAYOUT, readGate, baseDir }) {
  const target = extractTarget(toolName, args);

  if (target.kind === 'unknown') {
    return denyOf(REASONS.UNKNOWN_WRITE_TOOL, `未识别的写工具 "${toolName}"：无法确认它是否写阶段产物。请把它加入 allowlist，或改用已知的写工具。`, {
      allowlistField: 'stageGate.allowedTools',
    });
  }

  let stage = null;
  if (target.kind === 'path') {
    // baseDir 用来把绝对路径剥成相对路径——真实 write 工具传的是绝对路径
    const loc = locateStage(target.path, root, baseDir);
    if (!loc.under) return { kind: 'allow' };
    stage = loc.stage;
  } else {
    // 命令文本里也可能有绝对路径，先剥 baseDir
    const scan = scanCommandText(relativize(target.text, baseDir), root, layout);
    if (!scan.suspect) return { kind: 'allow' };
    stage = scan.stage;
  }

  // 落在 root 下但认不出阶段（比如直接写 root 本身）
  if (stage === null) {
    return denyOf(REASONS.GATE_MISSING, `目标在 ${normalizePath(root)} 下但不在任何已知阶段目录里。已知阶段：${layout.join(' / ')}。`, {
      layout,
    });
  }
  if (!layout.includes(stage)) {
    return denyOf(REASONS.GATE_MISSING, `未知阶段目录 "${stage}"。已知阶段：${layout.join(' / ')}。`, { layout });
  }

  const prev = prevStage(stage, layout);
  if (prev === null) return { kind: 'allow' }; // 第一道门无前置

  const raw = readGate(prev);
  const gate = parseGate(raw);

  if (gate.state === 'missing') {
    return denyOf(REASONS.GATE_MISSING, `缺 ${prev} 的门记录。要写 ${stage} 的产物，得先过 ${prev} 那道门。`, {
      upstream: prev,
      // 刻意不给 JSON 模板：R4 实测表明 AI 会照着模板自己伪造 pass。
      // 这里只说明「需要人做什么」，不说明「怎么写文件」。
      howToResolve: `这一步需要人来决定，不由执行者自决。请让负责 ${prev} 的人运行审查并把结论写进 ${normalizePath(root)}/${prev}/GATE.json；确实要跳过也应由人明确同意。`,
    });
  }
  if (gate.state === 'malformed') {
    return denyOf(REASONS.GATE_MALFORMED, `${prev} 的门记录无法解析（${gate.why}）。`, {
      upstream: prev,
      howToResolve: `修正 ${normalizePath(root)}/${prev}/GATE.json：verdict 必须是 pass / fail / skip 之一（小写）。`,
    });
  }
  if (gate.verdict === 'fail') {
    return denyOf(REASONS.GATE_FAILED, `${prev} 的门判定为 fail，不能往下走。`, {
      upstream: prev,
      howToResolve: `修完 ${prev} 的问题后重开审查，把 ${normalizePath(root)}/${prev}/GATE.json 的 verdict 改成 pass；或改成 skip 并写明原因（会留痕）。`,
    });
  }
  if (gate.verdict === 'skip') {
    return { kind: 'skip-noted', stage: prev };
  }
  return { kind: 'allow' };
}
