# AGENTS.md

> 本项目是一个 DSH 插件。**文件已搭好，功能未定**——功能定了之后，先把 P0 需求写清楚，再动代码。

## 开工前

1. **用 `skill` 工具加载 `plugin-kit`**。判据在那里，本文不复述。
2. 查宿主契约，读 `plugin-kit` 包里的 `host-skills/`（**位置见 `plugin-kit` 的 `SKILL.md`「宿主领域知识在哪」——它会报出绝对路径**）：
   - 写 Host 半 / slot / Config / 抄模板 → `cordis-plugin-development/`
   - 写 patch / preset / 查有哪些插件包可装 → `cordis-composition-reference/`
   - 做 agent preset / composition → `editing-cordis-compositions/`
   - 设计模型可见的工具描述 → `agent-experience/`
3. **先读那个目录下的 `PATHS-README.md`**。那 4 份文档里的 `references/xxx` 是相对**它们各自目录**写的，不是相对 `plugin-kit` 的 base directory。照 base 解析会落到 23 处不存在的文件。

> 注意：`host-skills/` **不在本项目里**，在 `plugin-kit` 包里。本项目只有 7 个骨架文件。

## 查不到答案时的顺序

1. `cordis_inspect_query` —— 答「有什么方法 / 什么事件 / 什么 slot」
2. **它答不了「怎么组合起来能用」** —— catalog 只给零件，不给装配图
3. `grep` 上面那个 `host-skills/` 目录 —— 装配图在文档里
4. **还不够 → 找一个真实运行的同类型插件，读它的源码**
   在 `~\.dsh\profiles\<profile>\node_modules\` 下找。
   **这条最有效，但最容易忘**——一次真实开发里翻了两百多次 catalog 和源码都没答案，
   最后是读一个已发布插件的源码才找到接缝。

**顺带记一条**：省上下文只有在它没有引起更多搜索、重复读取或错误时才划算。**查得太多本身就是错。**

## 最常踩的五条

1. **每条验收必须能判真假**；靠人看的必须给机判替代，否则标「人工判读」。
2. **每条关于宿主的断言必须带出处**（探测命令+返回，或安装包 `文件:行`）。
3. **每阶段结束开一个独立审查员**：它不写代码、只读产物、只出三态结论。
4. **任何检查先证明它会红**，再用它判通过。
5. **模块存在 ≠ 产品在用**：必须证明它在 import 图里可达。

## 本项目的形态

- Host 半；`inject` 目前是空数组
- 需要宿主服务才往 `inject` 加，**但只加确实存在的**
- 要配置就用 schemastery 的 `Schema.object(...)`；**不要导出普通的 `Config = {}`**

## 阶段做完时

> 开一个审查员，按 `plugin-kit` 的 `references/process.md` P\<n\> 出口判据审这一版。
> 需求在 `<需求文件>`，产物在 `<产物目录>`。只读不写，只出三态结论。

**必须是新开的审查员。**同一个会话让它「顺便检查一下」不算。

## 交付前

- `npm pack` 后从 tarball 真加载一次
- `files` 与包内文件三方向差集为空
- 交付说明里的命令全部真跑过

## 不要做

- 不要把「测试全绿」当成「验收通过」
- 不要把「无法判定」写成「通过」
- 不要在没跑过的情况下把命令写进交付说明
- **不要自己创建 `GATE.json`** —— 那个必须人写。自己造等于把审查机制作废
