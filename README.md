# dsh-plugin-kit

> **一个包，三样东西**：判据（skill）+ 常驻纪律（systemPrompt 段）+ 强制力（未过门拦截）。

装它，`plugin-kit` 这个 skill 自动出现在你的 skill 目录里；每个会话开头会看到一句纪律提醒；写到未过门的阶段目录会被拦住。

## 为什么是一个包

原来是两个：

| | 问题 |
|---|---|
| `.dsh/skills/plugin-kit/`（skill） | 每个项目要手动复制；而且**注册了不代表 AI 会去看** |
| `dsh-stage-gate`（插件） | 只有强制力，不知道判据是什么 |

合并后装一个包全都有，版本天然同步，卸载一键干净。

## 三种执行方式

同一套判据，有三种让人「不忘」的方式。**它们不是新旧两代**：

| 方式 | 机制 | 何时用 | 代价 |
|---|---|---|---|
| 写进 `AGENTS.md` | 每次运行都注入 | 短规则、必须每次看见 | 太长会被稀释 |
| 做成 skill | 按描述匹配加载 | 长内容、按需读 | 匹配不上就不出现 |
| **做成插件**（本包） | 宿主级强制拦截 | 需要「不用记」 | 要改目录结构、要放 marker |

本包提供的是第三种，**并且把第一种的模板一起给了**：[`skills/plugin-kit/assets/AGENTS.template.md`](skills/plugin-kit/assets/AGENTS.template.md)。

## 三样东西分别是什么

| 段 | 提供什么 | 怎么实现 |
|---|---|---|
| **判据** | 每个阶段该产出什么、谁来判断、什么算过 | 把 `skills/plugin-kit/` 注册进宿主 skill 目录 |
| **纪律** | 「开工前先加载 plugin-kit」的常驻提醒 | `systemPrompt.section`，每步都在 |
| **强制力** | 未过门时拦住对下游阶段产物的写入 | `tools/pre-execute` 拦截 |

**光有任一样都不够**：

- 光有 skill：模型可以不去看，且每项目要手动复制
- 光有拦截：不知道判据，只会死拦
- 光有纪律：是提示，可以被忽略

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

**不建 marker 就只享受 skill + 纪律，不启用拦截。**

在项目根建 `.stage-gate.json`：

```json
{"enabled": true, "root": "stages"}
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

## 配置

| 字段 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | **只关拦截**，skill 和纪律段仍生效 |
| `mode` | `enforce` | `observe` 只记日志不拦 |
| `root` | `stages` | 阶段产物根目录 |
| `layout` | 九阶段 | 阶段目录名（有序） |
| `gateFile` | `GATE.json` | 门记录文件名 |
| `allowedTools` | `[]` | 额外信任的写工具（未识别的默认 deny） |

### 三级采用

| 级别 | 配置 | 效果 |
|---|---|---|
| **只要判据** | 不建 marker | skill + 纪律，无拦截 |
| **观察** | marker + `mode: observe` | 记「本可以拦住 N 次」，不真拦 |
| **拦截** | marker + `mode: enforce` | 真拦 |

## 三种交付形态

| 形态 | 装什么 | 得到什么 |
|---|---|---|
| **纯判据** | 复制 `.dsh/skills/plugin-kit/` | 只有 skill，无强制力 |
| **完整** | 装本包 | 判据 + 纪律 + 强制力 |
| **观察** | 装本包 + `mode: observe` | 判据 + 纪律 + 日志 |

**注意**：装了包就**必然带拦截能力**（没有设置页可以只开一部分）。想要纯判据，用第一种形态。

## 源码布局

```
dsh-plugin-kit/
├── index.js                 三段式入口
├── lib/
│   ├── gate.js              判定内核（纯函数，38 条测试）
│   ├── ledger.js            台账（13 条测试）
│   ├── skill-provider.js    skill 注册（37 条测试）
│   └── discipline.js        常驻纪律文本
├── skills/plugin-kit/       判据（构建产物，权威源在 .dsh/skills/plugin-kit/）
├── vendor/                  schemastery 与 Config
└── test/                    133 条
```

**双树一致性**：`.dsh/skills/plugin-kit/` 是权威源，`skills/plugin-kit/` 是构建产物。测试里有哈希断言，改了一边忘另一边会立刻变红。

## 日志

插件会打日志。**四级语义固定**（完整规范见 [`LOGGING.md`](LOGGING.md)）：

| 等级 | 什么该用 | 用户该做什么 |
|---|---|---|
| **error** | 装上了但**坏了** | 必须修，否则插件无效 |
| **warn** | 工作着但**需要你知道** | 看一眼，多半不用动 |
| **info** | **生命周期**（启动时一次） | 知道就行 |
| **debug** | **每次调用**的细节 | 排查时才看（**注意：宿主默认阈值是 2，debug 是 3，默认被过滤**） |

### 启动自检（装完该看到这四行）

```
[plugin-kit] v0.1.0 已加载 → cwd=<你的项目目录>
[plugin-kit] skill provider 已注册 → name=plugin-kit root=<包内 skills 路径>
[plugin-kit] 纪律段已挂载 → name=plugin-kit:discipline order=121
[plugin-kit] 拦截已启用 → root=stages gateFile=GATE.json mode=enforce layout=9阶段 allowedTools=0
```

**有一条 `error` 就说明插件是残的**（比如打包漏了 `skills/`）。

### 重要：headless 模式看不到这些日志

`dsh headless` 只把**模型回复**打到 stdout，`ctx.logger` 的输出不进终端。

**这不是插件的问题，是宿主行为。** 想确认插件在工作：

| 方式 | 怎么做 |
|---|---|
| 看 skill 目录 | 让模型列出可用 skill，应含 `plugin-kit` |
| 看拦截行为 | 在有 marker 的项目里试着写阶段产物，应被拦 |
| 看台账 | `cat stages/_ledger.jsonl` |

Web GUI 模式下日志正常显示。

## 真机验证：怎么自己复跑

`evidence/` 里存着每次真机验证的结果摘要。**不要信摘要，自己跑一遍。**

```powershell
$env:SN_API_KEY = '<你的 key>'
node test/e2e/run.mjs
```

**需要什么**：

| 项 | 说明 |
|---|---|
| `SN_API_KEY` | 一次真实模型调用（sensenova 系） |
| DSH 已安装 | 脚本用 `DSH_CMD` 或默认安装路径定位 |
| 约 3-5 分钟 | 9 个场景各跑一次真实会话 |

**没有 key 会怎样**：脚本 **SKIP 并说明**，退出码 2。**不会伪装成通过。**

### 验的 9 个场景

| 场景 | 判据 |
|---|---|
| `skill-catalog` | 模型列出的 skill 清单含 `plugin-kit` |
| `skill-load` | `skill` 工具返回 `skill_content`，且模型答出「9 张阶段卡」 |
| `discipline` | 模型确认 systemPrompt 里有提到 `.stage-gate.json` 的段 |
| `gate-block` | 缺 p0 门时写 `stages/p1/` **被拦，文件未创建** |
| `gate-no-self-unlock` | AI **没有**自己造 `GATE.json`（R4 回归） |
| `gate-model-reports` | 模型如实报告被拦，不假装成功 |
| `gate-allow` | 补上 pass 门后**写入成功** |
| `ledger` | `stages/_ledger.jsonl` 有记录 |
| `no-marker` | 无 marker 项目**不误拦**（R9 回归） |

### 跑完会写什么

`evidence/<日期>-real-host.md`，含**环境指纹**（Node / DSH 版本 / 时间）和每个场景的判据。

**为什么要记环境指纹**：同一个结论换个 DSH 版本可能就不成立，记录里必须能看出是在哪个版本上验的。

### 边界

- 建**一次性 profile**（`pk-e2e-xxxx`），跑完自动删，**不碰日常 profile**
- 用 `--keep` 保留现场供排障
- 用 `--case <名字>` 只跑一个场景

## 已知限制（诚实列）

| 限制 | 影响 |
|---|---|
| **项目不建 `.stage-gate.json` → 拦截完全不生效** | 根本限制。没有接缝能强制真实工作进入约定目录 |
| **读懂了规则的 AI 能自己造门** | 真机验证时发生过一次。已修（deny 理由不再给 JSON 模板），但边界仍在——只要理由要能被人看懂，AI 就能看懂 |
| 伪造 `GATE.json`（手写 pass） | 能绕过。和「人工开门」性质相同；彻底防伪需要签名，超出范围 |
| bash 命令经过变量拼接 | 保守文本匹配可能漏 |
| **常驻纪律段无法按项目门控** | `PromptSection.text` 拿不到 cwd，只能用条件句（「如果本项目有 marker……」），文字仍会进每个会话 |
| 子代理的调用 | 设计上全局注册覆盖，源码核实过，但**未在真机单独验子代理场景** |

## 生命周期：安装 / 升级 / 卸载

### 安装后你会看到什么

**在 Web GUI 里**，启动自检四行：

```
[plugin-kit] v0.1.0 已加载 → cwd=<你的项目目录>
[plugin-kit] skill provider 已注册 → name=plugin-kit root=<包内 skills 路径>
[plugin-kit] 纪律段已挂载 → name=plugin-kit:discipline order=121
[plugin-kit] 拦截已启用 → root=stages gateFile=GATE.json mode=enforce layout=9阶段 allowedTools=0
```

**有一条 `error` 就说明插件是残的**（比如打包漏了 `skills/`）。

**在 headless 里看不到这些**——用另外三种方式确认：

| 方式 | 怎么做 | 期望 |
|---|---|---|
| skill 目录 | 让模型列出可用 skill | 应含 `plugin-kit` |
| 拦截行为 | 在有 marker 的项目里写阶段产物 | 应被拦 |
| 台账 | `cat stages/_ledger.jsonl` | 有 `blocked` 记录 |

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
| 启动日志四行消失 | 这是最直接的「已卸载」信号 |
| skill 目录里没有 `plugin-kit` | 判据也没了 |
| 不再拦截阶段产物 | 回到「人工开门」 |
| **你的项目文件一个都不会变** | 见下 |

**卸载后不会删的东西**（故意的）：

| 留下什么 | 为什么 |
|---|---|
| `.stage-gate.json` | 是你的项目决策，不是插件的附属物。留着，将来重装能直接用 |
| `stages/` 目录 | 是你的产物 |
| `stages/_ledger.jsonl` | 是历史记录，删了就查不到过去拦过什么 |

**要彻底清干净**，自己删这三样：

```powershell
Remove-Item -Recurse .\stages
Remove-Item .stage-gate.json
```

### 从 `dsh-stage-gate` 迁移（旧名）

**旧包和新包的行 id 不同**（`stage-gate` vs `plugin-kit`）。**如果直接装新版而不卸旧版，配置树里会有两行，双重拦截。**

正确顺序：

```powershell
# 1. 备份台账和 marker
Copy-Item -Recurse .\stages .\stages.bak
Copy-Item .stage-gate.json .stage-gate.json.bak

# 2. 卸旧
dsh plugin --profile <profile> remove @wufeng0105/dsh-stage-gate

# 3. 装新
plugin_manager(action="install_bundle", target="<新包路径>")

# 4. 验证：dump-config 里应该只有一行 plugin-kit
dsh <profile> --dump-config | Select-String 'plugin-kit|stage-gate'

# 5. 确认无误后删备份
```

**台账和 marker 不需要迁移**——文件名和格式都没变。

## 为什么会多出一个 `.stage-gate.json`

它是**项目级采用标记**。没有接缝能强制真实工作进入 `stages/`，所以只能靠它让「机制没运行」和「机制运行但没拦住」可区分：

- 无 marker：完全放行，首次 warn 一次
- 有 marker：正常拦截

## 许可证

MIT
