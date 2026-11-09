# `plugin-kit` 自指审计（对《SKILL-LAYERING-DESIGN.md》第八节三处改动的验收）

审计对象：`C:\Users\Administrator\Documents\ProgramFilesCode\DshBundle\.dsh\skills\plugin-kit\` 全部 9 个文件（6 个 md + 1 个 mjs + 2 个 json 资产）
审计判据：只取两处——`references/reviewer.md`（九个动作、4 级证据、输出格式）与 `process-lab/SKILL-LAYERING-DESIGN.md` 第五节原则 + 第八节自查
审计方式：只读。未安装任何 bundle，未写 `$DSH_HOME`，未修改除本文件外的任何文件。内置 skill 从**已安装的 `app.asar`（DSH 0.2.2-rc.1）**按 asar 头解析后只读取出（临时副本在 `%TEMP%`），工作区旧副本 `dsh-agent-preset-skills/` 仅用于比对版本漂移。

**方法学前提（先声明，免得后面被当成结论）**：`DshBundle` 根目录 `git status` 返回 `fatal: not a git repository`（L2，命令输出）。**没有改动前快照，本审计无法核对 diff**，只能核对「改后终态是否满足设计文档的三项要求」。这不是审计偷懒，是 D-6 记的那条缺陷本身。

---

判定：PASS-WITH-CONDITIONS

缺陷：
  D-1 MAJOR 证据 `references/process.md:190,193,196` 对 `references/tools.md:158,5` L3 同一件事两个相反口径：必读的 process.md 仍把 `dsh` 子命令写成定论，tools.md 却说"随宿主版本变化，去内置 skill 或 `dsh --help` 现取"——而这两条 `dsh` 命令在整仓（含内置 4 个 skill、含 `dsh --help` 文案）**只有 process.md 这一处写着**（内置全文扫 `from-default-profile|plugin --profile|dump-config` 仅命中 `SKILL.md:34` 的"打印现有 profile"），所以 tools.md 指向的"现取"没有可用的落点；命令本身我按 CLI 源码验证是**正确**的（`dsh <name>` 展开为 `--profile <name>`，与 `ROADMAP.md:38` 已实测的形式一致），坏的是"新政策 + 旧原文"的并存
  D-2 MINOR 证据 `references/process.md:98`、`SKILL.md:75` 对 9 张卡（`process.md:100,113,127,137,155,168,180,210,224`） L3 声明"共八张卡 / 8 张阶段卡"，实有 9 张（P3.5 运行时验收漏计）；正是铁律 15「计数机检」要防的那类错，本 skill 自己犯
  D-3 MINOR 证据 `references/tools.md:193` 对 `tools.md:197-202`、`scripts/recheck.mjs:85-196` L3 写"五种 `probe.kind`"，表里 6 行、脚本实现 6 种；按"五种"读会漏掉 `none`/`manual` 这条唯一的逃生口
  D-4 MINOR 证据 `references/tools.md:29` 对已安装 `cordis-plugin-development/SKILL.md:28-32` L3 声称该节有"provider 名单、**参数、返回结构**"，实际只有 6 个 provider 名 + `Config.listConfigs` 的 `name`/`entry` 两个参数与 `packageDir` 一个返回字段；`Service.listService`（需 `service`）、`Slots.listSubTree`（需 `root`）、`Event.listEvents`（可省 `event`）的入参一个都没写，Client `Builtin` 整个漏掉——把覆盖面说满了，模型照这话去查会缺参数；且"指到某一节"越出设计第七节「不告诉它「在第几节」」与原则 5「按主题 + skill 名」
  D-5 MINOR 证据 `references/process.md:199` 对同文件 `:206`、本仓 `process-lab/ROADMAP.md:40`、已安装 `dsh-home-paths/lib/index.js:101-110` L3 拆除路径写死 `$env:USERPROFILE\.dsh\profiles\smoke`：项目自己的 ROADMAP 记的清理方式是删 `$DSH_HOME/profiles/<name>`，同文件 7 行后又用 `$DSH_PROFILE_DIR`。`DSH_HOME` 解析优先级是"显式配置 > `$DSH_HOME` > 默认 `~/.dsh`"，指向别处时这行删不到东西也不报错——"一次性 profile 已删除"这条出口判据静默失效，而同一出口里"日常 profile 未被改动"那半仍正常，一半过、一半空真
  D-6 MINOR 证据 仓库根 `git status` → `fatal: not a git repository`（命令输出） L2 本次改动无 diff、无改动前快照，铁律 1「任何已验必须能被第二个人原样跑出来」对这次改动不成立；本报告只能核终态、不能复跑"到底删了哪 18 处、改前是什么样"
  D-7 MINOR 证据 `references/process.md:94`（标注）对 `process.md:92` 与 `tools.md:43`（同一事实两处） L3 标注未记核对时的宿主版本基线（本文核对的是 0.2.2-rc.1）；且同一领域契约在两文件并存、无同步标记，宿主一旦补上这处记载，两处都会退化成"内置没记"的错误断言

放行意见：三处该改的骨架都真实落地（tools.md 的 provider/method 参数确已降级、P1/P2 与 tools.md 指向的是三个真实存在的内置 skill 名、铁律 23 已被标为领域契约且我独立复核为真），但该改 1 只落到 tools.md、process.md 仍留着同一批 `dsh` 子命令并与新 tools.md 互相矛盾，须先补齐这处再放行。

**这些缺陷是谁造成的**（不把既存问题记在本次改动账上，也不因为"不是我改的"就放过）。**归因全部是 L3 推断**——没有 diff 基线（D-6），所以我用两种线索交叉判：一是该行文字与设计第八节「该改 N」描述的**内容对应关系**，二是文件 mtime（`tools.md` 2026-11-09 01:05:16、`process.md` 01:05:39、`SKILL.md` 01:06:01 三个文件被改，`reviewer.md`/`evidence.md`/两个 json/`recheck.mjs` 停在 11-08）。mtime 只能证明"碰过"，不能证明"碰的是哪一行"，因此下表最后一行标为"无法归因"而不是"既存"。

| 缺陷 | 归因（L3 推断） | 依据 |
|---|---|---|
| D-1 | **本次改动造成**（新 tools.md 与未改的 process.md 之间新增了口径冲突） | `tools.md:5,158` 的措辞与该改 1 的描述一一对应；`process.md:188-199` 的 PowerShell 块在改后仍是旧的写法 |
| D-2、D-3 | **无法归因**（大概率既存，但不排除本次顺手改坏） | P3.5 与 `none` 早于本次改动应当就存在，但无基线可证；且 `process.md` 本次确实被改过 |
| D-4 | **本次改动造成**（`tools.md:29` 的"具体到某一节"是新写的指针） | 该行属该改 2 新增内容，与设计第七节「不告诉它「在第几节」」直接冲突 |
| D-5 | **无法归因**（大概率既存） | 一次性 profile 的 PowerShell 块无本次改动痕迹 |
| D-6 | 流程/环境问题，非文档内容 | 无仓库基线 |
| D-7 | **本次改动造成**（标注是该改 3 新增的，且未写版本基线） | `process.md:94` 的引用块属该改 3 新增内容 |

也就是说：**7 条里 3 条（D-1、D-4、D-7）可归到这次改动头上**，且都集中在该改 1 与该改 2 的落笔处；D-1 是唯一达到 MAJOR 的一条，其余 2 条可随 D-1 一起在同一轮改完。

---

## 一、九个动作里，我实际做了哪几个

按 `reviewer.md` 的九条逐一交代，没做的写明为什么：

| 动作 | 做了没 | 怎么做的 / 为什么没做 |
|---|---|---|
| 1 独立复跑 | 做了 | 不采信改动说明。全部结论来自我自己读文件、跑命令：`recheck.mjs --self-test`、`recheck.mjs` 对样例清单、`cordis_inspect_list`、`cordis_inspect_query`（Host 三个 provider）、asar 头解析取内置 skill、`git status`、PATH/环境探针、机器计数 |
| 2 空真排除 | 做了 | 重点查"指向"是不是空指针：三个 skill 名是否真在本次会话目录里、`skill` 工具能否真加载、`Knowledge sources, in order` 一节是否真有它承诺的内容。见第三节 |
| 3 接线可达性 | 做了 | 本改动的"接线"= 指针能否走到真东西。三条指针全部实测可达（其中一条我直接 `skill` 加载了正文）；模板里的相对链接 100% 解析通过（脚本化扫了 6 个 md 的全部 12 个 `[]()`） |
| 4 验收分类复核 | 做了 | 拒绝把"读不到页面"当兜底：客户端结论全部压到 L3 并写明，没有一条升格 |
| 5 计数机检 | 做了 | 23 条铁律（正则计数，1–23 连续无缺）、9 张阶段卡（`^### P` 计数）、6 种 `probe.kind`（表行数 + 脚本分支数）、12 个 markdown 相对链接全解析。**两处对不上，见 D-2、D-3** |
| 6 防漂移测试核查 | 做了 | `recheck.mjs --self-test` 的 fixture 是脚本自带的常量——**这在本脚本是合法的**（它测的是"判定逻辑会不会红"，不是"被测源码常量有没有漂"），铁律 16 不适用。但要看"它真会红"：实跑，3 条反例全部按预期变红，exit 0 |
| 7 打包真加载 | **不适用** | 本次改动不产包、不改 `package.json`、不改 `files`。铁律 17 的触发条件不存在；不拿"没做"冒充"通过" |
| 8 缺陷清单时效 | 不适用 | 无上一轮缺陷清单 |
| 9 行为复现优先 | 做了（能做的部分） | 能跑的都跑了（见动作 1）；文档类断言只能 L3，已标注 |

---

## 二、逐条核对：三处该改到底落地没有

### 该改 1（`tools.md` 命令参数降级）——**在 tools.md 里落地，在 process.md 里没落地**

正则扫全仓 `install_bundle|approvedBuilds|list_plugins|action:|app\.asar|dsh-agent-preset` → **0 命中**。也就是说设计文档点名的"`plugin_manager` 的调用形式"确实删干净了，且没有反向引入内置 skill 的文件路径（原则 5 的"不允许"一栏守住了）。

`cordis_inspect_query` 仍出现 8 次（tools.md 3、reviewer.md 1、AGENTS.template 1、host-snapshot 样例 2、recheck.mjs 注释 1），但**全是工具名，不是 provider/method 参数**——按要检查的是"硬编码参数"而不是"提到工具名"，这些不算违规。`plugin_manager` 只剩 `tools.md:143` 一处，且就写在"怎么装：见内置 skill `cordis-plugin-development`"这句话里。

**但 `tools.md` 里还剩 1 处会随宿主升级失效的硬编码**：`:43` 的 `Config.listConfigs` 返回 `id` 是 `include:<patchId>`、`entry.options.id` 是裸 `patchId`。这处**按该改 3 是应当保留的**（领域契约，内置没记），且它自己带标注"（这是领域契约，内置未记载，所以留在本 skill 与铁律）"。所以答案是：**有 1 处，且是设计明确要求保留的那一处**，不是漏网。

真正的漏网在 `process.md`：`:189-199` 的 PowerShell 块原样保留 `dsh smoke --from-default-profile web --dump-config`、`dsh plugin --profile smoke add`、`dsh smoke`、`Remove-Item ...\profiles\smoke`。设计第八节把该改 1 的字面范围限定在 `references/tools.md`，所以这不算越过任务书；但它造成一个**任务书没预料到的后果**——`tools.md:158` 现在说"具体命令随宿主版本变化，去内置 skill 或 `dsh --help` 现取"，而必读的 `process.md` 在同一段 10 行内（`:190-199`）就把这些命令当定论列了出来，且**在 `plugin-kit` 这个 skill 产物内再没有第二处写它们**（`process-lab/ROADMAP.md:38-40` 有，但那是 roadmap 记录、不是 skill 会加载的东西；内置 4 个 skill 全文没有）。两文件口径相反，见 D-1。

**顺带替这批命令做了正确性验证**（因为我判它"不该被写成定论"，得先证明它本身对不对，否则可能是在替一条错的命令争辩）：`@deepseek-ai/dsh/lib/bin.js:129` 把首 token 非 `-` 且非 `plugin` 的写法展开成 `["--profile", ...argv]`，所以 `dsh smoke ...` ≡ `dsh --profile smoke ...`；`--from-default-profile` 只能配**自定义** profile 名（`profile-boot-e2mS45fC.js:149-155` 对同名 shipped 模板直接抛错），`smoke` 合法；`--dump-config` 与 `--from-default-profile` 组合后走 `resolveBoot` 的 dump 分支、不启动（`bin.js:77-91`、`dump-config-D97dwXdd.js:24-25`）。结论：**命令内容是对的（L3），坏的是"新政策 + 旧原文"的并存**。

**按设计自己的度量复算**（design `:249` 写"18 处具体参数：`cordis_inspect_query` 9、`plugin_manager` 3、`dsh` 6"；我按同口径机数改后终态）。**这张表是终态快照，不是 diff**——没有改动前快照（D-6），"真删掉的"一列是"设计记的基线 − 现在实测"的减法，前提是设计记的基线准确，而那本身也是 L4 自述：

| 被点名的对象 | 设计说的现状 | 改后实测 | 真删掉的 |
|---|---|---|---|
| `cordis_inspect_query` | 9 | **8**（tools.md 3、reviewer.md 1、AGENTS.template 1、host-snapshot 样例 2、recheck.mjs 注释 1） | 1 |
| `plugin_manager` | 3 | **1**（tools.md:143，且就写在"见内置 skill"这句里） | 2 |
| `dsh` 子命令 | 6 | **3**（全部在 process.md:190/193/196） | 3 |
| 合计 | 18 | **12** | 6 |

数字说明两件事：一是**该改 1 只完成了三分之一**（按设计自己的度量），二是**残留下来的 8 处 `cordis_inspect_query` 全是工具名、不含 provider/method 参数**，按"会不会随宿主升级失效"这个**目的**判并不违规。度量与目的在这里分叉——我没有拿"完成了 6/18"当缺陷，因为设计第八节的改法是"降级为『这个阶段需要探测宿主能力，用 inspect 系列现取』"，目的达成了；但这条分叉本身值得记：**下次要判断这类改动完成没完成，数处数会得出错误结论**。

### 该改 2（补主题指向）——**落地，且指向的是真名字**

| 落点 | 行 | 指向 | 我核实了什么 |
|---|---|---|---|
| P1 卡 | `process.md:125` | `cordis-plugin-development`（形态判断/扩展点）、`editing-cordis-compositions`（Host 还是 preset）、`cordis-composition-reference`（可装包清单） | 三条都对：`practices.md:10`「Extension points are shared; use the weakest mechanism that suffices」；`editing-cordis-compositions/SKILL.md:76-80`「Choose plugin placement」；`cordis-composition-reference/SKILL.md:27-29`「Installable plugin packages → references/packages.md」。L3 |
| P2 卡 | `process.md:153` | `cordis-plugin-development`（形态/扩展点/Host 半与浏览器半/UI 规则/MCP/配置持久化）、`cordis-composition-reference`（patch）、`editing-cordis-compositions`（preset） | 六项逐一对到已安装文件：`host-plugin.md`（Host 半、manifest、install）、`ui-plugin.md`（浏览器半）、`practices.md:31-38`（UI 规则）、`mcp-bundle.md`（MCP）、`host-plugin.md:66-77` §Persist your own configuration（配置持久化）。L3 |
| tools.md | `:9` 新增「技术细节见」列 + `:29,143,158` 三处正文指针 | 同上 | 列覆盖 P1/P1.5/P4 三行；`:143` 安装、`:158` 运行时命令两处降级都指向内置或 `dsh --help` |

**指向的是 skill 名，不是文件路径**——这一点我用正则确认过：全仓 0 处 `app.asar`、0 处 `dsh-agent-preset/...`、0 处 `references/host-plugin.md`。唯一越界的是 `tools.md:29` 指到了**章节名**，见 D-4。

**版本漂移已复核**（用户提示"注意那是旧副本"，确实有必要）：工作区副本 `cordis-plugin-development/references/host-plugin.md` 是 5300 B，已安装版 6883 B；差的正是 §Persist your own configuration（`host-plugin.md:66-77`）。也就是说 design 第七节"配置持久化 → `cordis-plugin-development`"这一行**只对已安装版成立，对 11-04 旧副本不成立**。本次指向按已安装版判为准确（L3），但任何拿旧副本核这份 skill 的人都会核出"指空"。这条不记缺陷（指向本身对），记进第六节边界。

### 该改 3（标出铁律 23）——**标注清晰，且断言为真**

`process.md:94` 用独立引用块写明：第 23 条是**领域契约知识**（宿主的一条事实），本该归内置但内置没记载，前 22 条说流程、第 23 条说坑，后者会随宿主升级变化。

三件事我独立核过：

1. **"内置没有记载"为真**（L3）。把已安装的 4 个内置 skill **全部 33 个文件**（`cordis-plugin-development` 27、`cordis-composition-reference` 2、`editing-cordis-compositions` 1、`agent-experience` 1；含模板与 locale，不含各自 `package.json`）逐个全文扫 `patchId|include:|options\.id` → **0 命中**。工作区旧副本（13 个文件）同样 0 命中。
2. **这处二元性真实存在**（L2，真机调用）。`cordis_inspect_query` Host `Config.listConfigs` 返回 `{"id":"include:plugin-manager","patchId":"plugin-manager",...}`——同一分录里两个字段并存，正是铁律 23 描述的形状。
3. **契约值确实是裸 patchId**（L3）。`cordis-plugin-loader/lib/index.js:85-99,195,244,308-309,458` 一路用 `options.id` 做行坐标与树存储键，`entry.options.id` 就是裸 id。

结论：标注不仅写得清楚，而且它保护的那条知识是**真的、且确实只有这一处记着**。这是本次改动里质量最高的一处。

---

## 三、四个指定问题

### 1. 改动有没有让 skill 变得不可用？

**没有。** 具体核实（不是"看起来没坏"）：

- **路径**：脚本化解析 6 个 md 里全部 12 个 markdown 相对链接 → **0 断链**。
- **内置 skill 名**：`cordis-plugin-development`、`editing-cordis-compositions`、`cordis-composition-reference` 三个名字**全部出现在本会话的可用 skill 目录里**（L2：本会话真实注入的目录）；且我不止看名字，**真的用 `skill` 工具加载了 `cordis-plugin-development`**，正文 50 行完整返回（L2 行为）。指针不是空指针。
- **阶段卡逻辑完整**：9 张卡逐张检查，`入口/产物/出口` **9/9 全在**；P1、P2 两张另加 `技术细节见`。三栏结构没被改动破坏。
- **skill 入口自洽**：`SKILL.md:77` 对 tools.md 的新描述（"每个阶段用什么检查、判据是什么、技术细节该去哪个内置 skill 找"）与改后 tools.md 一致。

### 2. 降级是否过度？——**工具层没过，指针层过了一点点**

没过度的证据（这些是"还知道该做什么"的部分，全部保留）：

- `tools.md:31-38`「查完必须产出」表：服务方法→方法签名、事件→事件名+mode+签名、插槽→key+kind+注册项+props、Config→字段与类型。**这是降级后真正的替代品**——它把"查"落成了"必须产出什么"，不是"去查一下"。
- `tools.md:40-43`「两个坑」：客户端探测会超时、显示 id ≠ 契约 id。两条都与宿主版本无关，长期有效。
- `tools.md:145` 安装判据："安装结果必须给出明确的『是否生效』字段，日志、进程列表、boot payload 都不能替代它"——判据留下，用法移走，这个切分是对的。
- `tools.md:147-164` P3.5：建/装/验/拆 四步方法论 + 三条判据（依赖清单出现该包、看 Host 日志不看浏览器控制台、`$DSH_PROFILE_DIR` 跑前跑后哈希比对）**全部保留**。

过度的证据（**一处**）：`tools.md:158` 说"去内置 skill 或 `dsh --help` 现取"。我按这句话真的去取了：
- 内置 4 个 skill 全文正则扫 `from-default-profile|plugin --profile|dsh plugin|dump-config|create a profile|new profile|profile template` → 内置 skill 里**没有任何一处讲怎么建一次性 profile**；唯一沾边的是 `cordis-plugin-development/SKILL.md:34` 的 `dsh --profile "$DSH_PROFILE" --dump-config`（那是打印**现有** profile，不是建新的）。L3。
- `dsh --help` 层面：从 `@deepseek-ai/dsh/lib/bin.js:39-49,105` 解出，帮助里只有 `dsh rescue --from-default-profile web`（模板文案是"recreate … **then boot it**"），没有任何"只创建不启动"的写法；`--dump-config` 与 `--from-default-profile` 能组合、且组合后确实不启动（`dump-config-D97dwXdd.js:24-25` → `prepareProfile(profile, !defaultOnly, fromDefaultProfile)`；`profile-boot-e2mS45fC.js:217-218`），但**这个组合只能从源码读出来，`--help` 不教**。

所以那一句"现取"在本机是**半空头支票**。它没有让 skill 不可用——因为 `process.md:189-199` 里命令还在（这也是 D-1 的另一面：漏改反而成了兜底，但兜底与一句话政策互相打脸）。判：不单独记 BLOCKER，并入 D-1。

另外 `tools.md:158` 也漏了两条会直接造成误操作的硬约束（L3，源码）：`--from-default-profile` 是**替换**——`initializeProfileFromDefault` 先把现有目录 `rename` 成 `previous` 再换新的（`profile-boot-e2mS45fC.js:156-183`），对已存在的 profile 跑一次就等于抹掉；且目标名不能与 shipped 模板同名（`:154-155` 直接抛错）。这两条 `--help` 里没有（帮助只写"replace a custom profile with a fresh copy of a shipped profile template"），照 `tools.md:158` 的"现取"取不到。

同时我把"顺序"也验了一遍，因为这三条命令有先后依赖：`dsh smoke --from-default-profile web --dump-config` 造出 smoke（web 模板）→ `dsh plugin --profile smoke add <pkg>` 装包（`plugin-DscIHF4k.js:42`：profile 已存在就不再初始化，所以这一步不会把上一步的模板冲掉）→ `dsh smoke` 启动。**反过来的顺序会出错**：先跑 `dsh plugin --profile smoke add`，`plugin-DscIHF4k.js:42` 会用 `DEFAULT_PROFILE_BUNDLES`（**不是** web 模板）初始化，语义就变了；而单独跑 `dsh smoke` 会直接抛 `profile "smoke" does not exist; create it with 'dsh plugin --profile smoke add <package>'`（`app-boot/lib/index.js:1848-1851`）。`process.md:188-199` 的顺序是对的，但它没写"为什么必须是这个顺序"——这恰好是降级后最该留下的那类知识。

### 3. 主题指向是否准确？——**准，且我按已安装版逐条点到了文件**

用户点名的三个主题，逐个到 `app.asar` 里核（L3）：

| 主题 | `cordis-plugin-development` 真的覆盖了吗 | 出处 |
|---|---|---|
| 插件形态判断 | 是。Host-only / 配置型 / UI 型 / MCP 型四种形态各有专文 | `host-plugin.md:1-83`（bundle 与 Host 插件）、`ui-plugin.md`、`mcp-bundle.md` |
| 扩展点选择 | 是，而且给了强弱序 | `practices.md:10`「From weakest to strongest: `ctx.tools.restrict()` → `ctx.tools.guard()` → waterfall → `system-prompt/assemble`」 |
| 配置持久化 | 是（**仅已安装版**） | `host-plugin.md:66-77` §Persist your own configuration：`ctx.fiber.entry` + `ctx.get('configEditor')` + `.volatile()` + 密钥走 `ctx.credentials.modifyRecord()` |

另两条顺带核了，因为 P1 卡把它们分别指给了别的 skill，指对了才不算拆台：
- "该放 Host 还是 preset" → `editing-cordis-compositions/SKILL.md:76-80`「Choose plugin placement」：Host 提供共享服务，preset 提供有作用域的工具/人格/策略，preset 提供 service 必须同 realm 隔离。**指对了，而且这是 P1 阶段最早的那个分叉。**
- "可装包清单" → `cordis-composition-reference/SKILL.md:27-29` + `references/packages.md`（43771 B）。**指对了。**

一处过度声明：`tools.md:29` 说那一节有"provider 名单、参数、返回结构"。我逐字读了那一节（已安装版 `SKILL.md:28-32`），实际内容是：6 个 provider 名（`Service`、`Event`、`Config`、`Tool`、`Slots`、`Theme`）+ `Config.listConfigs` 的 `name`/`entry` 两个参数 + `packageDir` 一个返回字段。对不上三处：`Service.listService` 需要 `service`、`Slots.listSubTree` 需要 `root`、`Event.listEvents` 可省 `event`——这三个入参**一个都没写**；Client `Builtin` provider **整个没提**；除 `Config` 外没有别的方法签名（`listService`、`listEvents`、`listSubTree`、`listTokens`、`listBuiltins` 都不在文里）。我实测的 provider 清单是 Host `Service/Event/Config/Tool` + Client `Service/Event/Builtin/Slots/Theme`，共 9 个（`cordis_inspect_list`，L2）。所以那句话把覆盖面说满了——模型照它去查，会以为不用读参数就直接调。

### 4. 自指检查：这次改动符不符合自己的 23 条铁律？

| 铁律 | 符合？ | 依据 |
|---|---|---|
| 1 可复跑 | **不符** | 没有 diff/基线，见 D-6。我这份审计能复跑，但"改动本身"复跑不了 |
| 5 断言必须有出处 | 部分 | 指向内置的断言在产物里**没带出处**；但设计原则 5 明确允许"按主题 + skill 名"的粗指针，若强制加 `文件:行` 会把 §7 刻意去掉的原文级指针又装回来。我按设计判不违规，只把"D-4 那一处越界声明"记缺陷 |
| 6 证据工具自检 | **符合** | `recheck.mjs --self-test` 我独立跑过：3 条反例（删方法/改 mode/删事件）全红、基线全绿、exit 0。工具不是空转的 |
| 13 接线可达性 | **符合** | "模块存在 ≠ 产品在用"的对应物是"skill 名存在 ≠ 指得到"。三个名字全部实测可达，其中一个我加载了正文。没有只在目录里、正文指空的情况 |
| 15 计数机检 | **不符 ×2** | 8 张卡 vs 9 张（D-2）；五种 kind vs 6 种（D-3）。这两条铁律的存在理由就是"声称 3+17+1=21，实际 20 条"，现在轮到 skill 自己 |
| 16 防漂移测试不带常量 | 不适用 | 本 skill 唯一的测试是 `recheck.mjs` 的自检 fixture，它测判定逻辑，常量自带给合法 |
| 17 打包后必须真加载 | 不适用 | 不产包（用户已说明不涉及） |
| 8 证据口径 | 符合 | 本报告全部结论落到 `文件:行` 或命令+输出，没有一条靠"我觉得" |
| 3 三态 / L3 不冒充 | 符合（本报告） | 客户端 `Slots.listSubTree` 实测 10s 超时，所有客户端相关结论压在 L3，未写成"已验" |

---

## 四、我核实了什么，才敢判"三处该改的骨架是真的"

不是"读了一遍觉得对"，逐项列证据与等级：

1. **参数确实降级了**（L2/L3）：全仓正则扫 `install_bundle|approvedBuilds|list_plugins|action:|app.asar|dsh-agent-preset` → 0 命中。唯一残留的宿主契约是 `tools.md:43` 那处**被设计点名保留**的领域契约。
2. **指针指向真名字**（L2）：三个 skill 名在本会话注入的目录里可见；`skill('cordis-plugin-development')` 真加载成功，返回正文含 `Knowledge sources, in order`、§Persist、§Install 三处被指向的内容。
3. **覆盖判断为真**（L3）：已安装 0.2.2-rc.1 的 `host-plugin.md:66-77`（配置持久化）、`practices.md:10`（扩展点强弱序）、`editing-cordis-compositions/SKILL.md:76-80`（Host vs preset）、`cordis-composition-reference/SKILL.md:27-29`（可装包清单）逐处对上。
4. **铁律 23 为真且上游未记载**（L2 + L3）：真机 `Config.listConfigs` 同时返回 `id` 与 `patchId`；内置全部文件扫 `patchId|include:|options.id` → 0 命中；Loader 源码用 `options.id` 做行坐标。
5. **阶段卡没被改坏**（L3，脚本化）：9 张卡 × 3 栏 = 27 个栏目全在，P1/P2 各多一段 `技术细节见`。
6. **链接没断**（L3，脚本化）：6 个 md、12 个相对链接（`SKILL.md` 11、`tools.md` 1）、0 断链。
7. **唯一的可执行资产没被改坏**（L2）：`recheck.mjs --self-test` exit 0；再用随附样例清单跑真实判定 exit 1，四态分布正常（2 OK / 1 MISSING / 1 UNVERIFIABLE）。那条 MISSING 是 `pkg.files` 在我的工作目录下找不到 `package.json`——样例的 `probe.file` 是相对路径，相对的是**运行目录**，所以这既不是脚本缺陷也不是样例写错，而是"跑之前要 cd 到被测项目"这条隐含前提没写在 `tools.md:113-139` 里（不单列缺陷：`--scan-dir` 也依赖同一前提，属同一处可补的说明）。
8. **本机 `dsh` 不在 PATH**（L2）：`Get-Command dsh` 未命中，`PATH` 里无 DeepSeek 项，可执行体只在 `resources/runtime/cli/bin/dsh.cmd`。这既是 D-1 的影响放大器，也反证了设计"命令参数会随环境失效"的判断是对的。

---

## 五、证据等级与不可判定项

| 等级 | 本报告里的用途 |
|---|---|
| L1 | **无。** 没有一条结论来自真实安装环境下的运行观察（本轮约束：不安装） |
| L2 | `cordis_inspect_list` / `cordis_inspect_query`（Host）真机返回；`skill` 工具真加载内置 skill；`recheck.mjs` 实跑；`git status`、PATH 探针、`node --version` |
| L3 | 全部文件内容类结论（行号引用）、asar 内源码与内置 skill 正文、Loader 与 CLI 源码 |
| L4 | **未使用。** 改动说明、design 文档的自述只当检索线索，未作为任何结论的依据 |

**不可判定（不写成"通过"）**：

- **Client 侧一切结论停在 L3**。`cordis_inspect_query` client `Slots.listSubTree` 实测 `timed out after 10000ms`。因此"client 探测会超时"这一条（`tools.md:42`）我既不能证实也不能证伪到 L1/L2，只能引 `tools.md` 自己的事故记录 + 本次实测超时作为旁证。
- **`dsh --help` 的真实输出未取**：本机 `dsh` 不在 PATH，取帮助要走 `resources/runtime/cli/bin/dsh.cmd`；我用读 `@deepseek-ai/dsh/lib/bin.js` 源码（L3）替代，未真跑 CLI（真跑要 boot profile，越出"只读、不碰 `$DSH_HOME`"的约束）。所以"帮助里到底显示哪些示例"是**按源码重建**的，不是抄屏。
- **`tools.md:158` 的"现取"路径能否在别的部署里走通**：我只能证明"本机内置 skill 没写、`--help` 不教、本机 `dsh` 不在 PATH"，不能证明"所有部署都取不到"。
- **三处改动的 diff 不可判定**：无 VCS 基线（D-6）。第二节的"该改 1 只完成三分之一"是按 design `:249` 的口径机数出来的终态对比，不是 diff；第一节归因表里标"本次改动造成"的三条，依据是内容对应关系 + mtime，**属推断**。

---

## 六、审计边界

- 只读。未安装任何 bundle、未启动 profile、未改 `$DSH_HOME` 下任何文件；只读过 `~/.dsh/profiles` 的**目录名列表**与若干 `DSH_*` 环境变量。
- 未跑 `npm pack`、未跑任何项目的 `node --test`：本次改动不产包、无测试目标。
- 内置 skill 取自已安装 `app.asar`（只读解析，临时副本在 `%TEMP%`）；工作区副本 `dsh-agent-preset-skills/` 只用于确认版本漂移（`host-plugin.md` 5300 vs 6883 B，差异即 §Persist）。
- 无 VCS 基线，**不能证明**这三处改动之外没有别的改动；本报告判的是"终态满足不满足设计第八节"，不是"diff 干净不干净"。
- **报告没有为"该怎么改"给补丁**。放行意见只指到该修的段落（`process.md:188-199` 与 `tools.md:158` 二者取一），不代写改法——按 `reviewer.md`「不写代码、不替写的人补产物」。
- 本文件是唯一写入。

---

## 七、给下一轮的最小动作（不是补丁，是范围）

按 reviewer.md「返工（最小集合 N 条）」的形式给，只列要动的段落和必须满足的判据，不写具体措辞：

1. **`process.md:188-199` 与 `tools.md:158` 二选一**（D-1）。我倾向"命令留 process.md、删掉或改写 tools.md:158 那句"，理由是：`tools.md:5` 自己声明"这一篇只写判据"，把命令搬进来会与它自己的分工冲突；而 process.md 是必读的阶段规格，命令＋顺序依赖放这里最不容易被漏掉。若反向选择（命令搬进 tools.md），则必须同时改 `tools.md:5` 的分工声明。**判据**：改完后 `plugin-kit` 内搜 `from-default-profile`，必须只在**一个**文件里出现，且出现处同时写明"替换语义（会覆盖同名已有 profile）"和"必须在 `dsh plugin --profile add` 之前跑"这两条依赖。
2. **`process.md:98` 与 `SKILL.md:75`**（D-2）：把"八张卡/8 张阶段卡"改成机数得出的数，并把 P3.5 纳入。**判据**：`^### P` 计数 == 文中声明的数。
3. **`tools.md:193`**（D-3）：把"五种"改成与表行数、与 `recheck.mjs` 分支数一致。**判据**：三处数量相等。
4. **`tools.md:29`**（D-4）：删掉"参数、返回结构"这半句，或改成"provider 名单"；同时把"「Knowledge sources, in order」一节"降级为 skill 名（设计第七节的要求）。**判据**：该行不含章节名，且不再承诺内置承诺不了的内容。
5. **`process.md:199`**（D-5）：清理路径改用与 `:206` 同源的变量。**判据**：该行不含 `$env:USERPROFILE`。
6. **`process.md:94`**（D-7）：补一句核对时的宿主版本。**判据**：标注里出现具体版本号。

D-6（无基线）不是文档能修的，是流程要修的：下一轮改动前先把 `plugin-kit` 纳入版本控制或留一份快照。
