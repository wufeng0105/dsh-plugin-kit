/**
 * my-plugin —— Host 半。
 *
 * 骨架阶段：只证明这个包能被宿主加载。功能定了再在 apply 里注册。
 *
 * 三条硬规矩（都踩过，写错会让 DSH 起不来）：
 *
 * 1. `inject` 里只能写宿主确实存在的服务名。写错或写了不存在的服务，
 *    插件会永远 `pending`，而宿主把「有 entry 未激活」当成 web boot 失败——
 *    整个页面加载不出来。不确定就保持空数组。
 * 2. 不要导出 `Config = {}`。要配置就用 schemastery 的 `Schema.object(...)`；
 *    不需要就干脆不导出。普通对象会让 activate 崩在
 *    `Cannot read properties of undefined (reading 'validate')`。
 * 3. 所有资源注册包在 `ctx.effect(() => { ... return cleanup })` 里。
 *
 * @module my-plugin
 */

export const name = 'my-plugin';

/** 需要宿主服务时才往这里加。不需要就留空。 */
export const inject = [];

export function apply(ctx, config) {
  const sink = typeof ctx.logger?.info === 'function' ? ctx.logger.info.bind(ctx.logger) : undefined;
  if (sink !== undefined) sink('[my-plugin] loaded');
}
