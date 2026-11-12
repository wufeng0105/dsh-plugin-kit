/**
 * 常驻纪律段 —— 每步都出现在 systemPrompt 里的一小段文字。
 *
 * ## 为什么需要它
 *
 * 宿主 skill 目录只让 skill **可见**（name + description）。
 * 没有常驻指令，模型没有「要去看看」的持续理由——这正是
 * 「AI 不守约定」的一个成因。
 *
 * ## 为什么是条件句，不是运行时门控
 *
 * 探测结果（出处：process-lab 归档仓的 MERGE-FACTS.md §十一，本仓不含）：
 * `PromptSection.text` 收到的是 `{ scope?, signal? }`，**没有 cwd**；
 * `workingDirectory.get()` 要 `Session`，而回调里没有。
 * 所以「只在启用了阶段门的项目里注入」**做不到**。
 *
 * 退到条件句：文本自己说明「有 marker 才相关」。
 *
 * ## 为什么不复述门规则
 *
 * 门规则已经被 `tools/pre-execute` 机械执行了。在 prompt 里说一遍
 * 只会构成第三份副本（`gate.js` / `SKILL.md` / prompt），且没有权威源。
 * 这里只说「去哪找判据」。
 *
 * @module lib/discipline
 */

/** systemPrompt 段名。带命名空间，避免和宿主的段撞。 */
export const SECTION_NAME = 'plugin-kit:discipline';

/**
 * 段顺序。宿主约定：身份类在 -100 附近，内容类在正数区。
 * 121 放在核心身份/配置之后、常规 per-agent 上下文之前。
 */
export const SECTION_ORDER = 121;

/**
 * 注入的正文。
 *
 * 写作约束（每条都有来由）：
 * - **条件句开头**：非插件项目里不构成假指令（审计 I1）
 * - **第一条就是「去加载判据」**：那是最需要说服的动作（审计 I5）
 * - **不复述门规则**：判据在 skill 里，本段只说「去哪找」（审计 I5）
 * - **不许声称「会被拦住」**：2026-11-11 D1 裁定删掉拦截层后，
 *   任何工具调用都不会被 stage-gate deny。说「会被拦住」是假话，
 *   而假话一旦被验证为假，读者会连这条纪律一起丢掉。
 */
export const DISCIPLINE_TEXT = [
  '<EXTREMELY_IMPORTANT>',
  '如果本项目根目录下有 `.stage-gate.json`，说明它启用了阶段门：',
  '',
  '1. **开工前先加载 `plugin-kit` skill**（用 `skill` 工具）。它规定每个阶段该产出什么、',
  '   谁来判断、什么算过——那是唯一的判据来源，本段不复述。',
  '2. **阶段产物写到 `stages/<阶段>/` 下**（如 `stages/p0/`）。写到别处不会报错，',
  '   但也不会进台账——你会得到一本空台账，且没有任何信号告诉你记漏了。',
  '3. **不要自己造门记录**。机制挡不住你，这是纪律不是技术约束：自己写的后果是',
  '   台账里出现一条「审过了」而实际没人审，那比不写更坏。',
  '',
  '如果没有 `.stage-gate.json`，忽略本段。',
  '</EXTREMELY_IMPORTANT>',
].join('\n');
