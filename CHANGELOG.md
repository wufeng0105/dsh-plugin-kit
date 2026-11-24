# 更新日志

本文件记录所有值得注意的变更。
格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 骨架 AGENTS.md 按维护者协议重写（2026-11-24）

原模板有多处不合协议，重写为「条件 → 动作」体例。33 条列表全部以 `→` 连接，模糊词与状态句零命中。

| 原问题 | 违反 | 修法 |
|---|---|---|
| 首段是背景故事（「本项目是一个 DSH 插件」+ 解释「就位」为什么不是「文件已创建」） | 只写指令；解释「为什么」不写；一次性分析结论不收 | 压成一句状态，判据移入「判据」节 |
| 六条纪律与 `SKILL.md` 的开发纪律**完全重复**（六条全中） | 同一规则两处 → 只留一处，其余写指路 | 提出全文，改为一句「加载 `plugin-kit` skill」指路 |
| 「最常踩的六条」与「不要做」两节承担同一批禁令 | 一条内容两个决策 → 拆开；并列冲突方案禁止 | 合并为一节「不写」 |
| 大量解释性破折号后接理由（六处） | 解释「为什么」不写 | 只保留会改变动作的那半句 |
| 「`inject` 目前是空数组」 | 状态句，可改写成指令 | 改为「加服务 → 先 inspect 确认存在，再加进 `inject`」 |
| 「判定它真的就位…读返回里的 `application`」——全仓无一处说明 `application` 是什么、读到什么算过 | 无判据可验证是否遵守 → 改写成有判据 | 换成可执行的：preflight 0 FAIL 且 `install_bundle` 返回成功 |
| 用编号 `0.` 起头的「开工前」列表 | 组织条目统一「条件 → 动作」 | 全部改为 `-` 列表 + `→` |
| `docs/adr/` 尚不存在 | 检查引用 → 路径必须存在 | 保留为「要写 ADR → 放 `docs/adr/…`」，路径由用户创建，属条件式引用 |

**同步修守卫**：`mutate-template.mjs` 三个变异用例的注入串因模板改写而失配（会变成 SKIP 并让整套失败），已同步到新文本；修后 7/7 全部真变红。

**未改动**：`README.md`、`CONTRIBUTING.md`、`SKILL.md` —— 它们是本仓文档，不是 agent 指令文件，不受该协议约束。

### 清理：删除已与产品脱钩的死代码（2026-11-24）

- **删除 `test/e2e/run.mjs`（455 行）**。它不在任何 npm script 里，也从不进包（`npm run check` 从未跑过它）。六个用例中：`load` 期望答案是「9 阶段卡」、`discipline` 期望 systemPrompt 含 `.stage-gate.json`、`block`/`allow`/`nomarker` 全在构造 `.stage-gate.json` 与 `GATE.json` 测门拦截——测的全是已删除的机制；`catalog` 仍有意义但已被 `判据:可扫出` 覆盖。文件头还引用不存在的 `references/evidence.md`。
- **`打包守卫`从「`test/e2e/` 不进包」拓宽为「整个 `test/` 与 `evidence/` 不进包」**。原断言写死了一个已删除的目录，过滤结果恒为空 = 空真；同时补了反向断言（包内文件非空、确有 `skills/` 内容）。正反两向已验证：把 `test` 塞进 `files` 会红，还原后绿。
- **`.gitignore` 删掉 `.zhll/`**：那是已退役机制的草稿区，目录从未存在过，描述里还写着「gates 原始输出」。

**保留**：`evidence/skills-v1-history.bundle`（35KB）看似冗余，但经核实**不是**——它对应的 `legacy-skill-only` tag 只在远端、本地未 fetch，这份 bundle 是离线查看那段历史的唯一途径。

## [0.4.0] - 2026-11-24

### 独立审计后的修复：空真守卫、自证为绿的保鲜链、丢失的不变量（2026-11-24）

第二轮独立审计（陌生人视角）判 FAIL，抓到的不是措辞问题。以下逐条修。

#### 空真：两条「单源」守卫名不副实

`面:四家族正典`、`面:纪律单源` 原先只查「README 里出现了某个关键词」，而那个词在 README 里本来就有多处——**把指向 SKILL.md 的整句删掉，守卫照样 PASS**（审计用副本做了删除实验）。六个 `面:*` 守卫此前从未被任何变异注入过，所以空真一直没被发现。

- `面:四家族正典` 改为断言**存在一条真 markdown 链接**，其链接文本点名「首装验证」/「失败家族」，且目标文件存在。
- `面:纪律单源` 改为反向断言：README 不得把六条纪律整段复述回来（双源才是它该拦的）。
- `mutate-pack.mjs` 新增两个变异：`README 拆掉失败家族指路`、`README 复述六条纪律`——**六个 `面:*` 守卫第一次有了变红证明**。

#### 保鲜链自证为绿

`gen-host-snapshot.mjs` 头注释声称「从当前运行的宿主 inspect 结果生成」，实际从未调用 `cordis_inspect_query`——它把 `VERSION.json` 的版本号与一份手填常量拼起来写出去。审计的控制实验：把 `VERSION.json` 的 `dsh` 改成 `9.9.9` 后重跑，recheck 对**一个不存在的宿主版本**判全套 OK。

- 脚本头注释与输出数据的 `_comment` / `source` 改为如实描述：「SNAPSHOT 是人工实测后整理的字面量，本脚本不查询宿主」。
- README 的升级复检命令改为让用户指到自己的清单与快照，并明示快照要人工 inspect 后填；「已知限制」新增一行说明这条链能证明什么、不能证明什么。

#### 迁到 CONTRIBUTING 时丢掉的不变量

被删的 ADR 里有一条**约束未来**而非记录过去的内容：「`design-check` 的判定格式随包分发，是用户仓的公共契约，只能加宽、不能收紧」。删除后全仓零处承接，代价会在某次无害的格式简化里兑付——一批用户仓突然判红。

- 现补进 `SKILL.md` 设计期一节与 `CONTRIBUTING.md`「不变量」节，并写明违反的代价与必须保住的旧格式夹具。

#### 其余

| 问题 | 修 |
|---|---|
| `SKILL.md` 把模型送去面 C 的 `CONTRIBUTING.md`（不进包） | 审查员三条硬要求就地展开，不再跨面指路 |
| `touchpoints.sample.json` 指向不存在的 `TOOLS.md` | 字段说明就地写全（8 个字段）；并注明 `host` 要改成实测版本 |
| README 的 `node skills/plugin-kit/scripts/...` 只在仓根可执行 | 改为 `<plugin-kit包>/skills/plugin-kit/scripts/...`，与 SKILL.md 一致 |
| 骨架的 `{插件名}` 占位符不在任何替换清单里，两个门都 0 FAIL | `SKILL.md` 与 `template/AGENTS.md` 补进替换清单；模板里的说明改为描述而不写占位符字面量（否则占位符零残留测试会误伤） |
| README 称 recheck 只有四态 | 补第五态 `DRIFT` 与 `--scan-dir` |
| `preflight.mjs` 头注释称「4 个注入缺陷」，实为 10 条断言 | 改为 7 条注入 + 3 条判据 |
| README 启动日志引文少 `[plugin-kit]` 前缀 | 补上 |
| README 首句「前两段住 skill 正文，后两段是脚本」与产品表矛盾 | 改为「判据住 skill 正文，三段自检是随包脚本，重解脚本只在源码仓」 |
| README 布局树漏 `cordis.patch.yml`（宿主识别入口）、`locale/`、`icon.svg` | 补上 |
| 生命周期节写死 `@wufeng0105/dsh-stage-gate`（registry 上 404） | 改为泛化表述 |

断言总数仍为 36（本轮是替换实现、不是新增）；`mutate-pack` 的变异注入点 6 → 8（三套件合计 21 个）。

### 交付面重构：文档按「谁拿到哪一份」重排（2026-11-24）

按「GitHub 项目最终交付的是收件人拿到他那份东西并让它起作用」重排文档，而不是继续往 README 里堆维护者内容。历史决策不再以叙述形式留在正文里——要对，git 里有。

- **三个交付面**定死：面 A 对外承诺（`README.md`）、面 B 产品本体（`SKILL.md` + 脚本 + `template/`）、面 C 源码仓（`CONTRIBUTING.md` + `CHANGELOG` + `evidence/` + `test/`）。判据写进 `CONTRIBUTING.md`「文档规矩」节。
- **`README.md` 由 217 非空行降至 129 行**：开发纪律、审查员协议、发布流程、「历史与凭据」整节迁出；新增「不做什么」三条硬边界（不拦截 / 不记账 / 不注入常驻提示），把唯一仍有约束力的历史改写成现在时。
- **新建 `CONTRIBUTING.md`**：维护者入口，收开发纪律与审查员协议（含任务书模板）、发布流程与「发布成功」判据、文档规矩与禁用语、守卫怎么改。
- **删除 `docs/`**：四份 ADR（全部是决策过程记录，没有一篇描述现行产品）与 `docs/release-runbook.md`（并入 CONTRIBUTING）。五个文件均已在 git 历史中，可随时取回。
- **`SKILL.md` 去编号**：五个中文序号节改语义名（「查契约的三步」「首装验证」「升级保鲜」等），并新增「从这里开始」四段导航表。
- **修复 `SKILL.md` 缺证据等级定义**：它用到 L1–L4 却只给名字不给定义（定义原先只在 README，迁移后会变成包内死引用）。定义现下沉进 SKILL.md，CONTRIBUTING 留可读副本。

#### 修复（本轮核查抓到的交付面缺陷）

| 缺陷 | 症状 | 修 |
|---|---|---|
| `preflight.mjs:220` 死指向 | 家族④ 的「补法」让用户去 skill 里找 `P3.5 运行时验收`，而该编号已随旧流程退役、SKILL.md 里没有这一节 | 改为按语义节名指路，并新增守卫「保鲜:脚本指路可解析」 |
| `template/package.json` 的 `engines.dsh` 低于本包 | 骨架允许装进本包自己都不支持的宿主版本 | 对齐到 `>=0.2.2-rc.1`，并新增守卫「模板:engines 不低于本包」 |
| `template/AGENTS.md` 用 `§三` 指路 | 节编号随本次重构消失，随包分发的这份文件会断链 | 改为按语义节名指路 |
| `test/mutate-pack.mjs` 变异 3 锚点脱钩 | 注入串写的还是 `## 二、首装验证`，改名后显示「注入失败」而非变红——守卫假绿 | 锚点改用语义标题；修后 6/6 变异重新全真变红 |

#### 守卫调整

- 「收敛」组改为「面」组：`收敛:四家族`/`收敛:纪律单源` 的锚从 `§编号` 改为语义节名（改排版不再假红，真删内容照样红）。
- `收敛:证据等级` 改为 `面:证据等级双落点`：断言定义在 SKILL.md（随包那一份）且 CONTRIBUTING 有副本。
- 删除 `ADR:三份在位`、`设计期:README ADR 计数`（对象已删且无替代）。
- 新增 `面:无跨面链接`：README 不得链接到不进 npm 包的文件。
- 断言总数 35 → 36。

### 发布流程：把「发布后核实」做成机判（2026-11-17）

0.3.0 发布时踩到：`npm publish` 打印 `+ 包@版本` 且 exit 0，但紧随的查询连续 404，一度被误判为发布失败。根因两条——本机全局 registry 是 npmmirror 镜像（查的是镜像旧索引），官方源 CDN 传播需数分钟。

- 新增 `scripts/verify-publish.mjs`：「发布成功」的唯一判据改为官方源版本端点能查到；支持 `--wait`（最多 8 分钟）、超时与 404 三条原因排查提示。正反例已实测（0.3.0 绿 / 9.9.9 红）。
- 新增项目级 `.npmrc`：本目录内 npm 命令固定官方源；全局 registry 不变，日常安装速度不受影响。
- `package.json` 加 `publishConfig`（registry + access public）作双保险；`publish:npm` 改为 `publish → verify --wait`，新增 `publish:verify`。
- README 发布节改写：说明 registry 分层与「发布成功」判据。

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
