# 精简多签站（multisig-station-streamline）

分公司能力的**可外发公开版**：源码可交付给子公司 / 社会客户。

## 与完整分公司的区别

| | 完整分公司 | 本精简版 |
|--|--|--|
| 公网页开通 | 有 | **有**（主入口） |
| 已开通 | 有 | **有** |
| 多签地址 / 公网页装修 / 开通钱包 | 有 | **有** |
| 系统更新 / 使用说明 / 改密 | 有 | **有** |
| 后台内部开通码、场景、对接、会员账号、网络页 | 有 | **无（源码已去掉）** |
| 大额 3/4 接总部 | 有 | **有** |

`/api/health` 返回 `"edition":"streamline"`。

## 本地开发

```bash
cd backend && cp .env.example .env && npm i && npx prisma migrate deploy && npm run seed && npm run dev
cd frontend && npm i && npm run dev
```

默认 API 端口 **8791**（避免与总部 8788、分公司冲突）。配置 `HQ_BASE_URL`、`BRANCH_API_KEY`、`BRANCH_PUBLIC_URL` 后可向总部登记并拉取高档 3 址。

## 管理入口

- 公网页：`/`
- 后台：`/branch/login`

## 发版

```bash
VERSION=20260817-1 NOTES="说明" bash deploy/pack-release.sh
```

产物：`dist-release/streamline-VERSION.zip`。发布仓默认 `e12games/multisig-station-streamline-releases`（需自建）。
