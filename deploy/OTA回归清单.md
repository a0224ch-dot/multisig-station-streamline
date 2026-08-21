# 精简版 OTA 线上回归清单

在**非生产或可回滚的演示站**上做。每轮记下：域名、起始 `VERSION`、目标版本、操作人、时间、PASS/FAIL。

前置：

```bash
cd /www/wwwroot/multisig-station-streamline
cat VERSION
grep -E '^(PORT|PM2_NAME|PM2_UPDATER_NAME|INSTALL_ROOT|UPDATE_RELEASES_URL)=' backend/.env
pm2 list
SITE_DOMAIN='你的域名.com' bash deploy/accept-streamline.sh
```

后台路径：登录 → **系统更新** → 检查更新 → 立即更新。  
状态文件：`.update-work/status.json`；API 停机时可看 `frontend/dist/update-status.json`。

---

## R0. 正常更新（基线，每轮必做）

| # | 步骤 | 期望 | □ |
|---|------|------|---|
| R0.1 | 记下当前 VERSION、`.env` 中 PORT / JWT / BRANCH_API_KEY | 备份纸面或截图 | □ |
| R0.2 | 检查更新 | 能拉到清单；有新版则显示目标版本 | □ |
| R0.3 | 立即更新 | 阶段顺序大致：下载 → 校验 → 备份 → 停 API → 覆盖 → 依赖 → 迁移 → 启动 → 健康检查 → success | □ |
| R0.4 | 更新中 | `pm2 list` 出现 `multisig-streamline-updater`（或 `PM2_UPDATER_NAME`）；API 可短暂 offline | □ |
| R0.5 | 结束后 | API online；`VERSION` = 目标版；health 仍为 `edition=streamline` | □ |
| R0.6 | 配置未丢 | `.env` 与数据库仍在；能用原管理员密码登录 | □ |
| R0.7 | 更新页 | 显示成功，不再卡在「进行中」 | □ |
| R0.8 | updater 收口 | 更新完成后 updater 进程可消失（`--no-autorestart`） | □ |

---

## R1. 断网（下载阶段）

| # | 步骤 | 期望 | □ |
|---|------|------|---|
| R1.1 | 确认有可更新版本后，在点「立即更新」**前或刚进入 downloading** 断开出网（或临时 block GitHub/releases） | — | □ |
| R1.2 | 观察状态 | phase → failed（或 rolled_back）；有明确失败原因（下载失败等） | □ |
| R1.3 | 恢复网络 | API 应仍可用或回滚后可用；`.env` / db 未坏 | □ |
| R1.4 | 再点检查更新 → 立即更新 | 能完整升到目标版（同 R0） | □ |

模拟示例（仅测试机，测完务必恢复）：

```bash
# 临时拒绝外网 HTTPS（示例，按实际网卡/策略调整）
iptables -A OUTPUT -p tcp --dport 443 -j REJECT
# 恢复
iptables -D OUTPUT -p tcp --dport 443 -j REJECT
```

---

## R2. 半截失败（覆盖 / 依赖阶段杀进程）

| # | 步骤 | 期望 | □ |
|---|------|------|---|
| R2.1 | 开始更新，等进入 stopping / extracting / installing | 状态文件 phase 已不是 idle | □ |
| R2.2 | 杀掉 updater：`pm2 delete multisig-streamline-updater` 或 `kill` 其 pid | 更新中断 | □ |
| R2.3 | 若 API 已停：手动 `pm2 start`（与安装时相同命令）或等回滚逻辑 | 站点最终可登录；不可长期卡在 busy | □ |
| R2.4 | 重启 API 后 | `finalizeUpdateOnBoot` 把卡住状态收成 failed/success；可再次「检查更新」 | □ |
| R2.5 | 再跑完整更新 | 同 R0 成功 | □ |

手动拉起 API（端口与名字以 `.env` 为准）：

```bash
cd /www/wwwroot/multisig-station-streamline/backend
pm2 delete multisig-streamline-api 2>/dev/null || true
pm2 start npx --name multisig-streamline-api --cwd "$(pwd)" -- tsx src/index.ts
pm2 save
```

---

## R3. PM2 名冲突

| # | 步骤 | 期望 | □ |
|---|------|------|---|
| R3.1 | `PM2_NAME` 与 `PM2_UPDATER_NAME` 不得相同 | 安装脚本直接拒绝；运行时若已误配则自动改用 `*-updater` | □ |
| R3.2 | 同机另起同名 API（故意） | 安装脚本应提示将 delete 重建；交付时确认不会误删总部 `multisig-hq-api` | □ |
| R3.3 | 更新时 stop 只删 API 名 | updater 进程在更新中不被 `pm2 delete <API名>` 误杀 | □ |
| R3.4 | 错误配置回归 | 临时把 `.env` 里 `PM2_NAME` 设成与 updater 同名后重启再更新：应自动改用 `*-updater` 并写日志，**不得**互删；测完改回 | □ |

测完 **立刻改回** 正确 `PM2_NAME` / `PM2_UPDATER_NAME`。

---

## R4. 校验失败 / 坏包（可选）

| # | 步骤 | 期望 | □ |
|---|------|------|---|
| R4.1 | 若有测试清单可指向错误 sha256 | 停在 verifying/failed，**未**覆盖业务文件 | □ |
| R4.2 | API 保持可服务 | 无需回滚也能继续用旧版 | □ |

---

## R5. 更新页在 API 停机时仍可读（可选）

| # | 步骤 | 期望 | □ |
|---|------|------|---|
| R5.1 | 更新进入 stopping 后刷新「系统更新」页 | 不长期只显示「请求失败」；能读到静态 `update-status.json` 进度 | □ |

---

## 记录模板

```
日期:
站点:
起始版本:
目标版本:
用例: R0 / R1 / R2 / R3 / R4 / R5
结果: PASS / FAIL
现象与日志摘要:
pm2 list 截图或粘贴:
处理:
```

一轮「可外发」最低标准：**R0 + R1 + R2 + R3 全 PASS**。
