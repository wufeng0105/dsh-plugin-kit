---
name: plugin-kit
description: Use when a DSH plugin needs the full cycle — new plugin, what each stage must produce, an independent reviewer at a stage gate, host touchpoints after a DSH upgrade, or tests that pass while the feature does nothing. Trigger on any DSH plugin, bundle, cordis, install, won't-load, button-does-nothing, or release question. Complements cordis-plugin-development, which says how to build; this says what to produce and who checks it.
---

# DSH 插件开发流程

> 把"检查"从写的人手里拿走，交给一个不参与写的审查员，能抓住自评永远抓不到的错。
>
> 代价：判据是事故喂出来的；审查员会误判；中间态留不住。
>
> **门仍然要人工开**——插件形态（`@wufeng0105/dsh-plugin-kit`）**不替你拦人**，
> 它记一本台账：哪个阶段写过东西、门记录怎么写的、审查是谁在什么上下文里做的。
> 默认 `observe` 只记账不拦；`mode: enforce` 是显式选择，不是默认。
>
> 只想要判据、不要插件时，仍可单独复制本目录使用。

## 给谁用

**给已经会写 DSH 插件的人。** 这是阶段门与审查清单，不是从零教学。还没装成功过最小插件的话，先去把那件事做完——装不上的时候，下面每一条你都看不懂，因为它们讲的都是"做对了之后怎么防止做歪"。

## 它解决什么

三轮真实开发里，问题不是「写得不好」，而是**坏在看不见的地方**：

| 失败模式 | 具体形态 | 自评能发现吗 |
|---|---|---|
| **没接线** | 模块写了、测试全绿，产品代码没 import 它 | 不能 |
| **空真** | 「全关时与宿主一致」——当时压根没接线 | 不能 |
| **假绿** | 负例的观测字段不存在，永远不红 | 不能 |

共同点：**它们不在任何一段代码里，而在段与段之间。逐段检查一律看不见。**

### 与宿主内置 skill 的分工

宿主自带 4 个 skill，讲**怎么用宿主的 API**。这个 skill 讲**怎么确认自己用对了**。

判别轴不是「事实 vs 判断」，而是：

> **内置给你领域契约知识 + 零散的证据标准；这个 skill 给你一套可执行的裁决程序。**

**碎片 vs 程序。** 程序需要角色、循环、结论格式——这些塞进知识文档会毁掉知识文档。

## 最短路径

### 先判断走哪条路

- **只是自己用、改一处、当天能验完** → 下面五条就够。
- **要发布、别人会用、或验收超过三条** → 走完整流程（P0–P5）。

拿不准时按完整流程走，但从 P0 开始——P0 只要求一页纸，不浪费多少时间。

### 只做小改动

用下面五条就够。它们覆盖了 23 条铁律里最高频的坑。

1. **每条验收必须能判真假**；靠人看的必须给机判替代，否则标「人工判读」。
2. **每条关于宿主的断言必须带出处**（探测命令+返回，或安装包 `文件:行`）。
3. **每阶段结束开一个独立审查员**：它不写代码、只读产物、只出三态结论。
4. **任何检查先证明它会红**，再用它判通过。
5. **模块存在 ≠ 产品在用**：必须证明它在 import 图里可达。

> 即使只是"先搭个架子"，也先写三行验收标准——否则后面没人能判断"做完没有"。

### 完整流程

阶段序列：

```
P0 需求 → P1 计划 → P1.5 探针门 → P2 执行 → P3 验证 → P3b 修复 → P3.5 运行时验收 → P4 交付 → P5 维护
                                          ↑ 每道门都可能打回，打回后下游停摆
```

每个阶段的入口、产物、出口判据见 [`references/process.md`](references/process.md)。

### 开审查员

阶段做完，对新开的子代理说：

> 开一个审查员，按 `references/process.md` 的 P\<n\> 出口判据审这一版。
> 需求在 `<需求文件>`，产物在 `<产物目录>`。只读不写，只出三态结论。

然后把 [`references/reviewer.md`](references/reviewer.md) 的「任务书模板」贴进去。

**必须是新开的。** 同一个会话让它"顺便检查一下"不算——那是自评的加强版，三轮实验里一次真正的 BLOCKER 都没抓到。

### 怎么让它不被忘记

最常见的困扰是"每次都要再强调一遍"。三种**执行方式**：

| 方式 | 机制 | 优点 | 代价 |
|---|---|---|---|
| 写进 `AGENTS.md` | 每次运行都注入 | 一定会被看见，零维护 | 太长会被稀释，只能放短规则 |
| 做成 skill | 按描述匹配自动加载 | 可放长文，按需加载 | 匹配不上就不出现 |
| **做成插件** | 宿主级接缝 + 台账 | **不会漏记** | 要改目录结构、要放 marker；判据仍靠人定 |

**三者不是新旧两代，是同一套判据的三种执行方式。**

- 短规则 → `AGENTS.md`
- 长内容 → skill
- **需要「事后查得到」→ 插件**（它记录，不阻止）

> **为什么插件那一格不再写「强制」**：这个包真的拦过人，764 分钟里拦了 17 次、
> 0 次针对产品代码，还拦掉了最后一次独立审查派发。拦截层已删。**别把「记了台账」
> 当成「检查已经发生」**——台账能证明「这件事有记录」，不能证明「这件事被审过」。

## 新建一个插件项目

**不要从零手写。** 有一个现成的骨架，复制过去即可：`template/`

```
template/
├── package.json          ← 含 dsh.bundle.patch，宿主才认它是插件
├── cordis.patch.yml      ← 插入 profile 的那一行
├── index.js              ← Host 半骨架，inject 为空
├── AGENTS.md             ← 给下一个 AI 的项目说明
├── .stage-gate.json      ← 存在即启用阶段门（不想启用就删掉它）
└── stages/p0/.gitkeep    ← 让空目录能被 git 记住
```

> **骨架里没有 `.gitignore`。** 不是漏了——npm 打包时**总会排除** `.gitignore`，
> 放一份会让「仓库里的骨架」和「包里的骨架」不一致（2026-11-11 实测踩到）。
> 需要的项目自己建一份。

**三步**：

1. **把 `template/` 里的内容（含隐藏文件）复制到项目根目录**
2. **把占位符 `my-plugin` 全部替换成本项目名**（短横线小写）：

   | 文件 | 改哪 |
   |---|---|
   | `package.json` | `name` → `@local/<项目名>` |
   | `cordis.patch.yml` | `id` 和 `name` |
   | `index.js` | `name` 常量 + 日志前缀 |

   **改完搜一次 `my-plugin`，必须零残留。** 漏掉 `cordis.patch.yml` 的 `name` 会让那一行指向不存在的包，插件装不上。
3. **装一次**（`install_bundle`，`target` 传项目绝对路径），读返回的 `application`——**骨架装得上，才算搭好了**。装完它什么都不做是正常的。

**为什么用骨架而不是现写**：历史上最频繁的失败是「文件都建了，装不上」——`package.json` 少个字段、`inject` 写错一个名字，都在装的那一刻才暴露。骨架把这些固化成文件，漏不了。

## 按需读什么

**阅读顺序就是下表顺序。** 每一份只讲一个主题，读完再决定要不要读下一份。

| # | 文件 | 只讲这一件事 | 读完能回答 |
|---|---|---|---|
| 1 | [`references/walkthrough.md`](references/walkthrough.md) | **一次真实打回长什么样** | 「打回具体是什么样？」——**先看这个**，比读 23 条铁律有效 |
| 2 | [`references/process.md`](references/process.md) | **什么算过**：23 条铁律 + 9 张阶段卡 | 「这一阶段算过了吗？」开工前必读，每阶段结束对照 |
| 3 | [`references/tools.md`](references/tools.md) | **用什么检查**：每阶段的手段与判据 | 「这一步该跑什么？」卡住时读 |
| 4 | [`references/reviewer.md`](references/reviewer.md) | **谁来判**：审查员的 9 个动作 + 4 级证据等级 + 任务书模板 | 「审查员会怎么打我回？」要开审查员时读 |
| 5 | [`references/evidence.md`](references/evidence.md) | **凭什么信**：它证明了什么 + 哪些没证明 | 「我该信它到什么程度？」**决定要不要用之前读；两条还没关掉的边界必须读** |

**为什么是这个顺序**：先看打回（知道疼）→ 再看判据（知道标准）→ 再看手段（知道怎么查）→ 再找审查员（知道谁查）→ 最后看它靠不靠谱（知道信多少）。

## 宿主领域知识在哪

**本 skill 只讲「怎么确认自己用对了」。「宿主的 API 怎么用」在别处。**

那 4 份宿主自带的 skill 已解成**普通文件**，在 `host-skills/`：

| 什么时候读 | 读哪份 |
|---|---|
| 要写 Host 半 / Client 半、选 slot、写 Config、抄模板 | `host-skills/cordis-plugin-development/` |
| 要写 bundle patch、改 preset、查有哪些插件包可装 | `host-skills/cordis-composition-reference/` |
| 要做 agent preset / composition | `host-skills/editing-cordis-compositions/` |
| 要写模型可见的工具描述、设计加载时机 | `host-skills/agent-experience/` |

> **读之前先看 [`host-skills/PATHS-README.md`](host-skills/PATHS-README.md)。**
> 那 4 份是宿主原文的逐字节副本，正文里的 `references/xxx`、`templates/xxx` 是**相对它们各自目录**写的，
> 而宿主把本 skill 的 base directory 报成 `skills/plugin-kit`——照 base 解析会落到 23 处不存在的文件。
> 那个文件说明了正确基准。**共 23 处，`cordis-plugin-development` 占 22 处。**

**为什么用这份而不是直接查宿主**：原文在 `app.asar` 里，`grep` 和 `glob` **打不开**——只能 `read` 单文件，且必须预先知道路径。这里的副本是普通文件，能整目录 `grep`、能 `glob`、能 diff。

### 查不出答案时的顺序（与宿主原文合并）

宿主 `cordis-plugin-development/SKILL.md` 自带一条查的顺序：**inspect → 读该包自己的 README（经 packageDir）→ 读 lib/types 源码**。它比下面这条多了「读包 README」一着；本项目补两条宿主没写的：

1. **先 `cordis_inspect_query`**（含宿主说的「读 packageDir 的 README」）—— 答「有什么方法 / 什么事件 / 什么 slot」
2. **catalog 答不了「怎么组合起来能用」→ `grep` 这里的 `host-skills/`** —— 装配图在文档里
3. **还不够 → 找一个真实运行的同类型插件，读它的源码** —— **最有效、也最容易被忘的一招**

> 第 3 条的分量：一次真实开发翻遍 catalog 和源码 200 多次没答案，最后是读一个已发布设置页插件的 `lib/routes.js` 才找到接缝。另外，`agent-experience` 的话同样适用：**查得太多本身就是错**。

**版本**：`host-skills/VERSION.json` 记了解出时的 DSH 版本。若 `app.asar` 的修改时间比它新，这份副本可能已过期，应重新解一次。

## 可调用的脚本

| 脚本 | 用法 |
|---|---|
| [`scripts/recheck.mjs`](scripts/recheck.mjs) | P5 触点复检。先跑 `node scripts/recheck.mjs --self-test` 证明它会红，再拿它判真实清单 |

## 可复制的资产

| 文件 | 用途 |
|---|---|
| [`template/`](template/) | **整目录复制到新项目根**——项目骨架，见上文「新建一个插件项目」 |
| [`template/AGENTS.md`](template/AGENTS.md) | 只想给已有项目加一份项目说明时，单独复制这一个 |
| [`assets/touchpoints.sample.json`](assets/touchpoints.sample.json) | 触点清单样例，抄结构 |
| [`assets/host-snapshot.sample.json`](assets/host-snapshot.sample.json) | 宿主探测快照样例，抄结构 |

## 关键提醒

- **测试全绿 ≠ 验收通过**。三轮实验里第三轮 111 个测试全绿，仍有 5 项验收无法通过。
- **"无法判定"不是"通过"**。探测不到就标 `UNVERIFIABLE`，并写明证据等级。
- **交付说明里的命令必须真跑过**。有一次 `npm test` 写错路径，从来没被跑过。
- **证据等级 L3 不能冒充 L1/L2**。读源码得出的结论，不能写成"已验证"。

## 这套东西的边界

**它不是万能的。完整边界在 [`references/evidence.md`](references/evidence.md)，这里只点出最要紧的两条。**

**这两条还没关掉，用之前必须知道**：

1. **「换人」从没真的换过**——三轮实验换了上下文，但同一模型、同一作者、同一机器、同一宿主版本。所以验证的是「审查员没参与写」，不是「换个人也一样」。如果换人后打回位置完全不同，这套判据就只是「这个作者踩过的坑清单」，不是结构性的。
2. **成本只测过一半**——E 阶段实测 204 分钟（事前止损线的 70.8%），这个数支持「流程能抓到真问题」，**不支持「流程划算」**。而且那次实验的第 9–12 起缺陷是**用户发现的，不是审查员**——最后一道防线是人。

另外两条长期边界（不必记，但结论依赖它们时要降级）：中间态不可复跑（证据是报告文字，不是可重放快照）；审查员会误判（它漏过也错过，只是比自评更可靠）。

**想判断「现在该信它到什么程度」，去读 `evidence.md` 前两节。**
