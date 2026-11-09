# 《Skill 体系的两层设计》审计

审计对象：`process-lab/SKILL-LAYERING-DESIGN.md`（228 行）
审计方式：只读。内置 4 个 skill 从**已安装的 `app.asar`（DSH 0.2.2-rc.1）**解出核对，并与工作区副本 `dsh-agent-preset-skills/`（2026-11-04 快照）逐文件比对；`plugin-kit` 与 `process-lab` 其余文件直接读。

未安装任何 bundle，未改动 `$DSH_HOME`，未修改除本文件外的任何文件。

行号约定：引用内置 skill 时给的是**工作区副本**（`dsh-agent-preset-skills/`，2026-11-04 快照）的行号；引用已安装版时单独注明。两者内容有漂移（见 M-5），核对过的差异已在正文标出。

---

判定：PASS-WITH-CONDITIONS

阻断缺陷（仅限以下三种情形）：
  无。
  三类阻断候选逐条排除，理由见「二、阻断候选为什么都不成立」。

重要缺陷：
  I-1 「内置=事实 / plugin-kit=判断」的二分不干净，且被文档自己推到了绝对化（「内置根本没有，也永远不会提供」）。内置里存在认识论与设计判断内容：`cordis-plugin-development/SKILL.md:25`「installation and slot registration alone do not establish what the user sees」；`references/host-plugin.md:53`「do not claim visual success from installation alone」、`:68`「report success only after observing the requested capability」；`references/verification.md:3`「A screenshot of a mock page is not verification of the running plugin」；`references/practices.md:3`「the installed Harness is the authority」；`references/user-actions.md:11`「Do not maintain separate operation logic in the UI and tool paths」；`references/practices.md:10`「use the weakest mechanism that suffices」；`editing-cordis-compositions/SKILL.md:76-80`「Choose plugin placement」。影响：文档的判别轴选错了（选了"事实/判断"，应选"领域契约知识 / 裁决程序与权限"）。按现文本，`SKILL-LAYERING-DESIGN.md:168`「这是内置永远不提供的」与 `:226`「内置根本没有，也永远不会提供」被证伪；一个照决策树走的维护者会把"验证诚实"这类规则当成自建独占，重复编写或无视内置已有约束。不需要推翻两层论，但这句话必须降级为「不提供成体系的裁决程序（谁判、证据多强、判错怎么复核）」。
  I-2 原则 1／原则 4／决策树把"归内置"当成一个可执行动作，而 `:149` 自己承认内置侧动不了（「内置反过来引用 plugin-kit（动不了，写了也白写）」）。同一条流里出现两个互斥前提：`:109`「事实……→ 内置」、`:140`「会 → 归内置」、`:157`「是 → 归内置。不要自建。结束。」对上 `:149`「动不了」。影响：对"随宿主升级失效、但内置并未覆盖"的知识，三条规则给了三个不同处置（归内置 / 不要自建 / 只能留在本地），维护者无从执行；结论段 `:226`「属于内置的地盘」也没有落地动作（删？上报上游？保留粗化版？）。必须补第三个动作，否则原则 1 与原则 5 在字面上互相矛盾。
  I-3 2.2 的「零覆盖」是过度陈述，且出处标错。发版：`cordis-plugin-development/references/host-plugin.md:35`「For a packed or published bundle, verify the actual packed file list」；升级：`references/practices.md:22`「the user's patch layer survives upgrades」、`SKILL.md:49` 的 "upgrade stability" 一行；退役：`references/host-plugin.md:70`「`remove_bundle` removes a bundle」、`editing-cordis-compositions/SKILL.md:70` 的 legacy preset 删除步骤。出处：文档写「覆盖映射（三轮实验时做过）」（`:28`），但 process-lab 里唯一的"覆盖映射"是 `impl/round2-draft-studio/02-plan.md:135` 的**验收项→步骤**映射，与内置 skill 覆盖无关；仓库内没有该表的任何工件。影响：结论（不是重复）仍然成立——碎片不等于流程——但"零覆盖"作为事实陈述不准确，且把一条新断言包装成旧工件，审查者无法按图索骥复核。正确表述应是「无阶段化流程，只有零散操作条目」。
  I-4 自查「不该改 1：23 条铁律全部是判断不是事实」（`:212-214`）不成立。`plugin-kit/references/process.md:92` 铁律 23「显示形态 ≠ 契约形态」是关于 `Config.listConfigs` 返回字段的宿主契约事实，与 `references/tools.md:64` 的"坑 2"是同一条知识；`:52` 铁律 6 的 `DOMRect` 序列化事故同样依附宿主/浏览器事实。影响：按原则 1，这两条至少有一部分属于"会随宿主升级失效"，应当外置；但内置并未记载这处 id 二元性（已安装 `host-plugin.md` 只说"query `Config.listConfigs` for an installed plugin's schema"），于是按决策树执行 = 丢掉唯一记录。这条与 I-2 是同一个洞的两端，必须一起修。
  I-5 原则 3 与自查「不该改 2」打架。`:132` 明说"知识够了但没被加载/执行 → 流程机制"，且"不该用什么"一栏写「❌ 不该再加一个 skill」；而 `:218` 判定「阶段卡和审查员机制」符合原则 3——它们恰恰装在一个 skill 里（`.dsh/skills/plugin-kit/SKILL.md`），其生效前提仍是"这个 skill 被加载"。影响：按原则 3 字面，plugin-kit 的"执行机制"那一半应当迁到 `AGENTS.md` 或插件，与"不该改 2"的结论相反。文档需要一句区分（判据文本可以住在 skill 里；强制力必须来自别处，如 `assets/AGENTS.template.md` + 人工开门），否则原则与自查结论互相拆台。
  I-6 主题地图（第七节）有 4 处实质缺口，其中 2 处是"明显遗漏"而非"还能更详细"：
    (a) 缺一整类形态决策：**该放 Host 还是放 preset**。地图只有"Host-only / 双面 / 配置型"这一轴（这一轴路由是对的，`cordis-plugin-development` 的 `host-plugin.md` 确实覆盖 Host-only 与 configuration-only bundle）。但"这个能力该由 Host 提供还是由 preset 提供"是另一条更早的分叉，判据在 `editing-cordis-compositions/SKILL.md:76-80`（Host plugins supply shared services；preset plugins contribute scoped tools/persona/policies；preset 提供 service 必须同 realm 隔离）。`cordis-plugin-development` 对此只有一句"Load `editing-cordis-compositions` for agent preset changes"（`:8`）。地图没有这一行，而它恰恰决定后面所有技术细节该去哪个 skill 找。
    (b) `agent-experience` 被窄化成"tool 定义"。它的 description 明确覆盖 "designing skills, context loading, or multi-step workflows"（`agent-experience/SKILL.md:3`）。这份文档本身就在设计 skill，地图却没有"怎么写/改一个 skill、怎么让它被发现、资源怎么按需加载"这一行——这是最扎眼的一处遗漏。
    (c) MCP 接入无行。`cordis-plugin-development/references/mcp-bundle.md` 是一整类形态（配置型 bundle 接 MCP），"配置型"三个字不足以让模型知道有专文。
    (d) "插件怎么保存自己的配置/密钥"无行。已安装 0.2.2-rc.1 的 `host-plugin.md` 有 §Persist your own configuration（`ctx.fiber.entry` + `configEditor`、`ctx.credentials.modifyRecord`），作者所用的 11-04 副本没有这一节。
    影响：(a)(b) 会让"按主题指向"落到错的或空的 skill 上；(c)(d) 会让模型自己发明配置持久化与 MCP 接入方式，正是该表想避免的。判据是"明显遗漏"而非"还能更详细"：这四条都能在 8 分钟内从已安装的 4 个 skill 里点名到具体文件，且每一条漏掉都会导致模型走错路或自造实现。
  I-7 路线 A 的"致命点"打偏。`:76` 判它死于「指针会失效：内置在 `app.asar` 里，你控制不了它改章节名」，但原则 5（`:148`）已经把指针限制在"按主题"这一级，而主题级指针在本次实测的版本漂移中并未失效：4 个 skill 名、章节主题都没变，只是 `host-plugin.md` 多了 1.5 KB 一节。真正致命的是路线 A 自己的第二条 ❌（`:77`「模型未必去读」）加丢失兜底。影响：读者会学到错误的教训（以为"指针"本身不可用），也会低估路线 A 的真实代价。否决结论不变，理由要换。

次要缺陷：
  M-1 标题级口径不严：`app.asar` 内除这 4 个之外还有 `dsh-official-plugins`、`dsh-personalized-pages` 两个 bundled skill，`runtime/office-skills/` 另有 7 个（本会话目录里都可见）。`:3`「app.asar 里的 4 个」按 `:11` 的路径限定是对的，但没有限定词时会被读成"DSH 只有 4 个 skill"。
  M-2 rank 段落（`:37-39`）有三处要写准：①「低 rank 被丢弃」若按数值读，与下一行优先级表**方向相反**。实现是升序排序取首个（`compareIndexedCandidates` 按 `rank` 升序，`collectLayer` 首见即胜），因此 rank 100 胜 600，被丢弃并 warn 的是数值大、优先级低的那一侧。这不影响结论，但照字面读会得到"项目 skill 被内置压掉"的错误认知，而这恰好是路线 B 与"兜底"论证的机制前提；② rank 只在**同一 layer 内**决定同名胜负，跨层是"最近层直接获胜"且无 warn（`@deepseek-ai/dsh-skill/lib/index.js:115` 注释、`collectFresh` 的 `merged.set`）；③ 这 4 个内置 skill 实际挂在 `customSkillDirs`（rank 300 —— shipped patch 的 `skill-filesystem` 行把 `@deepseek-ai/dsh-agent-preset` 的 `skills` 目录塞进 `customSkillDirs`），不是链尾的 bundled（600）。
  M-3 路线 B 的第三条 ❌「绕过了『不能调整 app.asar』的前提」（`:88`）与 2.3 的「技术上完全可行」（`:41`）措辞冲突：同名覆盖并没有改动 `app.asar`。若原意是"绕过了该约束的意图"，应写成"规避了约束的意图"，否则读者会以为技术上不可行。
  M-4 原则 2「措辞过时（写死路径）→ 哪都别放」（`:121`）应改为"去路径化后保留"。按字面执行会误伤"内容有效、只是写法过时"的规则。
  M-5 文档没有标注内置版本基线。我实测工作区副本（11-04）与已安装 0.2.2-rc.1 并不一致：`host-plugin.md` 6883 vs 5300 字节、`cordis-plugin-development/SKILL.md` 8131 vs 8147、`packages.md` 43771 vs 41180。2.1 与第七节的核对因此不可复现——这恰好是文档自己主张"事实会随宿主升级失效"的实证，但应写进文档，作为主题地图的版本前提。
  M-6 `:65`「不能把地图和地图的可信度说明合并成一张图」是类比，不是论证。结论（不该合并）另有更好的理由（裁决程序需要独立角色与独立证据等级），建议换成理由本身。

---

## 一、总评

核心结论站得住：**不是重复，是错层；采用路线 C；该补主题指向。** 我核实了支撑它的全部关键事实，没有发现足以推翻它的反例。

站不住的部分集中在两处：一是把"两层"说成了"事实 vs 判断"，并推到"内置永远不会提供"这种可被引文直接证伪的强度；二是把"归内置"当成可执行动作，而文档自己承认内置侧动不了。这两处不改，会让后来的人要么删掉只存在一份的知识，要么重复编写内置已有的约束。

第三处是自查的覆盖面：「2 处该改、2 处不该改」里，两处"该改"成立，但"不该改 1"（23 条铁律全是判断）的论据是错的——至少铁律 23 是宿主契约事实。

## 二、阻断候选为什么都不成立

1. **核心判断错了吗（两层论）**——没有。二分不干净（I-1），但"不是同一层的两个实现、合并会失败、`plugin-kit` 的价值在裁决程序"这三条都成立：内置 4 个 skill 的绝对主体是 API/patch 方言/清单/UI 规则，认识论内容只是零散的一两句，且没有证据等级、没有独立审查角色、没有"判错怎么复核"。修正到"领域契约知识 / 裁决程序与权限"即可，不需要换结论。
2. **原则之间互相矛盾到按它执行会打架吗**——有一条字面矛盾（I-2：归内置 vs 动不了），但存在显然的善意读法（"属内置所有"而非"放进内置"），且 `:204` 的改法给了可执行的代理（降级 + 粗化保留 + 主题指向）。它会造成"该写的不写"或"该删的没删"，属于需要修的洞，不属于"按它执行必然打架"。
3. **漏掉明显更优的路线吗**——没有。我按机制重新推了一遍候选：把技术细节改成运行期探测（已含在该改 1）、把长规则拆进 `AGENTS.md`（原则 4 已含、`assets/AGENTS.template.md` 已实现）、把 skill 作为 bundle 运行时注册（`ctx.skills.register` / `registerProvider`，rank 250/600，可打包随 profile 发布）、从 `app.asar` 自动同步影子副本到 `.dsh/skills`（同名覆盖，rank 100）。后两条确实存在，但没有一条明显更优：运行时注册同样解决不了"正文按需加载"，影子副本仍要自己背维护与静默覆盖，且都不改变"判断该住哪一层"这个真问题。路线 C 不是最优解里最漂亮的，但没有被漏掉的更优解。

## 三、四个指定问题的回答

**1. 事实核查（逐条）**

| 文档断言 | 核实结果 |
|---|---|
| `dsh-skill/lib/index.js:319-322` 同名按 rank 覆盖、低优先级丢弃并 warn（`:37`） | ✅ 行号与内容都对得上（已安装 0.2.2-rc.1，`collectLayer` 的 `seen.has` 分支）。warn 文案是 "ignored because a higher-priority skill already exists" |
| rank 链 100/200/300/400/500 + bundled（`:39`） | ✅ 常量全部命中（`dsh-skill-filesystem`）；`BUNDLED_SKILL_RANK = 600`。但见 M-2：这 4 个内置实际在 300，不在 600；且 rank 只在同层内裁决 |
| 「用同名覆盖内置技术上完全可行」（`:41`） | ✅ 成立，且比文档设想的更容易（100/300 的差距） |
| 「现在对内置只有 description 一句防撞车，正文 0 处引用」（`:208`） | ✅ 全仓 grep 只命中 `SKILL.md:3` 的 description，正文确为 0 |
| 「`references/tools.md` 写了大量具体调用参数」（`:200`） | ✅ 命中：inspect 的 provider/method 表、`plugin_manager` 返回判读、`dsh plugin --profile` 子命令、`recheck.mjs` 参数 |
| 内置 4 个的覆盖范围（2.1） | ✅ 四条描述均与正文相符（含 `agent-experience` 的"上下文经济"） |
| 门禁/发版/升级/退役 零覆盖（`:33`） | ⚠️ 门禁确实为零；发版/升级/退役各有零散条目（I-3）。**这条是文档最需要改的事实陈述** |
| 「覆盖映射三轮实验时做过」（`:28`） | ❌ 找不到对应工件；三轮里的"覆盖映射"是验收项→步骤映射（I-3） |

**2. 「两层论」成立到什么程度**

方向对，边界脏。文档的第三张表（`:54-59`，回答的问题 / 知识类型 / 失效原因 / 有效性来源）比它的口号（`:61`）准确得多：真正把两套分开的是**"谁有权判、证据多强、判错怎么复核"**，而不是"事实 vs 判断"。内置里有事实也有判断（引文见 I-1），`plugin-kit` 里也有事实（铁律 23，见 I-4）——两个集合都不是纯的。修正到"内置=领域契约知识与轻量实践规则；plugin-kit=裁决程序、权限与证据制度（可执行、可复核、带独立角色）"后，二分干净且结论不变。

**3. 路线 C 的冗余代价是否被诚实交代**

诚实，且理由不是自我合理化，但适用范围被说大了。

- "内置未必被加载"是机制事实，不是猜测：skill 目录（`<available_skills>`，每个 skill 一行 name+description）注入每个会话，**正文只有显式调用 `skill` 工具才会加载**。所以内置未加载是常态，不是预算意外——文档写的"因上下文预算没被加载"（`:101`）把常态说成了偶发。
- 因此"`plugin-kit` 里留一份粗略版做兜底"在**流程/判据**上是真兜底：这部分内置确实没有。
- 在**技术事实**上这个理由很弱：宿主事实可以靠 `cordis_inspect_list/query` 在运行时现取，不需要任何 skill 备份。文档用"某些技术点两份都提"（`:98`）来论证冗余合理，恰好挑了自己最弱的那一类。该改 1（把事实降级并外置）与这一点其实是一致的，只是文档没把"兜底只对判据成立"说出来。

**4. 原则与决策树会不会打架**

会，两处：I-2（归内置 vs 动不了）、I-5（执行机制不该做成 skill vs 阶段卡和审查员就在 skill 里）。另外决策树缺一个分支："随宿主升级失效、但内置没覆盖"——现有三条出口（归内置 / 不写 / 自建）没有一条是它要的。

**5.「两处该改」是否成立**

- 该改 1（`references/tools.md` 的命令细节）：**成立**。内容是宿主事实，且多数可在运行期现取（provider/method 用 `cordis_inspect_list`，安装结果看 `application/warnings`——后者内置也写了）。改法的边界要守死：`scripts/recheck.mjs` 的参数是 `plugin-kit` 自有资产的接口，不是宿主事实，不能一起外置。
- 该改 2（补主题指向）：**成立**，前提是先修 I-6，否则会把模型指到错的 skill 或指空。
- 不该改 1（23 条铁律）：**不成立**，至少铁律 23（以及铁律 6 的事故依赖）是宿主契约事实（I-4）。
- 不该改 2（阶段卡与审查员）：**结论成立、论据不成立**——它符合的是原则 3 的"解法"列，却正撞在原则 3 的"不该用什么"列上（I-5）。补一句机制落点即可。

## 四、我核实了什么，才判定"核心站得住"

1. 从 `app.asar` 解出 4 个 skill 的全部 13 个文件（DSH 0.2.2-rc.1），逐篇读完，确认 2.1 的四条覆盖描述与正文相符，并确认"门禁/审查员角色"这一类内容确实不存在。
2. 解出 `@deepseek-ai/dsh-skill/lib/index.js`，确认 `:319-322` 就是同名丢弃 + warn 的那四行；解出 `dsh-skill-filesystem/lib/index.js`，确认 100/200/300/400/500 与 600 的常量，并确认这 4 个内置是由 shipped patch 的 `customSkillDirs`（300）挂进来的。
3. 全仓 grep `plugin-kit`，确认正文对 4 个内置的引用数为 0、description 为 1 处——该改 2 的前提为真。
4. 把工作区副本（11-04）与已安装版逐文件比大小/哈希/差异行，确认版本漂移真实存在（`host-plugin.md` 多一节、`packages.md` 多 2.6 KB），因此"写路径/章节名会失效"是真风险、"写主题名"在本次漂移中未失效。
5. 在 `process-lab` 全仓找"覆盖映射"的出处，确认只有验收项映射，没有内置覆盖映射工件。
6. 读 `plugin-kit` 的 `SKILL.md`/`process.md`/`reviewer.md`/`evidence.md`/`tools.md`/`assets/AGENTS.template.md`，确认 23 条铁律里混着宿主事实（铁律 23、6），且阶段门/审查员确实以 skill 为载体、以 `AGENTS.md` 模板为强制力补充。
7. 按机制重推了 4 条替代路线（见上文阻断候选 3），确认没有明显更优解。

## 五、判定条件

按下列顺序修，改完可转 PASS：

1. 删掉「内置永远不提供」类绝对断言，把判别轴换成"领域契约知识 / 裁决程序与权限"（I-1）。
2. 给"归内置"补上可执行动作，并在决策树加一支"随宿主失效但内置未覆盖"（I-2、I-4）。
3. 2.2 改为"无阶段化流程，仅有零散条目"，三条反例各写一句，出处标成作者核对而非三轮工件（I-3）。
4. 「不该改 1」收窄为"23 条中的裁决类不改；铁律 23 的宿主事实部分需单独处置"（I-4）。
5. 原则 3 补机制落点：判据文本住 skill，强制力住 `AGENTS.md` + 人工开门；据此收窄"不该再加一个 skill"的适用范围（I-5）。
6. 主题地图补 (a)(b)，并为 (c)(d) 各加一行（I-6）。
7. 换掉路线 A 的致命点，改为"丢兜底 + 模型未必去读"（I-7）。

只做 1/2/3，即可维持当前的 PASS-WITH-CONDITIONS。

## 六、审计边界

- 未安装任何 bundle、未启动或改动 `$DSH_HOME`、未跑三轮的 `node --test`/`npm pack`；`app.asar` 仅只读解析（解出的临时副本在 `%TEMP%`）。
- 未验证"skill 因上下文预算未加载"的因果，只验证了"正文按需加载、目录每会话注入"这一机制事实。
- 未评估内置 4 个 skill 与 `plugin-kit` 的内容优劣（按任务约定不在范围）。
- 未审文笔、排版、详细程度，未审三轮实验历史细节，未审未来规划。

## 附：证据索引

| 用途 | 位置 |
|---|---|
| 内置 4 个（工作区副本，核对 2.1 / 第七节） | [agent-experience](../dsh-agent-preset-skills/agent-experience/SKILL.md)、[cordis-plugin-development](../dsh-agent-preset-skills/cordis-plugin-development/SKILL.md)、[cordis-composition-reference](../dsh-agent-preset-skills/cordis-composition-reference/SKILL.md)、[editing-cordis-compositions](../dsh-agent-preset-skills/editing-cordis-compositions/SKILL.md) |
| I-1 引文（内置里的认识论/判断） | [cordis-plugin-development/SKILL.md:25](../dsh-agent-preset-skills/cordis-plugin-development/SKILL.md)、[host-plugin.md:53](../dsh-agent-preset-skills/cordis-plugin-development/references/host-plugin.md)、[verification.md:3](../dsh-agent-preset-skills/cordis-plugin-development/references/verification.md)、[practices.md:3](../dsh-agent-preset-skills/cordis-plugin-development/references/practices.md)、[user-actions.md:11](../dsh-agent-preset-skills/cordis-plugin-development/references/user-actions.md) |
| I-3 零覆盖反例 | [host-plugin.md:35](../dsh-agent-preset-skills/cordis-plugin-development/references/host-plugin.md)、[practices.md:22](../dsh-agent-preset-skills/cordis-plugin-development/references/practices.md)、[host-plugin.md:70](../dsh-agent-preset-skills/cordis-plugin-development/references/host-plugin.md) |
| I-3 出处误标 | [02-plan.md:135](impl/round2-draft-studio/02-plan.md)（是验收项映射） |
| I-4 铁律 23 | [process.md:92](../.dsh/skills/plugin-kit/references/process.md)、[tools.md:64](../.dsh/skills/plugin-kit/references/tools.md) |
| I-5 机制载体 | [SKILL.md](../.dsh/skills/plugin-kit/SKILL.md)、[AGENTS.template.md](../.dsh/skills/plugin-kit/assets/AGENTS.template.md) |
| 该改 2 前提 | [SKILL.md:3](../.dsh/skills/plugin-kit/SKILL.md)（全文唯一一处内置引用） |
| I-6(a) 放置判据 | [editing-cordis-compositions/SKILL.md:76](../dsh-agent-preset-skills/editing-cordis-compositions/SKILL.md) |
| I-6(c) MCP 接入 | [mcp-bundle.md](../dsh-agent-preset-skills/cordis-plugin-development/references/mcp-bundle.md) |
| I-6(d) 配置持久化（仅已安装版有，11-04 副本无此节） | 已安装 `@deepseek-ai/dsh-agent-preset/skills/cordis-plugin-development/references/host-plugin.md` §Persist your own configuration |
| M-2 rank 排序方向 | 已安装 `@deepseek-ai/dsh-skill/lib/index.js`：`compareIndexedCandidates`（`rank` 升序）+ `collectLayer`（首见即胜、warn） |
