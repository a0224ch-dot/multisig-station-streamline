# 精简多签站（multisig-station-streamline）

可外发的多签站点源码：公网页开通 + 精简管理后台。

## 功能

- 公网页扫码 / 链接开通多签
- 后台：多签地址、已开通、公网页装修、开通钱包、系统更新、使用说明、修改密码

`/api/health` 返回 `"edition":"streamline"`。

## 本地开发

```bash
cd backend && cp .env.example .env && npm i && npx prisma migrate deploy && npm run seed && npm run dev
cd frontend && npm i && npm run dev
```

默认 API 端口 **8791**。按 `.env.example` 填写必要配置后启动即可。

## 入口

- 公网页：`/`
- 后台：`/branch/login`

## 发版 / 在线更新

```bash
VERSION=20260817-1 NOTES="说明" bash deploy/pack-release.sh
```

更新清单发布仓：https://github.com/e12games/multisig-station-streamline-releases  
业务源码仓：https://github.com/e12games/multisig-station-streamline
