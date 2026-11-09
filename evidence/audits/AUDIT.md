# AUDIT — dsh-plugin-process-lab

> 审计者立场：第一次接触，只读。未安装任何 bundle，未碰 `$DSH_HOME`，除本文件外未改任何文件。
> 审计对象：工作目录（git `v1.0.0`，180 个跟踪文件；另有未跟踪的 `OUTLINE.md`）。
> 审计时间：2026-11-08。
> 证据口径：`文件:行` 以当前工作区为准；命令均在本机实跑；凡不能从仓库复现的，直接写「无法验证」，不猜。

---

## 裁决

**部分可用。**

一句话理由：**作为「已经会写 DSH 插件的人」的阶段门/审查清单，它可用且有真实价值；作为「另一个开发者从零照着做」的交付物，它不可用——没有可安装的最小样板、没有宿主契约的入门路径、没有版本基线，关键证据又停在报告里、无法从仓库复跑。**

---

## 一、五个问题的直接回答

### 1. 能不能用：一个没参与过的人，照着这些文件，能不能真的开发一个 DSH 插件？

**不能从零开发；能拿来当「已经会写插件的人」的审查清单。**

卡点按阶段排：

| 阶段 | 卡在哪 | 证据 |
|---|---|---|
| P0/P1 | 没有宿主契约的入门路径。规格要求「关于宿主的断言必须带出处」，但只说了用 inspect；而同一套文档承认客户端 inspect 累计 10+ 次超时。替代路径是读 `app.asar`，但读法只散落在 `impl/round2-draft-studio/probe-tools/*.ps1`，主文档没有教程。 | `spec/process-v4.md:13`；`README.md:58`；`impl/round2-draft-studio/probe-tools/asar-grep.ps1:16`（默认路径写死本机） |
| P1 | 现行规格 `process-v4.md` 的「阶段卡」只有「出口判据（增补项）」，没有入口/产物；完整的入口/产物/出口在旧的 `process-v3.md`。主 README 却把 v4 说成「23 条铁律 + P0–P5 阶段卡」。 | `README.md:21`；`spec/process-v4.md:44-53`；`spec/process-v3.md:23-74` |
| P2 | 没有安全的最小骨架。三个 `impl/*/bundle*` 都被 README 警告不要装；R1 的 README 自己说设置页、提示词接线、宿主写都没实现；R3 的 bundle 顶层没有 README。新人只能从这些半成品反推 `package.json`、`cordis.patch.yml`、slot、inject、Config schema。 | `README.md:49-53`；`impl/round1-enhance/bundle/README.md:9-13`；`impl/round3-teammate-picker/bundle/`（仅 5 个顶层文件，无 README） |
| P4 | 主文档没有给出可照抄的安装/验收命令。安装命令只在 R1 的 bundle README 和 R2 的交付文档里；P4 的「npm pack 后真加载」是判据，不是操作步骤。 | `impl/round1-enhance/bundle/README.md:35-44`；`spec/process-v4.md:52` |

**能用的一部分**：如果你已经知道 DSH 插件长什么样，这套「每道门开独立审查员 + 三态 + 证据等级 + 红绿证明」的清单确实能逼出东西。三轮里审查员抓到的真实缺陷（身份段名、假成功、没接线、防漂移测试造假、D-02 数据丢失）不是编的，报告里有可核对的行号链。

**结论**：它是一份「审查方法」，不是一份「开发入门」。把它交给一个没写过 DSH 插件的人，他会在 P0/P1 的宿主契约和 P2 的骨架两处停住。

### 2. 自洽吗：有没有互相矛盾、重复、说过又改口、版本混乱？

**大方向自洽，细节多处互相打架，而且有一处「说过又改口」正好落在核心事故上。**

最严重的几处：

- `out/README.md` 还在指 `spec/process-v3.md`（12 条铁律），并说第 2、3 轮「只跑到 P0/P1」；主 `README.md` 指 v4（23 条），说 R2/R3 都到 P3b。两份「怎么用」直接冲突。
- `FINAL-REPORT.md:14` 写「64 条卡点台账」，`README.md:25` 和台账实际是 67 条。
- `FINAL-REPORT.md:23` 说 R2「终验放行（C1–C9）」，`:63` 又说「终验结果待定」；`out/three-rounds-evidence.md:68` 也写「终验待定」。
- `out/three-rounds-evidence.md:3` 说「在四种条件下跑」，下面只列了三种（R1/R2/R3）。
- `spec/reviewer.md` 的固定输出格式只有 `PASS / FAIL / UNDECIDABLE`，但实际报告用的是 `GO-WITH-CONDITIONS`、`带条件可进 P4`、`不可进 P4 交付`——最常见的「带条件通过」在格式里没有位置。
- 台账 #59 说 D-02/D-03「在 P2 后期已被自然修好」；`11-reverification.md:23` 说「仍然复现，与『修复轮开始前就已修好』的前提不符」；`spec/process-v4.md:38` 说负责人「误判已修好（实际没修好）」。三份文档讲的是同一件事，结论相反。

### 3. 证据站得住吗：每条卡点能不能指回具体文件或命令输出？有没有夸大、无法复现的断言？

**终态可复跑；中间态和关键事故不可复跑；台账里有一部分条目无法从仓库验证。**

站得住的部分（我实际抽查）：

| 台账条目 | 指向 | 核对结果 |
|---|---|---|
| #10 身份段名/假成功/description | `05-verification.md` §四 | 属实：1 BLOCKER + 3 MAJOR，行号能对上当时的报告 |
| #17 138→153 | `06-fix-report.md` §4 | 属实：报告写 153/153，修复前 138 |
| #21 打包 27 文件、三方向差集 | `08-delivery.md` §一 | 属实：27 = 26 + `package.json`，差集为空 |
| #22 旧状态迁移死锁 | `08-delivery.md` §2.6 | 属实：`degraded` + `version-conflict`，有命令输出 |
| #44/#46 座位被占、插件路由无鉴权 | `06-p1.5-probes.md` §2/§4 | 属实：`include:dsh-draft-studio`、200/401/404 对照都有 |
| #47/#49/#50 R3 的 B-1、npm test、files[] | `08-verification.md` B-1/m-1/M-3 | 属实：81/81 下的 2 BLOCKER，行号链完整 |
| #52/#53 3+17+1=21、常量漂移 | `09-verification.md` §2.2/§3.2 | 属实：实列 20、正确分母 25；MUT5/6/8 全绿 |
| #56 B-2 两个根因 | `10-fix-report.md` §1.2 + `11-lead-decision-v3.md` | 属实：guard + junction realpath，有安装形态实测 |
| #65/#67 R2 终验/R-1 | `14-final-verification.md` §4/§5 | 属实：C1–C9、R-1 机制与源码行号都有 |

站不住/无法验证的部分：

| 台账条目 | 问题 |
|---|---|
| #4 | 证据写「子代理收尾原话」，但原话不在仓库里；`01-analysis.md` 只有 R2 风险，没有那句「最后悔的决定」。**无法验证原话。** |
| #8、#11 | 都写「观察者复探 `Slots.listSubTree` 成功」，但仓库里没有这次复探的输出；`05-verification.md:95` 反而说验证者 5 次全超时。**无法验证复探成功。** |
| #14 | 证据是「观察者决定」，没有文件/命令。**无法验证。** |
| #57 | 证据是 `2f99c01a` 这个会话 id 的「收尾报告」——不是仓库文件；R3 P3b 后没有独立的终验文档。**无法验证。** |
| #58 | 证据是「12:39–13:03 并发写入时间线」，仓库里没有这条时间线。**无法验证。** |
| #62 | 证据是「文件 size 变 0，已重建」，只有结果（`process-v4.md` 现在 6381 字节），没有截断前后的记录。**无法验证事故本身。** |
| #51、#54、#59 | 引用的行号已失效：`ledger:76` 引 `client.js:74/120/187`，当前 `:74` 是 `@module lib/prompt`、`:120` 是设置注释、`:187` 是代码；`ledger:79` 引 `host.js:545`，当前是 `});`；`ledger:86` 引 `host.js:116-141/740-753`，当前 116-141 是 D-02 注释/`mergePatch`，740-753 是 `dump-draft`。**按当前文件复跑会对不上。** |

更要命的是「可复跑」这条铁律本身没有被证据遵守：

- `spec/process-v4.md:9` 要求「第二个人用你留下的命令原样跑出来」。
- 但 R1 的 13 个独立探针「脚本已删」（`05-verification.md:61`），报告只给「输出原文，截取关键行」，没给完整命令；附录还写「未留在工作区」（`:236`）。
- R1 复审的 24 个探针在 `%TEMP%\dsh-reverify\`（`07-reverify.md:220`）。
- R2 终验的探针在 `%TEMP%\final-verify\`（`14-final-verification.md:363-369`），P3 的探针在 `%TEMP%\p3-probes\`（`09-verification.md:456-457`）。
- git 只有 2 个提交（`095ca45`、`37e8ee6`）和一个 `v1.0.0` 标签，没有按轮/按门打标签，也没有中间态快照。

所以：**终态的 `node --test`、`npm pack`、`mutate.mjs`、`recheck.mjs --self-test` 能复跑；但「修复前是红的」「当时真的没接线」「当时 inspect 真的超时」这些支撑 23 条铁律的关键事实，只能信报告。** 这不是说报告在撒谎——恰恰相反，报告写得很细；问题是细报告不能替代可复跑的证据，尤其当它自己的第一条铁律就是「可复跑」。

另外，三轮不是对照实验：R1 也有「观察者人工强制」的阶段门（`out/three-rounds-evidence.md:13`），三位实现者不同（`:60`），三个插件难度不同，每格 n=1。它支持「这套做法在三个案例中能跑」，不支持「23 条铁律导致了 8→1→2 的改善」。报告里的「不是设计出来的，是跑出来的」（`FINAL-REPORT.md:4`）作为案例陈述是诚实的，但表格的数字容易被读成因果。

### 4. 结构合理吗：哪些该合并、该拆、该删？哪些是历史包袱？

**有明显的历史包袱和重复；作者自己的 `OUTLINE.md` 已经列出了 7 项待归档/合并，说明问题已经被意识到，只是还没做。**

| 文件/目录 | 现状 | 建议 |
|---|---|---|
| `out/README.md` | 还停在 v3（12 条铁律），说 R2/R3 只到 P0/P1；与主 README 冲突 | **删除或并入主 README**；它是第二份「怎么用」，而且过期 |
| `spec/process-v1.md` / `v2.md` / `v3.md` | 历史版本；v3 反而有 v4 缺失的完整阶段卡 | **移入 `archive/`**；v4 要么补回阶段卡，要么明确写「v3 的阶段卡仍是底座」 |
| `induction/v1.md` | 24 条台账时期的早期归纳；标题和数字都已过期 | **归档**；不要放在主目录让人误读 |
| `protocol.md` | 实验协议，用 S1–S6 旧阶段名 | **移入 `experiment/` 或归档**；它与 P0–P5 是两套命名 |
| `ledger/round1-enhance.md` | 文件名/标题是「第 1 轮」，实际 67 条跨三轮；`:38` 的「第 2 轮 · P0/P1 观察」也盖不住后面的 R2 P3、R3 P3b | **拆成 `ledger/round1.md`、`round2.md`、`round3.md`，或加 `round` 列并改名** |
| `out/FINAL-REPORT.md` + `out/three-rounds-evidence.md` | 三轮表、铁律来源表、审查员抓到的表大量重复 | **合并成一份 `EVIDENCE.md`**；`CHANGELOG.md` 里的同表改为链接 |
| `OUTLINE.md` | 未跟踪；提出 `PROCESS.md/REVIEWER.md/EVIDENCE.md` 的重写计划，并列出 7 项归档/删除 | 如果是路线图，**移到 `docs/plan/`**；如果交付 v1.0.0，**不要把它混进交付物** |
| `impl/round2-draft-studio/probe-tools/dump/` | 39 个文件、4,544,515 字节的第三方源码；`.gitignore` 排除，但工作目录里有 | **交付时删除**；保留 `probe-tools/*.ps1` 重抽脚本即可。若交付整个文件夹，它占 68% 体积，且有第三方代码/许可问题 |
| `impl/round2-draft-studio/bundle-lab/README.md` | 还是 P2 时代的说法：`:26` 说有设置页，`:28` 说 `remote.commands.execute` 没接线；终验 `14-final-verification.md:247` 已说点击→写回→回退跑通 | **标注「历史快照」或更新**；不要让读者拿它当现状 |
| `impl/round3-teammate-picker/bundle/` | 没有 README；最该给新人看的最近一轮反而没有入口说明 | **补一份 README**，至少写清「这版有什么/没什么/怎么验」 |

**一句话**：现在不是「文件不够」，是「同一件事有三份说法」。先做减法，比再写 10 页更有用。

### 5. 作为交付物缺什么：交给另一个人用，最缺的是什么？

按缺口大小排：

1. **一个能装上、能看见效果的最小插件样板 + 30 分钟走通路径。** 不是三个半成品，而是一个 `starter/`：一条 Host row、一个 Client slot、一个设置项、一条命令；`install_bundle` 后能看到按钮；一条测试能变红；一条 `npm pack` 能真加载。没有这个，前面所有「P0–P5」都是纸面。
2. **一份宿主契约探测指南。** 什么时候用 `cordis_inspect_*`、超时怎么办、怎么读 `app.asar`、哪些结论只能到 L3、怎么把探测输出变成 `文件:行`。现在这些知识散在 `probe-tools/*.ps1` 和三轮报告里，新人拼不起来。
3. **一份审查员任务书模板 + 角色定义。** 每道门给审查员什么文件、哪些不审、输出什么、谁有资格豁免、客户/负责人/审查员/实现者分别是谁。`spec/reviewer.md` 只定义了「审查员做什么」，没定义「怎么开一个」。
4. **版本基线。** 主文档没有写这套流程在哪个 DSH/cordis/Node 版本上验证过。`DSH 0.2.2-rc.1` 只出现在 `impl/round1-enhance/08-delivery.md:5` 和 `09-touchpoints.json` 的 `hostAtDiscovery` 里；`cordis 4.1.0` 只出现在 R2 终验。没有基线，P5 的「DSH 升级后复检」没有起点。
5. **「什么时候不该用」和轻量路径。** 23 条铁律 + 9 个门动作 + 4 级证据，对一个小插件是重税。文档没有成本估计，也没有「小改动只走哪几条」的裁剪规则。
6. **一个权威索引。** 现在 README 只列了 6 个路径，`CHANGELOG.md`、`OUTLINE.md`、`protocol.md`、`induction/`、`out/README.md`、`spec/process-v1..v3` 都不在索引里；新人不知道该读哪份、哪份已废弃。

**最缺的**：第 1 和第 2 项。没有它们，这套东西只能给作者本人当备忘录，不能交给另一个开发者。

---

## 二、问题清单（按严重度）

### 阻断

#### B1. 没有可开工的最小样板，现行规格又缺阶段卡底座

- 证据：
  - `README.md:21` 把 `process-v4.md` 说成「23 条铁律 + P0–P5 阶段卡」；实际 `spec/process-v4.md:44-53` 只有「出口判据（增补项）」，没有入口/产物。
  - 完整阶段卡在 `spec/process-v3.md:23-74`，但主 README 没有说「v4 是 v3 的增量，先读 v3」。
  - `README.md:49-53` 明确警告三个 bundle 都不要装；`impl/round1-enhance/bundle/README.md:9-13` 说设置页/提示词接线/宿主写都没实现；`impl/round3-teammate-picker/bundle/` 顶层没有 README。
  - `README.md:58` 承认客户端 inspect 累计 10+ 次超时；`spec/process-v4.md:13` 又要求宿主断言必须有出处。新人没有第三条路。
- 影响：P0/P1 不知道宿主契约怎么拿，P2 不知道骨架怎么写，P4 不知道装完怎么验。只能从半成品反推，而半成品本身是「不要装」的。
- 建议：补 `starter/` + `HOST-CONTRACT.md`；v4 补回阶段卡，或显式写「v3 阶段卡仍适用」。

#### B2. 证据链停在报告里，中间态不可复跑

- 证据：
  - `spec/process-v4.md:9`：「任何『已验』必须能被第二个人用你留下的命令原样跑出来。」
  - `05-verification.md:61`：「13 个探针全部通过（脚本已删，命令与输出原文如下，截取关键行）」；`:236`：「探针脚本为一次性验证用，未留在工作区。」
  - `07-reverify.md:220`：24 个探针留在 `%TEMP%\dsh-reverify\`。
  - `14-final-verification.md:363-369`：探针在 `%TEMP%\final-verify\`。
  - `09-verification.md:456-457`：探针在 `%TEMP%\p3-probes\`。
  - `git log --oneline` 只有 `095ca45`、`37e8ee6` 两个提交和一个 `v1.0.0` 标签；没有按轮/按门打标签，也没有中间态快照。
- 影响：终态测试能复跑；但「修复前是红的」「当时真的没接线」「当时 inspect 真的超时」这些支撑 23 条铁律的关键事实，只能信报告。报告越细，越需要独立快照；否则读者无法区分「真实事故」和「事后叙述」。
- 建议：每轮/每门打 tag；探针脚本入库；台账引用 `报告:行` + tag，而不是活动文件的行号；至少给 R1/R2 补一份「修复前」快照或可重放的变异脚本。

### 重要

#### M1. 版本/状态互相打架，读者不知道信哪份

- 证据：
  - `out/README.md:9` 指向 `spec/process-v3.md`（12 条铁律）；`:40` 说第 2、3 轮「只跑到 P0/P1」。
  - `README.md:21` 指向 v4（23 条）；`:33-35` 说 R2/R3 都到 P3b。
  - `FINAL-REPORT.md:14` 写「64 条卡点台账」；`README.md:25` 写 67；台账实际 67 行（`Select-String -Pattern '^\| \d+ \|'` → 67）。
  - `FINAL-REPORT.md:23` 说 R2「终验放行（C1–C9）」；`:63` 说「终验结果待定」；`out/three-rounds-evidence.md:68` 也写「终验待定」。
  - `out/three-rounds-evidence.md:3` 说「四种条件」，只列三种。
- 影响：新人打开 `out/README.md` 会走 v3 的 12 条流程，并以为 R2/R3 没进 P2。这是最可能走错的一步。
- 建议：`out/README.md` 删除/重写；`FINAL-REPORT.md` 的 64 改 67；删掉「终验待定」；「四种」改「三种」。

#### M2. `reviewer.md` 的固定输出格式与实际报告不一致，「带条件通过」没有位置

- 证据：
  - `spec/reviewer.md:21`：「带条件通过要写清条件。」
  - `spec/reviewer.md:36-42` 固定格式：`判定：PASS / FAIL / UNDECIDABLE`；`缺陷：...`；`放行：...`。
  - 实际：`05-verification.md:15` 用 `GO-WITH-CONDITIONS`；`14-final-verification.md:12` 用「带条件可进 P4」；`08-verification.md:15` 用「不可进 P4 交付」。三份都没有用 `PASS/FAIL/UNDECIDABLE` 作为顶层判定。
- 影响：「固定，便于机器与人共同读」是假的；审查员按格式写，反而表达不了最常见的「带条件通过」。同时验收三态 `VERIFIED/UNVERIFIABLE/FAIL/GAP` 也不是规格里的 `已验/未验/无法判定`。
- 建议：把「带条件通过」写进格式（如 `CONDITIONAL` + 条件列表）；统一验收三态与缺陷分级；要么让报告按格式重写，要么承认格式是建议而非固定。

#### M3. P1.5 的「清零」允许用「无法判定」清空，v4 还删掉了 v3 的「由谁何时接受」

- 证据：
  - `spec/process-v4.md:48`：「每条 UNVERIFIED 变 已验/降级/无法判定；清零后才进 P2。」
  - `spec/process-v4.md:11`：「不许把『无法判定』写成『通过』」——但没说「无法判定」是否阻断。
  - `spec/process-v3.md:43` 原来有「无法判定 + 由谁何时接受」；v4 的表里没有「由谁何时接受」。
- 影响：开发者可以把所有未知标成「无法判定」，UNVERIFIED 计数清零，P1.5 通过；门变成文书动作。三轮里 R2/R3 确实带着若干「无法判定」进了 P2，但没有一条规则说这些项谁签收、什么情况下必须阻断。
- 建议：P1.5 出口改成「无法判定项必须有具名接受人 + 到期时间，或被判阻断」；把 v3 的「由谁何时接受」补回。

#### M4. R3 的头条数字掩盖了 5 项 Client 面仍 FAIL 的验收；P3b 后没有独立终验

- 证据：
  - `README.md:35`、`FINAL-REPORT.md:24`：「111/111 + tarball 真加载」。
  - `impl/round3-teammate-picker/10-fix-report.md:430`：「A2/A3/A7-UI/A10/A13 在 Client 面仍然无法通过……只是不再谎称已就位。」
  - `10-fix-report.md:20`：m-2/m-3/m-4 仍未修；M-1 的运行时可达性仍未 live 验证。
  - `11-lead-decision-v3.md` 提到一个「收尾代理」重跑了命令，但它的报告不在仓库；`ledger:83` 的证据是会话 id `2f99c01a`。
- 影响：读者会以为 R3 已闭环；实际是「2 BLOCKER 修了，5 项 Client 面验收仍 FAIL（A2/A3/A7-UI/A10/A13），3 条 MINOR 未修，P3b 没有独立终验文档」。这与 `spec/process-v4.md:64`「修复轮与首轮同门」不一致。
- 建议：在 README/FINAL-REPORT 的 R3 行加「5 项 Client 面验收仍 FAIL」；把收尾代理的报告入库，或明确写「R3 P3b 只有修复者自证」。

#### M5. 台账 #59 的 D-02/D-03 叙事与 `11-reverification`/规格相反；多条行号已失效

- 证据：
  - `ledger:86`（#59）：「修复轮开工前复核发现 D-02/D-03 在 P2 后期已被自然修好。」
  - `11-reverification.md:23`：「D-02 / D-03 在我的复跑里仍然复现……与『修复轮开始前就已修好』的前提不符。」`:302-327` 有完整复现。
  - `spec/process-v4.md:38`：「R2 的 D-02/D-03 被负责人误判『已修好』（实际没修好）。」
  - `10-fix-report.md:184`：「负责人已复核为已修……本轮只确认它们仍在。」——同一行里「已修」和「仍在」自相矛盾；`:192-193` 又写「已修」。
  - 行号失效：`ledger:76` 引 `client.js:74/120/187`，当前 `:74` 是 `@module lib/prompt`、`:120` 是设置注释、`:187` 是 `const resolved = resolvePresetId(value);`；`ledger:79` 引 `host.js:545`，当前是 `});`；`ledger:86` 引 `host.js:116-141/740-753`，当前 116-141 是 D-02 注释/`mergePatch`，740-753 是 `dump-draft`。
- 影响：台账是三轮证据的索引；索引里最核心的一条「缺陷清单会过期」把「负责人读代码判错」写成了「确实已修」，正好把铁律 22 的反面案例写成了正面案例。行号失效则让读者按图索骥时找不到代码。
- 建议：按 `11-reverification` 重写 #59；台账引用 `报告:行`（不可变），不引活动文件行号；如需引代码，附 commit/tag。

#### M6. 没有审查员任务书模板，也没有定义客户/负责人/审查员的关系

- 证据：
  - `spec/reviewer.md` 定义了审查员做什么、不做什么、输出格式，但没有「任务书」输入模板。
  - `OUTLINE.md:60` 自己写「任务书模板」应该是 REVIEWER.md 的一节，但当前 `reviewer.md` 没有。
  - `spec/process-v4.md:66` 只说「审查员每道门新开」，没说开在哪、给什么、谁有资格。
- 影响：单人开发者无法制造「独立」；团队不知道任务书里该放哪些文件、哪些不审。审查员质量依赖「规格写得多死」（`reviewer.md:53`），而任务书是规格和产物之间的接口，现在缺失。
- 建议：补一节「任务书模板」：输入文件清单、不审项、判定标准、输出格式、证据等级、豁免流程；定义客户/负责人/审查员/实现者四个角色。

#### M7. 主文档没有 DSH 版本基线

- 证据：
  - `README.md`、`spec/process-v4.md` 都没有写验证时的 DSH/cordis/Node 版本。
  - `impl/round1-enhance/08-delivery.md:5` 写 `DSH 0.2.2-rc.1`、Node 24.22.2；`09-touchpoints.json` 的 `hostAtDiscovery.version` 是 `0.2.2-rc.1`；R2 终验用 `cordis 4.1.0`（`14-final-verification.md:60`）。
  - `spec/process-v4.md:75` 说「DSH 版本变化 → 复检」，但没有基线版本。
- 影响：换一个 DSH 版本，新人不知道哪些宿主断言仍成立；P5 的复检没有起点。
- 建议：README 顶部写「验证基线：DSH 0.2.2-rc.1 / cordis 4.1.0 / Node 24.22.2」；P5 写明「与基线 diff」。

#### M8. 三轮不是对照实验，因果结论被写强了

- 证据：
  - `out/three-rounds-evidence.md:13`：R1 的阶段门是「观察者人工强制」——R1 不是「无流程」基线，只是「无文件规格」。
  - `:60`：三位不同实现者；`:7-16`：三个不同插件的 8→1→2、153/178/111 被并排比较。
  - `FINAL-REPORT.md:4`：「不是设计出来的，是跑出来的。」
- 影响：报告能支持「这套做法在三个案例中能跑」，不能支持「23 条铁律导致了改善」。实现者、插件难度、轮次顺序都是混杂因素；每格 n=1。把案例写成对照，会让读者高估机制的效果。
- 建议：把「三轮结果」改写成「三个案例」，明确「不是对照实验，不能分离规格/实现者/插件难度的影响」；如果要因果结论，至少做一次同插件、同实现者的 A/B。

#### M9. 没有「什么时候不该用」和轻量路径

- 证据：
  - `README.md:37-45` 的「最小起手」仍是 5 条强制项；`spec/process-v4.md:5` 是 23 条；`reviewer.md:60-70` 是 9 个门动作。
  - 文档没有成本估计，也没有「小改动只走哪几条」的裁剪规则。
- 影响：一个小插件要么被过度流程拖死，要么被开发者直接放弃这套东西。README 的「按性价比排序」是一个开始，但它没有说「什么规模可以只做前 2 条」。
- 建议：加一节「适用规模」：一次性脚本/单文件插件/多插件产品分别走哪几张卡；给出「最小门」和「完整门」两档。

### 次要

#### m1. 台账文件名/标题与内容不符，轮次边界不清

- `ledger/round1-enhance.md:1` 标题是「第 1 轮」，但 67 行里有 43 行是 R2/R3；`:38` 的「第 2 轮 · P0/P1 观察」也盖不住后面的 R2 P3、R3 P3b。没有 `round` 列，读者无法按轮筛选。
- 建议：拆文件或加 `round` 列；标题改成「三轮卡点台账」。

#### m2. `impl` 下的 README 有过期/缺失

- `impl/round2-draft-studio/bundle-lab/README.md:26` 说「有设置页」，`:28` 说 `ctx.remote.commands.execute` 没接线；但 `14-final-verification.md:247` 说点击→写回→回退已跑通。这是 P2 时代的 README。
- `impl/round3-teammate-picker/bundle/` 没有 README，最近一轮反而没有入口说明。
- 建议：给 R2 README 标「P2 快照」；给 R3 补 README。

#### m3. 4.5MB 第三方 dump 在交付目录里

- `CHANGELOG.md:57` 说「约 3.5MB」；实际 `impl/round2-draft-studio/probe-tools/dump/` 是 39 个文件、4,544,515 字节。`.gitignore:4` 排除了它，但工作目录里有。
- 如果交付的是 git tag `v1.0.0`，它不在包内；如果交付的是整个文件夹，它占 68% 体积，且含第三方源码。两种交付物的内容不一致，文档没有说明。
- 建议：交付文件夹时删除；保留 `probe-tools/*.ps1` 重抽；在 README 写明「dump 不入交付物」。

#### m4. `OUTLINE.md` 是未跟踪的「下一版计划」，与现行结构冲突

- `git status --porcelain` → `?? OUTLINE.md`；它不在 `v1.0.0` 里。
- 它提出 `PROCESS.md/REVIEWER.md/EVIDENCE.md` 的重写（`OUTLINE.md:40-42`），并列出 7 项要归档/删除的文件（`:87-93`）。如果随交付物一起给，读者会看到「现行 README + 未来重写计划」两套结构；如果不给，它又是一份有用的路线图。
- 建议：移到 `docs/plan/` 并标注「非交付」；或删除。

#### m5. 计数/措辞小错

- `FINAL-REPORT.md:22` 说 R1「40 文件」；`08-delivery.md:34` 说包内 27 文件。40 是 `check-syntax` 检查的源文件数，不是包内文件数，读者会混。
- `CHANGELOG.md:43` 写 `npm test` 写成 `node test/`；实际是 `node --test test/`（`08-verification.md:71`）。
- `09-touchpoints.json` 的 status 是 verified 29 / unverified 11 / unverifiable 4；`10-maintenance.md:253` 的 recheck 基线是 OK 26 / UNVERIFIABLE 18。两者口径不同，文档没有解释。
- 建议：统一「文件数」口径；修 typo；给触点状态与 recheck 结论加一张映射表。

#### m6. `README.md:53` 说 R1 的 bundle「最完整」，但 R1 没有客户端页面、没有提示词接线

- `README.md:53`：「R1 的 bundle 最完整但也没装进过真实 profile。」
- `05-verification.md:110`：「即使装上，本构建也不会改任何提示词、检查也不会有数据。」
- R2 至少有客户端页面（虽然设置页空白），R3 至少有按钮。用「最完整」形容 R1 会误导新人去抄 R1。
- 建议：改成「R1 的 Host/状态层最完整，但没有客户端和提示词接线」；按层说明哪个 bundle 能参考什么。

---

## 三、你认为最该改的三处

### 1. 补一个能装上的最小插件样板（`starter/`）+ 宿主契约探测指南

这是「能不能用」的命门。具体建议：

- `starter/`：一条 `cordis.patch.yml` Host row、一个 `conversation.input.right` slot、一个 `Config` 设置项、一条 `/hello` 命令；`npm pack` → `install_bundle` → 重启 → 看到按钮 → 点一下 → 看到结果；一条测试能红→绿。
- `HOST-CONTRACT.md`：`cordis_inspect_*` 的用法、超时后的三条替代路径（app.asar / 已装插件源码 / 官方 README）、每条结论标 L1–L4、怎么把输出变成 `文件:行`。
- 30 分钟 walkthrough：从 clone 到装上，每一步给命令和预期输出。

没有这个，读者只能把 `impl/` 当源码考古；而 `impl/` 自己说「不要装」。

### 2. 把证据钉到版本上，让第二个人真的能复跑

- 每轮/每门打 git tag：`r1-p3`、`r2-p1`、`r2-p3`、`r2-p3b`、`r3-p3`、`r3-p3b`。
- 探针脚本全部入库（不要 `%TEMP%`、不要「脚本已删」）；至少给每个「红→绿」留一个可重放的 `mutate` 脚本。
- 台账引用 `报告:行` + tag，不引活动文件行号；如果必须引代码，写 `commit:path:line`。
- 把 64/67、R2「终验待定/放行」、R3「111/111 但 5 项 Client 面 FAIL」三处口径统一。
- 给 R1/R2 各补一份「修复前快照」或「可重放事故脚本」，否则 23 条铁律的来源永远只能信报告。

### 3. 收敛成「一份入口 + 一份现行规格 + 一份证据」

- 入口：`README.md`，只留目录、适用范围、30 分钟路径、版本基线。
- 现行规格：`spec/process-v4.md` 补回完整阶段卡（或明确「v3 阶段卡仍适用」）；`spec/reviewer.md` 补任务书模板和 `CONDITIONAL` 输出。
- 证据：`out/FINAL-REPORT.md` + `out/three-rounds-evidence.md` 合并成 `out/EVIDENCE.md`；`out/README.md` 删除；`ledger` 拆三轮。
- 归档：`spec/process-v1..v3`、`induction/v1.md`、`protocol.md` 移到 `archive/`；`OUTLINE.md` 移到 `docs/plan/`；`probe-tools/dump/` 从交付物删除。
- 这样读者只需要打开三个文件，而不是现在的 10+ 个互相引用的文档。

---

## 四、如果只能给使用者一句建议

**把它当「审查清单」用，不要当「从零开发 DSH 插件」的教程；先让一个最小插件真的装上、点一下、看到效果，再回来套这 23 条门。**

---

## 附录：我实际跑过的核验命令（节选）

```powershell
# 目录/版本
git status --porcelain=v1          # ?? OUTLINE.md
git log --oneline --decorate -n 5  # 37e8ee6 (tag: v1.0.0), 095ca45
git tag -l                         # v1.0.0

# 台账计数
(Select-String -Path 'ledger\round1-enhance.md' -Pattern '^\| \d+ \|').Count   # 67
# 台账行号 vs 当前代码
$p='impl\round2-draft-studio\bundle-lab\client.js'; $l=Get-Content -LiteralPath $p
$l[73]; $l[119]; $l[186]           # @module lib/prompt / 设置注释 / resolvePresetId
$p='impl\round2-draft-studio\bundle-lab\lib\host.js'; $l=Get-Content -LiteralPath $p
$l[544]                            # });

# 探针是否在仓库
Select-String -Path 'impl\round1-enhance\05-verification.md' -Pattern '脚本已删|未留在工作区'
Select-String -Path 'impl\round2-draft-studio\14-final-verification.md' -Pattern '%TEMP%\\final-verify'

# 计数/状态
Select-String -Path 'out\FINAL-REPORT.md','README.md' -Pattern '64 条|67 条|终验结果待定|终验待定'
Select-String -Path 'out\three-rounds-evidence.md' -Pattern '四种条件'

# 第三方 dump
$d=Get-ChildItem -Recurse -File -Force 'impl\round2-draft-studio\probe-tools\dump'
"files=$($d.Count) bytes=$((($d|Measure-Object Length -Sum).Sum))"   # 39 / 4544515
```

**未做的核验**：未安装任何 bundle；未跑三轮的 `node --test`/`npm pack`（避免改变工作区或触发安装）；未复跑 R1/R2 的 `%TEMP%` 探针（不在仓库内）；未逐条核对 `app.asar` 的 asar 行号（只核了台账与当前源码的对应关系）。这些不影响上面的结论，但属于本审计的边界。
