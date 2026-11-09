/**
 * Config schema —— 唯一接触 schemastery 的地方。
 *
 * 为什么不是普通 JSON Schema：cordis 的 `resolveConfig`（`cordis/lib/index.js:246`）
 * 直接调 `runtime.Config["~standard"].validate(config)`。普通对象没有 `~standard`，
 * 会在插件加载时抛 `TypeError: Cannot read properties of undefined (reading 'validate')`。
 *
 * 这个错误**只在真机加载时暴露**，离线测试（用桩 ctx）完全测不出来。
 * 记在这里，作为「离线全绿 ≠ 真能用」的实例。
 *
 * @module vendor/config
 */

import Schema from '../vendor/schemastery.mjs';

export const Config = Schema.object({
  /** 总开关。关掉等于没装。 */
  enabled: Schema.boolean().default(true),

  /**
   * observe 只记日志不拦；enforce 真的 deny。
   *
   * 用 observe 先跑一轮很重要：它让你看到「如果真拦，会挡下什么」，
   * 再决定要不要让它挡路。
   */
  mode: Schema.union(['observe', 'enforce']).default('enforce'),

  /** 阶段产物根目录。老项目可以指到别处。 */
  root: Schema.string().default('stages'),

  /**
   * 阶段目录名（有序）。
   *
   * 之前这里是缺失的：`index.js` 三处用了 `cfg.layout`，但 Config 里没声明。
   * schemastery 会把未声明的字段**静默剥掉**，于是无论用户配什么都不生效，
   * 永远走 DEFAULT_LAYOUT —— 而 README 却写着「可改成 ['00-需求','01-计划']」。
   *
   * 这是「文档承诺了做不到的事」，比功能缺失更糟。补上。
   */
  layout: Schema.array(Schema.string()).default([]),

  /**
   * 门记录文件名。
   * 单独可配，是因为有的项目习惯叫 `_GATE.json` 或 `.gate.json`。
   */
  gateFile: Schema.string().default('GATE.json'),

  /**
   * 额外信任的写工具。
   *
   * 默认空：未识别的写工具一律 deny（安全侧）。
   * 把工具登记进来等于承认「我知道它会写、我允许它不查门」——
   * 加得越多，G2 越弱。
   */
  allowedTools: Schema.array(Schema.string()).default([]),
});

/** 读 Config 的一个字段，容错 undefined。 */
export function pick(config, key, fallback) {
  const value = config?.[key];
  return value === undefined || value === null ? fallback : value;
}
