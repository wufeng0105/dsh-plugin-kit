/**
 * 阶段门 —— Host 半。
 *
 * 职责边界：
 *   - 本文件只做「宿主接缝的接线」和「I/O」
 *   - 判定逻辑全在 lib/gate.js（纯函数，可完整单测）
 *
 * 用到的接缝（出处：process-lab 归档仓的 INTERFACE-FACTS.md，本仓不含）：
 *   H1  tools/pre-execute  waterfall，拦截
 *   H10 tools/result        emit，落账
 *   H18 ctx.fs              读 GATE.json
 *
 * 明确不做：
 *   - 不自动创建 GATE.json（替人开门）
 *   - 不自动跑审查员
 *   - 不校验 GATE.json 的内容质量
 *
 * @module @wufeng0105/dsh-stage-gate
 */

import { decide, normalizePath, DEFAULT_LAYOUT, REASONS, extractTarget, locateStage, relativize } from './lib/gate.js';
import { readMarker, reconcile, createLedger, MARKER_FILE } from './lib/ledger.js';
import { existsSync as EXISTS, readFileSync as READ_FILE, mkdirSync as MKDIR } from 'node:fs';
import { join as RESOLVE, dirname as DIRNAME } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { listSkills, readSkill } from './lib/skill-provider.js';
import { SECTION_NAME, SECTION_ORDER, DISCIPLINE_TEXT } from './lib/discipline.js';

/** marker 文件名，用于日志文案。 */
const MARKER_NAME = MARKER_FILE;

/** 插件名，用于日志前缀与 Config 定位。 */
export const name = 'plugin-kit';

/**
 * 插件版本，从本包自己的 manifest 读（装配事实，不是用户配置）。
 *
 * 为什么要有：用户报问题时第一句话应该是「你装的哪个版本」。
 * 早期没有这行，排查时只能靠猜。
 *
 * 顶层 try/catch：K5——模块顶层不能抛，否则会把整个 server 带下去。
 */
const VERSION = (() => {
  try {
    return createRequire(import.meta.url)('./package.json').version ?? 'unknown';
  } catch {
    return 'unknown';
  }
})();

/** 硬依赖：fs 用来读 GATE.json。 */
export const inject = ['fs', 'workingDirectory', 'skills', 'systemPrompt'];

/** Config 从 vendor/config.js 来——必须是 schemastery Schema，不能是普通对象。 */
export { Config } from './vendor/config.js';
/** 把 deny 结果翻成宿主的 PreToolDecision。 */
function toDecision(result, log) {
  if (result.kind === 'deny') {
    const reason = [
      `[plugin-kit] ${result.message}`,
      result.hint?.howToResolve === undefined ? '' : `怎么解除：${result.hint.howToResolve}`,
    ].filter((part) => part !== '').join(' ');

    log?.('warn', `${result.code}: ${result.message}`);
    return {
      kind: 'deny',
      reason,
      info: { name: 'stage-gate', code: result.code },
    };
  }
  return { kind: 'allow' };
}

/**
 * 插件入口。
 * @param {import('cordis').Context} ctx
 * @param {object} [config]
 */
export function apply(ctx, config = {}) {
  const cfg = {
    enabled: config.enabled ?? true,
    mode: config.mode ?? 'enforce',
    root: config.root ?? 'stages',
    layout: Array.isArray(config.layout) && config.layout.length > 0 ? config.layout : DEFAULT_LAYOUT,
    gateFile: config.gateFile ?? 'GATE.json',
    allowedTools: Array.isArray(config.allowedTools) ? config.allowedTools : [],
  };

  /**
   * 日志适配器。
   *
   * ## 真机踩过的坑
   *
   * 原来写的是 `ctx.logger?.(level, message)` —— **从来没有输出过任何东西**。
   *
   * `ctx.logger` 是一个 **callable 服务**（`ctx.logger()` 创建命名 logger），
   * 不是「接收 level+message 的函数」。正确用法是 `ctx.logger.info(msg)` /
   * `ctx.logger.warn(msg)`（见 `dsh-workspace-changes/lib/index.js:1027,1047`）。
   *
   * 因为用了可选调用 `?.()`，服务存在时也不会报错，只是**静默什么都不做**——
   * 所以 6 处日志、包括本该报错的 warn，全都消失了，而离线测试用的桩
   * 恰好是按我的错形状写的，**测试全绿也没发现**。
   *
   * 这是「离线全绿、真机失效」的又一个实例。
   */
  /**
   * 日志适配器 + 结构化字段。
   *
   * ## 四级语义（见 LOGGING.md）
   *
   * | 等级 | 什么该用 | 口诀 |
   * |---|---|---|
   * | error | 装上了但**坏了** | 用户**必须**做什么 |
   * | warn  | 工作着但**需要你知道** | 用户**应该知道**什么 |
   * | info  | **生命周期**（启动时一次） | **一次性**状态 |
   * | debug | **每次调用**的细节 | **每次都发生**的 |
   *
   * ## 结构化字段
   *
   * 只允许四个，不许随意加（否则日志变垃圾桶）：
   *   stage / code / path / tool
   *
   * 字段**不改人读格式**——人读的是 message，字段供排查时筛选。
   *
   * ## 真机踩过的坑
   *
   * 早期写成 `ctx.logger?.(level, message)`，**从来没输出过任何东西**：
   * `ctx.logger` 是 callable 服务，正确用法是 `ctx.logger.info(msg)`。
   */
  const ALLOWED_FIELDS = ['stage', 'code', 'path', 'tool'];

  const log = (level, message, fields) => {
    const logger = ctx.logger;
    if (logger === undefined || logger === null) return;

    // 结构化字段：只取白名单里的，其余丢弃（防止日志变垃圾桶）
    let payload = message;
    if (fields !== undefined && fields !== null && typeof fields === 'object') {
      const picked = {};
      for (const key of ALLOWED_FIELDS) {
        if (fields[key] !== undefined) picked[key] = fields[key];
      }
      if (Object.keys(picked).length > 0) payload = { message, fields: picked };
    }

    const sink = typeof logger[level] === 'function' ? logger[level] : undefined;
    if (sink !== undefined) {
      sink.call(logger, payload);
      return;
    }
    // 兼容「logger 是普通函数」的旧形态（测试桩可能这么写）
    if (typeof logger === 'function') logger(level, payload);
  };



  // ---------------------------------------------------------------- 第一段：skill
  //
  // 注册打包的 skills/plugin-kit，让宿主目录里出现这个 skill。
  // 注意：这段**不受 `enabled` 控制** —— 关掉拦截不该让 skill 也跟着消失。

  const SKILLS_ROOT = RESOLVE(DIRNAME(fileURLToPath(import.meta.url)), 'skills');

  ctx.effect(() => {
    // K1：registerProvider 返回的 disposer 属于 SkillRegistry 的 context，
    // 不是本插件 fiber。包在 ctx.effect 里才能在卸载时回收。
    const dispose = ctx.skills.registerProvider((control) => ({
      name,
      control,
      async list(options) {
        return listSkills({ root: SKILLS_ROOT, provider: name, signal: options?.signal });
      },
      async get(candidate) {
        return readSkill({ root: SKILLS_ROOT, provider: name, locator: candidate?.locator });
      },
    }));
    return dispose;
  });

  // 启动自检（第 0 行）：版本 + 工作目录。
  //
  // 为什么要版本：用户报问题时第一句话应该是「你装的哪个版本」。
  // 为什么要 cwd：`root` 是相对路径，不给 cwd 用户不知道它相对哪里。
  log(
    'info',
    `[plugin-kit] v${VERSION} 已加载 → cwd=${
      (() => {
        try {
          return process.cwd();
        } catch {
          return 'unknown';
        }
      })()
    }`,
  );

  // 启动自检（第一段）：登记一行，让人能确认它真的挂上了。
  log('info', `[plugin-kit] skill provider 已注册 → name=${name} root=${SKILLS_ROOT}`);

  // 启动自检（第一段·补）：skills/ 目录存在吗？
  //
  // 为什么必须查：如果打包漏了 `skills/`，`listSkills` 会返回空数组而不抛错
  // （它把「目录不存在」当成「这个 provider 没有 skill」）。
  // 结果是：插件装上了、看起来一切正常、但 skill 目录里永远没有 plugin-kit。
  // **这是静默失败**——没有任何信号告诉用户「你的包是残的」。
  if (!EXISTS(SKILLS_ROOT)) {
    log('error', `[plugin-kit] 打包缺失：skills/ 目录不存在 → ${SKILLS_ROOT}。插件已加载但没有提供任何 skill。`, { path: 'skills/' });
  }

  // ---------------------------------------------------------------- 第二段：纪律
  //
  // 常驻一段提示，告诉模型「有判据，去加载」。
  // 不复述门规则 —— 那是第三段机械执行的事，复述只会造成多副本。

  ctx.effect(() => {
    ctx.systemPrompt.section({
      name: SECTION_NAME,
      order: SECTION_ORDER,
      text: DISCIPLINE_TEXT,
    });
  });

  // 启动自检（第二段）：让人能确认纪律段真的挂上了。
  // 纪律段是「提示」，挂了不代表模型会照做，但没挂一定不会。
  log('info', `[plugin-kit] 纪律段已挂载 → name=${SECTION_NAME} order=${SECTION_ORDER}`);

  if (!cfg.enabled) {
    log('warn', '[plugin-kit] 拦截已禁用（enabled: false），但 skill 与纪律段仍然生效');
    return;
  }

  // 启动自检（第三段）：配置值必须能被看见。
  // 没有这行，用户无法确认自己的配置到底生效了没有——这是插件最基本的要求。
  log(
    'info',
    `[plugin-kit] 拦截已启用 → root=${cfg.root} gateFile=${cfg.gateFile} mode=${cfg.mode} ` +
      `layout=${cfg.layout.length}阶段 allowedTools=${cfg.allowedTools.length}`,
  );

  const root = normalizePath(cfg.root);

  /**
   * 台账（C4）：优先 H15 storage，降级到内存 + 文件镜像。
   * 挂载是异步的，但不阻塞 apply —— 早期记录落内存，挂载后补写。
   *
   * onWarn 必须传：storage 挂载失败时「台账退到内存」只从这里报出来。
   * 漏传 = 静默降级——用户以为台账在 storage 里，实际每次重启都丢，
   * 而 LOGGING.md 的立会原则恰恰是「静默失败比报错更难查」。
   * 2026-11-11 审计抓到：createLedger 有参数、这里没传，警告被吞了数月。
   */
  const ledger = createLedger({
    storage: ctx.get?.('storage'),
    root,
    baseDir: undefined, // 每次调用时按会话 cwd 现填
    onWarn: (message) => log('warn', message),
  });

  /** marker 缓存（C3）：按项目根缓存，避免每次读盘。 */
  const markerCache = new Map();

  /** 该项目是否已采用阶段门（有 marker）。 */
  function adoptionOf(baseDir) {
    if (baseDir === undefined) return { adopted: false, marker: null };
    if (markerCache.has(baseDir)) return markerCache.get(baseDir);
    const result = readMarker(baseDir);
    markerCache.set(baseDir, result);
    return result;
  }

  /** 已警告过的「未采用」项目，避免每次调用都 warn。 */
  const warnedUnadopted = new Set();

  /**
   * 拿本次调用所在会话的工作目录。
   *
   * 为什么需要：真实 `write` 工具收到**绝对路径**（实测：
   * `C:\Users\...\stages\p1\plan.md`）。不带 baseDir 的话，
   * `locateStage` 认不出它落在 `stages/` 下 —— 这是真机才暴露的漏判。
   *
   * 拿不到时的兜底：用 `process.cwd()`。
   * 理由：相对路径本来就相对进程 cwd；退一步用进程 cwd 判断 marker，
   * 比「不知道就不管」更接近真机行为。
   */
  function baseDirOf(exec) {
    try {
      const session = exec?.agent?.session;
      if (session !== undefined) {
        const dir = ctx.workingDirectory?.get?.(session);
        if (typeof dir === 'string' && dir !== '') return dir;
      }
    } catch (error) {
      // 服务坏了不能静默——否则用户会看到「门没拦住」却不知道为什么。
      log('warn', `[plugin-kit] workingDirectory 读取失败：${String(error?.message ?? error)}（改用进程 cwd 兜底）`);
    }
    try {
      const cwd = process.cwd();
      return typeof cwd === 'string' && cwd !== '' ? cwd : undefined;
    } catch {
      return undefined;
    }
  }

  /** 读上游门记录的原始文本；读不到返回 null。 */
  async function readGate(stage) {
    const target = `${root}/${stage}/${cfg.gateFile}`;
    try {
      const resolved = await ctx.fs.resolve(target);
      if (resolved === undefined) return null;
      return await ctx.fs.readText(resolved);
    } catch (error) {
      // 读失败 ≠ 文件不存在。把区别说出来，否则用户只会看到「缺门」，
      // 而真正原因是读盘坏了（权限、编码、服务异常）。
      log('warn', `[plugin-kit] 读门记录失败 ${target}：${String(error?.message ?? error)}（按缺门处理）`, { path: target, stage });
      return null;
    }
  }

  /**
   * H1：拦截。
   *
   * 注意三点（实测时序坑，出处同上）：
   *   1. waterfall —— 不拥有决策时必须 return next()
   *   2. 异步门必须观察 exec.signal
   *   3. 全局注册（非 agent-scoped），否则子代理的调用收不到
   */
  ctx.on('tools/pre-execute', async (exec, next) => {
    if (exec.signal?.aborted === true) return next();

    // 允许显式登记的额外工具（默认 deny 的逃生门）
    const toolName = String(exec.name ?? '');
    if (cfg.allowedTools.includes(toolName)) return next();

    // decide 是同步的，但 readGate 是异步的 —— 先同步判断「要不要查门」
    const baseDir = baseDirOf(exec);

    // C3：项目未采用阶段门时 warn 一次，让「机制没运行」可观测
    if (baseDir !== undefined && !adoptionOf(baseDir).adopted && !warnedUnadopted.has(baseDir)) {
      warnedUnadopted.add(baseDir);
      log('warn', '[plugin-kit] 项目 ' + baseDir + ' 没有 ' + MARKER_NAME + '，阶段门未启用；本次及各次调用均不拦截。要启用就创建该 marker。');
    }

    const probe = decide({
      toolName,
      args: exec.arguments,
      root,
      layout: cfg.layout,
       baseDir,
      readGate: () => null, // 先探测：只关心它会不会走到「查门」那一步
    });

    // C3：未采用阶段门的项目完全放行（但上面已经 warn 过一次）
    // 这是设计的根本边界：机制只约束愿意进约定目录的项目。
    //
    // 拿不到 baseDir 时**必须放行**，不能拦：
    //   - 没有 baseDir 意味着不知道该项目的 marker 状态
    //   - 无从判断就该「不管」，而不是「假定它没采用然后拦」
    //   - 否则子代理、脚本化调用等拿不到 session 的场景会被误拦
    // 这是真机/单测都踩过的判断错误：早期 `baseDir !== undefined` 写成前置条件，
    // 导致 baseDir 为 undefined 时整段门控被跳过，退化成「一律拦」。
    if (probe.kind !== 'allow') {
      const adopted = baseDir === undefined ? false : adoptionOf(baseDir).adopted;
      if (!adopted) return next();
    }

    if (probe.kind === 'allow') return next();

    // 未知工具在 probe 阶段就 deny 了，直接返回
    if (probe.kind === 'deny' && probe.code === REASONS.UNKNOWN_WRITE_TOOL) {
      return toDecision(probe, log);
    }

    // 需要查门：这时才做异步 I/O
    const gateCache = new Map();
    const result = decide({
      toolName,
      args: exec.arguments,
      root,
      layout: cfg.layout,
       baseDir,
      readGate: (stage) => {
        // decide 是同步的，这里用一个「已预取」的缓存
        return gateCache.has(stage) ? gateCache.get(stage) : null;
      },
    });

    // 如果 decide 认为要查某个上游门，这里补一次异步读再判
    const needsGate = result.kind !== 'allow';
    if (!needsGate) return next();

    // 找出它需要的上游阶段（用与 decide 相同的推导）
    const upstream = findUpstream(exec, cfg.layout, root, baseDir);
    if (upstream === null) return next();

    gateCache.set(upstream, await readGate(upstream));

    const final = decide({
      toolName,
      args: exec.arguments,
      root,
      layout: cfg.layout,
       baseDir,
      readGate: (stage) => gateCache.get(stage) ?? null,
    });

    if (final.kind === 'skip-noted') {
      log('warn', `[plugin-kit] ${final.stage} 的门被跳过（skip），本次写入放行但已留痕`, { stage: final.stage, code: 'GATE_SKIP' });
      // C4：跳过门必须入账，否则 G3 形同虚设
      ledger.append({ stage: final.stage, kind: 'skip', verdict: 'skip', baseDir });
      return next();
    }
    if (final.kind === 'deny') {
      if (cfg.mode === 'observe') {
        log('warn', `[plugin-kit][observe] 本可以拦住：${final.code} — ${final.message}`, { code: final.code, stage: final.hint?.upstream });
        // observe 模式也要入账：这是「本可以拦住 N 次」的数据来源
        ledger.append({ stage: final.hint?.upstream ?? null, kind: 'would-block', verdict: final.code, baseDir });
        return next();
      }
      ledger.append({ stage: final.hint?.upstream ?? null, kind: 'blocked', verdict: final.code, baseDir });
      return toDecision(final, log);
    }
    // final.kind === 'allow'：门过了，放行。
    // 这个分支曾经漏过 —— 漏掉会导致 handler 返回 undefined，瀑布链断掉、next 永不调用。
    return next();
  });

  /**
   * H10：事实落账。
   *
   * 只记「和阶段目录有关的写」，不记所有工具调用（否则台账爆炸）。
   */
  ctx.on('tools/result', (exec, result) => {
    try {
      const resultBaseDir = baseDirOf(exec);
      if (!isStageWrite(exec, root, resultBaseDir)) return;
      log('debug', '[plugin-kit] result: ' + String(exec.name ?? '') + ' -> ' + (result.isError ? 'error' : 'ok'), { tool: String(exec.name ?? '') });

      // C4：读时补记 —— 人手写 GATE.json 不产生工具调用，H1 看不见。
      // 每次有阶段写发生后就扫一遍，把台账里没有的门记录补上。
      if (resultBaseDir === undefined) return;
      const found = reconcile({
        baseDir: resultBaseDir,
        root,
        layout: cfg.layout,
        gateFile: cfg.gateFile,
        readText: (rel) => {
          try {
            const abs = RESOLVE(resultBaseDir, rel);
            return EXISTS(abs) ? READ_FILE(abs, 'utf8') : null;
          } catch {
            return null;
          }
        },
        hasEntry: (entry) => ledger.has(entry),
      });
      for (const entry of found) {
        log('debug', '[plugin-kit] 补记门记录：' + String(entry.stage) + ' = ' + String(entry.verdict), { stage: entry.stage });
        ledger.append({ ...entry, baseDir: resultBaseDir });
      }
    } catch (error) {
      // 落账失败不能影响主流程，但也**不能静默**——静默失败比报错更难查。
      // 只记一行，不抛。
      log('warn', `[plugin-kit] 台账补记失败（不影响主流程）：${String(error?.message ?? error)}`);
    }
  });
}

/** 从调用里推出它涉及的上游阶段（用于预取门记录）。 */
function findUpstream(exec, layout, root, baseDir) {
  const target = extractTarget(exec.name, exec.arguments);
  let stage = null;
  if (target.kind === 'path') {
    const loc = locateStage(target.path, root, baseDir);
    if (!loc.under || loc.stage === null) return null;
    stage = loc.stage;
  } else if (target.kind === 'text') {
    for (const candidate of layout) {
      if (relativize(target.text, baseDir).includes(`${root}/${candidate}`)) {
        stage = candidate;
        break;
      }
    }
    if (stage === null) return null;
  } else {
    return null;
  }
  const i = layout.indexOf(stage);
  return i <= 0 ? null : layout[i - 1];
}

/** 判断这次调用是否在写阶段目录（用于落账过滤）。 */
function isStageWrite(exec, root, baseDir) {
  const target = extractTarget(exec.name, exec.arguments);
  if (target.kind === 'path') return locateStage(target.path, root, baseDir).under;
  if (target.kind === 'text') return normalizePath(target.text).includes(`${root}/`);
  return false;
}

