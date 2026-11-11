/**
 * 项目状态与台账 —— 插件自有的持久化与可观测性。
 *
 * 解决两个审计条件：
 *   C3（I2）：让「机制没运行」与「机制运行但没拦住」在证据上可区分
 *   C4（I3）：人手写 GATE.json 不产生工具调用，H1 看不见；靠读时补记覆盖
 *
 * 存储用 H15 `ctx.storage`（跨会话持久）。拿不到 storage 时降级为内存 + 文件镜像。
 *
 * ## 2026-11-11 WP6：台账从死代码变成真产物
 *
 * 这一版修了三处，每一处都是「看起来在工作、实际什么都没记」的形态：
 *
 * 1. **`attach()` 曾被定义但从没被调用**（`index.js` 零调用点）。storage 从没打开过，
 *    台账永远只有内存那几行，进程一退就没了。现在 `apply()` 里真挂一次。
 * 2. **每行没有运行身份**。真实台账 14 行里有 5 组重复键，而重复行与「两次运行各记一次」
 *    在数据上无法区分。现在每行带 `runId`（一次进程一个，见 `PROCESS_RUN_ID`）。
 * 3. **去重键两套口径**：`append` 用 `stage|kind|at`，`has` 只比 `stage+kind`——
 *    `has` 永远比 `append` 宽。后果不是「多记」，是**静默少记**：GATE.json 的结论
 *    从 `pass` 改成 `fail` 后，`has` 仍说「这条记过了」，新的审查结论永久丢失。
 *    现在两者共用 `dedupeKey()`。
 *
 * @module lib/ledger
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import crypto from 'node:crypto';

/** 项目级 marker 文件名。存在 = 该项目已采用阶段门。 */
export const MARKER_FILE = '.stage-gate.json';

/** 台账镜像文件名（人可读）。放在 root 下。 */
export const LEDGER_FILE = '_ledger.jsonl';

/**
 * 生成本次进程的运行身份。
 *
 * ## 为什么选 `crypto.randomUUID()` 而不是「时间戳 + pid」
 *
 * `runId` 要回答的问题只有一个：**这条记录是哪一次运行写的**。所以它必须满足
 * 「两次不同的运行，身份一定不同」——而「时间戳 + pid」两条都能撞：
 *
 * - **pid 会被系统重用**。Windows 上进程号回收很快，同一个 pid 隔天落到另一个 DSH
 *   进程上是常态。撞了以后，两次运行的记录出现同一个 `runId`，而 `runId` 正是
 *   去重键的一部分 → 两次运行各自的同一事件被判成「重复」→ 后一次静默丢弃。
 * - **系统时钟会被校正**。NTP 往前拨、用户在虚拟机里改时间，都会让「进程启动时刻」
 *   这个数值后退；两个不同进程拿到同一个毫秒级时刻不是理论问题。
 *
 * UUID v4 的碰撞概率与运行次数无关（约 2⁻¹²²），代价只是「人读不出来」——但可读性
 * 不该由 `runId` 承担：每行已经有 `at`（毫秒级时间戳）回答「什么时候」，
 * `runId` 只回答「哪一次」。
 *
 * 回退：拿不到 `randomUUID`（不该发生，engines 要求 Node ≥ 20.3）时退到
 * 「毫秒时间戳 + pid」。那时唯一还能做的就是把两个值都写全，并在日志里看得出这是回退形态。
 */
export const PROCESS_RUN_ID = (() => {
  try {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    /* 落到下面的回退 */
  }
  try {
    return `${Date.now().toString(36)}-${process.pid}`;
  } catch {
    return 'unknown-run';
  }
})();

/**
 * 内容指纹：门记录没写 `at` 时，用它当这条观察的身份。
 *
 * 为什么需要它：`reconcile` 读到的 GATE.json 可能没有 `at`（README 标了必填，
 * 但手写的文件不会遵守）。没有时间戳就没有稳定身份，而「同一份内容被反复扫到」
 * 必须只记一条——否则每写一次阶段产物就多一条噪音。
 *
 * 只取 `verdict` / `by` / `reason`：**内容变了就是新的一条**。这正是旧实现做不到的事
 * （旧 `has` 只比 stage+kind，结论从 pass 改成 fail 会被当成「记过了」）。
 *
 * @param {object} entry
 * @returns {string}
 */
function contentTag(entry) {
  return `~${JSON.stringify([entry?.verdict ?? null, entry?.by ?? null, entry?.reason ?? null])}`;
}

/**
 * 台账去重键。**`append` 与 `has` 必须都走这一个函数。**
 *
 * 形态：`${runId}|${stage}|${kind}|<身份尾巴>`
 *
 * ## 为什么 `at` 在键里，以及为什么这不等于「同一秒算两条」
 *
 * `at` 不是「写入时刻」，是**这条事实的身份**——它来自门记录（`reconcile` 读到的
 * `GATE.json.at`），由写门的人钉死。带着同一个 `at` 的第二次 append，说的是同一件事，
 * 该跳过。这是 brief 要的行为。
 *
 * 真正会发生「同一毫秒两次写入」的是**事件行**（`would-block` / `blocked`）：
 * 它们不带 `at`，由 `append` 现填 ISO 毫秒时间戳。这类行**根本不用时间戳当身份**——
 * 用 `seq`（本次运行内的自增序）。所以：
 *
 * | 调用方给的 `at` | 尾巴是什么 | 含义 |
 * |---|---|---|
 * | 字符串 | 就是它 | 调用方钉死了这条事实 → 重复 append 跳过 |
 * | 显式 `null` | 内容指纹 `verdict/by/reason` | 门记录没写时间 → 同一份内容一条，结论变了记新的 |
 * | 缺省 `undefined` | `#seq` | **又发生了一次** → 每次都记，同毫秒也不合并 |
 *
 * 第三态是刻意避开 `at` 的：若拿「刚填的毫秒时间戳」当身份，两次真实发生的
 * `would-block` 在同一毫秒内会**静默合并成一条**，而「本可以拦住 N 次」的 N 就少算了。
 * 时间戳的分辨率不该决定计数。
 *
 * @param {string} runId
 * @param {object} entry
 * @returns {string}
 */
export function dedupeKey(runId, entry) {
  const at = entry?.at;
  let tail;
  // seq 优先于 at：事件行的 `at` 是 append 现填的写入时刻，**不是**这条事实的身份。
  // 若让它参与键，同一毫秒内的两次真实发生会被合并——那正是「本可以拦住 N 次」少算的原因。
  if (Number.isInteger(entry?.seq)) tail = `#${entry.seq}`;
  else if (typeof at === 'string' && at !== '') tail = at;
  else if (at === null) tail = contentTag(entry);
  else tail = '-';
  return `${runId}|${entry?.stage ?? '-'}|${entry?.kind ?? '-'}|${tail}`;
}

/**
 * 判断一个目录是否已采用阶段门（有 marker）。
 *
 * 为什么要这个：审计 I2 指出，如果项目不进入 `stages/`，
 * 机制完全不生效且无法观测。marker 让「未采用」变成一个显式状态。
 *
 * @param {string} baseDir 项目根
 * @param {string} markerName
 * @returns {{ adopted: boolean, marker: object | null }}
 */
export function readMarker(baseDir, markerName = MARKER_FILE) {
  if (baseDir === undefined || baseDir === null || baseDir === '') {
    return { adopted: false, marker: null };
  }
  const file = join(baseDir, markerName);
  if (!existsSync(file)) return { adopted: false, marker: null };
  try {
    return { adopted: true, marker: JSON.parse(readFileSync(file, 'utf8')) };
  } catch {
    // marker 存在但坏了：仍算已采用（用户意图明确），但记录一下
    return { adopted: true, marker: { malformed: true } };
  }
}

/**
 * 扫 root 下所有 GATE.json，补记台账里没有的条目。
 *
 * 为什么要这个：审计 I3 指出，人手写 GATE.json **不产生工具调用**，
 * `tools/pre-execute` 看不见。所以只能靠读时扫描补上。
 *
 * @param {object} deps
 * @param {string} deps.baseDir 项目根
 * @param {string} deps.root 阶段根（如 stages）
 * @param {readonly string[]} deps.layout
 * @param {string} deps.gateFile
 * @param {(relPath: string) => string | null} deps.readText 读 root 下文件的原始文本
 * @param {(entry: object) => boolean} deps.hasEntry 台账里是否已有该条
 * @returns {object[]} 新发现的条目
 */
export function reconcile({ baseDir, root, layout, gateFile, readText, hasEntry }) {
  const found = [];
  for (const stage of layout) {
    const rel = `${root}/${stage}/${gateFile}`;
    const raw = readText(rel);
    if (raw === null) continue;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const entry = {
      stage,
      verdict: typeof parsed?.verdict === 'string' ? parsed.verdict : 'malformed',
      by: typeof parsed?.by === 'string' ? parsed.by : 'unknown',
      at: typeof parsed?.at === 'string' ? parsed.at : null,
      kind: 'reconciled',
      reason: typeof parsed?.reason === 'string' ? parsed.reason : null,
    };
    if (hasEntry(entry)) continue;
    found.push(entry);
  }
  return found;
}

/**
 * 台账：优先写 H15 storage，同时镜像一份到文件（人可读）。
 *
 * 为什么要镜像：storage 里的东西用户看不到。审计 C4 要求「指定谁读台账、在哪看」，
 * 文件镜像是答案的一半。
 *
 * @param {object} deps
 * @param {object} [deps.storage] H15 storage 服务；缺省时退到内存 + 文件镜像
 * @param {string} deps.root 阶段根（如 stages），镜像写到 `<baseDir>/<root>/_ledger.jsonl`
 * @param {string} [deps.baseDir] 默认项目根；`append` 时可按会话现填
 * @param {(message: string) => void} [deps.onWarn] 降级/异常的唯一出口（漏传 = 静默降级）
 * @param {string} [deps.runId] 运行身份；缺省用本次进程的 `PROCESS_RUN_ID`
 */
export function createLedger({ storage, root, baseDir, onWarn, runId = PROCESS_RUN_ID }) {
  const memory = [];
  /**
   * 去重键 → 台账行。**`has` 与 `append` 共用这一个映射**——两套口径就是那条 bug：
   * `has` 比 `append` 宽，于是「明明没重复却被判重复」，新的审查结论静默丢失。
   *
   * 用 Map 而不是 Set + 数组：重复 append 时要能返回**已在台账里的那一行**，
   * 而不是把调用方传进来的临时对象原样吐回去。
   */
  const rows = new Map();
  let unit = null;
  /** `attach()` 的结果缓存：重复调用不会把历史行灌两遍。 */
  let attached = null;
  /** 事件行的运行内序号：同一毫秒内两次真实发生也各自独立。 */
  let seq = 0;

  /**
   * 尝试挂载 storage；失败就退到纯内存。**幂等**。
   *
   * @returns {Promise<boolean>} 是否真的挂上了
   */
  async function attach() {
    if (attached === null) attached = openUnit();
    return attached;
  }

  async function openUnit() {
    if (storage === undefined || storage === null) return false;
    try {
      const form = storage.form?.('domain');
      if (form === undefined || form === null) return false;
      unit = await form.open({
        name: 'stage-gate',
        version: 1,
        tables: ['entries'],
        hasGlobal: false,
      });
      const loaded = await unit.loadAll();
      const persisted = loaded?.tables?.entries ?? {};
      for (const value of Object.values(persisted)) {
        if (value === null || typeof value !== 'object') continue;
        // 老行没有 runId（WP6 之前写的），键里用 `-` 占位：它们不该和本次运行的任何行撞上。
        const key = dedupeKey(value.runId ?? '-', value);
        if (rows.has(key)) continue;
        rows.set(key, value);
        memory.push(value);
      }
      return true;
    } catch (error) {
      onWarn?.(`[stage-gate] storage 不可用，台账退到内存：${String(error?.message ?? error)}`);
      unit = null;
      return false;
    }
  }

  /**
   * 追加一条。**同一 `{runId, stage, kind, at}` 第二次 append 被跳过，不是覆盖。**
   *
   * 两种身份要分清（这是本模块最容易写错的一处）：
   *
   * - **事实行**（`reconciled`）：`at` 来自门记录。同一份门记录被扫到第二次 → 跳过。
   * - **事件行**（`would-block` / `blocked`）：没有 `at`，每次发生都算一条，键用运行内 `seq`。
   *   若拿毫秒时间戳当键，同一毫秒内的两次真实发生会被静默合并——「本可以拦住 N 次」的
   *   N 就少算了。时间戳的分辨率不该决定计数。
   *
   * 顺序是刻意的：内存 → 文件镜像 → storage。镜像不依赖 storage，
   * 这样「storage 写失败」不会连累到人可读的那一份。
   *
   * @param {object} entry 台账行；`at` 缺省时自动补 ISO 时间戳（并分配 `seq`）
   * @returns {Promise<object>} 记下的那一行（重复时返回已在台账里的那条）
   */
  async function append(entry) {
    const givenAt = entry.at;
    const now = new Date().toISOString();

    let stored;
    let key;
    if (givenAt === undefined) {
      // 事件行：身份是运行内序号。seq 只在真正落账时递增，所以永远不会「重复」。
      stored = { ...entry, runId, at: now, seq: seq + 1 };
      key = dedupeKey(runId, stored);
    } else if (givenAt === null) {
      // 没写时间戳的门记录：身份是内容指纹，`at` 仍给人读那份留一个时间。
      stored = { ...entry, runId, at: now };
      key = dedupeKey(runId, { ...stored, at: null });
    } else {
      // 事实行：身份是门记录自己的时间戳。
      stored = { ...entry, runId };
      key = dedupeKey(runId, stored);
    }

    if (rows.has(key)) {
      // 重复：跳过（不覆盖、不重写镜像），返回已在台账里的那条，让调用方能看见「记过了」。
      return rows.get(key);
    }

    if (givenAt === undefined) seq = stored.seq;
    rows.set(key, stored);
    memory.push(stored);
    mirror(stored, stored.baseDir);

    if (unit !== null) {
      try {
        await unit.putRecord('entries', key, stored);
      } catch {
        /* storage 写失败不影响主流程；镜像已经写到人了 */
      }
    }
    return stored;
  }

  /** 镜像到 root 下的 JSONL。失败静默——主流程不能因为镜像挂了而停。 */
  function mirror(row, rowBaseDir) {
    const dir0 = rowBaseDir ?? baseDir;
    if (dir0 === undefined || dir0 === null || dir0 === '') return;
    try {
      const dir = join(dir0, root);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const file = join(dir, LEDGER_FILE);
      writeFileSync(file, `${JSON.stringify(row)}\n`, { encoding: 'utf8', flag: 'a' });
    } catch {
      /* 镜像失败不影响主流程 */
    }
  }

  /**
   * 台账里是否已有**这一条**（与 `append` 同一个键）。
   *
   * 注意 `at` 缺省时返回 `false`：没有时间戳就没有稳定身份，
   * 「没法证明它记过」和「记过」是两件事——前者必须放行，否则又会静默丢记录。
   *
   * @param {object} entry
   * @returns {boolean}
   */
  function has(entry) {
    if (entry === null || typeof entry !== 'object') return false;
    return rows.has(dedupeKey(runId, entry));
  }

  return {
    runId,
    attach,
    append,
    has,
    all: () => [...memory],
    /** 已挂载的 storage 单元（测试用；产品代码不该直接碰它）。 */
    unit: () => unit,
  };
}
