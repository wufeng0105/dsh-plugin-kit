# 更新日志

本文件记录所有值得注意的变更。
格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [未发布]

### 判据减法第二轮：治理文档退出导览位（2026-11-11）

两轮接手者视角的审计交叉确认误导面在「治理文档冒充导览文档」与「同一张表的第三份副本」。逐处验「哪刀会切到信息」后执行：

- `MATERIALS.md` → `evidence/audits/2026-11-10-MATERIALS.md`（使命完结，正文仍是祈使句待办体）
- `OUTLINE.md` 204 → 79 行：加作用域声明（做插件开发不要读），删通读清单/声音锚点/已执行改动清单；留术语账本、各篇分工、硬约束
- process.md：删「怎么让它不被忘记」三副本表；**保留「会付出什么代价」**（成本方法论唯一源）；删尾部同义指路
- SKILL.md：删「2026-11 更新」化石订正注（所订正的句子已不在正文）；「查答案顺序」与宿主原文合并而非替换（宿主缺「找真实运行的同类插件」这条）
- tools.md：删「常见误用」5 行（铁律复述）；标明 `plugin_manager` 只作用于当前 profile
- README 382 → 303 行：三种执行方式/真机验证/旧名迁移/marker 说明压成指路
- 术语账本「三态结论」纠正为 reviewer.md 实际用语（`BLOCK` 全仓无此用词——账本自己漂移）

被删内容全部有 CHANGELOG 或审计存档对应；两轮合计人读文档约 2600 → 1877 行。

### 新增项目骨架 `template/`（2026-11-11）

**问题**：新建一个 DSH 插件项目时，最容易失败的不是功能，是**骨架本身**——

- `package.json` 少了 `dsh.bundle.patch` → 宿主不认它是插件，报 `declares no dsh.bundle`
- `cordis.patch.yml` 的 `name` 与 `package.json` 的 `name` 不一致 → 那一行指向不存在的包
- `inject` 猜了宿主没有的服务名 → 插件永远 `pending`，宿主当成 web boot 失败，**整个页面加载不出来**
- 导出普通的 `Config = {}` → activate 崩在 `Cannot read properties of undefined (reading 'validate')`
- 忘建 `.stage-gate.json` → 阶段门永远不启用，人却以为启用了

这些都在「装的那一刻」才暴露，而且都不是靠 `node --check` 能发现的。

**改动**：

| 项 | 内容 |
|---|---|
| `skills/plugin-kit/template/` | **新增** 6 文件：`package.json` / `cordis.patch.yml` / `index.js` / `AGENTS.md` / `.stage-gate.json` / `stages/p0/.gitkeep` |
| `skills/plugin-kit/SKILL.md` | **新增一节「新建一个插件项目」**：复制 → 改占位符 `my-plugin` → 装一次验证 |
| `assets/AGENTS.template.md` | **删除**，内容并入 `template/AGENTS.md`——同一份内容两处会漂移 |
| `test/template.mjs` | **新增** 9 条骨架自洽守卫 |
| `test/packed.mjs` | 骨架文件进包断言改为「**工作区里有的，一律必须在包里**」 |
| `test/mutate-pack.mjs` | 新增 2 个变异：只改一半名字 / 漏掉 marker |

#### 实测踩到：npm 无法打包 `.gitignore`

模板最初含 `.gitignore`（第 7 个文件）。`npm pack` 实测：**工作区有，包里没有**——npm 总会排除 `.gitignore`。

于是「仓库里的骨架」和「包里的骨架」不一致，而当时所有断言都是绿的。

**处置**：模板里删掉它（骨架现在 6 个文件），并把打包守卫改成更硬的判据——

> 不是「列表里的文件都在包里」，而是「**工作区里有的，一律必须在包里**」。

后者能自动抓住这一整类问题，不用每次手动往列表里加。改完立刻在 `SKILL.md` 里写明「骨架里没有 `.gitignore`，不是漏了」。

#### 为什么不做脚本或斜杠命令

考虑过 `node scripts/init.mjs` 和 `/plugin-kit init`。结论是**骨架目录更好**：

| | 骨架目录 | 脚本 |
|---|---|---|
| 实现成本 | 零代码 | 要写、要测、要变红证明 |
| 能不能直接看 | ✅ 就是普通文件 | ❌ 藏在代码里 |
| 加一个文件 | 直接放进去 | 改代码 |
| 漂移风险 | 低（文件是唯一源） | 高（代码 vs 文档两份） |

斜杠命令额外有两个缺点：handler 只能返回 `{kind:'success'|'error', text}`（**不能让 AI 接着干**），而且要占一个全局命令名。

脚本唯一更强的地方是自动替换项目名——但那只是 5 处文本，而且「搜占位符零残留」能立刻验证。

### 内置宿主 skill 解成可 grep 的普通文件 + 包内自足（2026-11-10）

**问题**：宿主自带的 4 个 skill 埋在 203MB 的 `app.asar` 里。`ls` / `cat` / `grep` / `glob` **全都打不开**——只有 `read` 单文件能进，且必须预先知道路径。

**实测代价**：一次真实插件开发中，为回答「宿主有没有删除会话的 API」「Client 怎么让 Host 执行操作」，花了 22 次 `cordis_inspect_query`（同一份 catalog 查了 14 次）、55 次 `grep`、71 次 `read`、51 次 `glob`，三条候选路全试错。

**改动**：

| 项 | 内容 |
|---|---|
| `skills/plugin-kit/host-skills/` | **新增** 33 文件（4 个 skill 的普通文件副本，来源 `app.asar`，DSH `0.2.2-rc.1`） |
| `skills/plugin-kit/host-skills/VERSION.json` | 版本戳：`dsh` / `extractedAt` / `source` 三字段 |
| `skills/plugin-kit/host-skills/README.md` | 说明：这是什么、与 `plugin-kit` 的分工、过期怎么重解 |
| `SKILL.md` | **新增一节「宿主领域知识在哪」**：指向表 + 三条查不出答案时的顺序 |
| `lib/skill-provider.js` | **`readSkill` 补上 `resourceBase`** —— 见下 |
| `.dsh/`（整棵目录） | **删除** —— 见下 |

#### `readSkill` 补 `resourceBase`：一条缺失让 AI 不知道文件在哪

宿主 `dsh-skill/lib/index.js:71-79` 的 `renderResourceHint` 分两支：

| `resourceBase` | 宿主注入到 `<skill_resources>` 的内容 |
|---|---|
| 有（`kind:'directory'`） | 「Base directory for this skill: **绝对路径**」+「相对路径按这个 base 解析」 |
| **没有** | 只说「Resources for this skill are managed by provider X」——**不给路径** |

`listSkills` 一直有 `resourceBase`，**`readSkill` 一直没有**。而宿主渲染用的是 `readSkill` 那份。

**后果**：AI 拿到 SKILL.md 正文，却不知道 `references/`、`host-skills/` 在哪——只能猜，或去翻 `app.asar`（打不开）。上面那 200+ 次工具调用，根因之一就是这一行缺失。

补上后宿主会自动报绝对路径，**与当前工作目录无关**——AI 不用再猜。

#### 删除 `.dsh/`：让发布物真正自足

之前 `DshBundle\.dsh\skills\plugin-kit\` 是「权威源」，包内 `skills/plugin-kit/` 是「构建产物」，靠一条**双树一致性**测试守着哈希相等。

**这隐含一个错误前提**：发布到 GitHub 给别人用时，对方也得先创建 `.dsh/skills/plugin-kit/` 才能跑测试。

**已删除**。判据现在只有一处源：`skills/plugin-kit/`。

**那条测试改写成更有意义的问法**：**「SKILL.md 里提到的每个相对链接，都必须真的在包里」**——包括新增的 `host-skills/` 四个 skill 和 `VERSION.json`。这守的是「用户装完点开 skill，链接不是死的」，比「两棵树哈希相等」更接近真实失效方式。

删除前已用 `git bundle` 保全那棵树里的独立提交历史（`evidence/skills-v1-history.bundle`，34.7KB，不进 npm 包）。

**为什么要单独说「三条顺序」**：那次开发翻遍 catalog 和源码 200 多次都没答案，最后是读 `dshmarket` 的 `lib/routes.js` 才找到 `webServer.register({path, handler})`。**「找一个真实运行的同类插件」是最有效的一招，但最容易被忘掉。**

**明确不做**：

- 不做自动过期检测（读旧文档不是坏东西，人看一眼就能判断）
- 不把这 4 份注册成插件 skill（`skill-provider` 只扫 `skills/` 直接子目录；`host-skills/` 是 `plugin-kit/` 的子目录，不会被扫到）

**`package.json` 的 `files` 无需改动**——`vendor` 和 `skills` 早已在白名单里。

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

### 补记：用户负向证据（2026-11-10 12:27）

E 阶段收官后用户说「设置页没看到」——**第 9 起缺陷，第一起由真实用户撞上、流程内部没抓到的**（此后第 10–12 起同样来自用户；当时只此一起，故记「唯一」）。

根因两步：① 插件只装在 P3.5 的一次性 profile，跑完拆掉了，日常 `desktop` 从未装过 → 已补装；② 补装后仍看不到，查出 `slots.register` 被塞进 `slots.inject` 回调（market 先例证明 inject 是「等槽出现」的门控，不是注册入口）→ 已改为 register 直接调用 + inject 门控，并加 C4 护栏（专项变异证明会红）。

`references/limits.md` L1 同步：160 → **172 分钟**、55.6% → **59.7%**、8 起 → **9 起**、返工 36.9% → 41.3%。

**这条证据的分量**：COST-VERDICT 初版把完成标志 1 写成「部分」、结论偏乐观；用户撞上等于给那个乐观打了补丁。「UI 未做 L1 验证」不是免责声明，它真会让缺陷流到用户面前。

### 崩溃事故：web boot 失败（2026-11-10 12:38）

用户刷新后 **DSH 整个起不来**。日志 `crash-2026-11-10T04-38-14-952Z-web-boot.log`：
`Error: web boot: 1 entry did not activate / @wufeng0105/dsh-archive-manager: import failed`，
renderer console：`Uncaught SyntaxError: Unexpected token 'export'`。

根因：`client.js` 用了 ESM `export`，而宿主把所有插件 client.js **拼成一个大脚本**加载 → 整个脚本 parse 失败。对照四个正常插件，client.js 一个 export 都没有，硬契约是 `window.__ModuleLoader__.load({id, factory})`。

**21 条离线测试全绿却没抓到**——所有测试都在验「代码逻辑对不对」，没有一条验「宿主会怎么加载这个文件」。

修法：client.js 重写为 ModuleLoader 形态；测试加 `load-client.mjs` 适配层；新增 `module-shape.test.mjs`（C5，模拟拼接脚本 parse，专项变异证明会红）；测试面 18→21。

`process.md` P3.5 卡新增**模块形态条款**；`limits.md` L1 当时记为 184 分钟 / 63.9% / 10 起（COST-VERDICT 终表口径）。**此后又发生第二次崩溃（Config），计入后 L1 终值更新为 204 分钟 / 70.8% / 12 起**——现由 `evidence.md` 承载。

用户已用其他 IDE 彻底移除插件，DSH 恢复。**修复后的源码不要再装回日常 profile**，除非先过 C5 + 一次性 profile 真机启动验证。

### 第二个崩溃点：Config 不是 schemastery Schema（2026-11-10 13:0x）

按「建 profile → 装 → **启动 GUI** → 看设置页」正确顺序真机验证时，宿主启动报：

```
warning: 1 entry did not activate
archive-manager: TypeError: Cannot read properties of undefined (reading 'validate')  at resolveConfig
```

根因：`export const Config = {}` 是普通对象，cordis 要求 `Config` 是 schemastery Schema。
**不需要配置就不该导出 Config**（对照 `dsh-enhance`）。

修法：删掉 Config 导出。修后真机 **web boot 零 warning、零新崩溃日志**，boot 页 HTTP 200 且 client 清单含本插件（**首次拿到 L1**）。

新增 **C6 护栏**（`host-shape.test.mjs`）+ process.md 的 **Host 半形态条款**。测试面 21→23。

**两条宿主硬契约至此才完整**：client.js 用 ModuleLoader 形态（不能有 ESM）、index.js 的 Config 必须是 Schema 或不存在。

### 第二次崩溃：混入完整插件集（2026-11-10 13:15）

修掉 Config 问题后，按「建→装→启动→看设置页」顺序验，用户把插件装进日常 `desktop`（完整 13+1 bundle）重启，**又崩**：

```
Error: web boot: 1 entry did not activate
@wufeng0105/dsh-archive-manager: failed   ← 这次没有堆栈
```

**关键差异**：同一插件在隔离最小 profile（3 bundle）里能激活、零 warning；混进完整插件集就激活失败，且日志**没有 renderer 堆栈**，无法定位。

**两次崩溃共同根因**：我在离线/隔离环境**无法复现宿主的完整加载+激活场景**（27 个插件 client.js 拼一起加载）。23 条测试 + 4 变异全绿，全是验「代码逻辑」，没有一条验「宿主加载/激活行为」。P3.5 的最小 profile 只覆盖了最小组合。

**处置**：用户用「禁用第三方插件」救回 DSH；我 `dsh plugin remove` 彻底移除、删 symlink；恢复 desktop 到出事前 13 bundle（不含我的插件）；隔离插件、删除复现现场。

`process.md` P3.5 新增**完整插件集条款**：一次性 profile 必须复刻目标环境的完整 bundle 组合，最小 profile 验不出插件间冲突。

## [0.1.0] - 2026-11-09

首个版本。合并了原 `plugin-kit`（skill）与 `dsh-stage-gate`（插件）。

### 新增

**三段能力（一个包）**

- **判据**：把 `skills/plugin-kit/` 注册进宿主 skill 目录（`ctx.skills.registerProvider`）
- **纪律**：`systemPrompt` 常驻一段条件句，提示「有判据，去加载」
- **强制力**：`tools/pre-execute` 拦截未过门的阶段产物写入

**配置（全部可验）**

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

**测试**

全部验证入口是 `npm run check`（内核单测、打包守卫、骨架自洽、端到端复制实测、包外自足、冒烟、README 断言、失败信号、变异证明）。**各项数字不在此处维护**——统计性的数字没有决策含义，写两处就会漂移（本次审计实测：6 处数字漂移里 4 处是同一事实多处陈述）。

**有决策含义的数字只有一个，在 `evidence.md`**：E 阶段成本 204 分钟 / 占止损线 70.8% / 拦下 12 起——它是「这套东西值不值」的唯一依据。

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
