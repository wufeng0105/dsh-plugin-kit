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

import { decide, normalizePath, DEFAULT_LAYOUT, DEFAULT_ROOT, extractTarget, locateStage, relativize } from './lib/gate.js';
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
    mode: config.mode ?? 'observe',
    // root 2026-11-11 D1 裁定后不再是配置项：**故意不读 config.root**。
    // 只删 Schema 声明不够——schemastery 不剥未声明字段（实测），
    // 用户塞 `root: 'my-stages'` 仍会透传到这里。真按它跑就是「配错即静默失效」。
    // 所以这里硬写 DEFAULT_ROOT，让那个值彻底失效。
    layout: Array.isArray(config.layout) && config.layout.length > 0 ? config.layout : DEFAULT_LAYOUT,
    gateFile: config.gateFile ?? 'GATE.json',
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
    log('warn', '[plugin-kit] 台账已禁用（enabled: false），但 skill 与纪律段仍然生效');
    return;
  }

  // 启动自检（第三段）：配置值必须能被看见。
  // 没有这行，用户无法确认自己的配置到底生效了没有——这是插件最基本的要求。
  //
  // mode 必须是这一行里最醒目的一个：observe 是默认值，用户看到的「没被拦」
  // 默认不是「门过了」，而是「门只在记账」。不写出来，用户会以为门坏了。
  log(
    'info',
    `[plugin-kit] 已启用 → root=${DEFAULT_ROOT} gateFile=${cfg.gateFile} mode=${cfg.mode} ` +
      `layout=${cfg.layout.length}阶段`,
  );

  // `root` 2026-11-11 D1 裁定后不再是配置项：配错它会**静默失效**
  // （认不出阶段写入 → decide 返回 allow → 既不拦也不报错）。
  // 一个能把机制静默关掉的开关，不该存在。
  const root = normalizePath(DEFAULT_ROOT);

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

  /**
   * 真挂一次 storage。**这是 WP6 修的那个洞：`attach()` 定义了，从来没被调用。**
   *
   * 后果不是「台账少了点东西」，是台账**从来没持久过**：`createLedger` 里 `unit`
   * 恒为 null，所有 append 只落到内存 + 文件镜像，storage 分支永远不执行。
   * 真实台账 `stages/_ledger.jsonl` 只有 14 行、5 组重复键，而同期发生了 59 次阶段写
   * ——那 14 行是镜像写的，与 storage 无关；`attach()` 里的 `loadAll()` 一次没跑过，
   * 所以**跨会话的历史从来没被读回来过**。
   *
   * 三条约定：
   *
   * 1. **不 await**。`apply()` 是同步入口，等一个 I/O 会拖住宿主启动；
   *    而且 storage 挂不上是允许的（降级到内存 + 镜像），不该阻塞插件加载。
   * 2. **失败走 `onWarn`**。`attach()` 内部已 catch 并回调；这里再兜一层 `.catch`，
   *    防的是「不是 storage 打开失败，而是这行代码自己炸了」——那种情况一样不能静默。
   * 3. **挂载完成要留一行 info**。用户得能确认「台账到底挂在 storage 上还是内存里」，
   *    否则「为什么重启后台账是空的」这个问题永远得靠猜。
   */
  void ledger
    .attach()
    .then((mounted) => {
      const count = ledger.all().length;
      if (mounted) {
        log('info', `[plugin-kit] 台账已挂载 storage → runId=${ledger.runId} 读回 ${count} 行历史`);
      } else {
        // 不是 error：没有 storage 也能工作（内存 + 文件镜像），只是不跨会话。
        log('info', `[plugin-kit] 台账使用内存 + 文件镜像（无 storage）→ runId=${ledger.runId}`);
      }
    })
    .catch((error) => {
      log('warn', `[plugin-kit] 台账挂载异常，已降级为内存 + 文件镜像：${String(error?.message ?? error)}`);
    });

  /**
   * marker 缓存（C3）：按项目根缓存，避免每次读盘。
   *
   * ## 2026-11-11 修：**只缓存「已采用」，不缓存「未采用」**
   *
   * 真机实测（764 分钟会话）：`.stage-gate.json` 由那次会话自己在 `03:03:24` 创建，
   * 而创建它的那个调用的 pre-execute 早 1 秒跑——那一刻 marker 还不存在，
   * 于是 `adoptionOf` 把 `{adopted:false}` 写进缓存并**永久生效**，
   * 直到 `12:40:21` 才第一次 deny。**中间 629 分钟，门等于没装。**
   *
   * 为什么「未采用」不能缓存：项目在一秒之内就可能变成「已采用」（用户创建 marker），
   * 而缓存不会失效。反过来「已采用」不会自己变回去（除非用户删 marker，那时重启即可）。
   *
   * 代价：「未采用」的判定每次都要 `existsSync` 一次。相对「门静默失效 629 分钟」，
   * 这个代价可以接受——stat 一次纳秒级，而失效是小时级。
   */
  const markerCache = new Map();

  /** 该项目是否已采用阶段门（有 marker）。**只缓存正向结果**。 */
  function adoptionOf(baseDir) {
    if (baseDir === undefined) return { adopted: false, marker: null };
    if (markerCache.has(baseDir)) return markerCache.get(baseDir);
    const result = readMarker(baseDir);
    // 只在「已采用」时缓存；「未采用」不缓存，下次调用重读。
    if (result.adopted) markerCache.set(baseDir, result);
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

  /**
   * 读上游门记录的原始文本；读不到返回 null。
   *
   * ## 2026-11-11 修的两处（都是真机 bug，实测 6 次「缺门」全由此产生）
   *
   * **① 必须传 `opts.cwd`。** 宿主 `ctx.fs.resolve(path, opts)` 的实现是
   * `resolveLocalTarget(opts?.cwd ?? this.config.cwd, path)`——不传 cwd 时，
   * 相对路径 `stages/p0/GATE.json` 会按**宿主进程的 cwd** 解析，而那不是项目目录。
   * 解析落到别处 → 读不到 → 报「缺门」，而门文件其实在项目里躺着。
   * 宿主自己的 `dsh-tool-fs` 是这么取的（出处：app.asar 内 `dsh-tool-fs/lib/index.js`）：
   *   `const cwd = exec.agent === undefined ? undefined : await ctx.workingDirectory.ensure(exec.agent, exec.signal)`
   *   `ctx.fs.resolve(path, { ...(cwd !== undefined ? { cwd } : {}), signal: exec.signal })`
   *
   * **② 返回值是对象，不是字符串。** `resolve()` 返回 `{ targetKey, displayPath }`。
   * 早期代码写 `if (resolved === undefined) return null`——这个判断对「解析失败」永不成立
   * （失败会 throw，不会返回 undefined），而对「成功」又把整个对象喂给了 `readText`。
   * 正确用法：把对象原样交给 `readText`（它要的正是 `{displayPath, targetKey}`）。
   *
   * @param {string} stage
   * @param {{cwd?: string, signal?: AbortSignal}} [opts] 会话 cwd 与取消信号
   */
  async function readGate(stage, opts = {}) {
    const target = `${root}/${stage}/${cfg.gateFile}`;
    try {
      const resolveOpts = {
        ...(typeof opts.cwd === 'string' && opts.cwd !== '' ? { cwd: opts.cwd } : {}),
        ...(opts.signal === undefined ? {} : { signal: opts.signal }),
      };
      const resolved = await ctx.fs.resolve(target, resolveOpts);
      if (resolved === undefined || resolved === null) return null;
      return await ctx.fs.readText(resolved, opts.signal);
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

    const toolName = String(exec.name ?? '');

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

    // 读上游门记录：**必须传 cwd 与 signal**。
    // 不传 cwd → 相对路径按宿主进程 cwd 解析 → 门文件在项目里却读不到 → 误报「缺门」。
    // 这是实测 6 次 GATE_MISSING 的根因（门 mtime 均早于 deny 时刻）。
    gateCache.set(upstream, await readGate(upstream, { cwd: baseDir, signal: exec.signal }));

    const final = decide({
      toolName,
      args: exec.arguments,
      root,
      layout: cfg.layout,
       baseDir,
      readGate: (stage) => gateCache.get(stage) ?? null,
    });

    // ---------------------------------------------------------------- 一处分流
    //
    // 2026-11-11 WP5 / T9：这里原先有**两条**路。
    //
    //   - 一条专给「上游 skip」：记 `kind:'skip'` → `return next()`
    //     **那条就是那个洞**：`enforce` 下写 `{"verdict":"skip"}` 照样放行。
    //   - 一条给 deny：按 mode 分流
    //
    // 现在内核把「缺门 / 门失败 / 门格式坏 / 门自述未审查」**全部**报成
    // `kind:'deny'`（只是 `cause` 不同），所以这里只剩一条路，
    // 而 `observe` 与 `enforce` 的差别也只剩这一个 if。
    //
    // 具体：skip 在 enforce 下也会走到 `toDecision`，**它再也拦得住了**。
    if (final.kind === 'deny') {
      // 台账要能回答「这条为什么放行」。`detail` 由内核拼好（`skip p0 by=…`），
      // `cause` 是它的机器可读版本。两者都只在台账里，不回流判定。
      const entry = {
        stage: final.hint?.upstream ?? null,
        cause: final.cause ?? null,
        detail: final.detail ?? null,
        verdict: final.code,
        // `by` 是门记录里的自述签发者：**只进台账，不进判据**（裁定书 §1.2，明确不做 T2）。
        by: final.by ?? null,
        baseDir,
      };

      if (cfg.mode === 'observe') {
        // observe：放行 + 记账。四种原因走同一句 append，不再各记各的 kind。
        log('warn', `[plugin-kit][observe] 本可以拦住：${final.code} — ${final.message}`, { code: final.code, stage: final.hint?.upstream });
        // `would-block` 是「如果拦」的数据来源。skip 现在也归到这一类：
        // 它不再是「正常放行」，而是一条「本可以拦住」。
        ledger.append({ ...entry, kind: 'would-block' });
        return next();
      }

      ledger.append({ ...entry, kind: 'blocked' });
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

