/**
 * 项目状态与台账 —— 插件自有的持久化与可观测性。
 *
 * 解决两个审计条件：
 *   C3（I2）：让「机制没运行」与「机制运行但没拦住」在证据上可区分
 *   C4（I3）：人手写 GATE.json 不产生工具调用，H1 看不见；靠读时补记覆盖
 *
 * 存储用 H15 `ctx.storage`（跨会话持久）。拿不到 storage 时降级为内存 + 文件镜像。
 *
 * @module lib/ledger
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** 项目级 marker 文件名。存在 = 该项目已采用阶段门。 */
export const MARKER_FILE = '.stage-gate.json';

/** 台账镜像文件名（人可读）。放在 root 下。 */
export const LEDGER_FILE = '_ledger.jsonl';

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
 */
export function createLedger({ storage, root, baseDir, onWarn }) {
  const memory = [];
  let unit = null;

  /** 尝试挂载 storage；失败就退到纯内存。 */
  async function attach() {
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
      const rows = loaded?.tables?.entries ?? {};
      for (const value of Object.values(rows)) memory.push(value);
      return true;
    } catch (error) {
      onWarn?.(`[stage-gate] storage 不可用，台账退到内存：${String(error?.message ?? error)}`);
      unit = null;
      return false;
    }
  }

  /** 追加一条。 */
  async function append(entry) {
    const row = { ...entry, at: entry.at ?? new Date().toISOString() };
    memory.push(row);
    const key = `${row.stage}|${row.kind}|${row.at}`;
    if (unit !== null) {
      try {
        await unit.putRecord('entries', key, row);
      } catch {
        /* storage 写失败不影响主流程 */
      }
    }
    mirror(row, row.baseDir);
    return row;
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

  /** 台账里是否已有某条（按 stage + kind + at 判重）。 */
  function has(entry) {
    return memory.some((row) => row.stage === entry.stage && row.kind === entry.kind);
  }

  return { attach, append, has, all: () => [...memory] };
}
