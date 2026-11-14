---
name: plugin-kit
description: Use when developing, installing, or upgrading a DSH plugin — what the host requires, what to verify before claiming done, and how to keep both fresh after a DSH upgrade. Trigger on any DSH plugin, bundle, cordis, install, won't-load, button-does-nothing, or release question. Complements the host's dsh-doc, which holds the mechanisms themselves.
---

# DSH 插件：契约查证与完成验证

> 你在对着一个黑盒开发：**写之前不知道宿主要什么（契约），写完不知道它认不认（验证）。**
> 这个 skill 把两面都变成可执行的程序。它不拦你、不替你判断质量——它让你在宣称「完成」之前，每一条都有据可查。

## 给谁用

**给已经会写 DSH 插件的人。** 还没装成功过一个最小插件的话，先去做那件事——装不上的时候，这里的每一条你都看不懂。

## 一、查契约的三步顺序（痛点：宿主是黑盒）

宿主契约的真实来源只有一个：**正在运行的安装本身**。按成本从低到高三步，前一步答不了才走下一步：

### 第 1 步：`cordis_inspect_query`（权威源， always 先走）

- Service 方法与签名 → host `Service.listService` / `listService({service})`
- 事件名 / mode / 签名 → host `Event.listEvents` / `listEvents({event})`
- 插件 Config schema → host `Config.listConfigs`（`name` 过滤，`entry` 取单条）
- 工具 / Slot / 主题 → 对应 provider

**为什么它是权威源**：事件全集不在任何文档里（实测：rc.2 的 `fs/write-intent` 三个新接缝在 dsh-doc 全文没有逐条清单，只在 inspect 事件目录里）。**查事件签名永远走 inspect。**

### 第 2 步：`dsh-doc` 文档（机制原则与装配形态）

宿主自带的文档 skill（rc.2 起合并了旧的四份）。它讲机制原则：waterfall 纪律、注册的所有权、`ctx.tools.guard` vs `restrict` 的强弱、projection 性能模型。**它不逐条列 API**——那是 inspect 的事。

⚠ 可检索副本在 `host-skills/dsh-doc/`（43 文件，可 grep / glob）。读之前先看 `host-skills/PATHS-README.md`——正文里的相对路径按**副本所在目录**解析，不按宿主报的 base。原文在 208MB 的 app.asar 里，shell 工具打不开。

若任务涉及界面、设置页或 Slot：顺着副本的 `dsh-doc/SKILL.md` 「Read next」表往下读 `references/ui-plugin.md` 与 `templates/decoration/`（模板含 `./client` 导出与 `window.__ModuleLoader__.load` 起步形态）；验证页面用 `references/verification.md`。这些文件都在包里，不必从零手写界面。

### 第 3 步：找一个真实运行的同类型插件，读它的源码

**最有效、也最容易被忘的一招。** inspect 给零件，dsh-doc 给原则，但「这些怎么组合起来能用」只在真实插件里。去 `~\.dsh\profiles\<profile>\node_modules\` 找同类插件的 `lib/`。

> 分量：一次真实开发翻遍 catalog 和源码 200 多次没答案，最后是读一个已发布插件的 `lib/routes.js` 才找到接缝。**查得太多本身就是错**——省上下文只有在它没有引起更多搜索、重复读取或错误时才划算。

### 查完必须产出

| 要查的 | 产出（写进你的计划/触点清单） |
|---|---|
| 服务方法 | 方法签名 |
| 事件 | 事件名 + mode（emit/serial/waterfall/parallel）+ 签名 |
| 插槽 | key + kind + 注册项 + props |
| Config schema | 字段与类型，用于写 `cordis.patch.yml` |

**每条关于宿主的断言必须带出处**（探测命令+返回，或安装包 `文件:行`）。读源码得出的结论标 L3，不冒充已验证。

## 二、完成验证：preflight（痛点：「完成」没有权威定义）

代码写完、测试全绿 ≠ 装上能用。四类致命失败**全都不在任何一段代码里**，逐段检查看不见：

| 失败家族 | 典型形态 | 在哪暴露 |
|---|---|---|
| ① 装不上 | 缺 `dsh.bundle.patch`；patch 的 name 与包名不一致；`Config = {}`；inject 猜了不存在的服务 | install 那一刻 |
| ② 装上了但看不见 | skill 缺 resourceBase（模型不知道文件在哪）；slot 注册塞进 inject 回调 | 用户打开界面那一刻 |
| ③ 一加载就崩 | client.js 含 ESM export——宿主把所有插件 client.js **拼成一个大脚本**，一个坏插件让整个 web boot 崩 | 重启那一刻 |
| ④ 环境相关 | 最小 profile 能用、混进完整插件集崩（日志无堆栈） | 换环境那一刻 |

**跑自检**（装之前，每次交付前）：

```bash
node <本skill目录>/scripts/preflight.mjs <你的插件项目根>
```

逐项输出 ✓ / ✗ / ?，FAIL 附「缺什么、怎么补」。脚本自带 `--self-test`——先证明判定式会红，再用它判你的项目。

**preflight 覆盖不了的**：家族④ 只能真机验。用**一次性 profile**（建 → 装 → 验 → 拆，复刻目标环境的完整 bundle 组合，不碰日常 profile）。具体命令随宿主版本变，真跑 `dsh --help` / `dsh plugin --help` 现取。三条语义约束：`--from-default-profile` 是替换语义；不能与 shipped 模板同名；必须先建后装。

## 三、升级保鲜：recheck（痛点二在升级后复发）

DSH 升级 = 契约与验证清单同时刷新。两个动作。**脚本位置分两种安装形态**（路径不一样，照错形态跑必然 No such file）：

**包内脚本**（`skills/plugin-kit/scripts/`，随包分发，两态都有）：

```bash
# ② 你的插件依赖的触点还成立吗（先 --self-test 证明它会红）
node <本skill目录>/scripts/recheck.mjs --self-test
node <本skill目录>/scripts/recheck.mjs --touchpoints touchpoints.json --snapshot host-snapshot.json --strict
```

**重解脚本**（`<包根>/scripts/reextract.mjs`——只在**源码仓**有，不随 npm 包分发，因为它要读本机 app.asar 的绝对路径）：

```bash
# ① 宿主文档副本是否过期（STALE 判定 + 一键重解）——在源码仓根跑：
#    git clone https://github.com/wufeng0105/dsh-plugin-kit 后：
node scripts/reextract.mjs --check
node scripts/reextract.mjs          # 过期就重解（写回源码仓的 host-skills/，再重装包生效）
```

> **为什么重解脚本不进包**：它写的目标是本机 `app.asar` 相关路径与源码仓的 `host-skills/`，装进宿主 profile 的包没有这些上下文。装包形态下副本过期时，回源码仓重解 + 重装一次即可。

触点清单写法见 `assets/touchpoints.sample.json`；四态判定（OK / MISSING / CHANGED / UNVERIFIABLE）见脚本头部。**先跑 `--self-test` 证明它会红，再拿它判真实清单。**

## 四、开发纪律（本仓事故换来的六条，任何插件开发通用）

1. **每条验收必须能判真假**；靠人看的必须给机判替代，否则标「人工判读」。
2. **每条关于宿主的断言必须带出处**（探测命令+返回，或安装包 `文件:行`）。
3. **任何检查先证明它会红**，再用它判通过——改坏 → 红 → 改回 → 绿。「测试全绿」是一个状态，不是一项证据。
4. **模块存在 ≠ 产品在用**：必须证明它在 import 图里可达。
5. **「无法判定」不是「通过」**。探测不到就标 `UNVERIFIABLE`，写明证据等级（L1 运行时 / L2 行为复现 / L3 源码 / L4 自述）。
6. **交付说明里的命令必须真跑过。**

> 每条都有对应的事故出处（离线全绿真机崩、假绿机、自评盲区）——完整事故表见本包 `CHANGELOG.md` 的 0.1.x 节。
> 更重的阶段门流程（独立审查员、九阶段）已从本 skill 退役——对单人开发，上面六条 + preflight 覆盖了最高频的坑；审查员协议仍作为本仓自身的开发纪律保留（源码仓 `docs/reviewer.md`）。

## 五、新建一个插件项目

**不要从零手写。** 复制骨架：`template/`（4 文件：package.json / cordis.patch.yml / index.js / AGENTS.md）。

1. 整目录复制到项目根
2. 把占位符 `my-plugin` 全部替换成本项目名（三处同步，改完搜一次 `my-plugin` 必须零残留）
3. 跑 `preflight.mjs <项目根>` —— 0 FAIL 后再装
4. 装一次（`install_bundle`，target 传项目绝对路径），读返回的 `application`——**骨架装得上，才算搭好了**

> 骨架里没有 `.gitignore`。不是漏了——npm 打包总会排除它，放一份会让仓库与包不一致（2026-11-11 实测）。加第一个依赖时自己建。

## 关键提醒

- **测试全绿 ≠ 验收通过**。111 个测试全绿仍有 5 项验收无法通过，是真实发生过的事。
- **inspect 是权威源**：任何「宿主支持/不支持 X」的断言，先 query 再写。
- **证据等级不能冒充**：L3（源码核对）不能写成「已验证」。
