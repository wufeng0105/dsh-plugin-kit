/**
 * Skill provider —— 把打包的 `skills/` 目录注册进宿主 skill 目录。
 *
 * 这是「带 skill 的插件」的核心：装一个包，skill 自动出现在目录里，
 * 不用手动复制到每个项目。
 *
 * ## 必须避开的坑（出处：process-lab 归档仓的 MERGE-FACTS.md §四，本仓不含）
 *
 * - **K1**：`registerProvider` 返回的 disposer 由 SkillRegistry 的 context 拥有，
 *   不是本插件 fiber。必须包 `ctx.effect()` 才能在卸载时回收。
 * - **K3**：候选形状错会**穿透注册表抛**，一个坏候选拖垮整个 provider。
 *   所以列表项要两重防线：IO 失败跳过 + 字段违规跳过。
 * - **K5**：模块顶层不能抛——`apply()` 还没跑，顶层抛会把整个 server 带下去。
 *   本文件顶层只定义常量和纯函数。
 *
 * @module lib/skill-provider
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** 宿主强制的 skill 名语法（`dsh-skill` 的 SKILL_NAME）。 */
export const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * 目录渲染时 description 的截断上限。
 * `dsh-tool-skill` 的 DEFAULT_CATALOG_DESCRIPTION_MAX_LENGTH。
 */
export const DESCRIPTION_LIMIT = 500;

/**
 * 本 provider 在 skill 层级里的 rank。
 *
 * 550 介于用户级（400/500）与内置（600）之间：
 * 项目/用户的同名 skill 能覆盖我们，我们能覆盖其他打包 provider。
 */
export const PACKAGED_SKILL_RANK = 550;

/** 目录名暗含的语义：`_` 和 `.` 开头的不算 skill。 */
function isSkippable(name) {
  return name.startsWith('_') || name.startsWith('.');
}

/**
 * 解析 SKILL.md 的 frontmatter。
 *
 * 只做最简单的事：读第一段 `---` 之间的 `key: value`。
 * 不引 YAML 库——多一个依赖多一个版本坑。
 *
 * @param {string} text
 * @returns {{ metadata: Record<string,string>, body: string } | null}
 */
export function parseFrontmatter(text) {
  if (typeof text !== 'string' || !text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return null;
  const metadata = {};
  for (const line of text.slice(3, end).split('\n')) {
    const match = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line.trim());
    if (match) metadata[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return { metadata, body: text.slice(end + 4).replace(/^\n+/, '') };
}

/**
 * 第二重防线：校验一个候选是否合法。
 *
 * 第一重是 try/catch（IO 失败）；这一重防「读到了但字段违规」。
 * 任一不合格就要跳过，绝不能 push 进去——否则注册表会整个抛。
 *
 * @param {object} candidate
 * @param {string} providerName
 * @returns {boolean}
 */
export function isValidCandidate(candidate, providerName) {
  if (candidate === null || typeof candidate !== 'object') return false;
  if (typeof candidate.name !== 'string' || !SKILL_NAME.test(candidate.name)) return false;
  if (typeof candidate.description !== 'string' || candidate.description.length === 0) return false;
  if (candidate.description.length > DESCRIPTION_LIMIT) return false;
  if (typeof candidate.provider !== 'string' || candidate.provider !== providerName) return false;
  if (typeof candidate.rank !== 'number' || !Number.isFinite(candidate.rank)) return false;
  if (candidate.invocation === undefined || candidate.invocation === null) return false;
  return true;
}

/**
 * 扫描 skills 根目录，返回候选列表。
 *
 * @param {object} options
 * @param {string} options.root     skills 根目录（绝对路径）
 * @param {string} options.provider 注册用的 provider 名（候选的 provider 必须等于它）
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<object[]>}
 */
export async function listSkills({ root, provider, signal }) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return []; // skills 目录不存在：不是错误，只是没有 skill
  }

  const candidates = [];
  for (const entry of entries) {
    if (signal?.aborted === true) break;
    if (isSkippable(entry.name)) continue;
    if (!entry.isDirectory()) continue;

    const directory = entry.name;
    const file = join(root, directory, 'SKILL.md');

    // 第一重防线：IO 失败跳过
    let text;
    try {
      text = await readFile(file, 'utf8');
    } catch {
      continue;
    }

    let parsed;
    try {
      parsed = parseFrontmatter(text);
    } catch {
      continue; // 解析器本身抛了也跳过，不能让异常冒出去
    }
    if (parsed === null) continue;

    const { metadata } = parsed;
    const candidate = {
      name: metadata.name ?? directory,
      description: metadata.description ?? '',
      invocation: { modelInvocable: true, userInvocable: true },
      source: 'custom',
      provider,
      rank: PACKAGED_SKILL_RANK,
      locator: { directory },
      resourceBase: { kind: 'directory', path: join(root, directory) },
      path: file,
    };

    // 第二重防线：字段违规跳过
    if (!isValidCandidate(candidate, provider)) continue;
    candidates.push(candidate);
  }

  return candidates.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 读一个候选的完整正文，返回 **SkillDefinition**。
 *
 * ## 为什么必须返回完整定义（不是只给 content）
 *
 * `dsh-skill/lib/index.js:471-490` 的 `validateDefinition` 会逐字段检查，
 * 任一不合格就抛。必需字段：
 *
 * | 字段 | 要求 |
 * |---|---|
 * | `name` | string，匹配 SKILL_NAME |
 * | `description` | string，非空 |
 * | `invocation` | `{ modelInvocable: boolean, userInvocable: boolean }` |
 * | `source` | **string**（真机踩过：漏了它报 `source must be a string`） |
 * | `provider` | string |
 * | `content` | string |
 * | `path` | 可选 string |
 *
 * 早期版本只返回 `{ content, name, description }`，结果 `list()` 成功
 * （名字出现在目录里）但 `skill` 工具一加载就报错——**目录可见 ≠ 能加载**。
 *
 * @param {object} options
 * @param {string} options.root
 * @param {string} options.provider 注册用的 provider 名
 * @param {{ directory: string }} options.locator
 * @returns {Promise<object | undefined>}
 */
export async function readSkill({ root, provider, locator }) {
  if (locator === null || typeof locator !== 'object' || typeof locator.directory !== 'string') {
    return undefined;
  }
  // 防目录穿越：locator 只允许单段目录名
  if (locator.directory.includes('/') || locator.directory.includes('\\') || locator.directory === '..') {
    return undefined;
  }
  try {
    const path = join(root, locator.directory, 'SKILL.md');
    const text = await readFile(path, 'utf8');
    const parsed = parseFrontmatter(text);
    if (parsed === null) return undefined;

    const definition = {
      name: parsed.metadata.name ?? locator.directory,
      description: parsed.metadata.description ?? '',
      invocation: { modelInvocable: true, userInvocable: true },
      source: 'custom',
      provider,
      content: parsed.body,
      path,
      // 必须给：宿主 `dsh-skill/lib/index.js:71-79` 的 renderResourceHint 靠它决定
      // 是否告诉模型文件在哪。
      //   有 resourceBase(kind:'directory') → 注入
      //     「Base directory for this skill: <绝对路径>」
      //     「Resolve relative paths mentioned by this skill against the base directory」
      //   没有 → 只说「Resources for this skill are managed by provider "X"」，**不给路径**
      //
      // 2026-11-10 实测：缺这个字段时，模型拿到了 SKILL.md 正文却不知道
      // references/、host-skills/ 在哪——只能猜，或去翻 app.asar（打不开）。
      // 一次真实开发里为找宿主契约花了 200+ 次工具调用，根因之一就是这一行缺失。
      resourceBase: { kind: 'directory', path: join(root, locator.directory) },
    };

    // 返回前再校验一遍：形状错的宁可 undefined，也不要让注册表抛
    if (!isValidDefinition(definition, provider)) return undefined;
    return definition;
  } catch {
    return undefined;
  }
}

/**
 * 校验 SkillDefinition 的形状（对应宿主 `validateDefinition`）。
 *
 * @param {object} skill
 * @param {string} providerName
 * @returns {boolean}
 */
export function isValidDefinition(skill, providerName) {
  if (skill === null || typeof skill !== 'object') return false;
  if (typeof skill.name !== 'string' || !SKILL_NAME.test(skill.name)) return false;
  if (typeof skill.description !== 'string' || skill.description.length === 0) return false;
  if (typeof skill.source !== 'string' || skill.source.length === 0) return false;
  if (typeof skill.provider !== 'string' || skill.provider !== providerName) return false;
  if (typeof skill.content !== 'string') return false;
  if (skill.path !== undefined && typeof skill.path !== 'string') return false;
  const inv = skill.invocation;
  if (inv === undefined || inv === null || typeof inv !== 'object' || Array.isArray(inv)) return false;
  if (typeof inv.modelInvocable !== 'boolean' || typeof inv.userInvocable !== 'boolean') return false;
  return true;
}
