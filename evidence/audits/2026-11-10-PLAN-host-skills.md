# 计划：把宿主内置 skill 收进 plugin-kit

> 状态：**待批准，未动手**
> 日期：2026-11-10
> 依据：用户 2026-11-10 指示 + 对仓库的完整盘点

---

## 一、现状盘点（实测）

### 1.1 仓库

| 项 | 值 |
|---|---|
| 路径 | `DshBundle\dsh-plugin-kit` |
| git | `main` @ `007ace2`，**0 未提交** |
| remote | `github.com/wufeng0105/dsh-plugin-kit`（private） |
| 测试 | `npm test` **88/88 通过** |

### 1.2 目录

```
dsh-plugin-kit/
├── index.js            492 行   Host 半，4 行启动日志 + 3 段接线
├── lib/                gate.js / ledger.js / skill-provider.js / discipline.js
├── vendor/             ⚠ config.js + schemastery.mjs + cosmokit.mjs（运行时依赖）
├── skills/plugin-kit/  SKILL.md + references/6 + assets/3 + scripts/1
├── test/               9 文件（gate/ledger/skill-provider/smoke/readme-claims/
│                              failure-signals/mutate/real-host-check/e2e）
├── evidence/           不进 npm（audits 9 / ledger 2 / requirements 3）
├── locale/             en.json / zh.json
└── scripts/            ⚠ 空目录（git 未跟踪）
```

### 1.3 两个必须先解决的冲突

#### 冲突 A：`vendor/` 已被占用

`package.json` 的 `files` 里已有 `vendor`，`index.js:56` 有：

```js
export { Config } from './vendor/config.js';
```

**`vendor/` 现在装的是运行时代码依赖**（schemastery + cosmokit，因为宿主不保证提供）。如果往里塞宿主文档，语义会混。

**受影响**：无运行时风险（`host-skills/` 是子目录，不影响 `./vendor/config.js` 解析），但**目录语义混乱**。

#### 冲突 B：skill 目录有「双树一致性」守门

`test/readme-claims.mjs:26-27` 写死：

```js
/** 权威源 skill 目录：包内 skills/ 是它的构建产物，双树一致性由测试守门。 */
const SKILL_DIR = resolve(ROOT, '..', '.dsh', 'skills', 'plugin-kit');
```

**含义**：

- **权威源** = `DshBundle\.dsh\skills\plugin-kit`（项目本地 skill，宿主从这里加载）
- **构建产物** = `dsh-plugin-kit\skills\plugin-kit`（包内副本）
- 测试会读权威源的文件做断言（如 `M1a` 读 `SKILL.md`）

**实测两棵树当前 13/13 文件哈希一致。**

**这意味着**：往 `skills/plugin-kit/` 下加文件，**权威源不会自动跟着变**，会立刻破坏双树一致性。

---

## 二、目标（用户已确认的三条）

| # | 目标 | 用户原话 |
|---|---|---|
| 1 | 把 4 份宿主内置 skill 变成**插件内的普通文件** | 「内置 skill 放进我们插件」 |
| 2 | 目录放**一个版本文件**即可，不做复杂机制 | 「4 份内容不用动，而是在目录里面再放一个版本文件就可以了，这个东西不用做那么复杂」 |
| 3 | `package.json` 的 `files` 加 `vendor` | 「plugin-kit 的 package.json 的 files 要加 vendor」 |

**已定的命名与位置**：`vendor/host-skills/`

**已定的边界**：`DshBundle\dsh-skills-latest\` **保留但不再引用、不再维护**，作为用户其他项目的存档。**本次不动它、不删它。**

---

## 三、目录设计

```
dsh-plugin-kit/
├── vendor/
│   ├── config.js              ← 不动（运行时依赖）
│   ├── schemastery.mjs        ← 不动
│   ├── cosmokit.mjs           ← 不动
│   ├── LICENSE-cosmokit       ← 不动
│   ├── LICENSE-schemastery    ← 不动
│   └── host-skills/           ★ 新增
│       ├── VERSION.json       ★ 版本戳（用户要的那一个文件）
│       ├── README.md          ★ 三行说明：这是什么、从哪来、过期怎么办
│       ├── agent-experience/
│       ├── cordis-composition-reference/
│       ├── cordis-plugin-development/
│       └── editing-cordis-compositions/
```

**为什么 `vendor/host-skills/` 而不是 `vendor/` 直放**：`vendor/` 已有运行时依赖，加一层 `host-skills/` 把「代码依赖」和「外来文档」分开。

### VERSION.json 内容（用户要求「不用做那么复杂」）

```json
{
  "dsh": "0.2.2-rc.1",
  "extractedAt": "2026-11-10T19:35:00+08:00",
  "source": "app.asar/dsh/node_modules/@deepseek-ai/dsh-agent-preset/skills"
}
```

**三个字段，就这些。不做自动检测、不加代码、不写校验脚本。**

---

## 四、改动清单（逐项）

| # | 文件 | 动作 | 风险 |
|---|---|---|---|
| 1 | `vendor/host-skills/**` | **新增** 33 文件（从 asar 解出） | 无 |
| 2 | `vendor/host-skills/VERSION.json` | **新增** | 无 |
| 3 | `vendor/host-skills/README.md` | **新增** 说明 | 无 |
| 4 | `package.json` → `files` | `"vendor"` **已存在**，无需改 | — |
| 5 | `skills/plugin-kit/SKILL.md` | **加一节**：指向 `vendor/host-skills/` | 需同步权威源 |
| 6 | `.dsh/skills/plugin-kit/SKILL.md` | **同步**第 5 项 | 保双树一致 |
| 7 | `CHANGELOG.md` | 加一条 | 无 |
| 8 | `README.md` | 加一段说明 | 需过 readme-claims 检查 |

### ⚠ 第 4 项澄清

用户说「`files` 要加 `vendor`」——**实测 `files` 里已经有 `"vendor"`**。

所以**第 4 项不用做**。但我会在交付时说明这一点，不假装做了。

---

## 五、必须守住的三个约束

### 约束 1：双树一致性

`skills/plugin-kit/` 和 `.dsh/skills/plugin-kit/` 必须哈希一致。

**本次要改 SKILL.md，两处都要改。**

### 约束 2：88 条测试必须继续全绿

改动后跑：
```
npm test              88 条
node test/smoke.mjs   43 条
node test/readme-claims.mjs
node test/failure-signals.mjs
node test/mutate.mjs
```

### 约束 3：`readme-claims.mjs` 会检查 README 与实现一致

改 README 后要跑它，**不能被自己写的断言打回**。

---

## 六、执行顺序

| 步 | 做什么 | 判据 |
|---|---|---|
| 0 | 备份 `package.json` / `SKILL.md` 两处 | 可回滚 |
| 1 | 从 asar 解出 4 份 → `vendor/host-skills/` | 33 文件，哈希与 `dsh-skills-latest` 一致 |
| 2 | 写 `VERSION.json` + `README.md` | 三字段齐 |
| 3 | 改包内 `SKILL.md` 加指向节 | — |
| 4 | 同步权威源 `SKILL.md` | **两棵哈希一致** |
| 5 | 改 `CHANGELOG.md` | — |
| 6 | 跑全测试 | **88/88 绿** |
| 7 | 复跑 readme-claims / smoke / failure-signals / mutate | 全绿 |
| 8 | git diff 复核 | 只多不少 |

---

## 七、明确不做

| 不做 | 理由 |
|---|---|
| 自动过期检测 | 用户明确说「不用做那么复杂」 |
| 删 `DshBundle\dsh-skills-latest\` | 用户说保留作存档 |
| 改 `DshBundle\dsh-skills-latest\` | 已声明不维护、不关注 |
| 把宿主 skill 注册成插件 skill | **会污染宿主技能目录**——33 个文件会变成 4 个新 skill 出现在 AI 的技能列表里 |
| 动 `vendor/config.js` 等运行时依赖 | 无关 |
| commit / push | 等用户验收后再说 |

### ⚠ 第七项的风险说明

`lib/skill-provider.js:107` 只扫 `skills/` 的**直接子目录**（`if (!entry.isDirectory()) continue`，然后找 `SKILL.md`）。

**`vendor/host-skills/` 不在 `skills/` 下，所以不会被注册成 skill。**

**但如果以后有人把宿主 skill 放进 `skills/`，它们会被当成 4 个新 skill 注册进宿主**——那样 `plugin-kit` 就不只提供一个 skill 了，AI 的技能列表会多出 4 项。

**本次不碰这个边界。**

---

## 八、做完能带来什么（给用户判断值不值）

| 现在 | 做完 |
|---|---|
| 4 份宿主文档埋在 203MB asar 里 | 普通文件在插件包内 |
| **`grep` / `glob` 打不开** | 能 grep、能 glob |
| 必须先知道路径才能 `read` | 能整目录扫 |
| 只有 `dsh-skills-latest`（项目存档） | 插件自带，装到哪跟到哪 |
| 版本信息写在 3.5KB README 第 11 行 | `VERSION.json` 一眼可见 |

**对应那小时的真实成本**：55 次 `grep` + 51 次 `glob` + 71 次 `read` 里有相当部分是在跟 asar 的不可达性搏斗。

---

## 九、等用户确认的一件事

**SKILL.md 里怎么指路？** 三种写法：

| 写法 | 效果 |
|---|---|
| A. 只在「按需读什么」表里加一行 | 轻，但可能被忽略 |
| B. 加一个独立小节「宿主领域知识在哪」 | 中，会读到 |
| C. B + 在开头「最短路径」里提一句 | 重，但不漏 |

**我建议 B**：既不打断主流程，又保证读到。

---

**批准后按第六节顺序执行。**
