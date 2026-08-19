# 加密钱包精简多签站

**Crypto Wallet Streamline Multisig Station**

可外发的多签站源码：基于 TRON (TRC20) 公链，会员自建开通码并贴到自己的场景 + 精简管理后台。  
Open-source TRON (TRC20) multisig station: members create their own open codes for their scenarios + lightweight admin panel.

**演示站 / Demo：** https://multisig-station-streamline.iqiyia.cyou/

---

## 一键安装 / One-Click Install

> 适用于 Linux + 宝塔面板环境。  
> For Linux + Baota (BT Panel) environments.

```bash
cd /www/wwwroot && git clone -b main https://github.com/a0224ch-dot/multisig-station-streamline.git && cd multisig-station-streamline && bash deploy/install-streamline-baota.sh
```

前提 / Prerequisites：
- Linux 服务器已安装**宝塔面板**（Baota / BT Panel）
- **Node.js 18+** 和 **PM2**（宝塔软件商店可装）
- 域名已解析到服务器 IP

---

## 安装后配置 / Post-Install Config

### 宝塔站点 3 步 / Baota Site in 3 Steps

1. **网站目录 / Site root**  
   `/www/wwwroot/multisig-station-streamline/frontend/dist`

2. **反向代理 / Reverse proxy**  
   `/api` → `http://127.0.0.1:8791`（端口以 `backend/.env` 中 `PORT` 为准）

3. **伪静态 / Rewrite rule**  
   ```nginx
   try_files $uri $uri/ /index.html;
   ```

### 验证 / Verify

| 页面 / Page | 地址 / URL |
|---|---|
| 介绍首页 / Landing | `https://你的域名/` |
| 后台登录 / Admin login | `https://你的域名/login` |
| 站点开通页 / Open page | `https://你的域名/open` |
| 会员专属出码 / Member code | `https://你的域名/p/u/{码}` |
| 钱包签名 / Wallet sign | `https://你的域名/o/{会话}` |
| 健康检查 / Health check | `https://你的域名/api/health`（返回 `"edition":"streamline"`） |

---

## 在线更新 / OTA Update

后台 → **系统更新** → 检查更新 → 立即更新。配置和数据库不会被覆盖。更新时 API 会短暂停止再拉起。  
Admin → **System Update** → Check → Update Now. Config (.env) and database are preserved. The API stops briefly, then starts again.

---

## 核心功能 / Features

- 会员配自己的 2 个地址，专属入口 `/p/u/{码}` 生成开通码；在「场景」生成二维码贴到自己的应用
- 客户扫码后在 `/o/{会话}` 完成钱包签名
- 站点默认开通页 `/open`（与 `/p/路径` 同一页，走站长地址）
- 后台含：多签地址、网络设置、已开通、公网页装修、场景、会员管理、开通钱包、向总部续费、系统更新、使用说明
- 会员后台另有「会员月卡」（向本站续权限，与向总部续费无关）
- 收款订单页支持地址二维码扫码 + 一键复制金额
- `/api/health` 返回 `"edition":"streamline"`

---

## 本地开发 / Local Dev

```bash
# 后端 / Backend
cd backend && cp .env.example .env && npm i && npx prisma migrate deploy && npm run seed && npm run dev

# 前端 / Frontend（另开终端）
cd frontend && npm i && npm run dev
```

默认 API 端口 / Default API port：`8791`

---

## 详细搭建教程 / Full Setup Guides

- 中文完整版（主）：[`搭建教程.zh-CN.md`](./搭建教程.zh-CN.md)
- English guide (secondary)：[`Setup-Guide.en.md`](./Setup-Guide.en.md)
- 快速入口（导航页）：[`搭建教程.md`](./搭建教程.md)

---

## 相关仓库 / Related Repos

- 源码仓 / Source：https://github.com/a0224ch-dot/multisig-station-streamline
- 更新发布仓 / OTA releases：https://github.com/a0224ch-dot/multisig-station-streamline-releases
