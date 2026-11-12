/**
 * dsh-plugin-kit —— 契约知识 + 可执行验证清单的分发载体（Host 半）。
 *
 * 产品本体在 skills/plugin-kit/（判据正文 + preflight/recheck 脚本）。
 * 本文件只做一件事：把它们注册进宿主 skill 目录，免手动复制。
 *
 * 历史形态（拦截 / 台账 / 纪律段）已退役：
 *   - 拦截层废弃：docs/adr/0002-拦截层废弃.md
 *   - 作证台账搁置：docs/adr/0003-作证台账搁置.md
 *   - 旧实现完整代码在 git（61f5fa2 之前），工作树不再保留。
 *
 * 用到的接缝（rc.2 inspect 实测）：
 *   ctx.skills.registerProvider  —— 把 skills/ 注册进宿主 skill 目录
 *
 * @module @wufeng0105/dsh-plugin-kit
 */

import { existsSync as EXISTS } from 'node:fs';
import { join as RESOLVE, dirname as DIRNAME } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { listSkills, readSkill } from './lib/skill-provider.js';

/** 插件名，用于日志前缀、行 id、skill provider 注册名。 */
export const name = 'plugin-kit';

/**
 * 插件版本，从本包自己的 manifest 读（装配事实，不是用户配置）。
 * 顶层 try/catch：模块顶层不能抛，否则会把整个 server 带下去。
 */
const VERSION = (() => {
  try {
    return createRequire(import.meta.url)('./package.json').version ?? 'unknown';
  } catch {
    return 'unknown';
  }
})();

/** 硬依赖：只需要 skills 服务。 */
export const inject = ['skills'];

/**
 * 插件入口。
 * @param {import('cordis').Context} ctx
 * @param {object} [config] 本插件无用户配置；保留形参以匹配宿主调用约定。
 */
export function apply(ctx) {
  const SKILLS_ROOT = RESOLVE(DIRNAME(fileURLToPath(import.meta.url)), 'skills');

  ctx.effect(() => {
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

  const log = (message) => {
    const logger = ctx.logger;
    if (logger === undefined || logger === null) return;
    const sink = typeof logger.info === 'function' ? logger.info.bind(logger) : undefined;
    if (sink !== undefined) {
      sink(`[plugin-kit] ${message}`);
      return;
    }
    if (typeof logger === 'function') logger('info', `[plugin-kit] ${message}`);
  };

  log(`v${VERSION} 已加载 → cwd=${(() => { try { return process.cwd(); } catch { return 'unknown'; } })()}`);
  log(`skill provider 已注册 → name=${name} root=${SKILLS_ROOT}`);

  // 打包缺失自检：skills/ 不在时 listSkills 返回空数组而不抛错（静默失败）。
  // 这一行 error 是「插件是残的」的唯一信号。
  if (!EXISTS(SKILLS_ROOT)) {
    const errorSink = typeof ctx.logger?.error === 'function' ? ctx.logger.error.bind(ctx.logger) : undefined;
    const message = `[plugin-kit] 打包缺失：skills/ 目录不存在 → ${SKILLS_ROOT}。插件已加载但没有提供任何 skill。`;
    if (errorSink !== undefined) errorSink(message);
    else if (typeof ctx.logger === 'function') ctx.logger('error', message);
  }
}
