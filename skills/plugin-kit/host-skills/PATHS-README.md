# 读 dsh-doc 副本之前：路径基准

> 这一行是 `plugin-kit` 加的，**不是宿主原文**。`dsh-doc/` 内所有文件是宿主原文的逐字节副本。

## 问题（与 rc.1 时代相同，对象换成 dsh-doc）

宿主把 `dsh-doc` 的 `resourceBase` 报成**宿主安装内它自己的目录**（app.asar 内路径），而本目录这份副本在 `host-skills/dsh-doc/`。正文里 32 处反引号相对路径（`references/xxx`、`templates/xxx`）按**副本所在目录**解析才能命中。

| 你在读哪份 | 正文里的 `references/x` 实际指 |
|---|---|
| `host-skills/dsh-doc/SKILL.md` | `host-skills/dsh-doc/references/x` |
| 本目录其他任何文件 | 相对**它自己所在目录** |

**也就是：相对路径的基准是「你正在读的那个文件所在目录」，不是宿主报的 base，也不是 `host-skills/` 根。**

## 为什么不在原文里改

**因为 `dsh-doc/` 是宿主文档的逐字节副本。** 改了：与 DSH 升级后的原文 diff 失效、无法回答「宿主原文怎么写的」、重解脚本的「逐字节一致」失去意义。所以用这个文件在外层说明，原文保持可校验。

## 自动检查为何不覆盖这里

`test/packed.mjs` 检查的是 `plugin-kit/SKILL.md` 里的相对链接。`dsh-doc/SKILL.md` 的 32 处引用全是反引号路径、0 条 markdown 链接——失效方式是「反引号路径被按错基准解析」，靠本文件说明，不靠自动检查。

## 数量随版本变

上一版（rc.1 四份）是 23 处；本版（rc.2 dsh-doc）是 32 处。**这个数字随宿主升级变化，不要把它写成断言常量**——重解后用正则现数：

```powershell
([regex]::Matches((Get-Content skills\plugin-kit\host-skills\dsh-doc\SKILL.md -Raw), '`(references|templates)/[^`]+`')).Count
```
