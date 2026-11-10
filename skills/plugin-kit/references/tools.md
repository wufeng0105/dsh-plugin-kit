# 工具清单

> `process.md` 里每个阶段说"要检查"，这一篇说**用什么检查、看到什么算过**。
>
> **分工**：这一篇只写**判据**（什么算过）。具体的命令参数、provider 名单、API 签名属于领域契约知识，会随宿主升级失效——去内置 skill 找，见每节末尾的「技术细节见」。

## 一、按阶段查

| 阶段 | 工具 | 判据 | 技术细节见 |
|---|---|---|---|
| **P1 计划** | `cordis_inspect_list` / `cordis_inspect_query` | 每条依赖有方法签名、事件 mode、slot props | `cordis-plugin-development` |
| **P1.5 探针门** | 同上 + 安装包源码 | 每条 `UNVERIFIED` 有结论（已验/降级/无法判定+谁接受） | `cordis-plugin-development` |
| **P2 执行** | `node --check` | exit 0 | — |
| **P2 执行** | `node --test` | 全绿，exit 0 | — |
| **P2 执行** | 变红证明 | 至少一条检查真的变红过 | 见下「变红证明」 |
| **P2 / P3** | import 图检查 | 每个"已实现"模块都被产品代码引用 | 见下「接线可达性」 |
| **P3 验证** | 验收三态表 | 每条有 已验 / 无法判定 / 不符 | 见 `reviewer.md` |
| **P3.5 运行时** | 一次性 profile | 装上、启动无报错、日常 profile 未变 | 见下「运行时验收」 |
| **P4 交付** | `npm pack` + files 对账 | 三方向差集为空 | `cordis-plugin-development` |
| **P4 交付** | tarball 真加载 | import 成功，导出面正确 | — |
| **P5 维护** | `../scripts/recheck.mjs` | 输出 OK/MISSING/CHANGED/UNVERIFIABLE | 见下「触点复检」 |

## 二、逐个说

### 宿主探测：`cordis_inspect_list` / `cordis_inspect_query`

这是**唯一权威的宿主契约来源**。别靠记忆、别靠旧文档——宿主升级会改签名。

**怎么查**：用内置 skill `cordis-plugin-development`（它讲了查的顺序、该问哪些问题）。**注意它也没写全参数**——实测它只列了 provider 名和部分 Config 参数，`listService` / `listSubTree` / `listEvents` 的入参要自己从 inspect 返回或源码里看。所以：**先按它的顺序问，再按返回结构自己推参数。**

本节只写**查完要产出什么**——参数会随宿主升级失效，不在这里复制。

**查完必须产出**（这才是 P1 的出口判据，不是"查过了"）：

| 要查的 | 产出 |
|---|---|
| 服务方法 | 方法签名，写进依赖清单 |
| 事件 | 事件名 + mode（emit/serial/waterfall/parallel）+ 签名 |
| 插槽 | 插槽 key + kind（list/single/keyed/chain）+ 注册项 + props |
| Config schema | 字段与类型，用于写 `cordis.patch.yml` |

**两个坑**（三轮实验踩过，与宿主版本无关，长期有效）：

1. **客户端探测会超时**，且可用性取决于"页面是否在线、谁在问"。超时就退到只读安装包源码，并在报告里写明**证据等级是 L3，不是 L1/L2**。
2. **显示 id ≠ 契约 id**（这是领域契约，内置未记载，所以留在本 skill 与铁律 23。**两处必须同步改**——`process.md` 的铁律 23 是主记录，本条是应用说明；版本基线见铁律 23 的注）：`Config.listConfigs` 返回的 `id` 是 `include:<patchId>`，但 `entry.options.id`（真正的设置命名空间）是**裸 patchId**。两个字段并存时先确认哪个是契约值。

### 语法与测试：`node --check` / `node --test`

```bash
node --check index.js            # 单文件语法
node --test                      # 跑 test/ 下所有
node --test "test/*.test.js"     # 显式指定（Windows 上更稳）
```

**注意**：写进 `package.json` 的 `npm test` 必须**真的跑一次**。三轮实验里有一次写成 `node --test test/`（Node 把它当文件路径），从来没被跑过，报 `MODULE_NOT_FOUND`。

### 变红证明（mutation）

这是整套流程里最重要的动作。做法：

1. 找到一条能抓住缺陷的检查（测试或脚本）
2. **故意把被测代码改坏**，改成那个检查该抓的形态
3. 跑检查 → **必须变红**（退出码非 0 或断言失败）
4. 改回 → 必须变绿

如果改坏了还是绿的，说明**这条检查是空的**——它没在测你以为它在测的东西。

**存档约定**（不做这一步，红绿证明只有你自己信）：

```
probes/
├── *.mjs            探针脚本，入库，不留 %TEMP%
└── red/
    └── <缺陷编号>.txt   修复前的原始输出，证明"当时确实是红的"
```

台账里每条卡点的证据列写成 `报告:行 + 复跑命令`，第三个人照着敲一遍就能复现。只写"报告:行"的话，红态只能信报告。

三轮实验里的真实例子：

| 检查 | 改坏什么 | 结果 |
|---|---|---|
| 审批三态测试 | 把安全闸 `return 'ask'` 改成 `'allow'` | 2 个用例红 ✅ |
| 恢复派发路由测试 | 把 `planRestore` 退化成"只删表" | 8 个用例红 ✅ |
| 防漂移测试 | 把 `LABEL_MAX` 从 12 改成 15 | **全绿** ❌ —— 因为测试自己提供常量 |

写进项目里的做法：一个 `scripts/mutate.mjs`，把每条变异、期望结果、实际结果打出来，最后 `ALL MUTATIONS PROVEN` 才算过。

### 接线可达性检查

模块存在 ≠ 产品在用。检查方式任选：

```bash
# 简单：找 import
grep -rn "from '\./lib/writeback" src/ index.js

# 或者看 import 图（有 codegraph 的话）
codegraph explore <symbol>
```

判据：**每个声称"已实现"的模块，必须至少有一个产品文件 import 它**。只出现在注释里的不算。

### 打包三件套

```bash
npm pack                                    # 1. 出 tgz
tar -tzf my-plugin-1.0.0.tgz                # 2. 看真实文件表
# 3. 真加载
mkdir /tmp/t && tar -xzf my-plugin-1.0.0.tgz -C /tmp/t
node -e "import('/tmp/t/package/index.js').then(m => console.log(Object.keys(m)))"
```

**files 对账**：把 `package.json` 的 `files` 数组展开，与 `tar -tzf` 的真实列表做三方向差集（files 有但包里没有 / 包里有但 files 没写 / 两边都有）。差集必须为空，每个排除项要写理由。

### 触点复检：`../scripts/recheck.mjs`

这是 P5 的工具。做法：

1. 写 `touchpoints.json`（结构见 `../assets/touchpoints.sample.json`）
2. 用 `cordis_inspect_query` 导出 `host-snapshot.json`（结构见 `../assets/host-snapshot.sample.json`）
3. 跑：

```bash
node recheck.mjs --touchpoints touchpoints.json --snapshot host-snapshot.json
node recheck.mjs --touchpoints touchpoints.json --snapshot host-snapshot.json --scan-dir src
node recheck.mjs --touchpoints touchpoints.json --snapshot host-snapshot.json --strict
node recheck.mjs --self-test    # 内建 fixture，证明脚本会变红
```

输出四态：

| 结论 | 含义 |
|---|---|
| `OK` | 找到且签名/内容与期望一致 |
| `MISSING` | 整个不见了 |
| `CHANGED` | 还在，但形状变了 |
| `UNVERIFIABLE` | 机器判不了（需人工或读源码） |

`--strict` 时 `UNVERIFIABLE` 也算失败，适合当发布闸。`--scan-dir` 会扫源码里的 `ctx.get/ctx.on/inject`，找出"代码里有引用但清单没写"的漂移。

**这个脚本必须能变红。** 先跑 `--self-test` 确认它能按预期报 MISSING/CHANGED，再拿它判真实清单。

### 安装

怎么装：见内置 skill `cordis-plugin-development`。**注意 `plugin_manager` 只作用于当前 profile**——P3.5 要验的是「一次性 profile」，且要求日常 profile 未被改动，所以那一步的建/装顺序按 `process.md` 的 P3.5 卡走，不要用 `plugin_manager` 直接装。

**判据**（这是流程判据，不随宿主变）：安装结果必须给出明确的"是否生效"字段，并且**日志、进程列表、页面 boot payload 都不能替代它**。拿不到这个字段，就不能声称已生效。

### 运行时验收（一次性 profile）

离线验证只能证明"代码路径通"，不能证明"装上能用"。这一步用**一次性 profile** 拿 L1 证据，不碰日常 profile。

**流程**（方法论，不随宿主变）：

1. **建**：从 shipped 模板创建一个新 profile，只创建不启动
2. **装**：把待验的包装进去（目录形态 = link，改源码立即生效；包名形态 = 独立副本，改源码不影响）
3. **验**：启动该 profile，按插件的形态选观察面（UI 看页面，Host 看日志或接口）
4. **拆**：删掉这个 profile 目录

**具体命令**随宿主版本变化，且内置 skill 里也没有记载（实测：内置全文无 `--from-default-profile` / `plugin --profile`）。真跑 `dsh --help` 和 `dsh plugin --help` 现取——这是唯一可靠的落点。三条语义约束和拆除变量见 `process.md` 的 P3.5 卡。

**判据**：

- 装完后 profile 的依赖清单里出现该包；
- 启动后插件加载无报错——**看 Host 日志，不是浏览器控制台**（两半是各自独立装配的，Host 半失败时控制台本来就干净）；
- **日常 profile 未被改动**：跑前跑后对 `$DSH_PROFILE_DIR` 做哈希比对。

## 三、证据等级

每条结论都要标证据等级（L1 运行时 / L2 行为复现 / L3 源码核对 / L4 自述）。
等级的定义和「L3 不能冒充 L1/L2」的理由，见 [`reviewer.md`](reviewer.md) 的「证据等级」——这里不重复，避免两处漂移。

## 四、触点清单怎么写

`touchpoints.json` 的每一项：

```json
{
  "id": "svc.tools.guard",          // 唯一标识
  "surface": "service",              // service | event | config | slot | remote | package | layout
  "ref": "ctx.tools.guard()",        // 代码里实际怎么写
  "code": "src/index.js:42",         // 本仓引用位置
  "why": "同步硬否决工具调用",        // 为什么非它不可
  "probe": {                         // 怎么验
    "kind": "service",               // service | event | type | file | package | none
    "service": "tools",
    "method": "guard",
    "signatureIncludes": ["guard: ToolGuard"]
  },
  "status": "verified",              // verified | unverified | unverifiable（当前真实状态）
  "fallback": "不注册守卫，工具调用不再被拦"  // 它不成立时本插件会怎样
}
```

六种 `probe.kind`：

| kind | 查什么 | 必填字段 |
|---|---|---|
| `service` | 服务或方法 | `service`、`method`（可选）、`signatureIncludes` |
| `event` | 事件 | `event`、`mode`（可选）、`signatureIncludes` |
| `type` | 类型声明 | `type`、`via`（`{event}` 或 `{service}`）、`contains` / `absent` |
| `file` | 文件 | `path`、`sizeBytes` / `sha1` / `contains` |
| `package` | package.json 字段 | `file`、`path`（数组）、`equals` |
| `none` | 机器判不了 | `manual`（说明人工怎么查） |
