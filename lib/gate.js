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

/**
 * deny 的四种原因（2026-11-11 WP5 / T9）。
 *
 * 为什么要有这个：`decide` 对「缺门 / 门失败 / 门格式坏 / 门自述未审查」四种情况
 * **全部返回 `kind:'deny'`**，上层只按 `mode` 分流一次。要事后回答「这条为什么放行」，
 * 就必须在 deny 结果里带上一个机器可读的原因 —— 那就是 `cause`。
 *
 * 四个值刻意与 `composeDetail()` 的人读前缀一一对应，别各自改名。
 */
export const CAUSES = Object.freeze({
  MISSING: 'missing',
  FAILED: 'fail',
  MALFORMED: 'malformed',
  SKIP: 'skip',
});

/** 默认的阶段序列（与 plugin-kit 的九张阶段卡对齐）。 */
export const DEFAULT_LAYOUT = Object.freeze([
  'p0', 'p1', 'p1.5', 'p2', 'p3', 'p3b', 'p3.5', 'p4', 'p5',
]);

/**
 * 阶段产物根目录。**不可配置**（2026-11-11 D1 裁定）。
 *
 * 为什么砍掉配置项：`root` 配错会**静默失效**——实际目录是 `stages/`、
 * 配置写成 `my-stages` 时，`locateStage` 认不出任何阶段写入，`decide` 直接
 * 返回 `allow`，**既不拦也不报错**。用户会以为有保护，实际全放行。
 *
 * 实测对比（同一批）：`layout` 配错会 deny（报错），`gateFile` 配错也会 deny
 * （理由虽误导但至少报错）；只有 `root` 是「配错即静默」。
 * 一个能把机制静默关掉的开关，不该是配置项——要改约定就改代码。
 */
export const DEFAULT_ROOT = Object.freeze('stages');

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

  // 未识别的工具：不拦。
  //
  // 2026-11-11 D1 裁定：这里原先由 decide 翻成「未识别的写工具」deny，
  // 设计含义是「我不认识你的工具，所以判你有罪」。真实会话 739 次调用里这类调用 77 次，
  // 实际被拦 9 次，被拦的是 read×2 / ask_user_question×2 / list_subagent_models /
  // todo_write / skill / plugin_manager / subagent —— 没有一个会写工作区。
  // 9 次误拦 0 次真阳性，且它拦掉了那次派独立审查员的 subagent 调用。
  //
  // 判据类型错了：用「工具身份」（静态名单，随宿主升级漂移）去代理「调用行为」。
  // 任何靠维护名单的办法都会输给宿主升级，所以这一层整层删除，不再有名单要维护。
  //
  // 代价（明写）：将来若出现一个「会写盘但 extractTarget 不认识」的新工具，它会放行。
  // 这是裁定接受的 fail-open——今天它是 fail-closed 却拦错了 9 次。
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

  // 只匹配「写」的意图，避免把 read/cat/ls 也拦下。
  //
  // 2026-11-11 补：原正则只认 shell 写操作（>、cp、mv、rm…），
  // **不认 patch 语法**——于是 `apply_patch` 的 patch 文本里明明写着
  // `*** Update File: stages/p1/a.md`，却被当成「没有写意图」放行。
  // apply_patch 是最典型的写工具，漏它等于门形同虚设。
  // 现在把 patch 的三种指令（Add/Update/Delete File）也算写意图；
  // Set-Content / Out-File / New-Item 等 PowerShell cmdlet 同样补上。
  const writeIntent =
    /\b(>|>>|tee|cp|mv|touch|mkdir|rm|sed\s+-i|install|truncate|dd)\b|>\s*[^\s|&]|\*\*\*\s*(Add|Update|Delete)\s+File:|^\s*(Set-Content|Add-Content|Out-File|New-Item|Remove-Item|Move-Item|Copy-Item|Rename-Item)\b/im;

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
 * ## 2026-11-11 WP5：这里多交出一个 `by`
 *
 * `by` 与 `verdict` 平级地放在**解析结果**上（不是从 `gate` 那个 JSON 对象上现取），
 * 因为它俩的用途正好一对：
 *   - `verdict` 进判据（决定 pass / fail / skip 的处置）
 *   - `by` **只进台账**（拼 `detail` 字符串，供人看）
 *
 * 把 `by` 放在解析结果上、而不是让调用方去 `parsed.gate` 里现取，是为了让
 * 「谁读了 by」在代码里一眼可数：全仓只有 `composeDetail` 的调用点用到它。
 * `by` 是自述字段，伪造成本为零，**任何 `if` 都不许依赖它**（裁定书 §1.2 反对 T2）。
 *
 * @param {string | null | undefined} raw 文件内容；null 表示不存在
 * @returns {{ state: 'missing' } | { state: 'malformed', why: string } | { state: 'ok', verdict: string, by: string | null, gate: object }}
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
  return { state: 'ok', verdict, by: typeof parsed.by === 'string' ? parsed.by : null, gate: parsed };
}

/**
 * deny 的理由码。
 *
 * 2026-11-11 WP5：新增 `GATE_UNVERIFIED` —— 上游门自己写着 `verdict:"skip"`。
 * 它**取代**了原来那个 skip 专属的放行出口（那个 kind 名字已从本仓消失）。
 * 现在它是一个 deny，不是一次放行。
 *
 * 为什么用 `GATE_UNVERIFIED` 而不是「已跳过」之类的名字：要表达的是
 * 「这道门没有审查结论」，不是「跳过了就完事」。台账里它落成 `gate-unverified`。
 */
export const REASONS = Object.freeze({
  GATE_MISSING: 'GATE_MISSING',
  GATE_FAILED: 'GATE_FAILED',
  GATE_MALFORMED: 'GATE_MALFORMED',
  GATE_UNVERIFIED: 'GATE_UNVERIFIED',
  COMMAND_SUSPECT: 'COMMAND_SUSPECT',
});

/**
 * 生成 deny 的结果对象（形状由上层翻译成宿主的 deny 决策）。
 *
 * `cause` / `detail` / `by` 是本批（WP5）新加的，分工是硬的：
 *   - `cause`：机器读。四种原因之一（见 `CAUSES`）。台账按它统计。
 *   - `detail`：人读。一句「这条为什么被拦/被放行」，进台账。
 *   - `by`：门记录里的自述签发者。**只进台账**，伪造成本为零，绝不进判据。
 *
 * 三者都**不参与放不放行的计算**——处置只由 `kind` + 上层 `mode` 决定。
 *
 * @param {string} code 理由码（`REASONS` 之一）
 * @param {string} message 人读理由（给 deny 弹窗）
 * @param {object} [meta] `{ cause, detail, by, ...hint }`
 */
export function denyOf(code, message, meta) {
  const { cause, detail, by, ...hint } = meta === undefined ? {} : meta;
  return {
    kind: 'deny',
    code,
    message,
    ...(cause === undefined ? {} : { cause }),
    ...(detail === undefined ? {} : { detail }),
    ...(by === undefined ? {} : { by }),
    ...(Object.keys(hint).length === 0 ? {} : { hint }),
  };
}

/** 把阶段名翻成它的上游阶段名；第一道门返回 null。 */
export function prevStage(stage, layout = DEFAULT_LAYOUT) {
  const i = layout.indexOf(stage);
  if (i <= 0) return null;
  return layout[i - 1];
}

/**
 * 拼一句「这条为什么被拦 / 为什么放行」。
 *
 * ## 为什么需要（WP5 / 4.5 条）
 *
 * 764 分钟的会话里，台账只有 `allow` 没有原因，事后**没人能说出那次为什么放行**。
 * 缺门 / 门失败 / 门格式坏 / 门自述未审查，这四种在台账里长得一模一样。
 *
 * ## 格式（brief 定的，别自己改）
 *
 * | 原因 | detail |
 * |---|---|
 * | 缺门 | `missing p0` |
 * | 门失败 | `fail p0` |
 * | 门格式坏 | `malformed p0: not-json` |
 * | 门自述未审查 | `skip p0 by=user-authorized` |
 *
 * `by` 只出现在这里（台账用），**不参与判定**——见 `decide` 里的注释。
 *
 * @param {string} cause `CAUSES` 之一
 * @param {string} stage 出问题的上游阶段
 * @param {{why?: string, by?: string | null}} [extra]
 * @returns {string}
 */
export function composeDetail(cause, stage, extra = {}) {
  const base = `${cause} ${stage}`;
  if (cause === CAUSES.MALFORMED) return `${base}: ${extra.why ?? 'unknown'}`;
  if (cause === CAUSES.SKIP) return `${base} by=${extra.by ?? 'unknown'}`;
  return base;
}

/**
 * 核心判定。
 *
 * ## 2026-11-11 WP5 / T9：`skip` 不再是通行证
 *
 * 改之前（`dfd70b6`）：`skip` 有一个专属出口，返回一个 `kind` 表明
 * 「跳过已留痕」，上层见到它就 `next()` —— 也就是**放行**。
 *
 * 那是整个产品最致命的洞：`skip` 的字面语义是「这一阶段没审」，而它是**唯一被放行的
 * verdict**。也就是说，想跳过审查的人**根本不需要伪造 `pass`**——写 `skip` 就行，
 * 而且比写 `fail` 更省事（`fail` 反而会 deny）。764 分钟真实开发里，3 次成功的
 * 门记录写入**全部是 `skip`**。
 *
 * 现在：`skip` 与「缺门 / 门失败 / 门格式坏」**走同一个出口**——
 * 一律 `kind:'deny'`，只是 `cause` 不同。放不放行由上层按 `mode` 决定，
 * 但**内核不再给 skip 一条单独的放行通道**。
 *
 * `cause` 的四个值对应四种原因，处置**完全一样**；`detail` 供台账回答「为什么」。
 *
 * ## `by` 永不进判据
 *
 * `parseGate` 会把 `by` 交出来，但**只用于拼 `detail` 字符串**（给人看）。
 * 本函数里没有任何一个 `if` 依赖它——`by` 是自述字段，伪造成本为零，
 * 一旦进判据就等于给「自己写一句 by:human」开后门（裁定书 §1.2 明确反对 T2）。
 *
 * @param {object} input
 * @param {string} input.toolName       调用的工具名
 * @param {unknown} input.args          解析后的参数
 * @param {string} input.root           监控根，如 `stages`
 * @param {readonly string[]} [input.layout]
 * @param {(stage: string) => string | null} input.readGate  读上游门的原始文本
 * @returns {{ kind: 'allow' } | { kind: 'deny', code: string, cause: string, detail: string, message: string, hint?: object }}
 */
export function decide({ toolName, args, root, layout = DEFAULT_LAYOUT, readGate, baseDir }) {
  const target = extractTarget(toolName, args);

  // 未识别的工具 → 放行。
  //
  // 2026-11-11 D1 裁定（`03-拦截层存废裁定.md` §Q1、§Q2-A）：这里原先 deny，
  // 理由码是「未识别的写工具」。739 次真实调用里这类调用 77 次、被拦 9 次，
  // 9 次全落在只读工具上，0 次真阳性，其中一次是派独立审查员的 subagent 调用。
  // 「用一个静态工具名单去代理动态的调用行为」这一类判据整层删除，不再保留。
  //
  // 注意：`extractTarget` 仍可能返回 unknown（宿主新增写工具、或已知写工具缺了路径参数），
  // 这不是「不会再发生」的情况——只是「不因此拦人」。写工具认不出路径时它写不到 stages/，
  // 门本来也无从判定。
  if (target.kind === 'unknown') return { kind: 'allow' };

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
      cause: CAUSES.MISSING,
      detail: `missing <root:${normalizePath(root)}>`,
      layout,
    });
  }
  if (!layout.includes(stage)) {
    return denyOf(REASONS.GATE_MISSING, `未知阶段目录 "${stage}"。已知阶段：${layout.join(' / ')}。`, {
      cause: CAUSES.MISSING,
      detail: composeDetail(CAUSES.MISSING, stage),
      layout,
    });
  }

  const prev = prevStage(stage, layout);
  if (prev === null) return { kind: 'allow' }; // 第一道门无前置

  const raw = readGate(prev);
  const gate = parseGate(raw);

  // `by` 从 parseGate 的解析结果取，只往下传给 composeDetail（拼给人看的 detail）。
  // 刻意不在判定路径上读它：它只拼字符串，不进任何分支条件。
  const { by: reportedBy = null } = gate;

  if (gate.state === 'missing') {
    return denyOf(REASONS.GATE_MISSING, `缺 ${prev} 的门记录。要写 ${stage} 的产物，得先过 ${prev} 那道门。`, {
      cause: CAUSES.MISSING,
      detail: composeDetail(CAUSES.MISSING, prev),
      upstream: prev,
      // 刻意不给 JSON 模板：R4 实测表明 AI 会照着模板自己伪造 pass。
      // 这里只说明「需要人做什么」，不说明「怎么写文件」。
      howToResolve: `这一步需要人来决定，不由执行者自决。请让负责 ${prev} 的人运行审查并把结论写进 ${normalizePath(root)}/${prev}/GATE.json。`,
    });
  }
  if (gate.state === 'malformed') {
    return denyOf(REASONS.GATE_MALFORMED, `${prev} 的门记录无法解析（${gate.why}）。`, {
      cause: CAUSES.MALFORMED,
      detail: composeDetail(CAUSES.MALFORMED, prev, { why: gate.why }),
      upstream: prev,
      howToResolve: `修正 ${normalizePath(root)}/${prev}/GATE.json：verdict 必须是 pass / fail / skip 之一（小写）。`,
    });
  }
  if (gate.verdict === 'fail') {
    return denyOf(REASONS.GATE_FAILED, `${prev} 的门判定为 fail，不能往下走。`, {
      cause: CAUSES.FAILED,
      detail: composeDetail(CAUSES.FAILED, prev),
      // 门记录存在且合法 → 它自述的签发者一并进台账（只为人看，不进判据）。
      by: reportedBy,
      upstream: prev,
      howToResolve: `修完 ${prev} 的问题后重开审查，把 ${normalizePath(root)}/${prev}/GATE.json 的 verdict 改成 pass。`,
    });
  }
  // `skip`：上一阶段自述「未审查」。
  //
  // 这就是本批修的那个洞。**它不再 return 一个放行 kind。**
  // observe 下它会被上层记成 `would-block`（与缺门同类）；enforce 下它就是 deny。
  //
  // 为什么不在这里直接 deny 到底：处置是上层的职责（`mode` 是插件的配置，
  // 内核不认识它）。内核只负责说清「这是 deny，原因是 skip」，一句处置都不做。
  if (gate.verdict === 'skip') {
    return denyOf(REASONS.GATE_UNVERIFIED, `${prev} 的门自述未审查（verdict=skip），不能作为通行证。写 ${stage} 前需要一份真正的审查结论。`, {
      cause: CAUSES.SKIP,
      detail: composeDetail(CAUSES.SKIP, prev, { by: reportedBy }),
      // `by` 与 `detail` 里那份是同一个值，分开给是让上层不必去 parse detail 字符串。
      // 两个都只进台账。
      by: reportedBy,
      upstream: prev,
      howToResolve: `让负责 ${prev} 的人真正审查后，把 ${normalizePath(root)}/${prev}/GATE.json 的 verdict 改成 pass。skip 表示「这一阶段没审」，它不解除对下游的约束。`,
    });
  }
  return { kind: 'allow' };
}
