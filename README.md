# dsh-plugin-kit

> **一个包，三样东西**：判据（skill）+ 常驻纪律（systemPrompt 段）+ 一条不拦路的台账（记录每个阶段做过什么、审查是谁在什么上下文里做的）。

装它，`plugin-kit` 这个 skill 自动出现在你的 skill 目录里；每个会话开头会看到一句纪律提醒；每次碰阶段目录的写入会被记进台账（**它不拦你，它记录你没审过**——要真拦得显式选 `mode: enforce`，见下文「三级采用」）。

## 为什么是一个包

原来是两个：

| | 问题 |
|---|---|
| `.dsh/skills/plugin-kit/`（skill） | 每个项目要手动复制；而且**注册了不代表 AI 会去看** |
| `dsh-stage-gate`（插件，**旧包，合并前**） | 只有一个拦路器，不知道判据是什么 |

合并后装一个包全都有，版本天然同步，卸载一键干净。

## 三种形态

同一套判据可以只用一部分，取决于你装多少。

| 形态 | 装什么 | 得到什么 |
|---|---|---|
| **纯判据** | 复制 `skills/plugin-kit/` 到项目的 `.dsh/skills/` 或 `~/.dsh/skills/` | 只有 skill，无插件、无台账 |
| **完整**（推荐） | 装本包 | 判据 + 纪律 + 台账（默认不拦） |
| **显式拦截** | 装本包 + `mode: enforce` | 再加真拦（**未验证**，见「三级采用」） |

三种载体各管一段：写进 `AGENTS.md`（短规则、每次注入）、做成 skill（长文按需加载）、做成插件（本包，宿主级**台账**）。

本包是第三种，并把前两种的载体一起给了：[`skills/plugin-kit/template/`](skills/plugin-kit/template/) 是新项目骨架（6 个文件，整目录复制即可）。其中的 `AGENTS.md` 是**给下一个 AI 的项目说明**（每次运行都会被注入），不是写给当前这个人的。

**注意**：装了包就**必然带 `tools/pre-execute` 接缝**（没有设置页可以只开一部分）。想要纯判据，用第一种形态。

## 三样东西分别是什么

| 段 | 提供什么 | 怎么实现 |
|---|---|---|
| **判据** | 每个阶段该产出什么、谁来判断、什么算过 | 把 `skills/plugin-kit/` 注册进宿主 skill 目录 |
| **纪律** | 「开工前先加载 plugin-kit」的常驻提醒 | `systemPrompt.section`，每步都在 |
| **台账** | 每条阶段写入、每条「本可以拦住」、每条门记录，落成可查的行 | `tools/pre-execute` / `tools/result` + `stages/_ledger.jsonl` |

**光有任一样都不够**：

- 光有 skill：模型可以不去看，且每项目要手动复制
- 光有台账：不知道判据，只记下一堆没头的行
- 光有纪律：是提示，可以被忽略

**为什么不再声称「机械强制」**：这个包曾经用 `tools/pre-execute` 真的拦人。764 分钟的真实开发里它拦了 17 次，0 次针对产品代码——拦掉的是只读工具、自己的审查派发、和两份事故记录，最后用户自己上手才发现删除功能是错的。拦截层已删，现在是台账。

裁定全文在 `evidence/audits/2026-11-11-拦截层存废裁定.md`（源码仓库里，不进 npm 包）。

## 安装

```powershell
plugin_manager install_bundle target=<本目录绝对路径>
```

会在 profile 的 `cordis.patch.yml` 插一行 `id: plugin-kit`。

装完验证：

```
dump-config 里出现 - id: plugin-kit
skill 目录里出现 plugin-kit
让模型复述「有没有提到 .stage-gate.json 的段」→ 有
```

## 启用阶段门（可选）

**不建 marker 就只享受 skill + 纪律，连台账都不写。** marker 是「这个项目愿意进约定目录」的声明。

在项目根建 `.stage-gate.json`：

```json
{"enabled": true}
```

然后在项目里组织产物：

```
项目根/
└── stages/
    ├── p0/GATE.json          ← 过了 P0 才有这个
    ├── p0/需求.md
    ├── p1/GATE.json
    ├── p1/计划.md
    ├── _ledger.jsonl          ← 插件写的台账（人可读）
    └── …
```

默认九阶段：`p0 p1 p1.5 p2 p3 p3b p3.5 p4 p5`（对应 skill 里的九张阶段卡）。

> **marker 里的 `root` 不生效。** 读的时候只判文件在不在，内容只做 `JSON.parse` 后丢弃；
> 真实 `root` 恒为 `stages`（一个能配错就静默关掉机制的开关不该存在）。上面那份示例
> 只为兼容旧文件保留 `enabled` —— 写 `{"enabled": false}` **也照样算「已采用」**。

### `GATE.json` 格式

```json
{
  "stage": "p0",
  "verdict": "pass",
  "by": "human",
  "at": "2026-11-09T16:00:00Z",
  "reason": "审查通过"
}
```

| 字段 | 必填 | 取值 |
|---|---|---|
| `stage` | ✅ | 与目录名一致 |
| `verdict` | ✅ | `pass` / `fail` / `skip`（**小写**） |
| `by` | ✅ | `agent` / `human` / `unknown` |
| `at` | ✅ | ISO 8601 |
| `reason` | — | `skip` 时强烈建议填 |

**`verdict` 的三种取值都不是通行证。** 它进台账（`kind: reconciled`），让事后能查「谁在什么时候判了什么」；它不再是 allow/deny 的依据——`skip` 尤其不是：`skip` 的字面语义是「这一阶段没审」，而它曾经是唯一被放行的 verdict，也就是说想跳过审查的人**不需要伪造 `pass`，写 `skip` 就行**。

## 配置

| 字段 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 关掉整段台账，skill 和纪律段仍生效 |
| `mode` | `observe` | `observe` 只记账不拦（会写 `would-block` 行）；`enforce` 才真拦（**未验证**，见下） |
| `layout` | 九阶段 | 阶段目录名（有序） |
| `gateFile` | `GATE.json` | 门记录文件名 |

> `root` 与旧的「额外信任写工具」白名单都已从 Config 移除。`root` 配错会**静默放行**
> （认不出阶段写入）；那份白名单是「未知工具一律 deny」的逃生门，而那个 deny 类别整层删掉了。
> 两者塞进来都不产生任何效果。

### 三级采用

| 级别 | 配置 | 效果 |
|---|---|---|
| **只要判据** | 不建 marker | skill + 纪律；连台账都不写 |
| **默认（观察）** | marker，不配 `mode` | 每次「本可以拦住」写一条 `would-block` 进台账，**不真拦** |
| **显式拦截** | marker + `mode: enforce` | 真拦（`deny`），并写一条 `blocked`｜**未验证，见下** |

**默认是观察，不是拦截。** 在真机上量出「本可以拦住 N 次」之前不默认拦人——
764 分钟会话里全部误拦都由用户承担，而机制自己一次都没报过。

> **关于 `mode: enforce`（未验证的实验功能）**
>
> 它保留着，是因为 `skip` 漏洞修好之后它第一次**可能**真的有用。
> 但它**从未在真机上被验证过值得用**——上一次它在真实开发里拦的 17 次，
> 0 次针对产品代码。用它之前先读 `evidence/audits/2026-11-11-拦截层存废裁定.md`。
>
> 注意它现在也会拦 `skip`：写 `{"verdict":"skip"}` 不再等于放行。

## 源码布局

```
dsh-plugin-kit/
├── index.js                 三段式入口
├── lib/
│   ├── gate.js              判定内核（纯函数）
│   ├── ledger.js            台账
│   ├── skill-provider.js    skill 注册
│   └── discipline.js        常驻纪律文本
├── skills/plugin-kit/       判据（唯一源）
│   ├── SKILL.md
│   ├── references/          5 份判据正文
│   ├── template/            项目骨架（复制到新项目根）
│   ├── assets/              可复制样例
│   ├── scripts/             recheck.mjs
│   └── host-skills/         宿主自带 4 个 skill 的普通文件副本
├── vendor/
│   ├── config.js            Config（schemastery Schema）
│   └── schemastery.mjs      判定用的 Schema 实现
└── test/                    全部验证入口见 npm run check
```

**自足**：这个包被单独下载、装进任何 profile 都能完整工作。判据、资产、宿主文档副本全在包内，**不依赖任何外部目录**。

> 2026-11-10 之前这里还有一棵 `.dsh/skills/plugin-kit/`（本地开发现场），靠「双树一致性」测试守着。**那棵树已删除**——它让发布物隐含依赖一个别人不会创建的目录。那条测试改写成更有意义的问法：**「SKILL.md 里提到的每个文件都必须真的在包里」**。

### `skills/plugin-kit/host-skills/`

宿主自带 4 个 skill 的**逐字节副本**。原文在 203MB 的 `app.asar` 里，`grep` / `glob` 打不开，
只有 `read` 单文件能进且要预先知道路径。解成普通文件后能整目录扫。

`host-skills/VERSION.json` 记了来源版本；`app.asar` 比它新就说明副本可能过期。
**什么时候读哪份、为什么会有这份副本** → 见 `skills/plugin-kit/SKILL.md`「宿主领域知识在哪」。

## 文档地图

**每份只讲一件事。** 阅读顺序即下表顺序。

| 文件 | 只讲这一件事 |
|---|---|
| `README.md`（本文件） | 这个包是什么、怎么装、怎么配 |
| [`skills/plugin-kit/SKILL.md`](skills/plugin-kit/SKILL.md) | **导航**：现在该读哪份判据 |
| [`references/walkthrough.md`](skills/plugin-kit/references/walkthrough.md) | **示例**：一次真实打回长什么样 |
| [`references/process.md`](skills/plugin-kit/references/process.md) | **判断标准**：什么算过（23 条铁律 + 9 张阶段卡） |
| [`references/tools.md`](skills/plugin-kit/references/tools.md) | **手段**：用什么检查 |
| [`references/reviewer.md`](skills/plugin-kit/references/reviewer.md) | **审查员**：它怎么判 |
| [`references/evidence.md`](skills/plugin-kit/references/evidence.md) | **凭什么信**：证明了什么、哪些没证明 |
| [`LOGGING.md`](LOGGING.md) | 日志规范 |
| [`CHANGELOG.md`](CHANGELOG.md) | 版本历史 |

**跨文档引用按名不按号**（「铁律 12」除外——铁律编号被外部引用依赖，不加不减）。

## 日志

插件会打日志。**四级语义固定**（完整规范见 [`LOGGING.md`](LOGGING.md)）：

| 等级 | 什么该用 | 用户该做什么 |
|---|---|---|
| **error** | 装上了但**坏了** | 必须修，否则插件无效 |
| **warn** | 工作着但**需要你知道** | 看一眼，多半不用动 |
| **info** | **生命周期**（启动时一次） | 知道就行 |
| **debug** | **每次调用**的细节 | 排查时才看（**注意：宿主默认阈值是 2，debug 是 3，默认被过滤**） |

### 启动自检（装完该看到这四行 + 台账那一行）

```
[plugin-kit] v0.1.0 已加载 → cwd=<你的项目目录>
[plugin-kit] skill provider 已注册 → name=plugin-kit root=<包内 skills 路径>
[plugin-kit] 纪律段已挂载 → name=plugin-kit:discipline order=121
[plugin-kit] 已启用 → root=stages gateFile=GATE.json mode=observe layout=9阶段
[plugin-kit] 台账使用内存 + 文件镜像（无 storage）→ runId=<本次运行身份>
```

**有一条 `error` 就说明插件是残的**（比如打包漏了 `skills/`）。

**第五行的 `runId` 值得看一眼**：它是一次进程一个的身份，台账每一行都带它。
「这条记录是哪一次运行写的」是判重的前提——没有它，两次运行的同一条事件在数据上无法区分。

`mode=observe` 是默认值。**用户看到的「没被拦」默认不是「门过了」，而是「台账只在记账」。**

### 重要：headless 模式看不到这些日志

`dsh headless` 只把**模型回复**打到 stdout，`ctx.logger` 的输出不进终端。

**这不是插件的问题，是宿主行为。** 想确认插件在工作：

| 方式 | 怎么做 | 期望 |
|---|---|---|
| 看 skill 目录 | 让模型列出可用 skill，应含 `plugin-kit` | 判据在 |
| 看台账 | `cat stages/_ledger.jsonl` | 有 `reconciled` / `would-block` 行，每行带 `runId` |
| 看观测行为 | 在有 marker 的项目里写阶段产物 | 默认**放行**且记一条 `would-block`；`mode: enforce` 下才是 deny |

Web GUI 模式下日志正常显示。

## 真机验证：怎么自己复跑

> 验证脚本和存证**在源码仓库里，不在 npm 包里**：<https://github.com/wufeng0105/dsh-plugin-kit>

```powershell
$env:SN_API_KEY = '<你的 key>'   # 一次真实模型调用；没有 key 脚本会 SKIP，不会伪装通过
node test/e2e/run.mjs            # 9 个场景，建一次性 profile，跑完自动删，不碰日常 profile
```

9 个场景覆盖：skill 目录出现、纪律段注入、缺门拦截、AI 不自造门、如实报告、补门放行、台账落盘、无 marker 不误拦。跑完在 `evidence/` 写入带环境指纹（Node / DSH 版本）的结果。

## 已知限制（诚实列）

| 限制 | 影响 |
|---|---|
| **项目不建 `.stage-gate.json` → 连台账都不写** | 根本限制。没有接缝能强制真实工作进入约定目录 |
| **台账只记「碰了 `stages/` 的调用」** | 不记全部工具调用（否则台账爆炸）。写源码、跑测试都不进台账 |
| **shell 通道覆盖不保证** | 改文件用 shell（`Set-Content`、`node -e`、`git checkout --`）能绕过文本扫描。实测 4 种常见形态全漏——所以「台账里没有」不等于「没发生」 |
| **台账记的是「门记录这么写」，不是「审查真的做过」** | 手写一份 `{"verdict":"pass"}` 就能让台账显示「审过了」。彻底防伪需要签名，超出范围 |
| **常驻纪律段无法按项目门控** | `PromptSection.text` 拿不到 cwd，只能用条件句（「如果本项目有 marker……」），文字仍会进每个会话 |
| **`mode: enforce` 未验证** | 修好 `skip` 漏洞之后它第一次可能真的有用，但**从未在真机上验证过值得用**。默认不是它 |

## 生命周期：安装 / 升级 / 卸载

> **装完该看到什么**见上文「启动自检」——启动五行、headless 替代确认方式都在那里，这里不重复。

### 升级

**同一行 id 直接换包即可**：

```powershell
plugin_manager(action="install_bundle", target="<新包路径>")
```

升级后启动日志里的版本号会变——**这是确认升级成功的最直接方式**。

**从 `dsh-stage-gate`（旧名）升级必须先卸后装**，见下。

### 卸载

```powershell
dsh plugin --profile <你的 profile> remove @wufeng0105/dsh-plugin-kit
```

**卸载后你会看到什么变化**：

| 变化 | 说明 |
|---|---|
| 启动日志那几行消失 | 这是最直接的「已卸载」信号 |
| skill 目录里没有 `plugin-kit` | 判据也没了 |
| 不再记台账 | 回到全人工：没人记录你审没审 |
| **你的项目文件一个都不会变** | 见下 |

**卸载后不会删的东西**（故意的）：

| 留下什么 | 为什么 |
|---|---|
| `.stage-gate.json` | 是你的项目决策，不是插件的附属物。留着，将来重装能直接用 |
| `stages/` 目录 | 是你的产物 |
| `stages/_ledger.jsonl` | 是历史记录，删了就查不到过去写过什么、审过什么 |

**要彻底清干净**，自己删这三样：

```powershell
Remove-Item -Recurse .\stages
Remove-Item .stage-gate.json
```

### 从 `dsh-stage-gate` 迁移（旧名）

旧包行 id 是 `stage-gate`、新包是 `plugin-kit`——**不卸旧包直接装新版会挂两套监听器**（`enforce` 下等于双重拦截）。先卸旧再装新；台账和 marker 文件名没变，不用迁移。

## 许可证

MIT
