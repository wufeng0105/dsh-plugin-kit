# 参考项目结论存根

> 用途：`REFERENCE-STUDY.md` 的证据源。20 份分析原本只在会话上下文里，按「跨段状态只有落盘走得通」落盘于此。
> 来源：两份 workflow（`audit-reference-repos` 前 8 份全文、`audit-reference-repos-2` 后 12 份结构化）。
> 纪律：全部为**只读研究**——分析者未读 .git 历史、未运行工具、只做静态判读。标注 UNVERIFIED 的不是事实。
> 本地克隆根：`docs/repos/`。行号/路径均相对各仓库根。

## 结论存根（每项目一句 + 关键出处）

| 项目 | 机制形态 | 一句话结论 | 关键出处 |
|---|---|---|---|
| adr/madr | 模板 + 状态 | 决策记录模板；`Confirmation` 节预写"如何确认被实现"，optional、无强制 | `template/adr-template.md:42-44`、`docs/decisions/0018:30-33` |
| github/spec-kit | 判据写进命令模板 + workflow gate | 约定与执行入口共用同一载体；`analyze` 只读、禁臆造；三态证据表 | `templates/commands/plan.md:68-69`、`analyze.md:58,247-250`、`extensions/bug/commands/speckit.bug.test.md:96-101,193` |
| danger/danger | PR diff → 规则 → 回帖 | 必然靠 CI 的 PR 事件；`resolved_violations` 对比上次；`Danger: Ignore "原判词"` 豁免 | `docs/guides/what_does_danger_do.md:14`、`.github/workflows/CI.yml:49-54`、`comments_helper.rb:63-83` |
| reviewdog/reviewdog | linter 输出按 diff 过滤回帖 | `filter-mode` 界定审查范围；rdjson 结构化输出 | `README.md:924-935`、`proto/rdf/README.md:22-33` |
| pre-commit/pre-commit | git 钩子 + 判据 schema | `check-hooks-apply` 保证每条规则至少命中一个文件；二态 Passed/Failed，表达不了「带条件」 | `pre_commit/meta_hooks/check_hooks_apply.py:14-28`、`clientlib.py:230-265`、`run.py:203-215` |
| typicode/husky | git 钩子 + 退出码 | 非零退出码硬阻断；空脚本 `exit 0` 静默成功；`HUSKY=0` 一行绕过 | `husky:6,17-22`、`docs/how-to.md:20-46` |
| open-policy-agent/conftest | Rego 策略即代码 | 判据可单测、可复跑；`warn` 默认不阻断；exception 空串匹配所有 deny | `docs/index.md:43-52,239-251`、`docs/options.md:155-165`、`docs/exceptions.md:22-24` |
| stoplightio/spectral | 声明式 ruleset | 判据 `given`+`then`+`severity`；空集硬报错（开关默认关）；规则自带 description 压缩自由裁量 | `packages/cli/src/services/linter/linter.ts:43-45`、`docs/guides/4a-rules.md:121-125` |
| evilmartians/lefthook | 配置 + AI 事件注册 | `ai:` 把 Stop/PreToolUse 映射到门禁；`check-install` 0/1 验已接线；`assert_lefthook_installed` 拒绝静默跳过 | `docs/configuration/ai.md:9-20`、`docs/usage/commands/check-install.md:7-11`、`docs/configuration/assert_lefthook_installed.md:9` |
| sverweij/dependency-cruiser | 依赖规则契约 | `required` + `reachable:true` 正面断言；`--baseline` 已知违规基线；static only，补不了运行时 | `doc/rules-reference.md:87-95`、`doc/cli.md:832-859`、`doc/faq.md:510-530` |
| tufin/oasdiff | 两版规范 diff | 内容指纹 `SHA256(...)[:12]` 跨 commit 携带决定；coverage map（covered/waived/uncovered）；`TestBoundCellsFire` 证明判据会红 | `docs/FINGERPRINT.md:7-13`、`docs/CHECKS.md:74-80`、`docs/CUSTOMIZING-CHECKS.md:98,118` |
| obi1kenobi/cargo-semver-checks | rustdoc 差分 + 汇总门禁 | 退出码 0/100/101 区分通过/违规/检查无法完成；baseline 快照必须提交否则 CI 失败；零误报目标 + 假阳性模板 | `README.md:223-231,532-540`、`CONTRIBUTING.md:372`、`ci.yml:105-137` |
| bufbuild/buf | buf.yaml + breaking diff | `use:` 引用具名规则集、禁注释豁免；基线产物化可复跑；emergency-review-bypass label 可绕 | `buf.yaml:5-13`、`README.md:123`、`.github/workflows/emergency-review-bypass.yaml:10-11` |
| changesets/changesets | 变更时刻写意图文件 | 结构化 WHAT-WHY-HOW 问卷；`--empty` 专门绕过阻塞门禁，产物只是空 front matter | `docs/adding-a-changeset.md:32-37`、`docs/command-line-options.md:55-66` |
| semantic-release/semantic-release | 约定式提交驱动发布 | 9 步流水线 + verifyConditions 前置校验；dryRun 无副作用预演；`[skip release]` 绕过；verifyConditions required:false 即无门 | `README.md:84-96`、`lib/definitions/plugins.js:11,22,33`、`index.js:43-45` |
| microsoft/rushstack | CI 必经接线 + API 报告基线 | `change --verify` 写进默认 CI；API 报告与 Git 基线逐字比对；`--bypass-policy` 可跳；批量抑制压掉上千违规 | `.github/workflows/ci.yml:60-62`、`apps/api-extractor/.../api-extractor-template.json:193-194`、`eslint/eslint-bulk/README.md:16-21` |
| projen/projen | 单一真源全量重合成 | `is-it-a-finding` 五闸门；引用权威顺序；变异后仍绿才算数；AGENTS.md 本身由 projen 生成；`projen eject` 可整体退出 | `skills/projen-review/projen-review-principles/SKILL.md:50-107`、`src/ai-instructions.ts:287-301`、`docs/concepts/ejecting.md:8-21` |
| copier-org/copier | 模板 + 状态快照 + 生命周期钩子 | validator 空渲染=通过、非空=报错；`_commit`/`_src_path` 快照；`--UNSAFE` 一次放开危险特性 | `docs/configuring.md:280-282`、`docs/creating.md:62-68`、`docs/configuring.md:1869-1873` |
| pact-foundation/pact-js | 契约文件 + 双端重放 | 测真实 client 而非裸 HTTP；`verifyProvider()` 不符即红；CI 把 skipped/cancelled 也判失败 | `docs/consumer.md:96`、`docs/provider.md:320-322`、`.github/workflows/test.yml:27-49` |
| pact-foundation/pact_broker | 契约中心 + webhook | 内容变更事件自动拉起构建；**无验证结果即不通过**；`can-i-deploy --ignore Dog` 绕过 | `README.md:52,64-65`、`docs/developer/matrix.md:19,87-89` |

## 三条横切警示的证据

| 警示 | 证据 |
|---|---|
| 机制存在 ≠ 接上了 | danger 自 CI `echo 'bundle exec danger --verbose'`（`CI.yml:49-54`）；husky `[ ! -f "$s" ] && exit 0`（`husky:6`）；reviewdog 默认 `-fail-level=none` 返回 0（`README.md:917-920`）；conftest warn 默认不阻断（`docs/options.md:155-165`）；spectral `--fail-on-unmatched-globs` 默认 false（`docs/guides/2-cli.md:47`）；changesets `--empty`（`docs/command-line-options.md:55-66`）；oasdiff waived 缺口（`docs/CHECKS.md:78`） |
| 每个项目都有官方绕过通道 | `HUSKY=0`/`--no-verify`、`SKIP=hookid`、`LEFTHOOK=0`、`Danger: Ignore "原判词"`、conftest exception 空串、`severity: off`、`--no-config`、`[skip release]`、`can-i-deploy --ignore Dog`、buf emergency label、projen `eject`、copier `--UNSAFE` |
| 「必然发生」是有条件的必然 | spec-kit clarify/checklist/analyze 全 optional，`implement.md:79-84` 答一句 yes 即放行；hook 声明 mandatory 但模板不评估 condition（`docs/extensions/api.md:741,753`）；所有钩子都要一次性接线 |

## UNVERIFIED 汇总

- 20 份分析全部只读、未跑工具、未读 .git 历史；「必然触发/只查格式」多为配置文件的静态判读。
- spec-kit 引擎侧是否真强制 `optional:false`：仅见文档层不一致，未读 HookExecutor 源码。
- 各项目「实际 CI 行为」未复跑；`danger` 的 `echo` 是静态读到的配置。
- 前 8 份为自由文本、后 12 份为 schema 结构化，粒度不同，不等于证据强度不同。
- 我们自己的 skill 材料，20 份分析者多数未读；其「补到我们哪份文件」为映射推测，正文引用时只作落点参考。
