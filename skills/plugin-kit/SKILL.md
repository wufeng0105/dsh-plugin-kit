---
name: plugin-kit
description: Use when designing, developing, installing, or upgrading a DSH plugin — design-phase artifacts (glossary, ADR), what the host requires, what to verify before claiming done, and how to keep it fresh after a DSH upgrade. Trigger on any DSH plugin, bundle, cordis, install, won't-load, button-does-nothing, or release question. Complements the host's dsh-doc.
---

# DSH 插件：从设计到保鲜

## 从这里开始

先判断你现在在四段中的哪一段，跳到对应节，别从头读到尾：

| 你正在做的事 | 去哪一节 |
|---|---|
| 还没想清楚做什么、怎么分块 | 设计期：定概念与形状 |
| 要动笔写代码，但不知道宿主要什么 | 查契约的三步 |
| 代码写完了，要判断能不能装 | 首装验证 |
| DSH 升级了，不知道还兼不兼容 | 升级保鲜 |
| 要新建一个插件项目 | 新建插件项目 |

贯穿四段的是**开发纪律**六条，任何一段都成立。

## 设计期：定概念与形状（写代码之前）

两个 skill 管这一段，动笔前加载并按其做法做：**`domain-modeling`**（概念：术语一物一名、边界场景压测、重大取舍写 ADR）与 **`codebase-design`**（结构：接口小、实现深、接缝只设在真有第二个适配器的地方）。

落成工件（都在插件项目里，可被 `design-check.mjs` 机判）：

- **词汇表**（`CONTEXT.md`，或 README 的词汇表节；模板已带种子）：`**术语**：一两句定义` + `_Avoid_: 弃用叫法`。第一个术语敲定就写，不攒批。
- **ADR**（`docs/adr/NNNN-slug.md`）：难回头 + 无上下文会费解 + 真取舍三条全占才写；接口/接缝的取舍也记这里。

**接口三问**（动笔前，答案写进交付说明或 ADR）：删掉这个导出/模块，复杂度去了哪？接缝另一侧真有第二个适配器（生产+测试）吗？依赖是参数传入还是模块内 `new` 的？

**跑设计期核查**：

```bash
node <本skill目录>/scripts/design-check.mjs <你的插件项目根>
```

词汇表格式、ADR 命名/正文、标识符样式的弃用名（含 `_` / `.` / `/` 的旧词）出现在正文里都判 FAIL；普通弃用词只提示。首跑必红（模板种子是格式示例）——按补法换成第一条真实术语即绿。

⚠ **改 design-check 的判定格式时，只能加宽，不能收紧。** 词汇表条目格式、ADR 命名规则一旦随 npm 包分发到用户项目，就是他们的公共契约：收紧（例如改条目语法、要求新的必填字段）会让既有用户仓突然判红。兼容旧格式是硬要求，不是风格偏好。

**三个脚本的分工（不互判）**：设计期跑 design-check（定概念与形状）；装前跑 preflight（判宿主契约与装败）；升级后跑 recheck（判触点漂移）。

## 查契约的三步

宿主契约的真实来源只有一个：**正在运行的安装本身**。按成本从低到高三步，前一步答不了才走下一步。

### 第 1 步：`cordis_inspect_query`（权威源，先走这一步）

- Service 方法与签名 → host `Service.listService` / `listService({service})`
- 事件名 / mode / 签名 → host `Event.listEvents` / `listEvents({event})`
- 插件 Config schema → host `Config.listConfigs`（`name` 过滤，`entry` 取单条）
- 工具 / Slot / 主题 → 对应 provider

**事件签名永远走 inspect**：事件全集不在任何文档里，只在 inspect 的事件目录里。别去文档里找。

### 第 2 步：`dsh-doc` 文档（机制原则与装配形态）

宿主自带的文档 skill。它讲机制原则：waterfall 纪律、注册的所有权、`ctx.tools.guard` vs `restrict` 的强弱、projection 性能模型。**它不逐条列 API**——那是 inspect 的事。

⚠ 可检索副本在 `host-skills/dsh-doc/`（43 文件，可 grep / glob）。读之前先看 `host-skills/PATHS-README.md`——正文里的相对路径按**副本所在目录**解析，不按宿主报的 base。原文在宿主 app.asar 里（体积见 `host-skills/VERSION.json` 的 `asarBytes`），shell 工具打不开。

若任务涉及界面、设置页或 Slot：顺着副本的 `dsh-doc/SKILL.md` 「Read next」表往下读 `references/ui-plugin.md` 与 `templates/decoration/`（模板含 `./client` 导出与 `window.__ModuleLoader__.load` 起步形态）；验证页面用 `references/verification.md`。这些文件都在包里，不必从零手写界面。

### 第 3 步：找一个真实运行的同类型插件，读它的源码

**最有效、也最容易被忘的一招。** inspect 给零件，dsh-doc 给原则，但「这些怎么组合起来能用」只在真实插件里。去 `~\.dsh\profiles\<profile>\node_modules\` 找同类插件的 `lib/`。

**查得太多本身就是错**：省上下文只有在它没有引起更多搜索、重复读取或错误时才划算。

### 查完必须产出

| 要查的 | 产出（写进你的计划/触点清单） |
|---|---|
| 服务方法 | 方法签名 |
| 事件 | 事件名 + mode（emit/serial/waterfall/parallel）+ 签名 |
| 插槽 | key + kind + 注册项 + props |
| Config schema | 字段与类型，用于写 `cordis.patch.yml` |

**每条关于宿主的断言必须带出处**（探测命令+返回，或安装包 `文件:行`）。读源码得出的结论标 L3，不冒充已验证。

## 首装验证

代码写完、测试全绿 ≠ 装上能用。四类致命失败**全都不在任何一段代码里**，逐段检查看不见：

| 失败家族 | 典型形态 | 在哪暴露 |
|---|---|---|
| ① 装不上 | 缺 `dsh.bundle.patch`；patch 的 name 与包名不一致；`Config = {}`；inject 猜了不存在的服务 | install 那一刻 |
| ② 装上了但看不见 | skill 缺 resourceBase（模型不知道文件在哪）；slot 注册塞进 inject 回调 | 用户打开界面那一刻 |
| ③ 一加载就崩 | client.js 含 ESM export——宿主把所有插件 client.js **拼成一个大脚本**，一个坏插件让整个 web boot 崩 | 重启那一刻 |
| ④ 环境相关 | 最小 profile 能用、混进完整插件集崩（日志无堆栈） | 换环境那一刻 |

**跑自检**（装之前，每次交付前）：

```bash
node <本skill目录>/scripts/preflight.mjs <你的插件项目根>
```

逐项输出 ✓ / ✗ / ?，FAIL 附「缺什么、怎么补」。脚本自带 `--self-test`——先证明判定式会红，再用它判你的项目。

**preflight 覆盖不了的**：家族④ 只能真机验。用**一次性 profile**（建 → 装 → 验 → 拆，复刻目标环境的完整 bundle 组合，不碰日常 profile）。具体命令随宿主版本变，真跑 `dsh --help` / `dsh plugin --help` 现取。三条语义约束：`--from-default-profile` 是替换语义；不能与 shipped 模板同名；必须先建后装。

## 升级保鲜

DSH 升级 = 契约与验证清单同时刷新。两个动作。**脚本位置分两种安装形态**（路径不一样，照错形态跑必然 No such file）：

**包内脚本**（`skills/plugin-kit/scripts/`，随包分发，两态都有）：

```bash
# ② 你的插件依赖的触点还成立吗（先 --self-test 证明它会红）
node <本skill目录>/scripts/recheck.mjs --self-test
node <本skill目录>/scripts/recheck.mjs --touchpoints touchpoints.json --snapshot host-snapshot.json --strict
```

触点清单写法见 `assets/touchpoints.sample.json`；四态判定（OK / MISSING / CHANGED / UNVERIFIABLE）见脚本头部，加 `--scan-dir <你的源码目录>` 时另有第五态 DRIFT（代码里已经不再引用某个触点，说明清单该删条目了）。

**重解脚本**（`<包根>/scripts/reextract.mjs`——只在**源码仓**有，不随 npm 包分发）：

```bash
# ① 宿主文档副本是否过期（STALE 判定 + 一键重解）——在源码仓根跑：
node scripts/reextract.mjs --check
node scripts/reextract.mjs          # 过期就重解（写回源码仓的 host-skills/，再重装包生效）
```

**为什么重解脚本不进包**：它写的是本机 `app.asar` 关联路径与源码仓的 `host-skills/`，装进宿主 profile 的包没有这些上下文。装包形态下副本过期时，回源码仓重解 + 重装一次即可。

## 开发纪律

1. **每条验收必须能判真假**；靠人看的必须给机判替代，否则标「人工判读」。
2. **每条关于宿主的断言必须带出处**（探测命令+返回，或安装包 `文件:行`）。
3. **任何检查先证明它会红**，再用它判通过——改坏 → 红 → 改回 → 绿。「测试全绿」是一个状态，不是一项证据。
4. **模块存在 ≠ 产品在用**：必须证明它在 import 图里可达。
5. **「无法判定」不是「通过」**。探测不到就标 `UNVERIFIABLE`，并写明证据等级。
6. **交付说明里的命令必须真跑过。**

**证据等级**（每条结论都要标，高等级不能靠低等级冒充）：

| 等级 | 形态 | 能证明什么 |
|---|---|---|
| **L1 运行时** | 真机安装后实际点击、观察 | 功能真的可用 |
| **L2 行为复现** | 用真实依赖跑出行为 | 代码路径真的通 |
| **L3 源码核对** | 读安装包源码、引用行号 | 契约形态对不对 |
| **L4 自述** | 写的人自己说的 | **什么都不能证明**，只能当线索 |

对单人开发，上面六条 + preflight 覆盖了最高频的坑。要另开一个独立审查员交叉验证，三条硬要求是：不许只照抄实现者给的判定式（至少一条自己从需求原文推导）；至少一条真宿主观察（不接受全程沙箱跑脚本）；报告必须有「用户可见面」小节。每条结论标证据等级，L4 自述不算结论。

## 新建插件项目

**不要从零手写。** 复制骨架：`template/`（5 文件：package.json / cordis.patch.yml / index.js / AGENTS.md / CONTEXT.md）。

1. 整目录复制到项目根
2. 把占位符全部替换掉（改完在你项目里搜一次，两类占位符都必须零残留）：
   - 包名占位符 → 本项目名，三处：package.json / cordis.patch.yml / index.js
   - `CONTEXT.md` 首行的名字占位符 → 本项目名
   - `CONTEXT.md` 的「示例术语」→ 第一条真实术语（design-check 首跑必红是设计期第一步）
3. 跑 `design-check.mjs <项目根>` —— 0 FAIL 后再进装前自检
4. 跑 `preflight.mjs <项目根>` —— 0 FAIL 后再装
5. 装一次（`install_bundle`，target 传项目绝对路径），读返回的 `application`——**骨架装得上，才算搭好了**

骨架里没有 `.gitignore`：npm 打包总会排除它，放一份会让仓库与包不一致。加第一个依赖时自己建。

## 关键提醒

- **测试全绿 ≠ 验收通过**：0.2.0 重定义期曾出现 111 个测试全绿、仍有 5 项验收无法通过。
- **inspect 是权威源**：任何「宿主支持/不支持 X」的断言，先 query 再写。
- **证据等级不能冒充**：L3 不能冒充 L1/L2，读源码得出的结论不能写成「已验证」。
