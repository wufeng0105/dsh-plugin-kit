# AGENTS.md

> 本项目是 DSH 插件。骨架已就位，功能未定。

## 开工前

- 设计期开始 → 加载 `domain-modeling`（概念）与 `codebase-design`（结构），按它们的做法做。
- 复制骨架后 → 替换全部占位符：`package.json`、`cordis.patch.yml`、`index.js` 三处包名占位符，`CONTEXT.md` 首行名字占位符。改完在项目根搜一次，两类占位符零残留。
- 定第一个术语 → 写进 `CONTEXT.md`，格式 `**术语**：定义`，弃用叫法写 `_Avoid_:`。
- 要写 ADR → 放 `docs/adr/NNNN-slug.md`，三个条件全占才写：难回头、无上下文会费解、真取舍。
- 新增导出或模块前 → 答接口三问，答案写进交付说明或 ADR：删掉它复杂度去了哪；接缝另一侧是否有第二个适配器（生产+测试）；依赖是参数传入还是模块内 `new`。
- 查宿主服务、事件、Config、Slot 或工具 → 用 `cordis_inspect_query`（权威源）。
- 需要机制原则 → 读 `host-skills/dsh-doc/`（在 plugin-kit 包里）。
- 需要查契约三步、首装验证、升级保鲜的完整判据 → 加载 `plugin-kit` skill。
- 要确认某个组合怎么装配 → 找同类真实插件读源码。
- 写关于宿主的断言 → 附出处（探测命令与返回，或安装包 `文件:行`）。

## 本项目形态

- 加服务 → 先 inspect 确认存在，再加进 `inject`。
- 要配置 → 用 schemastery 的 `Schema.object(...)`。
- 导出配置 → 不写普通对象（`Config = {}` 会崩）。
- 写 client.js → 用 `window.__ModuleLoader__.load({ id, factory })`。
- client.js 中 → 不写 ESM `export` / `import`（宿主把全部插件 client.js 拼成一个脚本）。

## 交付前

- 设计期工件 → 跑 `node <plugin-kit包>/skills/plugin-kit/scripts/design-check.mjs <项目根>`，0 FAIL 才继续。
- 装之前 → 跑 `node <plugin-kit包>/skills/plugin-kit/scripts/preflight.mjs <项目根>`，0 FAIL 才继续。
- 打包 → 跑 `npm pack`，从 tarball 装一次。
- 加第一个依赖时 → 建 `.gitignore`，写 `node_modules/`、`*.tgz`、`*.log`。
- 升级 DSH 后 → 跑 `<plugin-kit包>/skills/plugin-kit/scripts/recheck.mjs`；判文档副本是否过期 → 在 plugin-kit 源码仓根跑 `node scripts/reextract.mjs --check`。
- design-check 报 FAIL 且提示「示例术语」→ 把 `CONTEXT.md` 的示例术语换成真实术语，这是骨架首跑的预期状态。

## 判据

- 前置命令输出 → 必须真跑过，不引用推断结果。
- 判「装上了」→ preflight 0 FAIL 且 `install_bundle` 返回成功，两个都满足才算。
- 判「用得上」→ 装后在宿主里看得到本项目贡献的界面或工具。
- 检查项 → 先构造一个应失败的输入，确认该项会红，再用它判通过。
- 模块 → 必须证明它在产品代码的 import 图里可达，存在不算在用。
- 判不了 → 标 `UNVERIFIABLE` 并写明证据等级：L1 运行时、L2 行为复现、L3 源码核对、L4 自述。
- 用户可见 → 界面文字只承载功能本身（按钮文字、placeholder、状态反馈）。

## 不写

- 把 `npm run check` 全绿当验收通过 → 不写（它不含真机验证）。
- 把「无法判定」写成「通过」→ 不写。
- 没跑过的命令写进交付说明 → 不写。
- 猜服务名 → 不写（名字错，插件永远 pending，宿主当 web boot 失败）。
- 界面上写「点击这里可以…」类解释 → 不写（交互没做对才需要解释）。
