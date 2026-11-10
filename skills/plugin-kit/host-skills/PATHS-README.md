# 读这几份文档之前：路径基准不是同一个

> 这一行是 `plugin-kit` 加的，**不是宿主原文**。原文一字未改。

## 问题

宿主把这些 skill 的 `resourceBase` 报成**父级目录**：

```
Base directory for this skill: <包>/skills/plugin-kit
```

但那 4 份文档的正文里，相对路径是**相对它们各自的目录**写的：

```
host-skills/cordis-plugin-development/SKILL.md 里写  references/practices.md
                  ↓ 真实位置
host-skills/cordis-plugin-development/references/practices.md

                  ↓ 但宿主报的 base 是 skills/plugin-kit/
skills/plugin-kit/references/practices.md   ← 不存在
```

**照宿主的规则解析，23 处反引号路径全部指向不存在的文件。**

## 正确读法

**看到反引号里的 `references/xxx`、`templates/xxx`、`locale/xxx`，按下面补全：**

| 你在读哪份 | 正文里的 `references/x` 实际指 |
|---|---|
| `host-skills/cordis-plugin-development/` | `host-skills/cordis-plugin-development/references/x` |
| `host-skills/cordis-composition-reference/` | `host-skills/cordis-composition-reference/references/x` |
| `host-skills/editing-cordis-compositions/` | 该目录下（无子引用） |
| `host-skills/agent-experience/` | 该目录下（无子引用） |

**也就是：相对路径的基准是「你正在读的那份 SKILL.md 所在目录」，不是宿主报的 base。**

## 为什么不在原文里改

**因为原文是宿主文档的逐字节副本。** 改了：

- 与 DSH 升级后的原文 diff 会失效
- 无法再回答「宿主原文怎么写的」
- `VERSION.json` 的「逐字节一致」失去意义

**所以用这个文件在外层说明，原文保持可校验。**

## 哪些文档受影响

| 文档 | 反引号相对路径数 |
|---|---|
| `cordis-plugin-development/SKILL.md` | **22** |
| `cordis-composition-reference/SKILL.md` | 1（`references/packages.md`） |
| `editing-cordis-compositions/SKILL.md` | 0 |
| `agent-experience/SKILL.md` | 0 |

**markdown 链接（`[文字](路径)`）四份都是 0 条**——所以不会误触 `plugin-kit` 自己的链接检查。

## 对应的 markdown 链接检查为何不管这里

`test/packed.mjs` 检查的是 **`plugin-kit/SKILL.md` 里**的相对链接必须进 tarball。

**这 4 份没有 markdown 链接，所以那条检查对它们无效**——它们的失效方式是「反引号路径被按错基准解析」，靠这个文件说明，不靠自动检查。
