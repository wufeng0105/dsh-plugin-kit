收敛信号：包在磁盘上已经能独立跑通（我把它从 tarball 解到包外实测），但「独立」还差三步：35 个新文件一个都没进 git、resourceBase 修复零测试覆盖、改写后的那条测试守的是工作区而不是包。

# 独立性审计：dsh-plugin-kit

审的版本：工作区 `dsh-plugin-kit/` @ `007ace2` + 未提交改动（`git status`: 6 M + 2 ??）
审的时间：2026-11-10
审计者立场：没参与过本产品任何设计与实现；不向委托人提问，只出结论。
只读边界遵守情况：**未修改包内任何文件**（审计前后 `git status --porcelain` 都是同样 8 行）。所有破坏性验证都在 `%TEMP%` 下的副本上做（`robocopy` 全量复制后删文件），`npm pack` 也只写 `%TEMP%`。未安装、未启动 DSH、未碰 profile。

## 一句话结论

**核心结论：包身上独立了，交付链上还没独立。**

- 代码层**真的**不读包外任何东西了。`index.js:163` 用 `import.meta.url` 定位 `skills/`，`lib/**` 只 import node 内建 + `vendor/`，没有一处 `..` 上跳。我把 `npm pack` 的 tarball 解到 `%TEMP%\pk-installed\package` 后直接跑：`listSkills` 扫出 `plugin-kit`、`readSkill` 返回绝对 `resourceBase` 且路径真实存在、`host-skills/VERSION.json` 在、`Config["~standard"].validate` 正常。
- **拦着「独立」的第一件事不是代码，是 git**：`skills/plugin-kit/host-skills/`（35 文件）和 `evidence/skills-v1-history.bundle` 都是 `??`（untracked）。从干净检出发布/推送，这 35 个文件**整体消失**，README:156 那句「不依赖任何外部目录」当场不成立。
- **第二件事**：`resourceBase` 这个修复本身是对的（我对着 `app.asar` 核过宿主源码），但**没有任何测试守它**。我把那一行删掉，`npm test` 88/88、`smoke` 43/43、`readme-claims` 38/38、`failure-signals` 14/14 **全绿**。
- **第三件事**：改写后的「自足」测试守的是**工作区**，不是**包**。我构造了一个真实失效：给 SKILL.md 加一条指向 `references/extra.log` 的链接，文件被 `skills/plugin-kit/.gitignore` 的 `*.log` 命中 → 测试 37/37 绿，tarball 里没有这个文件。这正是「装完链接是死的，而测试全绿」。
- 顺带发现一个**本轮改动新引入**的问题：`host-skills/` 里 4 份宿主文档正文大量写 `references/practices.md`、`templates/decoration/...`，这些是**相对那 4 份自己目录**的；但宿主现在会告诉模型「按 `skills/plugin-kit/` 解析相对路径」，而 `skills/plugin-kit/references/practices.md` 不存在。resourceBase 修复把「不知道在哪」换成了「按规则解析到错的地方」——对一个照着文档走的模型，后者更贵。

---

## Q1 独立性

### 1.1 代码里有没有读包外路径

没有。逐条核：

| 文件 | 证据 | 结论 |
|---|---|---|
| `index.js:163` | `const SKILLS_ROOT = RESOLVE(DIRNAME(fileURLToPath(import.meta.url)), 'skills');` | 包内相对自身定位 |
| `index.js:23-26` | 只 import `node:fs` / `node:path` / `node:url` / `node:module` | 无外部 |
| `index.js:46` | `createRequire(import.meta.url)('./package.json')`，且包在 try/catch 里 | 读自身 manifest |
| `lib/skill-provider.js:19-20` | 只 import `node:fs/promises`、`node:path` | 无外部 |
| `lib/ledger.js:13-14` | 只 import `node:fs`、`node:path` | 无外部 |
| `vendor/config.js:14` | `import Schema from '../vendor/schemastery.mjs'` | 包内 |
| `vendor/schemastery.mjs:1` | `from "./cosmokit.mjs"` | 包内 |

`grep` 全包 `lib/` 与 `index.js` 的路径上跳（`'..'` / `../`）：**0 命中**。

### 1.2 测试里有没有引用包外路径

| 文件 | 现状 | 判定 |
|---|---|---|
| `test/readme-claims.mjs:24,27` | `ROOT = resolve(HERE,'..')`；`SKILL_DIR = resolve(ROOT,'skills','plugin-kit')` | 已修好（原来上跳到 `../.dsh/skills/plugin-kit`） |
| `test/skill-provider.test.mjs:33-34` | `PACKAGE_ROOT = resolve(HERE,'..')`；`PACKAGED_SKILLS = join(PACKAGE_ROOT,'skills')` | 包内 |
| `test/smoke.mjs:20`、`test/mutate.mjs:23`、`test/failure-signals.mjs:44` | 都是 `resolve(HERE,'..')` | 包内 |
| `test/e2e/run.mjs:40,71,140,375` | 硬编码 `C:\Users\Administrator\...\DeepSeek Harness` 与 `~/.dsh/profiles` | **机器绑死，但 `test/e2e` 不进包**（`package.json:27-39` files 里无 `test`），且 `DSH_CMD` 可覆盖。不构成包外依赖 |
| `test/real-host-check.mjs:19-25` | 从 argv 收插件目录 | 无 |

**没有一处 `..` 越过包根。** 原「双树一致性」那条上跳（`resolve(PACKAGE_ROOT,'..','.dsh','skills','plugin-kit')`）确实随 `.dsh/` 一起消失了。

### 1.3 文档里有没有运行前提

有一处硬的、一处软的：

- **硬**：`README.md:128` 在「三种交付形态」表里写 **纯判据 → 复制 `.dsh/skills/plugin-kit/`**。`.dsh/` 已被删除，这个路径在源码树里不存在，在装好的包里也不存在。这不是历史注释的口吻，是**现行操作指令**。详 q4。
- **软**：`skills/plugin-kit/assets/AGENTS.template.md:13` 把 `.dsh/skills/plugin-kit/SKILL.md` 当默认路径（L7 有「不在就改」的逃生口）。作为**模板**可接受，但既然主形态已变成插件，默认值指向一个多半不存在的位置。

`SKILL.md:136`「复制 assets/AGENTS.template.md 到项目根」属于资产用法，不是包运行前提，不算。

### 1.4 `package.json` 的 `files` 够不够

够。逐项对：

| 运行时需要 | 在 files 里 | 实证（`npm pack --dry-run --json`） |
|---|---|---|
| `index.js` | ✅ L28 | 在 |
| `lib/`（4 个） | ✅ L29 | 4 个都在 |
| `vendor/`（config + schemastery + cosmokit + 2 LICENSE） | ✅ L30 | 5 个都在 |
| `skills/`（含 35 个 host-skills） | ✅ L31 | 57 个条目 |
| `cordis.patch.yml` | ✅ L32 | 在 |
| `locale/*.json` | ✅ L33 | en/zh 都在 |
| `icon.svg` | ✅ L34 | 在 |
| `README/CHANGELOG/LOGGING/LICENSE` | ✅ L35-38 | 都在 |
| `package.json` | npm 强制 | 在 |

`npm pack` 实测 **66 文件 / 121,467 B（118.6 KB）/ unpacked 321,928 B**。与自称一致。

### 1.5 判定

**把包单独拷到任意目录：功能完整（实证）。装进任意 profile：代码层面完整（未实测安装，见「不确定」）。**
但「发布一定带上 35 个新文件」这件事**当前没有保证**——见 Q5 与严重度表 #1。

---

## Q2 resourceBase 正确性

### 2.1 合法形状（asar 原文）

`app.asar/dsh/node_modules/@deepseek-ai/dsh-skill/lib/index.js:71-81`：

```js
function renderResourceHint(skill) {
  const base = skill.resourceBase;
  if (base === void 0) return [`Resources for this skill are managed by provider "${escapeText(skill.provider)}".`, "Load referenced resources only as needed."];
  switch (base.kind) {
    case "directory": return [`Base directory for this skill: ${escapeText(base.path)}`, "Resolve relative paths mentioned by this skill against the base directory before using them. ..."];
    case "url":       return [`Base URL for this skill: ${escapeText(base.url)}`, ...];
    case "opaque":    return [`Resources for this skill: ${escapeText(base.description)}`, ...];
    default: return assertNever(base, "SkillResourceBase.kind");
  }
}
```

- `kind` 是**封闭三值**：`directory` / `url` / `opaque`。`directory` 读 `path`（**语义是目录的绝对路径**，宿主只做 `escapeText`，不解析、不校验绝对性）。
- 形状的**权威定义**在 `dsh-tool-skill/lib/index.js:806-854`（tool 输出 schema）：`kind:'directory'` 时 `additionalProperties:false`，只允许 `{kind, path}`，两者都 required。

→ **plugin-kit 给的值形状正确**：`{ kind: 'directory', path: <abs> }`，没有多余键（`lib/skill-provider.js:208`）。

### 2.2 给的值对不对（绝对性）

`readSkill` 里是 `join(root, locator.directory)`，`root` 由 `index.js:163` 传入（基于 `import.meta.url` 的绝对路径）。实测（临时探针，跑完删除）：

```
absRoot: C:\...\dsh-plugin-kit\skills
def.resourceBase: {"kind":"directory","path":"C:\\...\\dsh-plugin-kit\\skills\\plugin-kit"}
isAbsolute: true
```

从 **tarball 解出来的独立副本**里同样成立：

```
resolved root: C:\Users\...\Temp\pk-installed\package\skills\
resourceBase: {"kind":"directory","path":"C:\\Users\\...\\Temp\\pk-installed\\package\\skills\\plugin-kit"}
resourceBase exists on disk: true
host-skills exists: true
VERSION.json exists: true
```

→ **是真绝对路径，且随安装位置变**。这一点比我预期的更硬：它不依赖 cwd、不依赖 profile 布局。

### 2.3 `isValidDefinition` 会不会拒掉

不会，两侧都不看这个字段：

- 本地 `lib/skill-provider.js:226-238`：只查 `name / description / source / provider / content / path / invocation`，**没有 resourceBase 分支**。
- 宿主 `dsh-skill/lib/index.js:471-490` `validateDefinition`：同上，也没有。`validateCandidate`（`:452-464`）同样不看。

→ 额外字段被完整容忍。而且这个字段**不是白加的**：`toSummary`（`:491-503`）会把它带进 catalog 摘要，`runtimeCandidate`（`:437-450`）也带。

### 2.4 宿主渲染用的是哪份返回值

**`readSkill` 那份。这个问题问得对，答案是「是」，所以修复有效。**

两条渲染路径都走 `ctx.skills.get()` → provider 的 `get()` → 我们的 `readSkill`：

| 路径 | 证据 |
|---|---|
| `skill` 工具调用 | `dsh-tool-skill/lib/index.js:876` `const skill = await ctx.skills.get(args.name, lookup)` → `:879-884` 返回 `{...resourceBase: {...skill.resourceBase}}` → `:861-864` `render: (_args, value) => [{type:'text', text: renderSkillContent(value)}]` |
| 用户显式调用 skill 的注入 | 同文件 `:909` `const skill = await ctx.skills.get(name, lookup)` → `:920` `text: renderSkillContent(skill)` |

`renderSkillContent`（`dsh-skill/lib/index.js:57-70`）把 `renderResourceHint` 的输出放进 `<skill_resources>`，正文放进 `<skill_instructions>`。

→ **修复前**：模型只看到 `Resources for this skill are managed by provider "plugin-kit".`（**不给路径**）。**修复后**：`Base directory for this skill: <绝对路径>` + 「按这个 base 解析相对路径」。
→ **结论：修复方向、形状、取值全部正确，安装后 AI 确实能拿到绝对路径。这项自称成立。**

### 2.5 但：这个修复**没有测试守**

我对副本删掉 `lib/skill-provider.js:208` 那一行（并确认 `"resourceBase" in def === false`），重跑全部四套：

```
npm test        → tests 88  pass 88  fail 0
node test/smoke.mjs           → pass 43  fail 0
node test/readme-claims.mjs   → 38 / 38 条成立
node test/failure-signals.mjs → 14 / 14 条通过
```

**全绿。** 也就是说：下次谁重构 `readSkill`、或者把返回值收敛成「只给 content」，这个真机踩过的坑会**静默复活**，而所有红灯都不会亮。这是本次审计里「改动正确但守备为零」的最典型一条。

---

## Q3 改写测试的有效性

### 3.1 它会红吗（构造失效验证）

会。我在副本上做删除实验（每例都是全量新副本，互不污染）：

| 场景 | 删什么 | 结果 |
|---|---|---|
| A | `references/limits.md`（SKILL.md 有直链） | ✖ 红：`SKILL.md 引用了包里不存在的文件：["references/limits.md"]` |
| G | `references/walkthrough.md`（SKILL.md 有直链） | ✖ 红（pass 36 / fail 1） |
| D | `references/walkthrough.md` + `host-skills/README.md` | ✖ 红（pass 36 / fail 1，只抓到前者） |

→ 对「SKILL.md 直链失效」这一类，**它是活的，且报错信息能直接指出缺哪个文件**。

### 3.2 它漏了什么（同样用实验证明）

| 场景 | 删什么 | 结果 | 含义 |
|---|---|---|---|
| B | `host-skills/cordis-plugin-development/templates/decoration/client.js` | **37/37 绿** | host-skills 的 33 个内层文件**零覆盖** |
| E | `host-skills/README.md` | **37/37 绿** | 连自己刚加的那份 README 也不守 |
| F | `host-skills/cordis-composition-reference/references/packages.md`（535 行，含约 200 个包清单） | **37/37 绿** | 这份是 cordis-composition-reference 的主体内容 |
| C | `skills/plugin-kit/README.md` | **37/37 绿** | 该文件不在 SKILL.md 的任何链接里 |

测试里唯一的 host-skills 断言是 `test/skill-provider.test.mjs:313-330`：4 个 `SKILL.md` + `VERSION.json` 存在。**目录其余 29 个文件、以及 4 份文档正文里点名的所有 `references/*.md`、`templates/*` 全都没有守。**

`references/` 内部互链也没守：全目录扫描结果只有 1 条（`references/tools.md:171` → `reviewer.md`），测试没查它。

### 3.3 最该守而没守的：**「在包里」被实现成了「在工作区里」**

测试用的是 `existsSync` 对工作区（`test/skill-provider.test.mjs:307-310`）。但 `skills/plugin-kit/.gitignore` 里写着 `*.log`、`.DS_Store`、`recheck-output.*`，而 **npm 会尊重嵌套 `.gitignore`**。我构造了完整失效链：

1. 在 `skills/plugin-kit/references/` 放 `extra.log`（内容就是一份文档）；
2. 在 `SKILL.md` 加 `[`references/extra.log`](references/extra.log)`；
3. 跑 `node --test test/skill-provider.test.mjs` → **pass 37 / fail 0**；
4. 跑 `npm pack --dry-run --json` → `in tarball? False`，`total entries: 66`（没变）。

**测试说「链接都在」，包说「这个文件不在」。** 这正是该测试注释（`:293-294`）自己写的失效模式：「用户装完点开 skill，一半链接是死的——而测试全绿」。它没守住自己声称要守的东西。
（前提是命名落进 `.gitignore` 的模式；今天是巧合，明天有人加 `*.json` 或 `recheck-*` 就不是巧合了。）

### 3.4 一个反向脆弱点（会误红）

正则是 `test/skill-provider.test.mjs:300` 的 `/\]\(([^)#][^)]*)\)/g`：只排除 `(` 后第一个字符是 `#` 的情况，**不剥离锚点**。今天 SKILL.md 里 0 条锚点链接，所以通过；但任何人写 `[流程](references/process.md#P3)`，`existsSync('references/process.md#P3')` 为 false → **正确的文档被判红**。同一类问题：也不剥离 `"title"` 与 URL 编码。

### 3.5 判定

**这个改写方向是对的（从「两棵树相同」换成「引用不缺」），但实现守的是工作区不是发布物，且覆盖范围只有 SKILL.md 的 13 条链接。**
它比原来那条**宽**（原来只比 11 个文件，现在至少能抓 SKILL.md 直链缺失），但**窄**在发布链路上：原测试至少证明「包内 = 那棵树」，新测试对「包内 = tarball」零保证。

**这个包最可能的失效方式，按概率排序：**
1. 从干净检出发布 → host-skills 35 个文件整体消失（Q5 #1，未 tracked）；
2. 宿主升级 → `host-skills/` 静默过期，而所有测试仍然绿（无版本断言）；
3. 有人重构 `readSkill` → `resourceBase` 丢失，模型又拿不到路径（Q2.5）；
4. 新增文档文件被 `.gitignore` 吞掉 → 测试绿、包缺文件（Q3.3）。
**上面 4 条，现有测试一条都拦不住。**

---

## Q4 目录组织与历史残留

### 4.1 放 `skills/plugin-kit/host-skills/` 对不对

**对，而且比放 `vendor/` 更强——不只是「相对路径短」。**

先核实你说的那条机制：

- 代码核实：`lib/skill-provider.js:95-118`，`readdir(root)` 后只对**直接子目录**取 `join(root, directory, 'SKILL.md')`，没有递归。
- 实测核实：把 root 指到 `skills/plugin-kit`（`host-skills` 的父级）→ 扫出 `[]`；把 root 直接指到 `host-skills/` → 扫出 4 个（`agent-experience`、`cordis-composition-reference`、`cordis-plugin-development`、`editing-cordis-compositions`）。
- **结论：说法成立，但不是因为有排除规则，只是因为「深度差一层」。** 宿主文档里的 4 份 `SKILL.md` 是能解析、能通过 `isValidCandidate` 的合法候选。哪天有人把扫描改成递归（或把 root 指错），这 4 份会**立刻注册**，而且 rank 550 < `BUNDLED_SKILL_RANK`（`dsh-skill/lib/index.js:23` = 600）**会盖住宿主自带的同名 skill**。现在没发生，但这是个无护栏的悬崖。

再给「放这里对」一个更硬的证据：`resourceBase.path` = `...\skills\plugin-kit`，而 `SKILL.md:98-105` 用 `host-skills/cordis-plugin-development/` 这种**相对 base 的写法**。实测 `existsSync(resourceBase.path + '\host-skills') === true`。**只有放在这个位置，SKILL.md 里写的相对路径才和宿主报的 base 对得上**；放 `vendor/` 就得写成 `../../vendor/host-skills/...`，既难读又会在 `resourceBase` 语义下变脆。**这个搬迁是对的，不应回退。**

### 4.2 `vendor/` 现在的划分合理吗

**合理，且我能证明它现在是「纯运行时依赖 + 两份许可」。**

| 文件 | 实证 |
|---|---|
| `vendor/config.js` | 唯一引 schemastery 的地方（`config.js:14`） |
| `vendor/schemastery.mjs` | 与宿主 `@deepseek-ai/schemastery@3.19.0` 的 `lib/index.mjs` **只差 1 行**：line 1 的 import 从 `"@deepseek-ai/cosmokit"` 改成 `"./cosmokit.mjs"`（另加末尾换行）。逐行 diff：`differing lines: 2, host 636 行 / local 637 行` |
| `vendor/cosmokit.mjs` | 与宿主 `@deepseek-ai/cosmokit@1.9.0` 的 `lib/index.js` **字节相同**（sha256 相等，17,160 B） |
| `LICENSE-schemastery` / `LICENSE-cosmokit` | 均为 MIT，`Copyright (c) 2021-present Shigma`，与宿主包一致 |

→ 划分干净：`vendor/` = 「不能靠宿主、必须自带的东西」。**没发现残留的文档副本或历史垃圾。**

小缺口：两个 `.mjs` 里**没有版本戳**（不知道对应 3.19.0 / 1.9.0），下次同步只能靠人记得。建议在文件头加一行来源注释或加 `vendor/VERSION.json`。**推测成分**：宿主换 schemastery 版本时这里不会自动跟上，但离线测试（`npm test` 的 88 条）能覆盖 Config 行为，所以风险可控。

### 4.3 README L13 / L128 / L158 该留还是该改

逐条判：

| 行 | 内容 | 判定 | 理由 |
|---|---|---|---|
| **L13** | 「为什么是一个包」表里：`.dsh/skills/plugin-kit/`（skill）… 每个项目要手动复制 | **改（轻）** | 这是**历史对比**，语境明确（「原来是两个」），保留有解释价值。但它把一个**已不存在**的路径当成「那个方案的名字」，今天读的人无法对照。建议改成「独立 skill 副本（当时放在 `.dsh/skills/`）」——保留史实，去掉「去这个路径看看」的暗示 |
| **L128** | 三种交付形态：纯判据 → **复制 `.dsh/skills/plugin-kit/`** | **必须改** | 这不是历史，是**现行操作指令**，且指向已删除的路径。想只要判据的人照做会找不到东西。正确写法：「复制本包的 `skills/plugin-kit/`」。同时 L132「想要纯判据，用第一种形态」也跟着指错 |
| **L158** | 「2026-11-10 之前这里还有一棵 …**那棵树已删除**…」 | **留** | 明确标注了过去时和删除事实，还顺带解释测试为什么改写。这是**解释历史**，且不会误导——它说的是「这里曾有、现在没有」 |

**分界线很清晰：凡是「过去时 + 已删除」的，留；凡是祈使句/操作表格里的路径，改。** L128 属于后者。

### 4.4 还有没有别处按旧结构说话

有 4 处，都是本轮搬迁（#2）留下的一跳没跳干净：

| 位置 | 原文 | 问题 |
|---|---|---|
| `README.md:180` | 「`skill-provider` 只扫 `skills/` 的直接子目录，**`vendor/` 不在范围**」 | `vendor/` 里已经没有 host-skills 了；这句话回答的是旧结构的问题，读起来像「host-skills 在 vendor 里」 |
| `skills/plugin-kit/host-skills/README.md:47` | 「`vendor/host-skills/` 不在扫描范围」 | **直接写错路径**。这文件是本轮新建的，且**会进包**（`npm pack` 里在） |
| `index.js:8` | 「用到的接缝（见 `process-lab/INTERFACE-FACTS.md`）」 | 该文件**在整个 DshBundle 里不存在**（`Get-ChildItem -Filter '*FACTS*'` 无命中；`process-lab/` 只有 `.md` 8 个，无此文件）。而 `index.js` **进包** |
| `lib/skill-provider.js:7`、`lib/discipline.js:12` | 「见 `process-lab/MERGE-FACTS.md` §四 / §十一」 | 同上，不存在，且**进包** |

后三条是「引用一个别人永远拿不到的私有工作区文件」，属于典型的**历史耦合残留**（虽然不影响运行）。建议改成「见项目内审计归档」或直接在注释里写结论，而不是给出一个死指针。

### 4.5 本轮新引入的问题：`host-skills/` 内部相对路径会被按错 base 解析

这是我在 Q2 之后发现的，**不属于「历史残留」，是这次改动带来的新问题**：

- 宿主现在会告诉模型：**「Resolve relative paths mentioned by this skill against the base directory」**，base = `...\skills\plugin-kit`。
- 但 `host-skills/cordis-plugin-development/SKILL.md:23-25,42-50` 里写的是 `references/practices.md`、`references/host-plugin.md`、`templates/decoration/package.json`——这些是**相对 `host-skills/cordis-plugin-development/`** 的。
- 实测：`skills/plugin-kit/references/practices.md` **不存在**（`Test-Path` → False）。
- 4 份宿主文档里**没有一条 markdown 链接**（`grep '\]\('` → no matches），全是裸路径文本，所以 Q3 那条链接测试对它们完全无效——既抓不到错，也帮不上忙。

**后果**：模型按宿主给的规则解析，会落到不存在的路径上，然后要么猜、要么放弃。这比修复前的「明说不管、不给路径」更容易浪费调用。
**修法（三选一，都不破坏独立性）**：① 把 4 份文档里的裸路径统一加 `host-skills/<skill名>/` 前缀；② 在每个 `host-skills/<name>/SKILL.md` 头部加一行「本文件内的相对路径以此文件所在目录为基准」；③ 在 `plugin-kit/SKILL.md:98-105` 的指路表里明确写「进入该目录后，路径相对该目录」。**我推荐 ②+③**，因为 ① 会让副本与 asar 原文产生 diff，破坏「字节相同」这个可复核性质（现在 33 个文件 `same=33 mismatch=0 missing=0`，很值钱）。

---

## Q5 打包真相

`npm pack --dry-run --json` 实测（同时 `npm pack --pack-destination %TEMP%` 做真包用于解包验证）：

```
entryCount = 66
size       = 121,467 B  (118.6 KB)   ← 与自称 118.6KB 一致
unpacked   = 321,928 B  (314.4 KB)
```

| 检查项 | 结果 | 证据 |
|---|---|---|
| `host-skills` 在包里 | ✅ 35 个条目 | `pack` 列表中 `skills/plugin-kit/host-skills/*` 共 35 条；磁盘上也是 35（33 副本 + README.md + VERSION.json） |
| 文件数对不对 | ✅ | 与 asar 原树逐文件比对：**`same=33 mismatch=0 missing=0 total=33`**，本地多出 `README.md`、`VERSION.json` 两个，符合设计 |
| `VERSION.json` 在不在 | ✅ | `skills/plugin-kit/host-skills/VERSION.json`；内容 `dsh: 0.2.2-rc.1`，与宿主 `app.asar/package.json` 的 `version: 0.2.2-rc.1` **一致** |
| `evidence/` 被排除 | ✅ | pack 列表 0 条命中；`files` 白名单（`package.json:27-39`）无 evidence |
| `test/e2e` 被排除 | ✅ | 同上，且**整个 `test/` 都不进包** |
| `LICENSE` 在 | ✅ | 在（1,068 B，`Copyright (c) 2026 wufeng0105`） |
| `locale` 在 | ✅ | `locale/en.json`、`locale/zh.json` 都在 |
| 其它不该少的 | ✅ | `cordis.patch.yml`、`icon.svg`、`LOGGING.md`、`vendor/LICENSE-*` 全在 |

**该进包却没进的：没有（就运行所需而言）。**

但有两个「该守却没守」：

1. **没有任何测试跑过 `npm pack`。** `grep` 全 `test/`：无 `npm pack`、无 `tarball`、无 `tgz`（唯一命中是 `readme-claims.mjs:483` 的一句注释）。所以「66 文件 / host-skills 在包里」这个结论**每次都要人手动验**，不是回归项。
2. **包内自带脚本是死的**：从 tarball 解出来跑 `npm test` → `Could not find 'test/gate.test.mjs, ...'`，exit 1。README:220-222 已明说验证脚本在源码仓库不在包里，所以**文档自洽**，但意味着**装包用户无法自检**，这也让上面第 1 点更严重。

**补充一条与发布直接相关的**：`skills/plugin-kit/.gitignore` 本身不进包（npm 行为，正常）。但这层 `.gitignore` 会参与决定「什么进包」（Q3.3 已实证）。也就是说**包里带不带某个文档，取决于一个不进包、也不被任何测试检查的文件**。

---

## 该改但没改的（按严重度排序）

| # | 问题 | 证据 | 建议动作 | 严重度 |
|---|---|---|---|---|
| 1 | **35 个新文件与历史 bundle 都是 untracked**。干净检出后发布/推送 → `host-skills/` 整体消失，README「自足」当场失效 | `git status --porcelain`: `?? skills/plugin-kit/host-skills/`、`?? evidence/skills-v1-history.bundle` | 提交；并加一条测试：`skills/` 下每个文件都必须 `git ls-files` 可见（或 CI 里从干净 clone 跑 `npm pack` 并断言 66 条） | **阻断（发布路径）** |
| 2 | **`resourceBase` 修复零测试覆盖**：删掉那行，4 套测试全绿 | 副本删除 `lib/skill-provider.js:208` 后：`88 pass / 43 pass / 38-of-38 / 14-of-14` | 在 `test/skill-provider.test.mjs` 加：`def.resourceBase` 深等于 `{kind:'directory'}`、`path` 为绝对路径、`existsSync(path)` 为真；`listSkills` 同理 | **高** |
| 3 | **改写后的测试守工作区不守包**：`.gitignore` 能吞掉被链接的文件，测试仍绿 | 加 `references/extra.log` + SKILL.md 链它 → `pass 37 / fail 0`，`pack` 里 `in tarball? False` | 断言来源改成 `npm pack --dry-run --json` 的实际文件列表（`spawnSync('npm', ['pack','--dry-run','--json'])`），或至少把 `skills/plugin-kit/.gitignore` 的模式也当反例检查 | **高** |
| 4 | **本轮新引入**：`host-skills/` 内 4 份文档的相对路径会被按 `skills/plugin-kit/` 解析，指向不存在的文件 | `host-skills/cordis-plugin-development/SKILL.md:23,42-50` 写 `references/practices.md`；`skills/plugin-kit/references/practices.md` 不存在；4 份文档 0 条 markdown 链接故测试无法覆盖 | 每份 `host-skills/<name>/SKILL.md` 顶部加一行「本文件内相对路径以本目录为基准」；并在 `SKILL.md:98-105` 的指路表里写明「进入该目录后路径相对该目录」 | **中高** |
| 5 | `README.md:128` 的「纯判据 → 复制 `.dsh/skills/plugin-kit/`」指向已删除路径（现行指令，不是历史） | `README.md:128,132`；`.dsh/` 已不存在（`Test-Path` False） | 改为「复制本包的 `skills/plugin-kit/`」 | **中** |
| 6 | `README.md:153` 写 `test/ 133 条`，实际 189 条（`88+43+38+14+6`），且 CHANGELOG 自己写的是 189 | 实测计数：kernel 88、smoke 43、claims 38、failure 14、mutate 6 → 189；`CHANGELOG.md:206`「测试（189 项）」 | 改 README；并把 `readme-claims.mjs` 的 M3（只校 CHANGELOG）扩到 README 的这条 | **中** |
| 7 | `README.md:180`「`vendor/` 不在范围」+ `host-skills/README.md:47`「`vendor/host-skills/` 不在扫描范围」——搬迁后残留，后者路径是错的 | 两行原文 | 改成「`host-skills/` 不是 `skills/` 的直接子目录，所以不会被当作 skill」 | **中低** |
| 8 | `evidence/skills-v1-history.bundle` **不是被删目录的备份**：里面只有 **1 个 commit**，树里 **11 个文件**，缺 `references/limits.md`、`references/walkthrough.md`（包里都有） | `git clone <bundle>` → `rev-list --count HEAD` = 1；`git ls-tree -r` 列出 11 个，无 limits/walkthrough | 在 CHANGELOG 里把措辞从「保全那棵树」收窄成「保全其已提交历史」；若还想要完整快照，从包内 `skills/plugin-kit/` 反向补一份 | **中低** |
| 9 | 包内源码引用**不存在**的私有文件：`process-lab/INTERFACE-FACTS.md`（`index.js:8`）、`process-lab/MERGE-FACTS.md`（`lib/skill-provider.js:7`、`lib/discipline.js:12`） | 全 DshBundle 搜 `*FACTS*` 无命中；`process-lab/` 无这两个文件 | 删指针或把结论直接写进注释（这几处注释的价值本来就在结论，不在出处） | **低** |
| 10 | `assets/AGENTS.template.md:13` 默认路径写死 `.dsh/skills/plugin-kit/SKILL.md` | 该文件 + L7 逃生口 | 主形态改成插件后，默认改成「由 plugin-kit 插件提供」，把 `.dsh/skills/` 降为例外说明 | **低** |
| 11 | 链接测试正则不剥锚点，`[x](a.md#sec)` 会误红 | `test/skill-provider.test.mjs:300` 的 `/\]\(([^)#][^)]*)\)/g` | 先把 href 按 `#` 截断、再去引号/title，然后 `existsSync` | **低** |
| 12 | `vendor/` 两份 `.mjs` 无版本戳（实际对应 schemastery 3.19.0 / cosmokit 1.9.0） | 与 asar 对比得出；文件头无版本行 | 文件头加来源/版本注释，或加 `vendor/VERSION.json` | **低** |
| 13 | 包根有一个**空**的 `scripts/` 目录（0 文件），是早期 sync 脚本方案的残留 | `(Get-ChildItem -Force scripts).Count` = 0；`git ls-files scripts` 无输出 | 删掉（不进包，纯整洁问题） | **极低** |

---

## 我复核了但结论与自称不符的

先给**核对通过**的部分（自称属实，我把它们从"待查"划掉）：

| 自称 | 我的复核 | 结论 |
|---|---|---|
| `npm test` 88/88 | `tests 88 / pass 88 / fail 0` | ✅ |
| `smoke` 43/43 | `pass 43 / fail 0` | ✅ |
| `readme-claims` 38/38 | `38 / 38 条成立` | ✅ |
| `failure-signals` 14/14 | `14 / 14 条通过` | ✅ |
| `mutate` 6/6 全红 | 6 个 `RED`，无 `GREEN`/`SKIP` | ✅ |
| `npm pack` 66 文件 118.6KB | `66` / `121,467 B` = 118.6 KB | ✅ |
| `host-skills` 35 文件 | 磁盘 35、包里 35（33 副本 + README + VERSION.json） | ✅ |
| 33 份副本与 asar 一致 | `same=33 mismatch=0 missing=0` | ✅ |
| `.dsh/` 已删除 | `Test-Path ...\DshBundle\.dsh` → False | ✅ |
| 「skill-provider 只扫直接子目录」 | 代码 + 实测（nested → `[]`） | ✅ |

**不符 / 需要修正的：**

1. **「这个包被单独下载、装进任何 profile 都能完整工作」——在当前 git 状态下不成立。**
   包**磁盘上**自足（我实证）；但 `host-skills/` 与 bundle 未 tracked，从干净检出构建就丢 35 个文件。自称描述的是工作区事实，不是仓库事实。**必须区分这两者，否则下一次「从仓库发版」就翻车。**

2. **「`lib/skill-provider.js` 补上 `resourceBase`」——修复正确，但「验证结果」里没有一条能证明它。**
   4 套测试对这件事完全无感（删掉全绿）。把这条记成「已完成且受测」是**过度陈述**。正确表述：「已修，未加测试」。

3. **「那条测试改写成：SKILL.md 里提到的每个文件都必须真的在包里」——它查的是工作区，不是包。**
   措辞（README:158、CHANGELOG「改写」段、测试注释）都说「在包里」。实证：`.gitignore` 吞掉的文件 → 测试绿、包缺。**这是说法与实现的偏差，不是实现 bug。**

4. **「`npm pack` 66 文件」是真的，但「66 是这个状态下该有的数」没有守。** 无测试跑 pack（Q5）。下次少 30 个文件也是「66」以外的数字，而红灯不会亮。

5. **「用 `git bundle` 保全了那棵树里的独立提交历史」——历史只有 1 个 commit，且其树缺 2 个现在包内存在的文件（`references/limits.md`、`references/walkthrough.md`）。**
   「保全历史」字面成立；但若读者理解为「那棵树被备份了」，是误解。CHANGELOG:50 的「34.7KB」核对为 35,536 B = 34.7 KB ✅。

6. **`README.md:153`「test/ 133 条」与 CHANGELOG「189 项」自相矛盾**，且 133 无任何测试守（M3 只查 CHANGELOG）。133 在 HEAD 版本里就是错的——**不是本轮引入，是本轮没顺手修**。

7. **`host-skills/README.md:47` 写「`vendor/host-skills/`」——本轮新建的文件里写了一个本轮已经不存在的路径。** 这是搬迁只改了一半的直接证据（另一个半在 `README.md:180`）。

---

## 我不确定的地方

以下都是**推测/未验证**，不要当结论用：

1. **「装进任意 profile 能完整工作」我只验到 L2+。** 我按硬边界没安装、没启动 DSH。我验的是：tarball 解到包外后 `apply()` 用桩 ctx 跑通、日志四行齐全、`listSkills`/`readSkill`/`Config` 正常。**真正的 `ctx.skills.registerProvider` 生命周期、`systemPrompt.section` 挂载、`tools/pre-execute` 真实派发，我没跑。** 结论「能拿到绝对路径」是基于 asar 源码 + 真实返回值的代码级推导，不是真机会话。
2. **发布路径到底是 `npm publish` 还是 `plugin_manager install_bundle target=<本地目录>`，我不确定。** README:47 写的是后者（本地目录），那种方式下 untracked 文件**不会**丢。严重度 #1 的定级建立在前者（或「从 GitHub 克隆后打包」）之上——但 README:221-222 明确指向 GitHub 仓库，所以我按「仓库是发布源」判。
3. **`.dsh/skills/plugin-kit` 被删前，工作区里到底有没有 `limits.md` / `walkthrough.md`，无法确定。** 我只能证明 bundle 里没有。如果被删时那棵树本来也缺这两个文件，那「双树一致性」测试在删除前就已经不成立了——这点我无法回溯（`.dsh` 已删、DshBundle 根不是 git 仓库）。
4. **`host-skills/` 会不会某天被递归扫描，是推测。** 现在不会（已实测）。我按 rank 数值推断「会盖住宿主自带 skill」（550 < 600），但 `collectLayer` 的同名去重逻辑我只读了 `dsh-skill/lib/index.js:312-330`，没有构造真实冲突场景验证。
5. **`app.asar` 的 mtime（2026-11-06 01:08）早于 `VERSION.json` 的 `extractedAt`（2026-11-10 19:35），说明当前副本「不过期」——按 README:178 的规则成立。** 但我不确定「用 mtime 判断副本是否过期」在宿主升级机制下是否可靠（升级可能保留 mtime、也可能不更新 asar 而是换目录）。这是对文档规则本身的怀疑，不是对当前状态的怀疑。
6. **`vendor/schemastery.mjs` 与宿主只差 import 一行**——这是好事（可复核），但也意味着它**不是独立的实现**，而是宿主实现的一份快照。宿主换 schemastery 大版本时，这份快照的语义可能与宿主 `resolveConfig` 期望不一致。我没有能力在不装环境的情况下验证跨版本兼容性。这是「独立性」在语义层的一个理论缺口，不是当前缺陷。
7. **README 的「133 条」是否曾经正确过，我没查。** 只确认它在 HEAD 就已经是 133，而当时实际是 131（kernel 88 + smoke 43）或 189（含 claims/failure/mutate）。两种算法都对不上 133，所以我怀疑它是历史遗留的估数。
