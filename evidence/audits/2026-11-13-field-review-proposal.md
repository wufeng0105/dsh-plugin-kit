# 提案与审计：plugin-kit 的「往下读」问题

> 状态：**已审计、已部分落盘**。C1/C2/C3 被审计推翻并撤销；C4 与 C2′ 落盘。
> 依据：一次真实开发会话的完整日志（下方 A 段），非推测性设计。
> 本文把「观察到的事实」与「据它提出的改动」分开写，便于逐条判定。
> **E 段记录独立审计结论，F 段记录最终决策。原始提案（A–D）保持原样，不回写、不美化——被推翻的地方要留着。**

---

## A. 证据（每条可复核）

**数据来源**
- `C:\Users\Administrator\Desktop\dsh-session-session-030438d9-b7f6-4848-9252-6dd04b7d77c3\session.v4.jsonl`（3477 行 / 41 turn / 286.5 分钟 / 2026-11-13）
- `C:\Users\Administrator\Desktop\新建 文本文档.txt`（同一 session id 的 markdown 导出）
- 复核方式：脚本全量解析 JSONL，按 seq 定位；数字均由脚本统计，非目测。

**A1. 材料齐备。** 包内 `skills/plugin-kit/host-skills/dsh-doc/` 有 43 份文档，其中与界面直接相关：`references/ui-plugin.md`、`references/verification.md`、`references/artwork.md`、`references/plugin-details.md`、`references/host-plugin.md`，以及 `templates/decoration/`（11 文件：`client.js` / `index.js` / `package.json` / `cordis.patch.yml` / `icon.svg` / `docs/DETAIL.md` / `docs/preview.svg` / 7 份 locale）。`host-skills/README.md:11` 把 dsh-doc 称为「宿主文档唯一入口」，并明列「UI 模板」。

**A2. 索引/使用说明一次未被读。** 全会话 75 次 `read` 调用中，路径含 `templates/` 的 **0 次**；`PATHS-README.md` **0 次**；`host-skills/README.md` **0 次**；`host-skills/dsh-doc/SKILL.md`（列 43 份文档索引的「Read next」表）**0 次**。`references/ui-plugin.md` 被读 **1 次**（seq 1516），其正文第 3 行即写「Read `templates/decoration/` … write its files into your bundle directory」，之后 200 seq 内的 7 次 `read` 无一指向 `templates/`。

**A3. 一次性加载，后半程无在场提醒。** `skill` 工具加载 `plugin-kit` 仅 **2 次**（seq 766 / turn 6、seq 1078 / turn 10）；其后 31 个 turn 未再加载。会话在 turn 35 发生一次 `compaction/start`（seq 2959），压缩摘要中关于 plugin-kit 仅剩 3 行（路径、preflight 结论、一条 `absent` 结论），不含任何「去哪找界面材料」的信息。骨架自带的 `template/AGENTS.md` 是随工作目录持续在场的文本，但其中与界面相关的只有一句：「界面半（client.js）用 `window.__ModuleLoader__.load(...)`，不能有 ESM export/import」（`:27`）——是警告，不是指路。

**A4. 需求从后台转向界面时，没有任何触发器。** 用户明确要求界面的消息出现在 seq 1076（「我建议是带界面的」）、seq 1225、seq 2283（「设置里面是不是应该自己绘一个设置页面」）。此后 AI 的界面知识来源为读真实插件源码（`dsh-enhance` 22 次命中、`dsh-archive-manager` 16 次命中，后者由用户在 seq 2780 直接给 GitHub 链接要求克隆）与加载别的 skill（`frontend-design` seq 2536、`ytcw` seq 3313）。

**A5. UI 返工集中且代价高。** 界面阶段（turn 29–41）出现 9 条含强烈不满措辞的用户消息（seq 2501、2608、2780、2799、2934、2979、3009、3094、3233），主题为「东拼西凑」「整体性重构」「参考归档会话布局」「按钮大小一致居中」。

**A6. preflight 的界面检查看错了路径。** `scripts/preflight.mjs:238-239` 只读取 `join(root, 'client.js')`；真实项目的界面文件位于 `ui/client.js`。全会话 10 次 preflight 输出恒为 `8/9 通过，0 FAIL，1 UNVERIFIABLE`（seq 1158 / 1740 / 2055 / 2182 / 2194 / 2271 / 2357 / 2404 / 2595 / 2916），其中 `crash.client-esm` 一条在每次都因 `ctx.clientText === null` 返回 PASS + 注记「本项目无 client.js（Host 半插件），跳过」。经复核，真实的 `projects/dsh-toolwarden/ui/client.js` 含 `window.__ModuleLoader__.load`（第 30 行）、无顶层 `export`/`import`——即这条判据本可检查到它，但路径没覆盖到。AI 后来手工补了一条等价检查（seq 2364），非判据本身生效。

**A7. 「别查太多」那句的真实措辞。** `SKILL.md:38` 原文：

> 分量：一次真实开发翻遍 catalog 和源码 200 多次没答案，最后是读一个已发布插件的 `lib/routes.js` 才找到接缝。**查得太多本身就是错**——省上下文只有在它没有引起更多搜索、重复读取或错误时才划算。

它带条件，逻辑上不自相矛盾；且前半句是有出处的真实事故。但「查得太多本身就是错」作为独立短句，给了一个可被引用的「省」的抓手。

**A8. 项目形态变化未被判据感知。** 同一 10 次 preflight 期间，项目由 4 文件增长到 14 文件（新增 `ui/`、`api.js`、`baseline.js`、`rules.js`、`tool.js` 及 5 个测试文件），版本 0.1.0 → 0.3.0，测试数 0 → 133；判据结论未变。

---

## B. 边界（本文不主张什么）

- 本文**不**主张 plugin-kit 缺少 UI 能力或缺少文档（A1 已否定）。
- 本文**不**主张「AI 偷懒」；A2–A4 指向的是触发机制，不是执行态度。
- 本文**不**主张「必然如此」：单次会话、中途至少 4 次 `model/selection` 切换、2 次额度报错、1 次 compression、无「不用 plugin-kit」的对照组。**由机制推及一般规律这一步，证据不足（UNVERIFIABLE）。**
- 本文**不**主张扩大 plugin-kit 的职责到 UI 质量/审美——那属于 `frontend-design` 等，加了会使工具臃肿。
- 本文**不**主张删掉 A7 那句话所依据的事故记录。

---

## C. 建议改动（3 处，均为文字；第 4 处为小修）

**C1 · 在持续在场的文本里加路标。** 文件：`skills/plugin-kit/template/AGENTS.md`
在「本项目的形态」一节补一段，大意：

> 当需求涉及界面、设置页、面板、Slot 时：先读 `host-skills/dsh-doc/references/ui-plugin.md`，再读 `host-skills/dsh-doc/templates/decoration/` 整套文件（共 11 个），照它的 `dsh.client` / `./client` / `window.__ModuleLoader__.load` 形态起步；不要从零手写界面。验证页面读 `references/verification.md`，图标读 `references/artwork.md`，详情图读 `references/plugin-details.md`。

理由：A3——`AGENTS.md` 是唯一不会随 turn / compaction 消失的载体；A2——路标必须在会被读到的那一层。

**C2 · 把「按分支读」变成必做项。** 文件：`skills/plugin-kit/SKILL.md`
在「一、查完必须产出」那张表（`:40-47`）后补一行约束：任务涉及界面时，「先读 ui-plugin.md + decoration 模板」与「inspect 查 Slots」并列为必做产出，而非可选项。并在「五、新建一个插件项目」（`:109`）的步骤 2 与 3 之间插一句：若项目带界面，此时先复制 `decoration` 模板的浏览器半，再跑 preflight。

理由：A2、A4——缺的不是材料，是「什么时候该往下钻」的触发条件。

**C3 · 改写 A7 那句（保留事故，撤掉「省」的抓手）。** 文件：`skills/plugin-kit/SKILL.md:38`
保留「翻遍 200 多次没答案，最后读 `lib/routes.js` 才找到接缝」；把结论从「查得太多本身就是错 / 省上下文才划算」改为方向性表述，大意：

> 错的是在错误的分支上反复搜，不是读得深。查契约时先定分支（要 Service / Event / Slot / 模板），该分支内的文档与真实插件源码要读到底；跨分支的反复检索才是浪费。

理由：A7——原句逻辑不矛盾，但给了「少读」一个可引用的借口；A2、A5——这次的代价正是「省」出来的。

**C4 · 修 preflight 找错路径（真 bug，独立于以上三条）。** 文件：`skills/plugin-kit/scripts/preflight.mjs:238-239`
除 `join(root, 'client.js')` 外，再按 `package.json` 的 `exports['./client']` 指向读取，或扫描项目内 `*/client.js`；并对 `dsh.client.platform === 'web'` 但找不到任何 client 文件的情形给出 FAIL/UNVERIFIABLE 而非静默 PASS。补一条 `--self-test` 用例：把 client 放进子目录，判定式必须仍能检查到它。

理由：A6、A8——这是可复现的判据缺陷，不依赖任何关于「导航」的推断。

**另附（不列入本次改动）：** `README.md` / `SKILL.md` 中「完成验证」的措辞容易让人以为它管质量；建议后续改为「首装验证 / 启动期预检」。此项与本次主题（往下读）无关，不塞进同一批。

---

## D. 交给审计员的问题（只判这些）

1. A1–A8 每条：成立 / 不成立 / 证据不足？各附一句理由与出处。
2. C1–C4 每条：是否被 A 段证据支撑？有无越界（把推断写成事实）？
3. B 段边界是否够用？有没有本文没承认、却必须承认的限制？
4. C3 是否如本文所说属于「改写」而非「删掉矛盾」？直接删会丢什么？
5. 这 4 处改动合起来，会不会反而让 plugin-kit 变臃肿或职责外溢？

**不许做**：不重新分析日志、不跑命令、不追新证据、不读 app.asar、不给替代方案、不评价「该不该改」这个决策本身。

---

## E. 独立审计结论（2026-11-13，subagent `proposal-auditor`）

约束：允许核实 4 份被点名文件原文；禁止重新分析日志、跑命令、追新证据、读 app.asar、给替代方案。

**逐条判定（摘要）**

| 断言 | 判定 | 审计理由要点 |
|---|---|---|
| A1 | 成立 | 引用无误；但「11 文件清单/与界面直接相关」属自述、不在可核范围 |
| A2 | 成立（仅统计层） | 75/0/1/7 是脚本数字；「`SKILL.md:32/:36` 已有指路」不在统计口径内 |
| A3 | **证据不足** | 「AGENTS.md 随目录持续在场 / 唯一不随 compaction 消失」是无出处机制推断，却是 C1 支柱 |
| A4 | **证据不足** | 「没有任何触发器」是全称推断（日志没发生 ≠ 不存在）；且与 `SKILL.md:32/:36` 已有指路冲突 |
| A5 | **证据不足** | 「强烈不满措辞」是人工归类，「代价高」无度量 |
| A6 | 成立 | `preflight.mjs:238-239`、`:182` 逐字核实；8/9 与 9 条 CHECKS 自洽 |
| A7 | 成立 | `:38` 引文逐字一致；但「给了『省』的抓手」是解读非事实 |
| A8 | 成立 | 9 条 CHECKS 无一涉及文件数/版本/测试数，有源码依据 |

| 建议 | 判定 |
|---|---|
| C1 | **越界（推断当事实）**：A2 反显示在场文件 0 次被读；从未统计 AGENTS.md 读取次数 |
| C2 | 部分支撑：「复制 decoration 浏览器半」与 `:111` 的 4 文件骨架不一致 |
| C3 | **越界**：「代价正是『省』出来的」把相关写成因果；「删矛盾」虚设了对立项 |
| C4 | **被 A 段支撑**：四条里唯一不依赖导航推断的；仅 `dsh.client.platform` 超出可核范围 |

**审计指出的三处文档自身缺陷**
1. A 段称「每条可复核」，但唯一证据源（日志）被排除在审计范围外；A2/A6 还以「经复核」口吻引用了范围外原文。
2. 未承认反证：`SKILL.md:32` 明写先读 `PATHS-README.md`、`:36` 明写读同类插件 `lib/`——**指路存在，只是没被走**，与「没有任何触发器」「唯一载体」直接冲突。
3. 「路标放进 AGENTS.md 就有效」是同型外推，B 段没给它 UNVERIFIABLE 待遇。

**C3 措辞**：「逻辑上不自相矛盾」正确；「改写而非删掉矛盾」站不住（无矛盾可删），且直接删还会丢「省上下文可能反噬」这个唯一平衡条件。

**臃肿风险**：C1 整段清单 + C2 两处必做项 + C3 更长的改写稿 + C4 判据，3 处净增量；C1/C2 把「读哪些 UI 文档」升为必做，越过 `README.md:22` 的分工自述，属**向界面指路外溢**（不是向审美外溢）。

**最该修的一处（审计原话）**：C3 理由「A2、A5——这次的代价正是『省』出来的」——A 段没有一条把 9 条不满或 0 次读取归因到 `SKILL.md:38`，是把相关写成因果，也是全文从观察跨到结论的关键跳板。

**补测失败**：拟补统计 AGENTS.md 读取次数时，桌面上的 `session.v4.jsonl` 与 `新建 文本文档.txt` 已不存在（2026-11-13 23:00 前后被移走）。审计关于「在场=被读从未被测量」的判定，**保持 UNVERIFIABLE**。

---

## F. 最终决策（由 lead 依据 E 段作出）

按「证据是否独立于导航推断」分级：

1. **落盘 C4（收窄版）** — 唯一源码可证、不依赖推断的缺陷。
   - `preflight.mjs:238-239` 改为按 `exports['./client']` 指向读取（含条件导出对象），不再只认包根。
   - `crash.client-esm` 在「声明了 ./client 却找不到文件」时改判 FAIL，不再静默 PASS。
   - **去掉原提案里 `dsh.client.platform === 'web'` 那段**（审计：超出可核范围）。
   - `--self-test` 补 2 个用例：子目录 client 带 ESM → FAIL；声明 ./client 但文件缺失 → FAIL。
   - 验证：`node --check` 0；`--self-test` 9/9；骨架回归 0 FAIL；`test/preflight.test.mjs` 6/6；`test/template.mjs` 9/9；`test/mutate-preflight.mjs` 全绿。另用临时夹具做了变异证明：改坏→红、改回→绿、删文件→红。

2. **撤销 C3** — 原句逻辑不矛盾、删了会丢事故与平衡条件、「省导致返工」无因果。**`SKILL.md:38` 一字未动。**

3. **撤销 C1 与 C2 的「必做项」升格** — 审计判越界，且会把「读哪些 UI 文档」越过分界线变成硬流程、让包变臃肿。**`template/AGENTS.md` 一字未动。**

4. **落盘 C2′（最小指路，非必做）** — 在 `SKILL.md:32` 那句**已经存在**的指路后面补一句：任务涉及界面/设置页/Slot 时，顺着副本的 `dsh-doc/SKILL.md`「Read next」表读 `ui-plugin.md` 与 `templates/decoration/`，验证用 `verification.md`；说明文件都在包里、不必从零手写。
   - 理由只依赖 A2 的统计事实（ui-plugin.md 读 1 次、templates/ 0 次），不依赖「AGENTS.md 一直在场」或「需求变化触发」等未证机制。
   - 不新建体系、不升格必做、不迁载体、不碰 `:38`。

5. **未做、留作后续（不塞进本批）**：`README.md`/`SKILL.md` 中「完成验证」改「首装验证 / 启动期预检」。与本次主题无关。

**结论**：从「补路标」这个大方案里，最终只保留了**一个可证的代码修复**和**一句指路**。其余全部撤回。审计的作用不是给方案盖章，是把 3/4 的方案打掉——这正是派它的理由。

---

## G. 落盘后浮现的副作用（必须记录）

C4 让 `collect()` 第一次真正读到浏览器半文件，随即暴露一个**既有判据**的假阳性：

- `visible.slot-registration`（`preflight.mjs:159-173`）原本会把 `slots.inject(...)` 回调内出现 `slots.register` 判 **FAIL**。以前 `clientText` 恒为 null，这条只在 `index.js` 里查，从未触发。
- 修好路径后对真实项目 `dsh-tool-keeper` 跑，读到了 `ui/client.js:658`：
  `ctx.slots.inject('settings.section', function () { return ctx.slots.register({...}) })` → 判 FAIL。
- 但**官方模板** `host-skills/dsh-doc/templates/decoration/client.js:16` 用的正是同一形态（`slots.inject(key, () => ctx.slots.register(...))`），且该模板是宿主自带、可正常工作的。`dsh-enhance` 的 `ui/client.js:926` 亦然。
- 本机没有 2026-11-10「设置页看不到」那次事故的原始代码，**无法区分合法形态与事故形态**。

**处置（按本 skill 纪律「无法判定不是通过」，不伪造区分规则）**：把该分支从 `FAIL` 降级为 `UNVERIFIABLE`，附人工验法（打开设置页确认 Slot 可见；可见记合法，不可见再按事故处理）。既不误伤官方形态，也不把事故放行。

这说明一件值得记的事：**修好一个「静默跳过」之后，被跳过的判据会开始说话，而其中有些说的是错的。** 修路径不是终点，还得接住它放出来的信号。本次未新增判据、未改动任何其它 CHECK。

**最终验证**：`node --check` 0；`preflight --self-test` 10/10；骨架 0 FAIL；真实项目 0 FAIL（2 UNVERIFIABLE）；`npm test` 39/39；`npm run check` 全门通过（`packed` 6/6、`template` 9/9、`selfcontained` 全过、`template-e2e` 全过、`readme-claims` 24/24、三套 mutate 全变红）；`mutate-preflight` 由 5 注入点扩为 6（新增「子包 `ui/client.js` 带 ESM」）。

**最终落盘面**：`SKILL.md`（+2 行指路）、`preflight.mjs`（路径解析 + 声明缺失判 FAIL + slot 判据降级 + `--self-test` 4 个新用例）、`test/mutate-preflight.mjs`（注入⑥）、本提案文档（新增）。`template/AGENTS.md` 与 `SKILL.md:38` 一字未动。

**未验证**：`visible.slot-registration` 降级后的人工判读（需要打开设置页看 Slot 是否可见）；浏览器渲染/图标/详情图（无浏览器控制权）。这两项按 UNVERIFIABLE 留痕，不冒充通过。
