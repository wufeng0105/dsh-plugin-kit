# AGENTS.md

> 本项目是一个 DSH 插件。**骨架已就位，功能未定**——功能定了之后，先把需求写清楚，再动代码。
>
> **「就位」在这里有明确的完成条件，不是「文件已创建」**：`node --check` 和 `npm pack` 全绿也**证明不了它装得上**。判定它真的就位，只有两条：①`preflight` 零 FAIL；②装一次，读返回里的 `application`。

## 开工前

1. **设计期先加载 `domain-modeling` 与 `codebase-design`**，并把两件事做掉：
   - **概念**：第一个术语敲定就写进 `CONTEXT.md`（模板已带种子）——`**术语**：定义` + `_Avoid_: 弃用叫法`，一名一物，不攒批；难回头 + 无上下文会费解 + 真取舍三条全占的决策写 `docs/adr/NNNN-slug.md`。
   - **形状**：动笔前过接口三问（答案写进交付说明或 ADR）——删掉这个导出/模块，复杂度去了哪？接缝另一侧真有第二个适配器（生产+测试）吗？依赖是参数传入还是模块内 `new` 的？
2. **用 `skill` 工具加载 `plugin-kit`**：查契约的三步顺序、首装验证、升级保鲜都在那里，本文不复述。
3. **查宿主契约**：`cordis_inspect_query` 是权威源（Service / Event / Config / Tools / Slots），文档副本 `host-skills/dsh-doc/`（在 plugin-kit 包里）讲机制原则，真实运行的同类插件源码讲装配。
4. **每条关于宿主的断言必须带出处**（探测命令+返回，或安装包 `文件:行`）。

## 最常踩的六条

1. **每条验收必须能判真假**：靠人看的必须给机判替代，否则标「人工判读」。
2. **每条关于宿主的断言必须带出处**。
3. **任何检查先证明它会红，再用它判通过**。
4. **模块存在 ≠ 产品在用**：必须证明它在 import 图里可达。
5. **「无法判定」不是「通过」**：探测不到就标 `UNVERIFIABLE`，写明证据等级。
6. **交付说明里的命令必须真跑过**。

## 本项目的形态

- **Host 半**：`inject` 目前是空数组。
- **加服务**：需要宿主服务才往 `inject` 加，**但只加确实存在的**（inspect 先查）。
- **配置**：要配置就用 schemastery 的 `Schema.object(...)`；**不要导出普通的 `Config = {}`**。
- **界面半**：client.js 用 `window.__ModuleLoader__.load({ id, factory })` 形态，**不能有 ESM export/import**——宿主把所有插件的 client.js 拼成一个大脚本加载。

## 交付前

1. **design-check**：`node <plugin-kit包>/skills/plugin-kit/scripts/design-check.mjs <项目根>` —— 设计期工件 0 FAIL（首跑必红：种子是格式示例，按补法换成第一条真实术语）。
2. **preflight**：`node <plugin-kit包>/skills/plugin-kit/scripts/preflight.mjs <项目根>` —— 0 FAIL 才算预检过。
3. **打包真加载**：`npm pack` 后从 tarball 真加载一次。
4. **建 `.gitignore`**：加第一个依赖时顺手建——`node_modules/`、`*.tgz`、`*.log`。（骨架没有依赖，所以还没建；骨架里不能预放 `.gitignore`：npm 打包会排除它，仓库与包就对不上了。）
5. **升级 DSH 后**：跑 `recheck.mjs`（升级复检，`<plugin-kit包>/skills/plugin-kit/scripts/`）；文档副本过期判定用 `reextract.mjs --check`——**该脚本只在 plugin-kit 源码仓有**（不随包分发），用法见 `plugin-kit` skill §三的两态说明。

两个自检分工不互判：design-check 判设计工件（词汇表/ADR/弃用名漂移），preflight 判宿主契约与装败。

## 不要做

- **不要把「测试全绿」当成「验收通过」**。
- **不要把「无法判定」写成「通过」**。
- **不要在没跑过的情况下把命令写进交付说明**。
- **不要猜服务名**：`inject` 写错一个名字，插件永远 pending，宿主当 web boot 失败。
- **不要在界面上解释功能**：功能即说明——界面文字只属于功能本身（按钮文字、placeholder、状态反馈）；「点击这里可以…」这类话是交互还没做对的信号，把解释做进形态、状态和交互里，别留在屏幕上。
