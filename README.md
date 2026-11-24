# dsh-plugin-kit

> **一条流水线，四段**：设计期定概念与形状 → 写代码前查宿主契约 → 装之前首装自检 → 升级后触点复检。前两段住 skill 正文，后两段是脚本。

装它，`plugin-kit` 这个 skill 自动出现在你的 skill 目录里。

## 这个包解决什么

开发 DSH 插件，你在对着一个黑盒：

| 痛点 | 表现 |
|---|---|
| **宿主是黑盒** | 契约（接缝、事件签名、Config 形状、加载方式）全在宿主运行时与 install 包内，shell 工具打不开；离线合法的代码宿主里可能非法 |
| **「完成」没有权威定义** | 代码写完、测试全绿之后，没人告诉你什么算装上了、什么算能用了；DSH 升级后同一问题再来一遍 |

这个包把流水线四段都变成可执行的程序：**设计期**跑 design-check 判工件，**写之前**查契约的三步，**装之前**跑 preflight，**升级之后**跑 recheck。

## 不做什么

- **不拦截任何调用。** 按工具身份猜调用行为这条路已被否证：拦得紧会拦掉合法的只读调用，拦得松则常见写盘形态可以直接绕过。这是设计边界，不要重新提议。
- **不记台账。** 本包不追踪谁改了什么，也不为写入分级作证。
- **不注入常驻提示。** 判据都在 skill 正文里，按需加载；不往 systemPrompt 塞东西。

## 产品组成

（「触点」「宿主快照」等术语的权威定义在[词汇表](#词汇表)。）

| 工件 | 在哪 | 职责 |
|---|---|---|
| **SKILL.md** | `skills/plugin-kit/` | 判据正文：查契约三步顺序、四大失败家族、开发纪律六条 |
| **preflight.mjs** | `skills/plugin-kit/scripts/` | 首装自检：四大失败家族逐条核查，输出 PASS / FAIL / UNVERIFIABLE，FAIL 附「缺什么、怎么补」 |
| **recheck.mjs** | `skills/plugin-kit/scripts/` | 升级复检：拿触点清单对照宿主快照，输出 OK / MISSING / CHANGED / UNVERIFIABLE 四态 |
| **design-check.mjs** | `skills/plugin-kit/scripts/` | 设计期核查：词汇表格式、ADR 命名/正文、标识符样式的弃用名漂移；FAIL 附「缺什么、怎么补、依据」 |
| **reextract.mjs** | `scripts/`（仅源码仓） | asar 解析与宿主文档重解：`--check` 过期判定 + 一键重解；不随 npm 包分发 |
| **gen-host-snapshot.mjs** | `scripts/`（仅源码仓） | 从当前宿主 inspect 结果生成触点清单与宿主快照 |
| **Host 半** | `index.js` + `lib/skill-provider.js` | 只做一件事：把 `skills/` 注册进宿主 skill 目录。无用户配置、无事件监听、无工具注册 |

Host 半的三个承重细节，每条都来自真机事故：

- skill 候选过**双重防线**——IO 失败跳过 + 字段违规跳过。一个坏候选会穿透注册表把整个 provider 拖垮，所以宁可静默跳过也不让它进门（`lib/skill-provider.js` 的 K1/K3/K5 注释）。
- `readSkill` 必须返回**完整 SkillDefinition** 并带 `resourceBase`——缺它时 skill 在目录里可见但一加载就报错（「目录可见 ≠ 能加载」），且模型拿到正文不知道 `references/` 在哪。
- `registerProvider` 的 disposer 由宿主拥有，必须包在 `ctx.effect()` 里才能在卸载时回收。

### 源码布局

```
dsh-plugin-kit/
├── index.js                 Host 半：只做 skill provider 注册
├── lib/skill-provider.js    skill 扫描与定义校验
├── skills/plugin-kit/       产品本体
│   ├── SKILL.md             判据正文（装进宿主的就是它）
│   ├── scripts/             preflight.mjs / recheck.mjs / design-check.mjs（随包分发）
│   ├── template/            新插件项目骨架（5 文件：含词汇表种子 CONTEXT.md）
│   ├── assets/              触点清单 / 宿主快照样例
│   └── host-skills/         dsh-doc 副本 + VERSION.json
├── scripts/                 reextract.mjs / gen-host-snapshot.mjs / release.mjs（仅源码仓）
├── evidence/                凭据：真机存证、审计、探针脚本
├── test/                    全部验证入口见 npm run check
├── CONTRIBUTING.md          维护者入口：发布流程、开发纪律、禁用语
└── CHANGELOG.md             版本历史
```

## 安装

```powershell
# 从 npm（推荐）
plugin_manager install_bundle target=@wufeng0105/dsh-plugin-kit

# 或从源码仓路径
plugin_manager install_bundle target=<本目录绝对路径>
```

包已发布到 npm：[`@wufeng0105/dsh-plugin-kit`](https://www.npmjs.com/package/@wufeng0105/dsh-plugin-kit)。

装完验证（headless 模式看不到日志，用这两条确认插件在工作）：

- skill 目录里出现 `plugin-kit`：让模型列出可用 skill，应含 `plugin-kit`。
- 启动日志应有两行 info：`[plugin-kit] v<版本> 已加载 → cwd=…` 与 `skill provider 已注册 → name=plugin-kit root=…`。有一条 `error`（「打包缺失：skills/ 目录不存在」）就说明插件是残的。

## 设计期：定概念与形状（写代码之前）

先加载 `domain-modeling`（概念：术语一物一名、边界场景压测、重大取舍写 ADR）与 `codebase-design`（结构：接口小、实现深、接缝只设在真有第二个适配器的地方），把两样工件落成：

- **词汇表**（`CONTEXT.md`，或 README 的词汇表节；模板已带种子）：`**术语**：一两句定义` + `_Avoid_: 弃用叫法`——第一个术语敲定就写，不攒批。
- **ADR**（`docs/adr/NNNN-slug.md`）：难回头 + 无上下文会费解 + 真取舍三条全占才写；接口/接缝的取舍也记这里。

**接口三问**（动笔前，答案写进交付说明或 ADR）：删掉这个导出/模块，复杂度去了哪？接缝另一侧真有第二个适配器（生产+测试）吗？依赖是参数传入还是模块内 `new` 的？

```bash
node skills/plugin-kit/scripts/design-check.mjs <你的插件项目根>
```

词汇表格式、ADR 命名/正文、标识符样式的弃用名（含 `_` / `.` / `/` 的旧词）出现在正文里判 FAIL；普通弃用词只提示。首跑必红（种子是格式示例）——按补法换成第一条真实术语即绿。三个脚本分工不互判：设计期 design-check / 装前 preflight / 升级后 recheck。

## 查契约的三步（摘要在 skill 正文）

1. **`cordis_inspect_query`** —— 权威源。Service 方法、事件名/mode/签名、Config schema。事件全集只在 inspect 里，任何文档都没有逐条清单。
2. **`dsh-doc` 文档** —— 机制原则与装配形态。可检索副本随包分发在 `skills/plugin-kit/host-skills/dsh-doc/`（43 文件，可 grep / glob）。
3. **找一个真实运行的同类型插件读源码** —— 最有效、最容易被忘的一招。

每步的「什么时候用 + 判据」、查完必须产出什么（方法签名 / 事件 mode / Slot props / Config 字段），全部写在 [`SKILL.md`](skills/plugin-kit/SKILL.md)——那是模型装包后实际读到的正文，此处只留摘要不展开。

## 首装验证：preflight

代码写完、测试全绿 ≠ 装上能用。四类致命失败**全都不在任何一段代码里**，逐段检查看不见——完整判定式见 [`SKILL.md`](skills/plugin-kit/SKILL.md) 的「首装验证」节，此处不复述。

```bash
# 装之前、每次交付前
node skills/plugin-kit/scripts/preflight.mjs <你的插件项目根>
```

- 逐项输出 `PASS / FAIL / UNVERIFIABLE`，FAIL 附「缺什么、怎么补」。
- `UNVERIFIABLE` 不是通过：按提示人工验，验完自己记结论。
- 自带 `--self-test`——**先证明判定式会红，再用它判你的项目**。
- 家族④（环境相关）只能真机验：用**一次性 profile**（建 → 装 → 验 → 拆，复刻目标环境的完整 bundle 组合，不碰日常 profile）。具体命令随宿主版本变，真跑 `dsh --help` / `dsh plugin --help` 现取。

## 升级复检与重解（保鲜）

DSH 升级 = 契约与验证清单同时刷新。两个动作，脚本位置分两种安装形态（照错形态跑必然 No such file）：

**重解**（`scripts/reextract.mjs`，只在源码仓——它要读本机 app.asar 并写回仓内副本）：

```bash
# 在源码仓根跑；过期判定（asar mtime > extractedAt）+ 一键重解
node scripts/reextract.mjs --check
node scripts/reextract.mjs
```

**升级复检**（`recheck.mjs` 随包分发，两态都有；拿触点清单对照宿主快照）：

```bash
# 先生成当前宿主的快照与触点清单（仓库内，不联网）
node scripts/gen-host-snapshot.mjs
node skills/plugin-kit/scripts/recheck.mjs \
  --touchpoints skills/plugin-kit/assets/touchpoints.json \
  --snapshot  skills/plugin-kit/assets/host-snapshot.json --strict
```

两个脚本都自带 `--self-test`，先跑它证明判定式会红。

## 已知限制（诚实列）

| 限制 | 影响 |
|---|---|
| preflight 是静态检查 | 它判不了运行时行为——装完后的实际可见性仍需一次性 profile 真机验证 |
| 「环境相关」家族 UNVERIFIABLE | 插件间冲突只能真机验（复刻完整 bundle 组合的一次性 profile） |
| 文档副本会过期 | 宿主升级后在**源码仓**跑 `node scripts/reextract.mjs --check`（该脚本不随 npm 包分发）；不做激活时自动同步（拿稳定性换新鲜度不划算） |
| inspect 不可达时判不了 | 没有宿主运行时，契约只能读到 L3（源码核对），不冒充已验证 |
| design-check 只判工件格式与特征词漂移 | 接口深度、接缝位置、依赖注入是人工判读（UNVERIFIABLE 给判法）；入口导出面归 preflight 判 |
| 证据边界 | 「四大失败家族」是单作者事故史归纳，「换人也遇到」未验证 |

## 生命周期

- **升级**：`plugin_manager install_bundle target=<新包路径>`，启动日志版本号会变。
- **卸载**：`dsh plugin --profile <profile> remove @wufeng0105/dsh-plugin-kit`——不删你项目的任何文件。
- **从更早的旧包名 `@wufeng0105/dsh-stage-gate` 迁移**：必须先卸旧再装新（旧包若仍在 profile 中，两套 bundle 行并存会双重注册）。

## 词汇表

一个东西一个名字。

**契约知识**：关于「宿主要什么」的事实：接缝名、事件签名、Config 形状、加载方式。来源是宿主运行时（inspect）与安装包源码，不是任何人的记忆。_Avoid_: 领域知识、宿主文档、API 文档

**验证清单**：「什么算装上了/能用了/升级后还兼容」的权威条目集合，按失败家族组织，每条带可执行判定式。_Avoid_: 验收标准、检查表、阶段卡

**失败家族**：插件装败的四类模式：装不上、装上了但看不见、一加载就崩、环境相关。验证清单按它组织。_Avoid_: 失败模式（单数形式指代整组时用家族）

**触点**：本插件（或任意插件）依赖的一个宿主接缝事实：服务方法、事件、Config 字段等。触点清单是升级后复检的对象。_Avoid_: 依赖项、引用

**保鲜**：契约知识与验证清单随宿主升级持续有效的工作方式：重解宿主文档副本 + 触点复检。不是自动同步。_Avoid_: 自动更新、同步

**重解**：从当前版本 app.asar 里把宿主自带文档（dsh-doc）重新抽出为可检索普通文件的动作。用入库的 asar 解析脚本执行。_Avoid_: 拷贝、刷新副本

**宿主快照**：用 inspect 导出的当前宿主契约事实集合（服务/事件/Config），recheck 的输入之一。

**设计期核查**：`skills/plugin-kit/scripts/design-check.mjs`——判词汇表/ADR 格式与标识符样式的弃用名漂移，FAIL 附补法与依据。_Avoid_: 文档检查（不带名）

**词汇表**：术语一物一名的正典（`CONTEXT.md` 或 README 词汇表节）。_Avoid_: 术语表、glossary

**ADR**：`docs/adr/NNNN-slug.md`——难回头的决策记录（三门槛：难回头 + 无上下文费解 + 真取舍）。

**preflight**：首装自检脚本（`skills/plugin-kit/scripts/preflight.mjs`）。_Avoid_: 自检（不带名）、smoke

**首装验证**：preflight 管的那一段职责名（装之前判宿主契约与四大装败家族）。

**升级复检**：recheck 管的那一段职责名（升级后判触点是否还成立）。

**recheck**：升级复检脚本（`skills/plugin-kit/scripts/recheck.mjs`）。_Avoid_: 复检（不带名）

## 许可证

MIT
