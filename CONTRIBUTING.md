# 维护者指南

> 本文件只对**要改这个包的人**有意义。只想用这个包，读 [README](README.md) 就够。

## 开发纪律

**审查员的价值不在「多一双眼睛」，而在「它没参与写，所以没有立场替写的人找理由」。**

判据正文的六条纪律与证据等级定义的正典在 [`skills/plugin-kit/SKILL.md`](skills/plugin-kit/SKILL.md) 的「开发纪律」节（每装一个包就会读到），本文不复述。

### 派独立审查员时的三条硬要求

缺任一条 = 未完成审查：

- **H1** 不许只照抄实现者给的判定式——至少一条要自己从需求原文推导，并写清推导链。
- **H2** 至少一条真宿主观察：装进真环境看一眼，不接受全程 `%TEMP%` 沙箱跑脚本。
- **H3** 报告必须有「用户可见面」小节：第一眼看到什么 / 对应哪条判据 / 哪部分没看到。缺这一节，读的人一眼就知道审查员没看屏幕。

### 九个动作

独立复跑、空真排除、接线可达性、验收分类复核、计数机检、防漂移测试核查、打包真加载、缺陷清单时效、行为复现优先。

### 五种失效方式（都实际发生过）

规格含糊时自创标准、同用坏仪器、只查缺陷清零、够不着运行时冒充、只读代码不跑行为。

### 任务书模板

复制给新开的审查员，替换尖括号内容：

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

## 发布流程

**这份内容只回答一件事：从这里发布一个版本，按什么顺序、每步怎么判真假。**

### registry 是分层的

| 层 | 值 | 由谁设 |
|---|---|---|
| 本仓 | `https://registry.npmjs.org/`（官方） | 本仓 `.npmrc` |
| 发布目标 | 官方源 + `access: public` | `package.json` 的 `publishConfig` |

在原理解释上，本仓带项目级 `.npmrc` 是为了让**本目录内**的 npm 命令固定读官方源真值；`package.json` 的 `publishConfig` 是双保险。**不要**为查一个版本去改全局配置。

### 发一个版本：四条命令

```bash
# 1. 升版 + 提交 + 打 tag（内部跑全量验证门，不过就不动）
node scripts/release.mjs patch|minor|major

# 2. 推送提交与 tag（脚本不代做，不可撤销）
git push origin main --follow-tags

# 3. 发布 + 自动核实（check → pack 干跑 → publish → verify --wait）
npm run publish:npm

# 4. 随时复查（不发版，只核官方源）
npm run publish:verify
```

发版前先跑 `node scripts/release.mjs --check`：七项核对（版本纯 `x.y.z`、CHANGELOG 有对应节、tag 不存在、工作树干净、分支 main 且已同步、npm 上没这个版本、`repository` 指回本仓）。任何一项不过就拒绝继续——**这一步红，说明还有其他事没做完，不是脚本毛病**。

**脚本不代做 push 与 publish**——两个不可撤销的外部动作，执行权留给人。

### 「发布成功」的判据

**唯一判据：官方源版本端点能查到。** 不是 `npm publish` 的退出码。

`npm publish` 成功时会打印 `+ @wufeng0105/dsh-plugin-kit@<版本>` 并 exit 0，但官方源 CDN 传播要几分钟，**期间所有查询都是 404**。

404 时按概率排查三条：

1. **CDN 还在传播**——最常见。等 1–5 分钟，或 `npm run publish:verify`（最多等 8 分钟）。
2. **真的没发出去**——查 publish 日志里有没有 `http fetch PUT 202`。**只有 GET、没有 PUT 才是真没发**；有 PUT 就是传播。日志位置用 `npm config get cache` 现取后缀 `_logs` 目录。
3. **查的不是官方源**——用 `npm config get registry` 确认当前位置；本仓应是 npmjs。

```bash
node scripts/verify-publish.mjs <版本>     # 核指定版本
node scripts/verify-publish.mjs --wait    # 等传播
```

> 首次发布时 packument（包根索引）会比版本端点晚几分钟生效，期间 `npm install` 报 404 而 tarball 直链已可下载——这是 CDN 传播，不是发布失败。

### 发布后自检（30 秒内可跑）

```bash
npm view @wufeng0105/dsh-plugin-kit version        # 应等于刚发的版本
npm run publish:verify                              # 应绿，并打印 tarball 直链
git status --porcelain                              # 应为空
git log --oneline -1 origin/main                    # 应是最新提交
```

四条全过，这次发布才算完成。

### 出错时别做的事

- **不要**因为查不到就改全局 registry（拿每天几十次安装的速度，补每次发布一次的查询，方向反了）。
- **不要**为了让 `release.mjs --check` 变绿而删 tag 或改版本号——红项通常指向真实的未完成步骤（最常见：提交还没 push）。
- **不要**把 npm token 写进仓库任何文件。token 在 `~/.npmrc` 里，发布时自动读。
- **不要**在没跑过的情况下把命令写进交付说明。

### 代理

按需临时设，不写进任何全局配置。**不要** `npm config set proxy`——那会让镜像请求也绕一圈，代理挂掉时全部失败。只在确需时对当前命令生效：

```powershell
$env:HTTPS_PROXY='<你的代理地址>'; npm view <pkg>
```

`raw.githubusercontent.com` 直连可能被 TLS 重置，出现 `schannel` / `TLS handshake` / 连接重置时先想到这条。

## 文档规矩

### 三个交付面（改文档前先确认你在改哪一面）

| 面 | 文件 | 判据 |
|---|---|---|
| **面 A 对外承诺** | `README.md` | 读者不需要本仓除包内文件以外的任何东西，就能完成安装并验证 |
| **面 B 产品本体** | `skills/plugin-kit/SKILL.md` + 三个脚本 + `template/` | 删掉仓里其他所有文档，产品依然完整可用 |
| **面 C 源码仓** | 本文件、`CHANGELOG.md`、`evidence/`、`test/` | 只有要动这个包的人才需要读 |

**一条内容只能待在一个面里。** 面 C 的内容出现在面 A，就是双源，必被这条规矩判红。

### 禁用语

以下词指代已不存在的机制，**不要在新文档里使用**（`test/readme-claims.mjs` 会检查）：

- **阶段门** — 指代已删除的流程门机制
- **纪律段** — 指代已删除的 systemPrompt 常驻注入
- **marker（`.stage-gate.json`）** — 指代已删除的项目级启用声明文件。现行的项目声明是触点清单 `touchpoints.json`
- **九阶段 / P0–P5** — 指代已删除的阶段划分
- **作证台账（witness）** — 指代未实现的写入分级台账

### 不变量：判定格式只能加宽

`design-check.mjs` 的词汇表条目格式与 ADR 命名规则随 npm 包分发，**是用户仓的公共契约**。

- 允许：加宽（接受更多旧形态、新增可选字段、放宽校验）
- 禁止：收紧（改条目语法、新增必填、重命名已有规则）

违反的代价不是本仓测试变红，是**既有用户仓在某次无害升级后突然全红**。改格式前必须同时保住 `test/design-check.test.mjs` 里的旧格式合规夹具。

### 一体成文

改文档前先读项目现有的约定（本文件、`README.md`、`skills/plugin-kit/SKILL.md`），以及待改文件全文。四条硬要求：

- **只用现在时**：以后怎样、后来改成什么，移出正文。
- **只在归属地展开**：同一事实留最完整的一处，别处最多一句「详见『<章节名>』」。
- **一个事物一个名字**：同一个值只有一个来源。指另一处写名字，不写编号。
- **标题不编号**：顺序由先后表达。

改完自查：删掉的东西记进 `CHANGELOG.md`。

### 守卫测试

`npm run check` 是唯一的全量验证入口。它先对七个入口文件逐个跑 `node --check`（`index.js`、`lib/skill-provider.js`、三个 skill 脚本、`reextract.mjs`、`verify-publish.mjs`），再跑七个套件：`test`（单元）、`packed`（打包守卫）、`template`（骨架守卫）、`template-e2e`（模板端到端）、`selfcontained`（自包含）、`claims`（README 断言）、`mutate`（三个变异套件）。

**改文档后必须跑**：`node test/readme-claims.mjs`。它断言 README 与 SKILL.md 里的事实与代码一致——文档说的和代码做的不一致就变红。

**改守卫后必须证明它会红**：`npm run mutate` 三个变异套件往产物里注入缺陷，必须全部变红。**「注入失败」不是通过**——变异串找不到锚点时会显示注入失败，那意味着守卫已经和文档脱钩了。

## 版本号

**版本号只有一个来源**：`package.json` 的 `version`。git tag 名与 npm 版本都从它派生。
