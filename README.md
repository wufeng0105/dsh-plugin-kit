# dsh-plugin-kit

> **一个包，两样东西**：契约查证顺序（skill）+ 验证脚本（preflight 首装自检 / recheck 升级复检），随宿主升级保鲜。

装它，`plugin-kit` 这个 skill 自动出现在你的 skill 目录里。它**不拦任何调用、不记台账、不注入常驻提示**——旧形态（阶段门拦截 / 台账 / 纪律段）已于 2026-11-13 退役，决策记录见 [`docs/adr/`](docs/adr/)。

## 它解决什么

开发 DSH 插件，你在对着一个黑盒：

| 痛点 | 表现 |
|---|---|
| **宿主是黑盒** | 契约（接缝、事件签名、Config 形状、加载方式）全在宿主运行时与约 208MB 的 app.asar 里（rc.2 时代实测 208,137,981 字节；rc.3 为 209,021,953，见 `skills/plugin-kit/host-skills/VERSION.json`），shell 工具打不开；离线合法的代码宿主里可能非法 |
| **「完成」没有权威定义** | 代码写完、测试全绿之后，没人告诉你什么算装上了、什么算能用了；DSH 升级后同一问题再来一遍 |

这个包把两面都变成可执行的程序：**写之前**按三步查契约，**装之前**跑 preflight，**升级之后**跑 recheck + 重解。

## 产品组成

（「触点」「宿主快照」等术语的权威定义在[词汇表](#词汇表)。）

| 工件 | 在哪 | 职责 |
|---|---|---|
| **SKILL.md** | `skills/plugin-kit/` | 判据正文：查契约三步顺序、四大失败家族、开发纪律六条 |
| **preflight.mjs** | `skills/plugin-kit/scripts/` | 首装自检：四大失败家族逐条核查，输出 PASS / FAIL / UNVERIFIABLE，FAIL 附「缺什么、怎么补」 |
| **recheck.mjs** | `skills/plugin-kit/scripts/` | 升级复检：拿触点清单对照宿主快照，输出 OK / MISSING / CHANGED / UNVERIFIABLE 四态 |
| **reextract.mjs** | `scripts/`（仅源码仓） | asar 解析与宿主文档重解：`--check` 过期判定 + 一键重解；不随 npm 包分发（它要读本机 app.asar 的绝对路径） |
| **gen-host-snapshot.mjs** | `scripts/`（仅源码仓） | 从当前宿主 inspect 结果生成触点清单与宿主快照，让 recheck 有真实清单可跑 |
| **Host 半** | `index.js` + `lib/skill-provider.js` | 只做一件事：把 `skills/` 注册进宿主 skill 目录。无用户配置、无事件监听、无工具注册 |

Host 半的三个承重细节（每条都有真机事故出处，见 [CHANGELOG.md](CHANGELOG.md) 0.1.x 节）：

- skill 候选过**双重防线**——IO 失败跳过 + 字段违规跳过。一个坏候选会穿透注册表把整个 provider 拖垮，所以宁可静默跳过也不让它进门（`lib/skill-provider.js` 的 K1/K3/K5 注释）。
- `readSkill` 必须返回**完整 SkillDefinition** 并带 `resourceBase`——缺它时 skill 在目录里可见但一加载就报错（「目录可见 ≠ 能加载」），且模型拿到正文不知道 `references/` 在哪（一次真实开发为此花了 200+ 次工具调用找契约）。
- `registerProvider` 的 disposer 由宿主拥有，必须包在 `ctx.effect()` 里才能在卸载时回收。

### 源码布局

```
dsh-plugin-kit/
├── index.js                 Host 半：只做 skill provider 注册
├── lib/skill-provider.js    skill 扫描与定义校验
├── skills/plugin-kit/       产品本体
│   ├── SKILL.md             判据正文（装进宿主的就是它）
│   ├── scripts/             preflight.mjs / recheck.mjs（随包分发）
│   ├── template/            新插件项目骨架（4 文件）
│   ├── assets/              触点清单 / 宿主快照样例
│   └── host-skills/         dsh-doc 副本（43 文件）+ VERSION.json
├── scripts/                 reextract.mjs / gen-host-snapshot.mjs / release.mjs（仅源码仓）
├── docs/adr/                三个决策记录
├── evidence/                凭据：裁定书、真机存证、验收记录、探针脚本、文档收敛账本
├── test/                    全部验证入口见 npm run check
└── CHANGELOG.md             版本历史（0.2.0 重定义 + 0.1.x 事故出处表）
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

## 查契约的三步（摘要在 skill 正文）

1. **`cordis_inspect_query`** —— 权威源。Service 方法、事件名/mode/签名、Config schema。事件全集（如 rc.2 的 `fs/write-intent`）只在 inspect 里，任何文档都没有逐条清单。
2. **`dsh-doc` 文档** —— 机制原则与装配形态。可检索副本随包分发在 `skills/plugin-kit/host-skills/dsh-doc/`（43 文件，可 grep / glob）。
3. **找一个真实运行的同类型插件读源码** —— 最有效、最容易被忘的一招。

每步的「什么时候用 + 判据」、查完必须产出什么（方法签名 / 事件 mode / Slot props / Config 字段），全部写在 [`skills/plugin-kit/SKILL.md`](skills/plugin-kit/SKILL.md)——那是模型装包后实际读到的正文，此处只留摘要不展开。

## 首装验证：preflight

代码写完、测试全绿 ≠ 装上能用。四类致命失败**全都不在任何一段代码里**，逐段检查看不见（每条判定式都有真机事故出处）：

| 家族 | 典型形态 | 在哪暴露 |
|---|---|---|
| ① 装不上 | 缺 `dsh.bundle.patch`；patch 的 name 与包名不一致；`Config = {}`；inject 猜了不存在的服务 | install 那一刻 |
| ② 装上了但看不见 | skill 缺 resourceBase（模型不知道文件在哪）；slot 注册塞进 inject 回调 | 用户打开界面那一刻 |
| ③ 一加载就崩 | client.js 含 ESM export——宿主把所有插件 client.js **拼成一个大脚本**，一个坏插件让整个 web boot 崩 | 重启那一刻 |
| ④ 环境相关 | 最小 profile 能用、混进完整插件集崩（日志无堆栈） | 换环境那一刻 |

```bash
# 装之前、每次交付前
node skills/plugin-kit/scripts/preflight.mjs <你的插件项目根>
```

- 逐项输出 `PASS / FAIL / UNVERIFIABLE`，FAIL 附「缺什么、怎么补」。
- `UNVERIFIABLE` 不是通过：按提示人工验，验完自己记结论。
- 自带 `--self-test`——**先证明判定式会红，再用它判你的项目**。
- 家族④只能真机验：用**一次性 profile**（建 → 装 → 验 → 拆，复刻目标环境的完整 bundle 组合，不碰日常 profile）。具体命令随宿主版本变，真跑 `dsh --help` / `dsh plugin --help` 现取。

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

rc.2 → rc.3 实测：文档副本 43 文件只有 1 行内容变化；触点 9 条中 8 OK / 0 MISSING / 0 CHANGED / 1 UNVERIFIABLE（`settings.section` Slot 需页面在线人工核对）。两个脚本都自带 `--self-test`，先跑它证明判定式会红。

## 开发纪律

> **审查员的价值不在「多一双眼睛」，而在「它没参与写，所以没有立场替写的人找理由」。** 审查员曾是本插件的产品能力，2026-11-13 降级为本仓开发纪律（ADR 0001）——它在两轮审查中各抓出两条 MAJOR，实证有效。协议原文在 git（原 `docs/reviewer.md`，2026-11-15 并入本节）。

六条（本仓事故换来的，任何插件开发通用）：

1. **每条验收必须能判真假**；靠人看的必须给机判替代，否则标「人工判读」。
2. **每条关于宿主的断言必须带出处**（探测命令+返回，或安装包 `文件:行`）。
3. **任何检查先证明它会红**，再用它判通过——改坏 → 红 → 改回 → 绿。「测试全绿」是一个状态，不是一项证据。
4. **模块存在 ≠ 产品在用**：必须证明它在 import 图里可达。
5. **「无法判定」不是「通过」**：探测不到就标 `UNVERIFIABLE`，写明证据等级。
6. **交付说明里的命令必须真跑过。**

证据等级（每条结论都要标；L3 不能冒充 L1/L2）：

| 等级 | 形态 | 能证明什么 |
|---|---|---|
| **L1 运行时** | 真机安装后实际点击、观察 | 功能真的可用 |
| **L2 行为复现** | 用真实依赖跑出行为 | 代码路径真的通 |
| **L3 源码核对** | 读安装包源码、引用行号 | 契约形态对不对 |
| **L4 自述** | 写的人自己说的 | **什么都不能证明**，只能当线索 |

派独立审查员时的三条硬要求（缺任一条 = 未完成审查）：

- **H1** 不许只照抄实现者给的判定式——至少一条要自己从需求原文推导，并写清推导链（9 份报告照抄 A1–A14，bug 全在显示层却全落在数据层）。
- **H2** 至少一条真宿主观察：装进真环境看一眼，不接受全程 `%TEMP%` 沙箱跑脚本。
- **H3** 报告必须有「用户可见面」小节：第一眼看到什么 / 对应哪条判据 / 哪部分没看到。缺这一节，读的人一眼就知道审查员没看屏幕。

九个动作：独立复跑、空真排除、接线可达性、验收分类复核、计数机检、防漂移测试核查、打包真加载、缺陷清单时效、行为复现优先。审查员的五种失效方式（规格含糊时自创标准、同用坏仪器、只查缺陷清零、够不着运行时冒充、只读代码不跑行为）都是实际发生过的——完整论述在 git 历史。

任务书模板（复制给新开的审查员，替换尖括号内容）：

```text
你是审查员。只读产物，不写代码，不改任何文件。

## 判据来源（只从这三处）
1. 需求验收表：<验收文件路径>
2. 客户需求：<需求文件路径>
3. 宿主真实契约：cordis_inspect_query 或安装包源码

## 三条硬要求（缺任一条 = 未完成审查）
1. 不许只照抄实现者给的判定式。至少一条判据要你自己从需求原文推导，并写清推导链。
2. 至少一条真宿主观察：装进真环境看一眼，不接受全程 %TEMP% 沙箱跑脚本。
3. 报告必须有「用户可见面」小节（第一眼看到什么 / 对应哪条判据 / 哪部分没看到）。

## 你要做的
1. 独立复跑所有命令（不引用写的人贴的输出）
2. 逐条按需求字面判三态：已验 / 无法判定 / 不符
3. 每条缺陷带证据（文件:行 或 命令输出），按 BLOCKER/MAJOR/MINOR 分级
4. 标注每条结论的证据等级：L1 运行时 / L2 行为复现 / L3 源码 / L4 自述
5. 给放行意见：PASS / PASS-WITH-CONDITIONS / FAIL / UNDECIDABLE

## 你要特别查的
- **用户可见面**：操作之后，宿主界面上用户第一眼看到什么？需求里那条判据在哪？
- 接线可达性：模块有没有真的被产品代码 import
- 空真：通过的检查有没有数据支撑
- 验收分类：有没有把实质缺陷归入"需运行时验"
- 防漂移测试：常量是不是测试自己提供的
- 计数：验收条数、缺陷条数、分类总和对不对得上

## 你不做什么
- 不写代码、不替写的人补产物
- 不把写的人的自述当结论
- 不把"无法判定"改写成"通过"
```

纪律有效的最近一次实证：「补路标」提案 4 条建议经独立审计后 3 条被推翻撤销，只落盘 1 条可证的代码修复——审计的作用不是盖章，是把 3/4 的方案打掉（全文见 [`evidence/audits/2026-11-13-field-review-proposal.md`](evidence/audits/2026-11-13-field-review-proposal.md)，被推翻的原提案与审计结论都保留原样）。

## 词汇表

一个东西一个名字；退役词只作历史语义，勿当现行词用。

### 现行词

**契约知识**：关于「宿主要什么」的事实：接缝名、事件签名、Config 形状、加载方式。来源是宿主运行时（inspect）与安装包源码，不是任何人的记忆。_Avoid_: 领域知识、宿主文档、API 文档

**验证清单**：「什么算装上了/能用了/升级后还兼容」的权威条目集合，按失败家族组织，每条带可执行判定式。_Avoid_: 验收标准、检查表、阶段卡

**失败家族**：插件装败的四类模式：装不上、装上了但看不见、一加载就崩、环境相关。验证清单按它组织。_Avoid_: 失败模式（单数形式指代整组时用家族）

**触点**：本插件（或任意插件）依赖的一个宿主接缝事实：服务方法、事件、Config 字段等。触点清单是升级后复检的对象。_Avoid_: 依赖项、引用

**保鲜**：契约知识与验证清单随宿主升级持续有效的工作方式：重解宿主文档副本 + 触点复检。不是自动同步。_Avoid_: 自动更新、同步

**重解**：从当前版本 app.asar 里把宿主自带文档（dsh-doc）重新抽出为可检索普通文件的动作。用入库的 asar 解析脚本执行。_Avoid_: 拷贝、刷新副本

**宿主快照**：用 inspect 导出的当前宿主契约事实集合（服务/事件/Config），recheck 的输入之一。

**preflight**：首装自检脚本（`skills/plugin-kit/scripts/preflight.mjs`）。_Avoid_: 自检（不带名）、smoke

**recheck**：升级复检脚本（`skills/plugin-kit/scripts/recheck.mjs`）。_Avoid_: 复检（不带名）

**拆名**：skill 正文把两件事合称「完成验证」——本 README 按职责拆称：**首装验证**（preflight 管的）与**升级复检**（recheck 管的）。两处说的是同一套脚本。preflight 词条保留 CONTEXT 原文「首装自检脚本」的叫法——那是脚本定义名，不是职责名。

### 退役词（历史语义，勿在新文档使用）

**阶段门**：已退役（2026-11-13，ADR 0001/0002）。旧机制：未过门的阶段产物写入被拦截或记账。拦截证伪（17 拦 0 真阳性——注意裁定书自身告诫：门实际只运行 134/763 分钟，「17 次」含争议，方向性结论不变）、台账未验证假设已搁置。历史实现见 git（`61f5fa2` / `c98c543` 等父提交树——`77ef98f` 及之前的所有提交均含完整旧实现）。_Avoid_: 用它指代本插件的任何现行能力

**纪律段**：已退役（ADR 0001）。旧机制：向 systemPrompt 常驻注入提示。判据内容现住 skill 正文，不需要常驻提醒。_Avoid_: systemPrompt 段

**marker（.stage-gate.json）**：已退役（ADR 0002）。旧机制：项目级「启用阶段门」声明文件。现行的项目声明是触点清单 `touchpoints.json`。_Avoid_: 启用开关

**九阶段 / P0–P5 卡**：已降级（ADR 0001）。旧产品把单作者事故史长出的流程当机制分发。其中仍成立的通用纪律（每条验收能判真假、变红证明、一次性 profile 等）已收编进 skill 正文「开发纪律」节；完整旧文见 `evidence/process-lab-legacy/`（源码仓，不进 npm 包）。

**作证台账（witness）**：搁置非废弃（ADR 0003）。曾设想挂在 fs/write-intent 上按作者分级记录写入事实。复活条件：多智能体协作使「谁干的」成为日常痛点；届时接缝迁移（tools/pre-execute → fs/*-intent）一并重启。

## 历史与凭据

历史材料默认不进阅读路径；要复核结论怎么来的，再进。

**三个决策（[`docs/adr/`](docs/adr/)，各一句话）：**

- **0001 核心目标重定义**：凡被证实的能力都是「证据或证据的纪律」，凡被证伪的都是「替代信任」——产品从流程门收敛为黑盒翻译器。
- **0002 拦截层废弃**：fail-closed（17 拦 0 真阳性）与 fail-open（shell 4 形态全绕过）双输；rc.2 的 `fs/*-intent` 接缝只解决「怎么拦得准」，解决不了「该不该拦」。
- **0003 作证台账搁置**：好想法、错的证据基础（痛点论证完全依赖单作者实验记录）；搁置非废弃，复活条件三条全列在 ADR 里。

**凭据目录（[`evidence/README.md`](evidence/README.md) 是入口）：**

| 文件 | 是什么 |
|---|---|
| `evidence/audits/2026-11-11-拦截层存废裁定.md` | 「17 拦 0 真阳性」等数字的唯一原始依据（含自身告诫与复核方法） |
| `evidence/audits/2026-11-13-field-review-proposal.md` | 提案→审计→落盘全程（C1/C2/C3 被推翻的原样保留） |
| `evidence/redefinition/需求.md` | 重定义的 P0 验收表 A1–A10（已执行完毕的凭据） |
| `evidence/redefinition/探针记录.md` + `probe-t*.mjs` | 三条探针：asar 结构、dsh-skill 契约、client.js ESM 判定式 |
| `evidence/redefinition/运行时验收.md` | 一次性 profile 真机验收（A8） |
| `evidence/doc-consolidation-2026-11-15.md` | 本次文档收敛的账本：主线、逐格处置表、防漂移守卫 |
| `evidence/2026-11-09-real-host.md` | 旧形态（阶段门）唯一真机存证——历史凭据，不代表现行产品 |

**判据先例**：误导性历史该删（保留是制造误导），但承重历史和被推翻的结论要留着（抹平了，主线看着顺，那是把证据改成了结论）。

## 发布与版本管理

**版本号只有一个来源**：`package.json` 的 `version`。git tag 名与 npm 版本都从它派生。

```bash
node scripts/release.mjs --check          # 只核对现状（七项），不改任何东西
node scripts/release.mjs patch|minor|major # 升版 + 提交 + 打 tag（跑全量验证门后才动）
git push origin main --follow-tags
npm run publish:npm                        # 内部先跑 check + pack 干跑，再发
```

`release.mjs` 的七项核对：版本是纯 `x.y.z`、CHANGELOG 有对应节、tag 不存在、工作树干净、分支是 main 且已同步、npm 上该版本不存在、`repository` 指回本仓。任何一项不过就拒绝继续。

**脚本不代做 push 与 publish**——两个不可撤销的外部动作，执行权留给人。发布后核对：`npm view @wufeng0105/dsh-plugin-kit version --registry=https://registry.npmjs.org/`。

> 首次发布时 packument（包根索引）会比版本端点晚几分钟生效，期间 `npm install` 报 404 而 tarball 直链已可下载——这是 CDN 传播，不是发布失败。

## 已知限制（诚实列）

| 限制 | 影响 |
|---|---|
| preflight 是静态检查 | 它判不了运行时行为——装完后的实际可见性仍需一次性 profile 真机验证 |
| 「环境相关」家族 UNVERIFIABLE | 插件间冲突只能真机验（复刻完整 bundle 组合的一次性 profile） |
| 文档副本会过期 | 宿主升级后在**源码仓**跑 `node scripts/reextract.mjs --check`（该脚本不随 npm 包分发）；不做激活时自动同步（拿稳定性换新鲜度不划算） |
| inspect 不可达时判不了 | 没有宿主运行时，契约只能读到 L3（源码核对），不冒充已验证 |
| 证据边界 | 「四大失败家族」是单作者事故史归纳，「换人也遇到」未验证；`fs/*-intent` 的 actor 字段能否解出 session 身份是 L3 推断（承 ADR 0003） |

## 生命周期

- **升级**：`plugin_manager install_bundle target=<新包路径>`，启动日志版本号会变。
- **卸载**：`dsh plugin --profile <profile> remove @wufeng0105/dsh-plugin-kit`——不删你项目的任何文件。
- **从 0.1.x（旧阶段门形态）升级**：直接换包即可；你项目里的 `.stage-gate.json` / `stages/` / `stages/_ledger.jsonl` 不会被删除也不会再被读写——要不要清掉由你决定（它们属于已退役的机制）。
- **从更早的旧包名 `@wufeng0105/dsh-stage-gate` 升级**：必须先卸旧再装新（旧包若仍在 profile 中，两套 bundle 行并存会双重注册）。

## 许可证

MIT
