# 发布流程操作卡

2026-11-17 定稿。**这份文件只回答一件事：从这里发布一个版本，按什么顺序、每步怎么判真假。**

环境事实（2026-11-17 实测，过期就重测）：Node v24.22.2 / npm 11.19.1 / pnpm 10.33.1。

## 一、registry 是分层的（别用一层的心智模型）

| 层 | 值 | 由谁设 |
|---|---|---|
| 全局 | `https://registry.npmmirror.com`（淘宝镜像） | `~/.npmrc`，未改动 |
| 本仓 | `https://registry.npmjs.org/`（官方） | 本仓 `.npmrc` |
| 发布目标 | 官方源 + `access: public` | `package.json` 的 `publishConfig` |

**效果**：在本仓跑任何 npm 命令都读官方源真值；离开本仓安装依赖仍走镜像，速度不受影响。**不要**为查一个版本去改全局配置。

## 二、发一个版本：四条命令

```bash
# 1. 升版 + 提交 + 打 tag（内部跑全量验证门，不过就不动）
node scripts/release.mjs patch|minor|major

# 2. 推送提交与 tag（脚本不代做，不可撤销）
git push origin main --follow-tags

# 3. 发布 + 自动核实（check → pack 干跑 → publish → verify --wait）
npm run publish:npm

# 4. 随时复查（不发版，只核官方源）
npm run publish:verify
```

发版前先跑 `node scripts/release.mjs --check`：七项核对（版本纯 `x.y.z`、CHANGELOG 有对应节、tag 不存在、工作树干净、分支 main 且已同步、npm 上没这个版本、`repository` 指回本仓）。任何一项不过就拒绝继续——**这一步红，说明还有其他事没做完，不是脚本毛病**。

## 三、「发布成功」的判据（这条最容易错）

**唯一判据：官方源版本端点能查到。** 不是 `npm publish` 的退出码。

`npm publish` 成功时会打印 `+ @wufeng0105/dsh-plugin-kit@0.3.0` 并 exit 0，但官方源 CDN 传播要几分钟，**期间所有查询都是 404**。

2026-11-17 实际踩过：发布其实成功了（日志里有 `http fetch PUT 202`），但查询连续 404，一度被误判为失败，白等三分钟还误读了一次日志。

404 时按概率排查三条：

1. **CDN 还在传播**——最常见。等 1–5 分钟，或 `npm run publish:verify`（最多等 8 分钟）。
2. **真的没发出去**——查 publish 日志里有没有 `http fetch PUT 202`。**只有 GET、没有 PUT 才是真没发**；有 PUT 就是传播。日志位置：`C:\Users\Administrator\AppData\Local\npm-cache\_logs\`。
3. **查的不是官方源**——用 `npm config get registry` 确认当前位置；本仓应是 npmjs。

```bash
node scripts/verify-publish.mjs 0.3.0     # 核指定版本
node scripts/verify-publish.mjs --wait    # 等传播
```

## 四、代理：按需临时设，不写进任何全局配置

本机代理 `127.0.0.1:7897`（Clash Verge）。**不要** `npm config set proxy`——那会让镜像请求也绕一圈，代理挂掉时全部失败。

只在确需的时候临时带：

```powershell
$env:HTTPS_PROXY='http://127.0.0.1:7897'; npm view <pkg>
```

`raw.githubusercontent.com` 直连会被 TLS 重置，必须走代理；出现 `schannel` / `TLS handshake` / 连接重置时先想到这条。

## 五、出错时别做的事

- **不要**因为查不到就改全局 registry（拿每天几十次安装的速度，补每次发布一次的查询，方向反了）。
- **不要**为了让 `release.mjs --check` 变绿而删 tag 或改版本号——红项通常指向真实的未完成步骤（最常见：提交还没 push）。
- **不要**把 npm token 写进仓库任何文件。token 在 `~/.npmrc` 里，发布时自动读。
- **不要**在没跑过的情况下把命令写进交付说明（本仓纪律第六条）。

## 六、验收自检（发布后 30 秒内可跑）

```bash
npm view @wufeng0105/dsh-plugin-kit version        # 应等于刚发的版本
npm run publish:verify                              # 应绿，并打印 tarball 直链
git status --porcelain                              # 应为空
git log --oneline -1 origin/main                    # 应是最新提交
```

四条全过，这次发布才算完成。任何一条不符，按第三节判据排查。
