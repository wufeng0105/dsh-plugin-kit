# 日志规范

> 目标：让用户能从日志判断三件事——**插件在不在工作、为什么没工作、我需要做什么。**

## 一、四级语义（定死，不许混用）

| 等级 | 什么该用 | 用户该做什么 | 频率 |
|---|---|---|---|
| **error** | 插件装上了但**坏了**（打包残、配置非法、内部异常） | **必须修**，否则插件无效 | 罕见 |
| **warn** | 插件在工作，但**状态异常或需要你知道**（未采用项目、门被跳过、读盘失败、拦截被主动关掉） | **看一眼**，多半不用动 | 低频 |
| **info** | **生命周期事件**（启动、禁用、启用） | 知道就行 | 启动时一次 |
| **debug** | **每次调用的细节**（每条工具结果、台账补记） | 排查时才看 | 高频 |

**判断口诀**：用户**必须**做什么 → `error`；**应该知道**什么 → `warn`；**一次性**状态 → `info`；**每次都发生** → `debug`。

## 二、结构化字段（不改人读格式）

`log()` 第二参数是可选 `fields`，**只在需要时用**，人读格式不变：

```js
log('warn', '[plugin-kit] 门被跳过，本次写入放行但已留痕', {
  stage: 'p0', code: 'GATE_SKIP', path: 'stages/p0/GATE.json',
});
```

**为什么不用纯 JSON**：这个插件的用户是开发者，但也要肉眼扫日志——纯 JSON 人读不了。

**只允许四个字段，不许加**（否则日志变垃圾桶）：

| 字段 | 什么时候带 | 取值 |
|---|---|---|
| `stage` | 涉及具体阶段 | `p0`…`p5` |
| `code` | 有明确原因码 | `GATE_MISSING` / `GATE_FAILED` / `GATE_MALFORMED` / `UNKNOWN_WRITE_TOOL` / `GATE_SKIP` |
| `path` | 涉及具体文件 | 相对项目根的路径 |
| `tool` | 涉及工具调用 | 工具名 |

## 三、`lib/` 层不调 logger

**`lib/` 是纯逻辑，直接调 logger 会破坏纯函数可测性。**

| 层 | 该不该有日志 | 理由 |
|---|---|---|
| `index.js` | ✅ 有 | 它知道 ctx、知道用户 |
| `lib/gate.js` | ❌ 不加 | 纯函数，可完整单测 |
| `lib/ledger.js` | ⚠️ 走回调 | 需要报告「写失败」，但通过 `onWarn` 回调，不直接调 logger |
| `lib/skill-provider.js` | ❌ 不加 | 返回 `undefined` / `[]` 已足够表达 |
| `lib/discipline.js` | ❌ 不加 | 纯常量 |

**那 `lib/` 里出问题怎么看到**：由 `index.js` 在调用点判断并记录。

```js
const list = await listSkills(...);
if (list.length === 0) {
  log('error', '[plugin-kit] 打包缺失：skills/ 下没有任何有效 skill', { path: 'skills/' });
}
```

## 四、启动自检四行

```
[plugin-kit] v<版本> 已加载 → cwd=<当前工作目录>
[plugin-kit] skill provider 已注册 → name=plugin-kit root=<包内 skills 路径>
[plugin-kit] 纪律段已挂载 → name=plugin-kit:discipline order=121
[plugin-kit] 拦截已启用 → root=stages gateFile=GATE.json mode=enforce layout=9阶段 allowedTools=0
```

**为什么要有版本号**：用户报问题时，第一句话应该是「你装的哪个版本」。

**为什么要有 cwd**：`root` 是相对路径，不给 cwd 用户不知道它相对哪里。

**有一条 `error` 就说明插件是残的**（比如打包漏了 `skills/`）。

## 五、宿主日志阈值的实测事实

**来源**：`cordis/lib/index.js:1036-1039, 1053`（L3，读源码）。

| 方法 | level 数字 |
|---|---|
| `error` | 0 |
| `warn` | 1 |
| `info` | 2 |
| `debug` | **3** |

**过滤规则**（`:1053`）：

```js
if ((exporter.levels?.[this.name] ?? exporter.levels?.default ?? this.level ?? 2) < level) continue;
```

**默认阈值是 `2`**，含义：

| 等级 | 默认能看到吗 |
|---|---|
| error (0) | ✅ |
| warn (1) | ✅ |
| info (2) | ✅ |
| **debug (3)** | ❌ **默认被过滤** |

**所以「debug 供排查时看」的准确含义是「宿主把阈值调到 3 之后才能看」。** 这不在插件控制范围内。

## 六、headless 下看不到日志

headless 模式下 `ctx.logger` 的输出不进 stderr。**这是宿主行为，插件改不了。**

**处理方式：写进 README 明说**，否则用户会以为插件没装好。

**不把日志写文件**——会引入新的路径和权限问题，成本远大于收益。

## 七、不做的

| 不做 | 理由 |
|---|---|
| 纯 JSON 日志 | 人读不了 |
| 日志写到文件 | 引入路径/权限问题，收益不够 |
| `lib/` 层加日志 | 破坏纯函数可测性 |
| 日志轮转/上限 | 宿主管这个，插件不该管 |
| 把 `debug` 内容改成 `info` | 会让默认输出刷屏（`result:` 每条工具调用都打） |

## 八、验收判据

| # | 判据 | 怎么验 |
|---|---|---|
| 1 | 四级语义不混用 | 逐条核对全部 `log(` 调用的等级 |
| 2 | `debug` 只放高频项 | 每条工具结果 / 台账补记 → debug |
| 3 | 结构化字段只允许那四个 | grep 所有 `log(` 的第二参数 |
| 4 | `lib/` 层零 logger 依赖 | grep `lib/*.js` 无 `logger` |
| 5 | 启动四行齐全（含版本 + cwd） | 测试断言 |
| 6 | README 明说 headless 限制 | 文档检查 |
