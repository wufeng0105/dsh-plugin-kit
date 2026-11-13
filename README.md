# dsh-plugin-kit

> **一个包，两样东西**：契约查证顺序（skill）+ 完成验证脚本（preflight 首装自检 / recheck 升级复检）。

装它，`plugin-kit` 这个 skill 自动出现在你的 skill 目录里。它**不拦任何调用、不记台账、不注入常驻提示**——旧形态（阶段门拦截 / 台账 / 纪律段）已于 2026-11-13 退役，决策记录见 [`docs/adr/`](docs/adr/)。

## 它解决什么

开发 DSH 插件，你在对着一个黑盒：

| 痛点 | 表现 |
|---|---|
| **宿主是黑盒** | 契约（接缝、事件签名、Config 形状、加载方式）全在宿主运行时与 208MB 的 app.asar 里，shell 工具打不开；离线合法的代码宿主里可能非法 |
| **「完成」没有权威定义** | 代码写完、测试全绿之后，没人告诉你什么算装上了、什么算能用了；DSH 升级后同一问题再来一遍 |

这个插件把两面都变成可执行的程序：**写之前**按三步顺序查契约，**宣称完成之前**跑 preflight，**升级之后**跑 recheck + 重解。

## 三步查契约（写在 skill 正文里）

1. **`cordis_inspect_query`** —— 权威源。Service 方法、事件名/mode/签名、Config schema。事件全集（如 rc.2 的 `fs/write-intent`）只在 inspect 里，任何文档都没有逐条清单。
2. **`dsh-doc` 文档** —— 机制原则与装配形态。可检索副本随包分发在 `skills/plugin-kit/host-skills/dsh-doc/`（43 文件，可 grep / glob）。
3. **找一个真实运行的同类型插件读源码** —— 最有效、最容易被忘的一招。

## 完成验证（脚本）

```bash
# 首装自检：四大失败家族逐条核查（装不上 / 看不见 / 一加载就崩 / 环境相关）
node skills/plugin-kit/scripts/preflight.mjs <你的插件项目根>

# 升级复检：你依赖的宿主触点还成立吗
node skills/plugin-kit/scripts/recheck.mjs --touchpoints touchpoints.json --snapshot host-snapshot.json --strict
```

- 每项输出 `PASS / FAIL / UNVERIFIABLE`，FAIL 附「缺什么、怎么补」
- `UNVERIFIABLE` 不是通过：按提示人工验，验完自己记结论
- 两个脚本都自带 `--self-test`——**先证明判定式会红，再用它判你的项目**

四大失败家族（每条判定式都有真机事故出处，见 CHANGELOG）：

| 家族 | 典型形态 |
|---|---|
| ① 装不上 | 缺 `dsh.bundle.patch`；patch 的 name 与包名不一致；`Config = {}`；inject 猜了不存在的服务 |
| ② 装上了但看不见 | skill 缺 resourceBase；slot 注册塞进 inject 回调 |
| ③ 一加载就崩 | client.js 含 ESM export——宿主把所有插件 client.js 拼成一个大脚本 |
| ④ 环境相关 | 最小 profile 能用、完整插件集崩（只能真机验，脚本标 UNVERIFIABLE） |

## 升级保鲜

DSH 升级后两件事：

```bash
# ① 宿主文档副本过期判定 + 一键重解（rc.2 实测：四份旧 skill 已被宿主合并为 dsh-doc）
#    注意：reextract 只在源码仓有（它要读本机 app.asar 并写回仓内副本），不随 npm 包分发——
#    装包形态下请在源码仓根跑，或见 plugin-kit skill §三的两态说明。
node scripts/reextract.mjs --check
node scripts/reextract.mjs

# ② 触点复检（recheck 随包分发，装包形态从 skills/plugin-kit/scripts/ 跑）
node skills/plugin-kit/scripts/recheck.mjs --touchpoints touchpoints.json --snapshot host-snapshot.json --strict
```

## 安装

```powershell
# 从 npm（推荐）
plugin_manager install_bundle target=@wufeng0105/dsh-plugin-kit

# 或从源码仓路径
plugin_manager install_bundle target=<本目录绝对路径>
```

包已发布到 npm：[`@wufeng0105/dsh-plugin-kit`](https://www.npmjs.com/package/@wufeng0105/dsh-plugin-kit)。

装完验证：skill 目录里出现 `plugin-kit`；让模型复述「四大失败家族」→ 能。

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

## 源码布局

```
dsh-plugin-kit/
├── index.js                 Host 半：只做 skill provider 注册（86 行）
├── lib/skill-provider.js    skill 扫描与定义校验
├── skills/plugin-kit/       产品本体
│   ├── SKILL.md             判据正文：查契约三步 + 失败家族 + 开发纪律
│   ├── scripts/             preflight.mjs（首装自检）/ recheck.mjs（升级复检）
│   ├── template/            新插件项目骨架（4 文件）
│   ├── assets/              触点清单 / 宿主快照样例
│   └── host-skills/         dsh-doc 副本（rc.2 逐字节）+ VERSION.json
├── scripts/reextract.mjs    asar 解析与重解（--check / --self-test；只在源码仓，不随 npm 包分发）
├── CONTEXT.md               词汇表（含退役词清单）
├── docs/                    reviewer.md（本仓开发纪律）+ adr/（三个决策记录）
├── evidence/                凭据：裁定书、真机存证、重定义验收记录、探针脚本
└── test/                    全部验证入口见 npm run check
```

## 文档地图

| 文件 | 只讲这一件事 |
|---|---|
| `README.md`（本文件） | 这个包是什么、怎么装、怎么用 |
| [`CONTEXT.md`](CONTEXT.md) | 词汇表：现行词与退役词 |
| [`docs/adr/`](docs/adr/) | 三个重大决策及其依据 |
| [`docs/reviewer.md`](docs/reviewer.md) | 审查员协议——本仓自身的开发纪律（不随 npm 包分发） |
| [`skills/plugin-kit/SKILL.md`](skills/plugin-kit/SKILL.md) | 判据正文（装进宿主的就是它） |
| [`CHANGELOG.md`](CHANGELOG.md) | 版本历史（0.2.0 重定义 + 0.1.x 事故出处表） |
| [`evidence/`](evidence/README.md) | 凭据：主张引用的原始报告与实测记录 |

**跨文档引用按名不按号。**

## 日志

启动两行（info）+ 打包缺失一行（error）：

```
[plugin-kit] v0.2.0 已加载 → cwd=<你的项目目录>
[plugin-kit] skill provider 已注册 → name=plugin-kit root=<包内 skills 路径>
```

有一条 `error` 就说明插件是残的（比如打包漏了 `skills/`）。headless 模式看不到这些日志——确认插件在工作：让模型列出可用 skill，应含 `plugin-kit`。

## 已知限制（诚实列）

| 限制 | 影响 |
|---|---|
| preflight 是静态检查 | 它判不了运行时行为——装完后的实际可见性仍需一次性 profile 真机验证 |
| 「环境相关」家族 UNVERIFIABLE | 插件间冲突只能真机验（复刻完整 bundle 组合的一次性 profile） |
| 文档副本会过期 | 宿主升级后在**源码仓**跑 `node scripts/reextract.mjs --check`（该脚本不随 npm 包分发，见上「源码布局」）；不做激活时自动同步（拿稳定性换新鲜度不划算） |
| inspect 不可达时判不了 | 没有宿主运行时，契约只能读到 L3（源码核对），不冒充已验证 |

## 生命周期

- **升级**：`plugin_manager install_bundle target=<新包路径>`，启动日志版本号会变
- **卸载**：`dsh plugin --profile <profile> remove @wufeng0105/dsh-plugin-kit`——不删你项目的任何文件
- **从 0.1.x（旧阶段门形态）升级**：直接换包即可；你项目里的 `.stage-gate.json` / `stages/` / `stages/_ledger.jsonl` 不会被删除也不会再被读写——要不要清掉由你决定（它们属于已退役的机制）
- **从更早的旧包名 `@wufeng0105/dsh-stage-gate` 升级**：必须先卸旧再装新（旧包若仍在 profile 中，两套 bundle 行并存会双重注册）

## 许可证

MIT
