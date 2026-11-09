# 一致性审计

> 独立性声明：本报告的作者不参与 `plugin-kit` 的写作。全部结论来自两类证据：**通读允许的 11 份文档**，以及**实跑 6 组命令**（结果内嵌，可复跑）。
> 冻结对象见 [`AUDIT-SNAPSHOT.md`](AUDIT-SNAPSHOT.md)。审计期间未修改任何产品文件与判据文件。

## 判定

**PASS-WITH-CONDITIONS**

四条一致性都有实质内容可核，产品声明的三段能力**全部真实存在且全绿**（无 BLOCKER）。但存在 7 条 MAJOR 与 6 条 MINOR，其中 M1 是本轮"已修三处"**改一处留一处**的直接证据。

```
四条一致性的结果：
  一、声明 vs 实现：三段能力、九阶段、四级日志全部落地；但 README 漏掉了 SKILL.md 三种执行方式中的一路（AGENTS.md）。
  二、承诺 vs 交付：承诺了"双树哈希守门"和"22 条断言"，交付物在源码检出下成立，独立安装下守门空真（M6），断言套件无运行入口（m4）。
  三、历史 vs 现状：三处已修改得不干净——SKILL.md 首屏和 evidence.md 结论节仍写着被推翻的原句（M1）；CHANGELOG 的交付记录数字整体过期（M3）。
  四、产物 vs 存在：文件路径与 `files` 白名单全部对得上，旧目录确已删除；仅两处计数与残句（m1/m5/m7）。
```

## 一、我实跑了什么（可复跑）

| # | 命令 | 结果 |
|---|---|---|
| 1 | `node --test test/gate.test.mjs test/ledger.test.mjs test/skill-provider.test.mjs` | 88 / 88 通过 |
| 2 | `node --test test/smoke.mjs` | 43 / 43 通过 |
| 3 | `node test/readme-claims.mjs` | 22 / 22 条成立 |
| 4 | `node test/failure-signals.mjs` | 14 / 14 条通过 |
| 5 | `node test/mutate.mjs` | 6 / 6 个变异变红 |
| 6 | `node scripts/recheck.mjs --self-test` | 4 / 4（含 3 条反例）|

合计 **173 条**（88 + 43 + 22 + 14 + 6）。另做两项事实核对：

- **双树哈希**：对 `.dsh/skills/plugin-kit/` 与 `dsh-plugin-kit/skills/plugin-kit/` 逐文件 SHA256 比对，**11 个文件全等，无差集**——本轮"包内副本已同步"（`BACKLOG-AND-CONSISTENCY.md:32`）属实。
- **`npm pack --dry-run`**：29 个文件，覆盖 README 提到的全部产物路径。
- **`dsh-stage-gate/`**：`Test-Path` 返回 **False**，确已删除（`CHANGELOG.md:77` 可信）。

## 二、四条一致性逐条

### 一、声明 vs 实现

**结论：三段能力、九阶段、四级日志三项声明全部落地且有测试守门；唯一缺口是"三种执行方式"在 README 里少一路。**

核过的三处（都成立）：

| 声明 | 出处 | 实现证据 |
|---|---|---|
| 判据 / 纪律 / 强制力三样 | `README.md:5`、`CHANGELOG.md:16-18` | `readme-claims.mjs` 的 `README:120` 断言装包必带拦截；smoke 43 条覆盖 skill 注册、`systemPrompt.section`、`tools/pre-execute` |
| 「九阶段」 | `README.md:71`、`SKILL.md:42` | `DEFAULT_LAYOUT` 断言（`readme-claims.mjs` `README:71`）实测导出为 `p0 p1 p1.5 p2 p3 p3b p3.5 p4 p5`，与 `process.md` 的 9 张阶段卡标题一一对应 |
| 「只有 error/warn/info/debug」 | `LOGGING.md:8-15`、`README.md:143-148` | `index.js` 实际分级计数：`warn 7 / info 2 / debug 2 / error 1` = **12 条**，与 `LOGGING.md:23`「当前 12 条」完全吻合；smoke 有 6 条日志规范测试 |

**不成立的**：`SKILL.md:61-73` 列了三种执行方式（AGENTS.md / skill / 插件），`README.md:112-120` 的「三种交付形态」是**另一根轴**（纯判据 / 完整 / 观察），README 全文 `AGENTS` 出现 **0 次**。见 **M6**。

### 二、承诺 vs 交付

**结论：四项承诺中三项交付到位（含"装一个包三样都有"），"双树哈希守门"在独立安装形态下是空真。**

| 承诺 | 出处 | 交付核验 |
|---|---|---|
| 「装一个包，三样都有」 | `README.md:5` | ✅ README `:18-31` + `CHANGELOG.md:14-18` 各自说明，无矛盾 |
| 「卸载后你的项目文件一个都不会变」 | `README.md:234-249` | ⚠️ README 说了，**CHANGELOG 全文 0 次"卸载"**（M2） |
| 「双树一致性靠哈希断言」 | `README.md:137` | ⚠️ 断言存在且当前通过，但独立安装时 `assert.ok(true)` 空真跳过（M6） |
| 「debug 默认被宿主过滤」 | `LOGGING.md:176,184` | ❌ README 说"排查时才看"（`:148`），**全文 0 次"过滤/阈值"**，用户永远等不到 debug（M5） |

### 三、历史 vs 现状

**结论：三处"已修"里两处留下了旧句；CHANGELOG 的交付记录数字与今天的实测整体不符。**

本轮改的三处，回收检查：

| 改动 | 现状 | 判定 |
|---|---|---|
| ①`SKILL.md`「做成插件不值得」 | `SKILL.md:67-78` 已改为三种执行方式 + 时间戳说明 | ✅ 自洽 |
| ②`SKILL.md` 边界第 1 条拆两半 | `SKILL.md:114` 已拆 | ⚠️ **但 `SKILL.md:10` 和 `evidence.md:141` 还写着原句**（M1）|
| ③`evidence.md` 边界一 | `evidence.md:87-93` 已改为「机制已实测可用」 | ⚠️ 同上，`evidence.md:141` 结论节仍写「运行时它验不了」，与本文件 `:87` 标题自相矛盾 |

`SKILL.md` description（431 字符）与正文**匹配**：描述里三个触发点——独立审查员（`references/reviewer.md`）、宿主升级后触点（`scripts/recheck.mjs`）、"测试全绿但功能没做"（`SKILL.md:105`）——都能在正文找到落点；且 431 < `DESCRIPTION_LIMIT` 500，有断言守门（`readme-claims.mjs:238`）。

CHANGELOG 声称的 8 条修复（R1–R5、R7–R9）与 README/LOGGING **无实质矛盾**：R4→`README.md:180`、R7→`LOGGING.md:98`、R8→`README.md:100` + `readme-claims.mjs` 的 layout 断言、R2→`package.json:46-50` 的 `dsh.bundle`。只有编号缺 R6 且无说明（m3），以及 `:20` 的「5 项」实列 6 项（m1）。

### 四、产物 vs 存在

**结论：README 与 SKILL.md 提到的每一个文件路径都真实存在，`files` 白名单无遗漏，旧目录已删。**

- `README.md:124-135` 源码布局 8 项：`index.js`、`lib/{gate,ledger,skill-provider,discipline}.js`、`skills/plugin-kit/`、`vendor/`、`test/` —— **全部存在**。
- `SKILL.md:84-101` 引用：`references/` 4 个 md、`scripts/recheck.mjs`、`assets/` 3 个 —— **7/7 存在**，且 `recheck.mjs --self-test` 实跑 4/4。
- `package.json:27-39` `files` 白名单 11 项，逐一存在；`npm pack` 产出的 29 个文件包含 README 提到的全部路径。
- `CHANGELOG.md:77` 声称 `dsh-stage-gate/` 已删 —— **实测不存在**，且 `README.md:219,251-272`、`CHANGELOG.md:68-73` 的迁移说明与之一致，属正常"旧名"引用。

## 三、不一致清单（按严重度排）

| # | 严重度 | 哪条一致性 | 文档:行 | 不一致的具体内容 | 建议怎么改 |
|---|---|---|---|---|---|
| **M1** | MAJOR | 三、历史 vs 现状 | `SKILL.md:10`、`evidence.md:141` | 首屏代价栏仍写「**运行时它验不了**」，结论节仍写「运行时它验不了」——与同文件 `SKILL.md:114`「机制已实测可用，只差真项目交付」和 `evidence.md:87-93` 直接冲突。本轮第 2、3 项修复只改了正文，没回收摘要句。 | 两处都改成「运行时机制可用，但没在真要交付的项目上走完 P0–P5」；`evidence.md:141` 改成「运行时**在真项目上**还没验过」 |
| **M2** | MAJOR | 二、承诺 vs 交付 | `CHANGELOG.md`（全文） | CHANGELOG 全文 **0 次**「卸载」。README 的核心承诺「卸载后你的项目文件一个都不会变」（`README.md:234`）在交付记录里没有任何对应条目，属于"承诺了但没记交付"。 | `CHANGELOG.md` 新增节加一条：「卸载：`dsh plugin remove` 只摘 loader 行，`.stage-gate.json` / `stages/` / `_ledger.jsonl` 均保留」 |
| **M3** | MAJOR | 三、历史 vs 现状 | `CHANGELOG.md:40-46` | 声称「测试（158 项）= 88 + 40 + 16 + 14 + 6」，**实测 173 项 = 88 + 43 + 22 + 14 + 6**。接线冒烟 40→43、README 断言 16→22，两项都过期 15 条。 | 三个数字改成 173 / 43 / 22；并把「README 断言核对」升级为 22（与 `readme-claims.mjs` 输出一致） |
| **M4** | MAJOR | 一、声明 vs 实现 | `README.md:128`、`README.md:134` | `gate.js` 标注「51 条测试」，实测 `gate.test.mjs` 跑 **38** 条（`assert` 59 处）——**51 既不是测试数也不是断言数，无来源**。同表另两行（ledger 13、skill-provider 37）与实跑**完全吻合**，说明只有这一格过期。`test/` 标注「133 条」实测 **131**（88 单测 + 43 冒烟）。 | 51→38，133→131（或改写成「131 条 + 22 条断言 + 14 条信号 + 6 条变异 = 173」） |
| **M5** | MAJOR | 二、承诺 vs 交付 | `README.md:141-157` vs `LOGGING.md:176,184` | `LOGGING.md` 第九节明确「debug 默认被宿主过滤」，并说「必须写进 README，否则…」；README 的日志表却写「排查时才看」，**全文无一处说明阈值=2、debug=3**。用户按 README 排查时会把"没有日志"误判成"插件没运行"。 | README 日志表下方加一行：「宿主默认阈值 2，`debug`(3) 默认被过滤，需宿主调高阈值才能看到」 |
| **M6** | MAJOR | 二、承诺 vs 交付 | `README.md:137` vs `test/skill-provider.test.mjs:295-299` | README 承诺「改了一边忘另一边会立刻变红」。该断言的权威源不存在时走 `assert.ok(true)` 直接返回——在**独立安装形态**下守门恒绿，正是铁律 2「空真排除」要禁的写法。 | 改成 `assert.fail('权威源缺失，无法证明双树一致')` 或 `test.skip()` + 显式标注，不要用恒真断言 |
| **M7** | MAJOR | 一、声明 vs 实现 | `SKILL.md:61-73` vs `README.md:112-120` | `SKILL.md` 说"同一套判据的三种执行方式"，README 只交付两根轴：三种**交付形态**（`:112`）和三级**采用**（`:104`）。**AGENTS.md 这一路在 README 里 0 次出现**，读者无法从产品文档得知"可以只写进 AGENTS.md"。 | README「三种交付形态」表加一行「短规则 → 写进项目 `AGENTS.md`」，或补一节引用 `assets/AGENTS.template.md` |
| **m1** | MINOR | 三、历史 vs 现状 | `CHANGELOG.md:20` | 「配置（**5 项**，全部可验）」，紧接列了 **6** 条（enabled / mode / root / layout / gateFile / allowedTools）；`README.md:95-102` 同样是 6 行。 | 改「5 项」→「6 项」。此条正是铁律 15「计数机检」的实例，建议顺手加断言 |
| **m2** | MINOR | 三、历史 vs 现状 | `LOGGING.md:125` | 正文残留「启动时把**三行**自检」，而交付的是四行（`README.md:152-157`、`index.js:185,199,226,235`）。同节 `:102` 的"现在三行→应该四行"是历史判断，可留；`:125` 是祈使句，不能留。 | 三行→四行 |
| **m3** | MINOR | 三、历史 vs 现状 | `CHANGELOG.md:52-59` | 修复编号 R1–R5、R7–R9 共 **8 条**，**R6 缺失且无说明**。读者会怀疑有 1 条修复被删掉。 | 补 R6 或加注「R6 已并入 R5 / 不适用」 |
| **m4** | MINOR | 二、承诺 vs 交付 | `package.json:40-45` | 项目主打的「22 条断言」(`readme-claims.mjs`)、`failure-signals.mjs`、`real-host-check.mjs` **都不在 `scripts` 里**，`npm run check` 也不跑它们。README 因此没有任何"怎么复跑这 22 条"的入口——外部读者只能靠口口相传。 | `scripts` 加 `"claims": "node test/readme-claims.mjs"`、`"signals": "node test/failure-signals.mjs"`，并纳入 `check` |
| **m5** | MINOR | 四、产物 vs 存在 | `dsh-plugin-kit/scripts/` | 空目录残留（0 个文件），未在 `package.json:27-39` 白名单内，也不会进 tarball。 | 删掉，或放入实际脚本 |
| **m6** | MINOR | 一、声明 vs 实现 | `package.json:53` vs `process.md:96` | `engines.dsh` 允许 `>=0.2.1-rc.1 <0.3.0-0`，而铁律 23 的事实基线是 `0.2.2-rc.1`。两份文件都没说"0.2.1 上验过没有"。 | 在 README「已知限制」加一行实测基线版本 |
| **m7** | MINOR | 三、历史 vs 现状 | `test/readme-claims.mjs:253` | 守门四行日志的断言，标题写着「启动打**三行**自检日志」。守门的测试自己带着过期标签。 | 标题改「四行」 |

## 四、缺什么事实

1. **`DEFAULT_LAYOUT` 没有直接读源码**（边界内只允许读 `index.js` 的几行，未读 `lib/gate.js`）。九阶段一致性的证据是 **间接的**：`readme-claims.mjs` 的 `README:71` 断言实跑通过，说明 `DEFAULT_LAYOUT` 导出值确为 `p0 p1 p1.5 p2 p3 p3b p3.5 p4 p5`。
2. **`CHANGELOG.md:81`「旧目录零独有文件（20 个文件）」无法复核**——旧目录已删，只留结论。只能确认"已删"这一半。
3. **「五轮真机验证」的轮次记录缺**：`OUTLINE-AUDIT.md:20` 提到今天已做五轮，允许读的文件里没有任何一份记录这五轮。`SKILL.md:114` 用的是"多次"，未给数。
4. **`real-host-check.mjs` 是否真跑通过、最近一次结果**：只读到它在 `test/` 里存在（7579 字节），未读内容，也未在本次运行它（需要真宿主）。
5. **`SKILL.md` 本身没有任何自动断言覆盖**——这是 `BACKLOG-AND-CONSISTENCY.md:86` 自认的缺口，本次审计只能人工核，仍未建立机制。**M1 正是这个缺口的产物**：三处措辞改动没有断言守门，所以改一半不会被发现。

## 五、关于「这份审计本身也只是报告」

必须说明白：**我执行了 6 组命令，但修复动作一条都没执行。** 这份报告如果不变成断言，就和 `GAPS.md`、`REFRAME.md` 落在同一个位置——`BACKLOG-AND-CONSISTENCY.md:12-20` 记录的"分析产能 > 执行产能"。

本报告里 **9 条（M1–M7、m1、m7）是纯文本比对，可以立刻变成 `readme-claims.mjs` 的条目，且今天就会红**。建议的最小执行动作只有一件：

> 往 `test/readme-claims.mjs` 追加 9 条断言：`SKILL.md` 不得出现「运行时它验不了」、`evidence.md` 同上、CHANGELOG 的 88/43/22 三个数与实跑一致、README 的 51/133 与实跑一致、README 含「阈值」二字、`assert.fail` 替换空真跳过、README 含 `AGENTS.md`、CHANGELOG 写「6 项」、`readme-claims.mjs` 自己的标题写「四行」。

加完这 9 条，`npm run claims` 会红 9 次；改到全绿，M1–M7、m1、m7 就**不是被"指出"的，是被"验证"的**。这是本次审计唯一能逃离"又一份分析"的出口。

---

**判定复核**：无 BLOCKER（三段能力、九阶段、四级日志、22 条断言、双树哈希、旧目录删除，逐项实跑或实测通过）→ 不判 FAIL；有 7 条 MAJOR → 不判 PASS。**PASS-WITH-CONDITIONS**。
