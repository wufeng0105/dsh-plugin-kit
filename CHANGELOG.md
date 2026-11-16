# 更新日志

本文件记录所有值得注意的变更。
格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.3.0] - 2026-11-17

### 设计期落点：两个 skill 的工件成了可机判的检查

- 新增 `design-check.mjs`（随包分发）：词汇表格式、ADR 命名/正文、标识符样式的弃用名漂移；FAIL 附「缺什么 / 怎么补 / 依据」，`--self-test` 9 用例先证明判定式会红。
- 模板新增 `CONTEXT.md` 词汇表种子（第 5 文件）：格式示例 + `_Avoid_` 示范；**首跑必红是设计期第一步**，补法教换成第一条真实术语。
- `template/AGENTS.md` 与 `SKILL.md` 增加设计期指路：无条件加载 `domain-modeling`（词汇表/ADR/三门槛）与 `codebase-design`（接口三问：删除测试 / 两个适配器 / 依赖传入），并写明 design-check / preflight / recheck 三个脚本分工不互判。
- 砍掉原方案里会假红的 `shape.*` 导出面检查（独立审计实测 6 个真实插件 3 个假红）；特征词漂移只判标识符样式的旧词，普通弃用词只提示。
- `package.json` 接线：`node --check` 与 `test` 收录新脚本与新测试；README 计数（骨架 5 文件 / ADR 四份）与结构同步，readme-claims 增加对应守卫。
- 决策记录：`docs/adr/0004-设计期核查.md`（含不可逆代价与 preflight 分工）。

### 一体成文：全仓统一为一条四段流水线

按「一体成文」五条体检后修掉的结构性问题——不是文字毛病，是两套话并存：

- **统一主线**：全仓一句话改为「设计期定概念与形状 → 写代码前查契约 → 装之前首装验证 → 升级后触点复检」。README 首句从「一个包，两样东西」改为「一条流水线，四段」；SKILL.md 标题「契约查证与完成验证」→「从设计到保鲜」，frontmatter description 与 package.json description 同步（补设计期、加 design-check）。
- **一件事只在一处说清**：四大失败家族与六条纪律的正典留在 SKILL.md（模型实际读到的正文），README 改为指路不复述——删掉重复的家族表与六条纪律正文。守卫也随之改判：`收敛:四家族`、`收敛:纪律双源` → `收敛:四家族`、`收敛:纪律单源`，断言的从「两处都有」改成「正典在 SKILL.md + README 指路」，防止把重复当规矩钉死。
- **删过期项**：SKILL.md 节标题「完成验证」→「首装验证」；「111 个测试全绿」补上时间限定（0.2.0 重定义期，非现状）；模板 AGENTS.md 的「触点复检」→「升级复检」（词汇表已拆名）；删除 README 词汇表的「拆名」胶水词条（它替两套话打圆场），改为独立的「首装验证」「升级复检」词条。
- **修被这次改名打断的守卫**：`mutate-pack` 的变异 ③ 注入串原写 `## 二、完成验证`，改名后注入落空（显示「注入失败」而非变红）——已同步为 `## 二、首装验证`，6/6 变异重新全红。

### 文档收敛：读懂现状从 6 个入口收敛为 1 份

- `README.md` 重写为唯一现状文档：产品组成、查契约摘要、首装验证、升级保鲜、开发纪律（reviewer 协议并入）、词汇表（CONTEXT.md 并入，退役词清单原样保留）、历史与凭据指路、发布、限制、生命周期。
- `CONTEXT.md`、`docs/reviewer.md` 并入 README 后删除（内容全数在场，原文在 git）。
- `docs/field-review-2026-11-13-proposal.md` 迁 `evidence/audits/2026-11-13-field-review-proposal.md`——它是「纪律有效」的凭据，不是现行主张。
- 职责拆名：README 面把 preflight/recheck 的职责分别称「首装验证」「升级复检」，不再合称「完成验证」（落盘 field-review 提案 F5 遗留项）。
- `test/readme-claims.mjs` 新增 5 条防漂移守卫（四家族 / 退役词 / 证据等级 / 纪律双源 / 链接存在），红证明已做。
- 账本与逐格裁决留痕：`evidence/doc-consolidation-2026-11-15.md`。

## [0.2.1] - 2026-11-14

### 升级到 DSH 0.2.2-rc.3：修好「升级保鲜」这条路径本身

**背景**：宿主从 rc.2 升到 rc.3 后按 skill §三 的流程实际执行了一遍，发现两个**真 bug**——「升级保鲜」这套能力此前只在 `--check` 分支被验证过，真正重解时会崩。

#### 修复（升级流程实测发现）

| 修 | 症状 | 原因 |
|---|---|---|
| `scripts/reextract.mjs` 重解必崩 | 文件已全部写完，然后 `ENOENT` 崩掉，`VERSION.json` 停在旧版本号（副本内容已是新的，元数据是旧的——比崩溃本身更难查） | 版本号有第二个来源读 `stages/p1.5/t2-dsh-skill/package.json`，而 `stages/` 已随阶段门退役删除 |
| `reextract.mjs --check` 结论虚高 | 同一文件既报 `CHANGED` 又报 `GONE`，diff 计数翻倍 | `CHANGED` 分支没有从 `current` 摘除，循环结束后被当成残留项 |
| `test/readme-claims.mjs` 每次升级必红 | 把 `dsh == "0.2.2-rc.2"` 写成硬断言 | 把宿主版本号当成了常量——那不是缺陷，是升级的必然结果 |

#### 新增

- `scripts/gen-host-snapshot.mjs`：从当前宿主 inspect 结果生成 `assets/touchpoints.json` 与 `assets/host-snapshot.json`，让 `recheck` 有真实清单可跑（此前仓库里只有 sample）。
- README「升级保鲜」一节补全为完整命令序列（含生成快照这一步）。

#### 升级实测结果（rc.2 → rc.3）

- 文档副本：43 文件，**只有 1 行内容变化**（`packages.md` 新增 `dsh-deepseek-chat-import` 一行）；`VERSION.json` → `dsh=0.2.2-rc.3`。
- 触点复检：**9 条中 8 OK / 0 MISSING / 0 CHANGED / 1 UNVERIFIABLE**。`skills.registerProvider`、`tools.register/restrict/guard`、`agent/created`(serial)、`webServer.register` 全部成立。
- inspect provider 目录：仍 9 个，形状未变。
- 未验证：`settings.section` Slot（客户端探测，需页面在线时人工核对）。

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
