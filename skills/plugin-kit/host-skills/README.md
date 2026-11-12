# DSH 内置 skill（宿主文档副本）

> **宿主自带的 skill 文档，解成普通文件放在这里。**
>
> 目的是让它们**能被 `grep` 和 `glob` 扫到**——原文在 208MB 的 `app.asar` 里，shell 工具（`ls` / `cat` / `cp` / `cmp`、glob、search）全部打不开，只有带 asar 穿透的文件读取工具和本目录的普通文件可用。

## 内容

| skill | 文件 | 讲什么 |
|---|---|---|
| **`dsh-doc`** | 43 | **宿主文档唯一入口（rc.2 起）**：插件开发、bundle manifest、Config、UI 模板、agent preset、Loader patch 方言、可装包清单、升级、验证、工具设计 |

> **rc.1 → rc.2 结构变更**（2026-11-13 实测）：rc.1 时代的四份 skill
> （`cordis-plugin-development` / `cordis-composition-reference` / `editing-cordis-compositions` / `agent-experience`）
> 已被宿主**合并为 `dsh-doc` 一份**。旧副本按 git 归档（`61f5fa2` 及之前可查）。
> 各 references 旧名的对应关系见 `dsh-doc/SKILL.md` 的「Read next」表。

## 它和本 skill 的关系

| | 讲什么 |
|---|---|
| **本 skill（`plugin-kit`）** | **怎么查契约（顺序）+ 怎么验证完成（preflight / recheck）** |
| **这里（`dsh-doc`）** | **宿主机制本身**：接缝原则、装配形态、模板 |

**互补，不重叠。** dsh-doc 自己也声明：确认任何 Service / Event / mode 都以 `cordis_inspect_query` 与安装包源码为准——**inspect 是权威源，文档副本是检索替身**。事件全集（如 `fs/write-intent`）在文档里没有逐条清单，查事件签名永远走 inspect。

## 版本与过期

`VERSION.json` 记了来源版本与 asar 字节数。当前是 **DSH `0.2.2-rc.2`**。

**判断是否过期**（两条任一满足即 STALE）：

```powershell
# ① 手工判
(Get-Item "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\app.asar").LastWriteTime
# 比 VERSION.json 的 extractedAt 新 → 过期

# ② 机判（推荐）——reextract 只在源码仓根有（不随 npm 包分发，它要读本机 asar 并写回仓内副本）
node scripts/reextract.mjs --check
```

**重解**（同样在源码仓根跑；重解后重装本包，副本才随包更新）：

```powershell
node scripts/reextract.mjs
```

一条命令完成：解析 asar → 清旧目录 → 写入新文件 → 更新 VERSION.json。脚本自带 `--self-test`（先证明解析器会抓差异再用它）。

不做激活时自动同步——拿运行时稳定性换文档新鲜度不划算（原裁定保留）。

## ⚠ 这些文件不会被注册成 skill

`lib/skill-provider.js` 只扫 `skills/` 的**直接子目录**（找 `SKILL.md`）。`host-skills/` 不在扫描范围。

**所以这份只是普通文档，不会出现在 AI 的技能列表里。** 有意为之：宿主已经把 `dsh-doc` 注册进 skill 目录（rc.2 实测），这里再注册一份就是重复源；本目录的价值是「可 grep 的检索替身」，不是第二份注册。
