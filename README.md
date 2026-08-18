# 精简多签站（multisig-station-streamline）

可外发的多签站源码：公网页开通 + 精简管理后台。  
External-ready multisig site: public open page + lightweight admin panel.

## 核心功能 / Features

- 公网页扫码或链接开通多签（地址不变）
- 后台含：多签地址、网络设置、已开通、公网页装修、开通钱包、系统更新、使用说明、修改密码
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
git clone -b 20260818-1044 https://github.com/a0224ch-dot/multisig-station-streamline.git
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

- 公网页：`https://your-domain.com/`
- 后台：`https://your-domain.com/branch/login`
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
VERSION=20260818-6 NOTES="修复已知 BUG / 更新功能" bash deploy/pack-release.sh
```

- 更新发布仓 / Release repo: https://github.com/a0224ch-dot/multisig-station-streamline-releases
- 源码仓 / Source repo: https://github.com/a0224ch-dot/multisig-station-streamline
