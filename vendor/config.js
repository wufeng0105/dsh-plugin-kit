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
   * ## 2026-11-11 D1 裁定：默认值从 enforce 改为 observe
   *
   * 理由（`03-拦截层存废裁定.md` §二）：在真机上量出「本可以拦住 N 次」之前，
   * 不该默认拦人。默认 enforce 的代价是**用户先被拦，再自己发现拦截是错的**——
   * 764 分钟会话里 9 次误拦全部由用户承担，而机制自己一次都没报过。
   *
   * 默认 observe 还让未来能收集到「如果拦会不会有用」的数据：
   * 每次本可以拦住都会写一条 `would-block` 进台账，那才是评估拦截层的数据源。
   *
   * enforce 仍然保留——但它是**显式选择**，不是默认。
   */
  mode: Schema.union(['observe', 'enforce']).default('observe'),

  /**
   * 阶段产物根目录。**2026-11-11 D1 裁定后已从配置项移除，恒为 `stages`。**
   *
   * 为什么砍掉它（实测，不是猜）：`root` 配错会**静默失效**——
   * 实际目录是 `stages/`、配置写成 `my-stages` 时，`locateStage` 认不出任何阶段写入，
   * `decide` 直接返回 `allow`，**既不拦也不报错**。用户会以为有保护，实际全放行。
   *
   * 对比另外两个字段（同批实测）：
   *   - `layout` 配错 → 返回 `deny GATE_MISSING`，**会报错**，不是静默
   *   - `gateFile` 配错 → 返回 `deny GATE_MISSING`，**会报错**（虽然理由误导）
   *
   * 所以只有 `root` 一个是「配错即静默」的，只有它该砍。
   * 三个字段全砍的代价是失去 `layout`/`gateFile` 的真实灵活性，收益却只有一条。
   *
   * 要改约定就改代码——一个「能把机制静默关掉」的开关，不该成为配置项。
   */
  // root: 已删除（恒为 'stages'，见 lib/gate.js 的 DEFAULT_ROOT）

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
});

/** 读 Config 的一个字段，容错 undefined。 */
export function pick(config, key, fallback) {
  const value = config?.[key];
  return value === undefined || value === null ? fallback : value;
}
