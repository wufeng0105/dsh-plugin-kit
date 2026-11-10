# 更新日志

本文件记录所有值得注意的变更。
格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [未发布]

### 并入 process-lab 的规格正文（2026-11-09）

原 `dsh-plugin-process-lab` 仓库归档，内容按「三向合并」并入本仓。

**合并而非覆盖**——两份是分叉的，各有对方没有的：

| 文件 | 包内原有（保留） | 从 process-lab 并入 |
|---|---|---|
| `references/process.md` | P3.5 运行时验收卡、铁律 23 版本基线、探针入库/红态存档 | 「给谁用」节、「三个层次按成本递增」、「开审查员的一句话」 |
| `references/reviewer.md` | —（两份完全相同，不动） | — |
| `references/evidence.md` | 八条边界、「已不再成立」订正段 | **「换人从没真的换过」升级为第一条边界** |

**新增两份 reference**：

- `references/walkthrough.md` —— 一次真实打回的完整片段（138 测试全绿 / 3 BLOCKER / 产品没接线）
- `references/limits.md` —— 两条还没关掉的边界（成本未测 / 独立性未验）

两者都进了 `SKILL.md` 的「按需读什么」表——否则对模型不存在。

### 证据与验证脚本移出 npm 包

`evidence/`（1.9MB）和 `test/e2e/` 从 `files` 白名单移除：

- npm 包只装运行需要的文件，实测 **73KB / 31 文件**
- 证据和复跑脚本留在源码仓库，README 用 GitHub URL 指向
- `evidence/` 现含：9 份独立审计原文、67 条卡点台账、3 份实验需求、三轮产物 tgz、真机验证存证

### 订正记录（原写在判据正文里，现移到这里）

`process.md` 的「怎么让它不被忘记」表，原先在本表下方写着：

> 2026-11 更新：本表原写「做成插件：成本高，不值得」。那句话是在还没有插件可用时写的。后来用 DSH 原生接缝（`tools/pre-execute`）做出了插件形态并做了真机验证，该判断被推翻。

**这段订正从判据正文移到了这里**，理由：`process.md` 是给模型读的判据，不是变更日志。

**但 `evidence.md` 里那句「已不再成立的一条……边界要标时间」保留在正文**——它不是订正记录，是一条可复用判据（边界会过期，要标时间）。


### E 阶段实验结论回写（2026-11-10）

在真实交付压力下跑了第四个项目 `dsh-archive-manager`（界面型插件，设置页批量管理归档会话），走完 P0–P5。**这是流程规格第一次在真项目上被检验**，结论回写三处：

| 文件 | 改动 |
|---|---|
| `references/limits.md` | L1 从「成本从未测过」改为「**测过一次，部分关闭**」：160 分钟 / 6 次开门 / 9 分钟目录维护，占事前止损线 55.6%。不接受「机制划算」的字面结论——工期分母未经检验、只有一个样本、返工占 36.9% |
| `references/process.md` P3.5 卡 | 补**形态例外**：界面型插件的 GUI 不一定可驱动，UI 项标 `UNVERIFIABLE`、装配层标 L2/L3 不冒充 L1、不得为拿 L1 启动第二个 GUI 干扰用户 |
| `references/evidence.md` 边界七 | 样本从三个变四个，且首次实证「界面型插件打破 P3.5 的 CLI 可验假设」；但四个仍是同一作者，「换人仍会遇到」仍未测 |

**流程挡下的 8 起真问题**（完整见 `dsh-archive-manager/stages/COST-VERDICT.md`）：销毁语义写进确认框、幽灵引用、网关名排实施期、GOAL 自身过期、状态绑定错位三连环、inject 未声明、自造槽名零先例、L1 等级标宽。

**新发现的失败模式**：独立审查员两次中途失败且无报告，暴露「审查员不可得时的降级复核协议」缺位。本次临时做法（作者复核 + 显式标注「无独立审查」+ 收紧放行判定）应固化。

## [0.1.0] - 2026-11-09

首个版本。合并了原 `plugin-kit`（skill）与 `dsh-stage-gate`（插件）。

### 补记：用户负向证据（2026-11-10 12:27）

E 阶段收官后用户说「设置页没看到」——**第 9 起缺陷，也是唯一一起由真实用户撞上、流程内部没抓到的**。

根因两步：① 插件只装在 P3.5 的一次性 profile，跑完拆掉了，日常 `desktop` 从未装过 → 已补装；② 补装后仍看不到，查出 `slots.register` 被塞进 `slots.inject` 回调（market 先例证明 inject 是「等槽出现」的门控，不是注册入口）→ 已改为 register 直接调用 + inject 门控，并加 C4 护栏（专项变异证明会红）。

`references/limits.md` L1 同步：160 → **172 分钟**、55.6% → **59.7%**、8 起 → **9 起**、返工 36.9% → 41.3%。

**这条证据的分量**：COST-VERDICT 初版把完成标志 1 写成「部分」、结论偏乐观；用户撞上等于给那个乐观打了补丁。「UI 未做 L1 验证」不是免责声明，它真会让缺陷流到用户面前。

### 新增

**三段能力（一个包）**

- **判据**：把 `skills/plugin-kit/` 注册进宿主 skill 目录（`ctx.skills.registerProvider`）
- **纪律**：`systemPrompt` 常驻一段条件句，提示「有判据，去加载」
- **强制力**：`tools/pre-execute` 拦截未过门的阶段产物写入

**配置（5 项，全部可验）**

- `enabled` — 只关拦截，skill 与纪律段仍生效
- `mode` — `observe`（只记不发）/ `enforce`（真拦）
- `root` — 阶段产物根目录，默认 `stages`
- `layout` — 阶段目录名（有序），默认九阶段
- `gateFile` — 门记录文件名，默认 `GATE.json`
- `allowedTools` — 额外信任的写工具，未识别工具默认 deny

**台账**

- `stages/_ledger.jsonl` 记录 `blocked` / `skip` / `would-block` / `reconciled` 四类事件
- 读时补记：人手写 `GATE.json` 不产生工具调用，靠扫描补上

**日志**

- 四级语义（error / warn / info / debug），规范见 `LOGGING.md`
- 启动四行自检：版本 + cwd、skill 注册、纪律段、拦截配置
- 结构化字段白名单：`stage` / `code` / `path` / `tool`

**测试（189 项）**

- 内核单测 88
- 接线冒烟 43（含日志规范 6 条）
- README 断言核对 38
- 失败信号验证 14
- 变异证明 6

### 修复

合并与真机验证过程中修掉的问题（每条都是「离线全绿、真机失效」）：

- **R1** 缺 `dsh.bundle.patch` → 插件被当普通依赖装，不成为 profile layer
- **R2** `Config` 是普通对象而非 schemastery `Schema` → 加载即崩（`Cannot read properties of undefined (reading 'validate')`）
- **R3** 只认相对路径，真实 `write` 工具传绝对路径 → 拦截静默失效，全部放行
- **R4** deny 理由里带 JSON 模板 → AI 照着自己伪造 `verdict: pass` 的门。修法：理由只说「需要人决定」，不给模板
- **R5** `get()` 返回的定义缺 `source` 字段 → `list()` 成功但 `skill` 工具加载报错
- **R7** `ctx.logger?.(level, message)` 调用方式错 → 6 处日志从来没输出过
- **R8** `layout` 未在 Config 声明 → schemastery 静默剥掉，用户配了不生效
- **R9** 拿不到 `baseDir` 时默认拦 → 子代理/脚本化调用被误拦（应为「不知道就不管」）

### 卸载行为

- 卸载后**用户项目文件一个都不删**：`.stage-gate.json`、`stages/`、`stages/_ledger.jsonl` 全部保留
- 卸载后启动四行自检消失，skill 也不再出现在目录里
- 要彻底清干净需自行删除上述三项
- 从旧包名 `@wufeng0105/dsh-stage-gate` 迁移**必须先卸后装**（两个行 id 同时存在会双重拦截）

### 真机验证（可复跑）

- `test/e2e/run.mjs`：9 个场景，一条命令跑完
- `evidence/` 存证，**同一天多次复跑追加历史不覆盖**
- 无 `SN_API_KEY` 时 SKIP 并返回退出码 2（区别于失败 1 / 通过 0）
- 记录环境指纹（Node / DSH 版本 / 时间），换版本能判断结论是否还适用

### 已知限制

- 项目不建 `.stage-gate.json` → 拦截完全不生效（根本限制）
- 读懂了规则的 AI 能自己造门记录（R4 修法只挡「照着模板做」）
- `debug` 级日志默认被宿主过滤（阈值 2，debug 是 3）
- headless 模式不输出 `ctx.logger` 到终端

### 不兼容说明

- 包名从 `@wufeng0105/dsh-stage-gate` 改为 `@wufeng0105/dsh-plugin-kit`
- Loader 行 id 从 `stage-gate` 改为 `plugin-kit`
- **从旧版升级必须先卸后装**（两行同时存在会双重拦截）
- 台账与 marker 文件名保持不变（`.stage-gate.json` / `_ledger.jsonl`），不需要迁移

## 已废弃

### `DshBundle/dsh-stage-gate/`（2026-11-09 删除）

原插件目录，已被 `dsh-plugin-kit` 完全取代。

**删除前核对**：旧目录零独有文件（20 个文件全部在新目录里有对应）。

**为什么删**：两个同源目录并存会让「哪个是真的」变成谜。历史引用它的 10 份过程文档（`MERGE-*` / `TRIGGER-*` / `RUNTIME-*` / `IMPL-*` / `REVIEW-*` / `REFRAME` 等）**保持原样不改**——它们是当时的记录，改了就是篡改证据。
