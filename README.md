# 加密钱包精简多签站（multisig-station-streamline）

可外发的多签站源码：会员自建开通码并贴到场景 + 精简管理后台。  
Crypto Wallet Streamline Multisig Station: members make open codes for their own scenarios + lightweight admin.

## 核心功能 / Features

- **主功用**：会员配自己的 2 址，专属入口 `/p/u/{码}` 出开通码；在「场景」生成二维码贴到自己的应用
- 客户扫码后钱包打开 `/o/{会话}` 签名（地址不变）
- 站点默认开通门 `/open`（与 `/p/路径` 同一页，走站长地址）
- 介绍首页 `/`：登录 / 条件注册，不出开通码
- 后台含：多签地址、网络设置、已开通、公网页装修（开通页外观）、场景（贴码卡片）、会员（注册与向本站收费）、开通钱包、站点月卡（向总部）、系统更新、使用说明、修改密码
- 会员后台另有「会员月卡」（向本站续权限，与站点月卡不是同一笔）
- `/api/health` 返回 `"edition":"streamline"`

## 快速搭建（中文主）/ Quick Setup (EN)

### 1) 准备环境 / Prerequisites

- Linux 服务器 + 宝塔面板（Baota）
- Node.js 18+、PM2
- 域名已解析到服务器 IP

### 2) 安装项目 / Install

```bash
cd /www/wwwroot
export SITE_DOMAIN='your-domain.com'
git clone -b main https://github.com/a0224ch-dot/multisig-station-streamline.git
cd multisig-station-streamline
bash deploy/install-streamline-baota.sh
```

### 3) 宝塔站点配置 / Baota Site Config

- 网站目录指向：`/www/wwwroot/multisig-station-streamline/frontend/dist`
- 反向代理：`/api` -> `http://127.0.0.1:8791`（按实际端口改）
- 伪静态：

```nginx
try_files $uri $uri/ /index.html;
```

### 4) 验证访问 / Verify

- 介绍首页：`https://your-domain.com/`
- 会员专属出码：`https://your-domain.com/p/u/{码}`
- 钱包签名：`https://your-domain.com/o/{会话}`
- 站点开通页：`https://your-domain.com/open`（与 `/p/路径` 同一页）
- 后台登录：`https://your-domain.com/login`（管理员与会员同一入口；`/branch/login` 仍可用）
- 会员注册：超管在「会员」页选注册档并点保存；须注册码时可链上购码（先填本站 USDT 收款地址）
- 健康检查：`https://your-domain.com/api/health`（应含 `"edition":"streamline"`）

## VPS / 宝塔搭建入口

- 中文完整版（主）: [`搭建教程.zh-CN.md`](./搭建教程.zh-CN.md)
- English guide (secondary): [`Setup-Guide.en.md`](./Setup-Guide.en.md)
- 快速入口（导航页）: [`搭建教程.md`](./搭建教程.md)

## 本地开发 / Local Dev

```bash
cd backend && cp .env.example .env && npm i && npx prisma migrate deploy && npm run seed && npm run dev
cd frontend && npm i && npm run dev
```

默认 API 端口：`8791`  
Default API port: `8791`

## 发版与在线更新 / Release & OTA Update

```bash
VERSION=20260818-9 NOTES="修复已知 BUG / 更新功能" bash deploy/pack-release.sh
```

- 更新发布仓 / Release repo: https://github.com/a0224ch-dot/multisig-station-streamline-releases
- 源码仓 / Source repo: https://github.com/a0224ch-dot/multisig-station-streamline
