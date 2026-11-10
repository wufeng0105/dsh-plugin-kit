# DSH 内置 skill（宿主文档副本）

> **宿主自带的 4 个 skill，解成普通文件放在这里。**
>
> 目的是让它们**能被 `grep` 和 `glob` 扫到**——原文在 `app.asar` 里，shell 工具打不开。

## 内容

| skill | 文件 | 讲什么 |
|---|---|---|
| **`cordis-plugin-development`** | 29 | **插件开发主入口**：Host/Client 两半、slot 注册、Config、模板、安装 |
| `cordis-composition-reference` | 2 | Loader YAML 方言 + 可安装插件包清单（535 行，约 200 个包） |
| `editing-cordis-compositions` | 1 | Agent preset 与 Cordis composition 编写 |
| `agent-experience` | 1 | 面向模型的工具描述 / skill 设计原则 |

## 它和本 skill 的关系

| | 讲什么 |
|---|---|
| **本 skill（`plugin-kit`）** | **什么算做完、谁来判断、什么算过** |
| **这里（宿主 4 份）** | **怎么用宿主的 API 把东西做出来** |

**互补，不重叠。** 判据在这里，领域契约在那儿。

## 版本与过期

`VERSION.json` 记了来源版本。当前是 **DSH `0.2.2-rc.1`**。

**判断是否过期**：

```powershell
(Get-Item "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\app.asar").LastWriteTime
```

**比 `VERSION.json` 里的 `extractedAt` 新，就该重新解一次。**

不做自动检测——过期了是「读到旧文档」，不是「东西坏了」，人看一眼就能判断。

## 为什么不做自动同步

宿主升级会换 `app.asar`。自动重解需要在插件激活时读 203MB 的 asar 并写盘——**这是拿运行时的稳定性换文档的新鲜度，不划算**。

**过期了手动重解一次即可**（见本 skill 的 `references/tools.md`）。

## ⚠ 这些文件不会被注册成 skill

`lib/skill-provider.js` 只扫 `skills/` 的**直接子目录**（找 `SKILL.md`）。`host-skills/` 不在扫描范围。

**所以这 4 份只是普通文档，不会出现在 AI 的技能列表里。** 这是有意为之——避免污染宿主技能目录。
