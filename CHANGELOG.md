# 更新日志

本文件记录所有值得注意的变更。
格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.2.0] - 2026-11-13

### 产品重定义：从阶段门到契约查证与完成验证（breaking）

**核心目标变更**（`docs/adr/0001-核心目标重定义.md`）：从「流程门（拦截 + 台账 + 纪律段）」改为「让插件开发者在写代码之前就知道宿主要什么（契约知识），在宣称完成之前就知道要验证什么、怎么验证（可执行验证清单），并随宿主升级持续保鲜」。

#### 删除（全部退役，历史在 git a3f686d 及其父提交树（61f5fa2 / c98c543）可查）

| 删 | 为什么 | 决策 |
|---|---|---|
| 拦截层（`tools/pre-execute` / enforce / GATE_* 理由码） | 17 拦 0 真阳性；fail-open 与 fail-closed 双输 | ADR 0002 |
| 台账（`lib/ledger.js` / `tools/result` / would-block） | 未验证假设（依赖单作者实验的「AI 伪造」场景）；搁置非否定 | ADR 0003 |
| 纪律段（`lib/discipline.js` / systemPrompt.section） | 提示可被忽略；判据内容现住 skill 正文 | ADR 0001 |
| 九阶段判据 `references/`（5 文件） | 单作者事故史长出的流程，不当作机制分发；reviewer.md 迁 `docs/`（本仓现行开发纪律），evidence.md 留 `evidence/process-lab-legacy/`（两条未关闭边界仍承重），其余三份删（git 可查） | ADR 0001 |
| `stages/` 目录约定（含全部 GATE.json 工件） | 目录约定绑定已退役的阶段门机制；验收凭据迁 `evidence/redefinition/` | ADR 0001 |
| vendor/（schemastery / cosmokit / config.js） | 无用户配置后不再需要 | 随 0001 |

#### 新增

| 增 | 是什么 |
|---|---|
| **`skills/plugin-kit/scripts/preflight.mjs`** | 首装自检：四大失败家族（装不上 / 看不见 / 一加载就崩 / 环境相关）逐条核查，FAIL 附补法；`--self-test` 7 用例证明判定式会红 |
| **`scripts/reextract.mjs`** | 自研 asar 解析器：`--check` 过期判定（STALE = asar mtime > extractedAt）、一键重解、`--self-test` |
| **`host-skills/dsh-doc/`（43 文件）** | rc.2 逐字节副本。**rc.1 的四份宿主 skill 已被宿主合并为 dsh-doc 一份**（实测 asar 21682 文件全扫描）；旧副本按 git 归档 |
| **`CONTEXT.md`** | 词汇表：契约知识 / 验证清单 / 失败家族 / 触点 / 保鲜 / 重解 + 退役词（阶段门 / 纪律段 / marker / 九阶段 / 作证台账） |
| **`docs/adr/0001-0003`** | 三个重大决策：重定义、拦截废弃、台账搁置（含复活条件） |
| SKILL.md 重写 | 查契约三步顺序（inspect 权威源 → dsh-doc 副本 → 同类插件源码）+ 失败家族 + 开发纪律六条 |

#### 修复（2026-11-13 早间审计抓到的 4 条不一致，先于重定义）

- 5 个测试文件写死旧仓库路径（搬家后 ENOENT）→ 全部改 `import.meta.url` 相对解析
- `cordis.patch.yml` 残留 `mode: enforce`（与 D1 裁定冲突、随包分发 enforce）→ 删除，config 留空
- `index.js` JSDoc 旧包名 → 更正
- `test/failure-signals.mjs` 头部注释块损坏（代码碎片混入）→ 修复（该文件随后随台账退役删除）

#### 实测依据（L1，2026-11-13 活体宿主）

- DSH `0.2.2-rc.2`；inspect Event 目录含 `fs/write-intent` / `fs/edit-intent` / `fs/delete-intent`（rc.1 副本无记载——升级后契约漂移的直接证据）
- asar 208,137,981 字节；`@deepseek-ai/dsh-agent-preset/skills/` 下仅存 `dsh-doc`（43 文件）
- `dsh-skill/lib/index.js` rc.2 源码实读：候选校验新增可选 `whenToUse` / `metadata`；`BUNDLED_SKILL_RANK = 600`
- client.js ESM 判定式（`new Function(拼接)`）5 用例红绿正确（T3 探针）

## [0.1.x] - 2026-11-09 ～ 2026-11-12（旧阶段门形态，已退役）

> 0.2.0 重定义把这一阶段的机制（拦截 / 台账 / 纪律段 / 九阶段判据）整体退役；
> 完整逐条历史在 git（a3f686d 的父提交树，即 61f5fa2 / c98c543 之前）。这里只留仍然承重的部分：
> preflight 失败家族的**事故出处**（每条判定式都换来自一次真机崩溃），与对用户的承诺。

### 事故（preflight 判据的出处，全部为「离线全绿、真机才炸」）

| 日期 | 事故 | preflight 对应核查项 |
|---|---|---|
| 2026-11-10 | client.js 含 ESM export → 宿主把所有插件 client.js 拼成一个大脚本，web boot 崩（21 条离线测试全绿没抓住） | ③ crash.client-esm |
| 2026-11-10 | `Config = {}` 普通对象 → activate 崩（Cannot read properties of undefined reading validate） | ① install.config-shape |
| 2026-11-10 | 最小 profile 能激活、混进完整 13+1 插件集就 `1 entry did not activate` 且无 renderer 堆栈 | ④ env.full-bundle（UNVERIFIABLE，只能真机验） |
| 2026-11-10 | skill 缺 `resourceBase` → 模型拿到正文不知道文件在哪，一次开发花 200+ 次工具调用找契约 | ② visible.skill-resourceBase（skill 形态） |
| 2026-11-11 | 模板 package.json 缺 `dsh.bundle.patch` / patch name 与包名不一致 → 装不上 | ① install.bundle-patch / install.name-consistency |
| 2026-11-10 | slot 注册塞进 inject 回调 → 设置页看不到 | ② visible.slot-registration |

### 对用户的承诺（仍然有效）

- 卸载不删用户项目文件（marker / stages/ / 台账文件保留——0.2.0 起它们只是不再被读写的普通文件）
- 从旧包名 `@wufeng0105/dsh-stage-gate` 迁移需先卸后装（历史上两套监听器会双重拦截；0.2.0 起拦截层已不存在，但旧包若仍在 profile 中仍需先卸）
- `npm pack` 总排除 `.gitignore`（骨架 4 文件设计的依据）


## 已废弃

### `DshBundle/dsh-stage-gate/`（2026-11-09 删除）

原插件目录，已被 `dsh-plugin-kit` 完全取代。

**删除前核对**：旧目录零独有文件（20 个文件全部在新目录里有对应）。

**为什么删**：两个同源目录并存会让「哪个是真的」变成谜。（当时同批的过程文档按「保持原样」原则保留；其后 2026-11-12 与 2026-11-13 两轮按「误导性历史该删」判据另行处置，见上方对应条目。）
