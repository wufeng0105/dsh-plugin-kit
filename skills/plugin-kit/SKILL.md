---
name: plugin-kit
description: Use when a DSH plugin needs the full cycle — new plugin, what each stage must produce, an independent reviewer at a stage gate, host touchpoints after a DSH upgrade, or tests that pass while the feature does nothing. Trigger on any DSH plugin, bundle, cordis, install, won't-load, button-does-nothing, or release question. Complements cordis-plugin-development, which says how to build; this says what to produce and who checks it.
---

# DSH 插件开发流程

> 把"检查"从写的人手里拿走，交给一个不参与写的审查员，能抓住自评永远抓不到的错。
>
> 代价：判据是事故喂出来的；审查员会误判；中间态留不住。
>
> **门不必再人工开了**——插件形态（`@wufeng0105/dsh-plugin-kit`）用 `tools/pre-execute` 机械拦截。
> 只想要判据、不要强制力时，仍可单独复制本目录使用。

## 给谁用

**给已经会写 DSH 插件的人。** 这是阶段门与审查清单，不是从零教学。还没装成功过最小插件的话，先去把那件事做完——装不上的时候，下面每一条你都看不懂，因为它们讲的都是"做对了之后怎么防止做歪"。

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
| **做成插件** | 宿主级强制，不靠记性 | **最强** | 要改目录结构、要放 marker；判据仍靠人定 |

**三者不是新旧两代，是同一套判据的三种执行方式。**

- 短规则 → `AGENTS.md`
- 长内容 → skill
- **需要「不用记」的强制力 → 插件**

> **2026-11 更新**：本 skill 原先在这里写「做成插件：成本高，不值得」。那句话是在**还没有插件可用时**写的。
> 后来用 DSH 原生接缝（`tools/pre-execute`）做出了插件形态并做了真机验证，该判断被推翻。
> **现在 `plugin-kit` 本身就以插件形态提供**（`@wufeng0105/dsh-plugin-kit`），它把这个 skill 一起打包注册。
> 想只要判据、不要强制力，仍可单独复制本目录使用。

## 按需读什么

| 文件 | 什么时候读 |
|---|---|
| [`references/process.md`](references/process.md) | 开工前必读；每阶段结束对照。23 条铁律 + 9 张阶段卡 |
| [`references/reviewer.md`](references/reviewer.md) | 要开审查员时。9 个动作 + 4 级证据等级 + 任务书模板 |
| [`references/tools.md`](references/tools.md) | 做到某个阶段卡住时。每个阶段用什么检查、判据是什么、**技术细节该去哪个内置 skill 找** |
| [`references/evidence.md`](references/evidence.md) | 想确认这套东西靠不靠谱时。**尤其「诚实的边界」那一节** |

## 可调用的脚本

| 脚本 | 用法 |
|---|---|
| [`scripts/recheck.mjs`](scripts/recheck.mjs) | P5 触点复检。先跑 `node scripts/recheck.mjs --self-test` 证明它会红，再拿它判真实清单 |

## 可复制的资产

| 文件 | 用途 |
|---|---|
| [`assets/AGENTS.template.md`](assets/AGENTS.template.md) | 复制到项目根并改名 `AGENTS.md`，让五条短规则每次运行都注入 |
| [`assets/touchpoints.sample.json`](assets/touchpoints.sample.json) | 触点清单样例，抄结构 |
| [`assets/host-snapshot.sample.json`](assets/host-snapshot.sample.json) | 宿主探测快照样例，抄结构 |

## 关键提醒

- **测试全绿 ≠ 验收通过**。三轮实验里第三轮 111 个测试全绿，仍有 5 项验收无法通过。
- **"无法判定"不是"通过"**。探测不到就标 `UNVERIFIABLE`，并写明证据等级。
- **交付说明里的命令必须真跑过**。有一次 `npm test` 写错路径，从来没被跑过。
- **证据等级 L3 不能冒充 L1/L2**。读源码得出的结论，不能写成"已验证"。

## 这套东西的边界

它不是万能的。完整边界见 [`references/evidence.md`](references/evidence.md) 的「诚实的边界」，最重要的三条：

1. **运行时验证：机制已可用，但真项目上没跑过**——三轮实验受"不许安装"约束，没有一条验收在真实安装环境下验过（**2026-11 之前**）。后经多次一次性 profile 真机验证，P3.5 这套流程本身已证明可用；**但在一个真要交付的项目上走完 P0–P5，仍未做过。**
2. **中间态不可复跑**——支撑铁律的事故证据是报告文字，不是可重放快照。
3. **审查员会误判**——它漏过也错过，只是比自评更可靠。

**这三条的区别很重要**：第 1 条的后半段（真项目验证）是唯一还空着的一格，其余两条是长期边界。
