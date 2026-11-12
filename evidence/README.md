# evidence/

**这个包的证据。只回答一件事：当前的结论凭什么成立。**

---

## 这里有什么

| 文件/目录 | 是什么 | 谁在用 |
|---|---|---|
| [`audits/2026-11-11-拦截层存废裁定.md`](audits/2026-11-11-拦截层存废裁定.md) | 独立反方审计：**为什么这个包不再拦人**。审的是当时的代码，结论已执行并升格为 [ADR 0002](../docs/adr/0002-拦截层废弃.md) | ADR 0002 的数据源；「17 拦 0 真阳性」等数字的唯一原始依据 |
| [`2026-11-09-real-host.md`](2026-11-09-real-host.md) | **旧形态**（阶段门插件）的唯一真机存证：9 场景 e2e、9/9 通过 | 历史凭据——证明旧形态曾经真机可用，不代表现行产品 |
| [`skills-v1-history.bundle`](skills-v1-history.bundle) | 已删除的 `.dsh/skills/` 开发树的 git 历史（34.7KB） | 「当初删了什么」的凭据 |
| [`process-lab-legacy/evidence.md`](process-lab-legacy/evidence.md) | 旧判据的可信度论证全文。**仍承重的部分**：两条未关闭边界（成本只测过一半 / 换人未测）仍是现行主张的边界 | 现行边界论证引用它；ADR 0001 据此降级审查员产品定位 |
| [`redefinition/需求.md`](redefinition/需求.md) | 2026-11-13 重定义的 P0 验收表（A1–A10）——**已执行完毕的凭据** | 重定义验收的原始判定式；独立审查员对着它审的 |
| [`redefinition/探针记录.md`](redefinition/探针记录.md) + `probe-t1/t2/t3.mjs` | 三条探针的结论与可复跑脚本（asar 结构、dsh-skill 契约、client.js ESM 判定式） | SKILL.md / preflight 多条判定式的出处 |
| [`redefinition/运行时验收.md`](redefinition/运行时验收.md) | P3.5 一次性 profile 真机验收记录（A8） | 0.2.0 装配层 L1 证据 |

---

## 什么**不**在这里

**历史审计报告全部删除了（2026-11-12）。** 原因是它们审的对象不在本仓：

- 8 份审 `dsh-plugin-process-lab`（另一个仓，已归档）
- 2 份审 `.dsh/skills/plugin-kit/`（本仓的旧开发树，已删）
- 3 份是本仓的过期快照（`@007ace2` 时代，落后几十个提交）

**保留它们不是「留个记录」，是制造误导**：读者点进去会看到 400 行讲着另一个仓的数字，而正文里的旧语义（阶段门会拦人）已经被推翻。删除的那批文件里，有 78 处引用了本仓不存在的文件名——它们本来就已经断了。

**2026-11-13 重定义时又按同一判据删了**：旧九阶段判据正文（process / tools / walkthrough，机制已退役、通用纪律已收编进现行 SKILL.md；完整原文在 git）。`reviewer.md` 不在此列——它迁去了 [`docs/reviewer.md`](../docs/reviewer.md)，因为审查员协议是本仓**现行**的开发纪律，不是 legacy。

---

## 论证与凭据的分工

| 位置 | 承载 | 读者 |
|---|---|---|
| [`../CONTEXT.md`](../CONTEXT.md) + [`../docs/adr/`](../docs/adr/) | **现行主张**：词汇表、三个重大决策及其依据 | 所有人 |
| `evidence/`（本目录） | **凭据**：主张引用的原始报告与实测记录 | 维护者，想复核结论怎么来的 |

旧判据「哪些证明过、哪些没证明」的完整论证在 [`process-lab-legacy/evidence.md`](process-lab-legacy/evidence.md)——它的两条未关闭边界仍然承重，其余内容只对旧形态有效。
