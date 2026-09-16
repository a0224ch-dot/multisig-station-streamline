# 加密钱包精简多签站 · 项目结构说明

**Crypto Wallet Streamline Multisig Station · Project Structure**

> 本文档面向**外发 / 公开**源码阅读者：说明目录分工与关键入口。  
> 不含公司内部多签策略（例如高档位触发条件、上游共管地址来源等）。  
> This document is for **public / outbound** source readers: layout and entry points only.  
> It does **not** describe internal multisig policy (e.g. high-tier triggers or upstream co-signer sourcing).

**演示站 / Demo：** https://multisig-station-streamline.iqiyia.cyou/

---

## 中文

### 1. 项目是什么

基于 TRON (TRC20) 的可自建多签站：**会员**自建开通码并贴场景；**站长**管理网络、地址、会员与 OTA。  
判定精简版：`GET /api/health` 返回 `"edition":"streamline"`。

### 2. 顶层目录

```
multisig-station-streamline/
├── backend/          # API 服务（Fastify + Prisma + SQLite）
├── frontend/         # 管理后台与公网 SPA（React + Vite）
├── deploy/           # 安装、发版、验收脚本与运维清单
├── examples/         # 对外 H5 场景模板（MIT）
├── PROJECT_STRUCTURE.md   # 本文件
├── README.md               # 快速上手
├── 搭建教程.md             # 四步快速搭建（中英）
├── 搭建教程.zh-CN.md       # 搭建完整版（中文）
├── Setup-Guide.en.md       # Setup guide (English)
├── CHANGELOG.md            # 版本变更
├── docs/踩坑与决策.md      # 可检索踩坑（不含内部档位触发条件）
└── VERSION                 # 当前版本号（与 OTA、help 对齐）
```

| 路径 | 功用 | 主要读者 |
|------|------|----------|
| `backend/` | REST API、链上开通会话、会员计费、OTA 更新器 | 后端 / 运维 |
| `frontend/` | 介绍页、开通页、登录、站长/会员后台 | 前端 / 产品 |
| `deploy/` | 宝塔一键装、打包 zip、nginx 修复、验收 | 运维 / 交付 |
| `examples/` | 可复制到友商或站长页面的静态跳转模板 | 集成方 |

### 3. 关键 URL（公网）

| 路径 | 用途 |
|------|------|
| `/` | 介绍首页（登录 / 条件注册，不出开通码） |
| `/login` | 站长与会员统一登录 |
| `/open` | 站点默认开通页（站长地址） |
| `/p/u/{会员短码}` | 会员专属出码入口 |
| `/p/{slug}` | 可装修路径，与 `/open` 同一开通页 |
| `/o/{token}` | 钱包签名页 |
| `/api/health` | 健康检查（含 `edition`、`version`） |

### 4. `backend/` 结构

```
backend/
├── prisma/
│   ├── schema.prisma      # 数据模型（用户、场景、开通会话、会员订单等）
│   ├── migrations/        # 数据库迁移
│   └── seed.ts            # 开发种子（默认 admin 等）
├── assets/scenarios/      # 内置场景封面 SVG
├── scripts/               # 本地验收脚本（非运行时）
├── src/
│   ├── index.ts           # 入口：注册路由、JWT、health
│   ├── routes/            # HTTP 路由（见下表）
│   ├── update/            # OTA：检查更新、下载 zip、PM2 重启
│   ├── auth.ts            # 角色与权限辅助
│   ├── scenarios.ts       # 场景卡业务（内置「柜台/友商柜台」等）
│   ├── openSession.ts     # 开通码会话
│   ├── presets.ts         # 多签地址配置
│   ├── memberBilling.ts   # 会员注册档、通用注册码、月卡天数
│   ├── memberRegisterCode.ts
│   ├── memberPayment.ts   # 链上购码订单监听
│   ├── license.ts         # 站点授权状态（与「向总部续费」相关）
│   ├── landing.ts         # 公网入口 URL 生成
│   ├── pageDecor.ts       # 开通页装修上传
│   ├── openWallets.ts     # 开通钱包入口配置
│   ├── tron.ts            # TRON 链交互（公开文档不展开内部档位策略）
│   ├── prices.ts          # 市价查询（用于开通前校验）
│   ├── partner.ts         # 友商 returnUrl 等（可选集成）
│   ├── hqClient.ts        # 与上游授权服务通信（**实现细节不对外说明**）
│   └── hqSync.ts            # 后台定时同步授权/策略（**不展开**）
├── .env.example           # 环境变量示例
└── package.json
```

**`src/routes/` 路由模块**

| 文件 | 职责 |
|------|------|
| `auth.ts` | 登录、验证码、会员注册、改密、用户管理 |
| `open.ts` | 公网开通：出码、prepare、broadcast、会员入口 meta |
| `scenarios.ts` | 场景 CRUD、图片上传、内置场景媒体 |
| `pageDecor.ts` | 公网页装修、landing slug |
| `admin.ts` | 网络、预置地址、已开通列表、广告、向总部续费订单 |
| `memberBilling.ts` | 会员计费设置、注册码、通用注册码 |
| `update.ts` | 系统更新检查与触发 |

**数据要点（`schema.prisma`）**

- `User`：角色 `SUPER_ADMIN` / `EMPLOYEE` / `MEMBER`，会员含 `memberCode`
- `Scenario`：场景卡（含 `builtinKey` 内置卡）
- `OpenSession`：一次开通会话与签名状态
- `MemberRegisterCode` / `MemberPayOrder`：注册码与链上购码

### 5. `frontend/` 结构

```
frontend/src/
├── App.tsx              # 路由总表（公网 + /branch + /member）
├── api.ts               # 调用后端 API
├── pages/               # 页面组件（见下表）
├── components/          # 通用 UI（语言切换、授权条等）
├── help/helpContent.ts  # 使用说明版本号与章节 ID
├── locales/zh.json      # 中文（含 help 全文）
├── locales/en.json      # 英文
├── i18n/                # i18next 配置
├── walletDeepLinks.ts   # 钱包跳转提示（非深链写死）
└── walletInject.ts      # 检测 injected wallet
```

**主要页面（`pages/`）**

| 文件 | 路由 | 说明 |
|------|------|------|
| `PublicHomePage.tsx` | `/` | 介绍首页 |
| `PublicOpenLanding.tsx` | `/open`, `/p/u/:code`, `/p/:slug` | 出开通码 |
| `OpenPage.tsx` | `/o/:token` | 钱包签名 |
| `LoginPage.tsx` | `/login` | 登录 |
| `MemberRegisterPage.tsx` | `/member/register` | 会员注册 |
| `BranchPresetsPage.tsx` | `/*/presets` | 多签地址 |
| `BranchScenariosPage.tsx` | `/*/scenarios` | 场景卡 |
| `BranchMembersPage.tsx` | `/branch/members` | 会员与通用注册码 |
| `BranchUpdatePage.tsx` | `/branch/update` | 系统更新 |
| `BranchHelpPage.tsx` | `/*/help` | 使用说明 |
| `BranchSubscriptionPage.tsx` | `/branch/subscription` | 向总部续费 |

会员后台复用部分 Branch 页面（场景、地址等），导航在 `App.tsx` 的 `MemberShell`。

### 6. `deploy/` 结构

| 文件 | 功用 |
|------|------|
| `install-streamline-baota.sh` | **精简版**宝塔一键安装（主入口） |
| `pack-release.sh` | 打 OTA zip + `latest.json` |
| `make-unix-zip.mjs` | Unix 格式 zip（避免 Windows 路径问题） |
| `accept-streamline.sh` | 机器可判定验收项 |
| `accept-partner-scene.mjs` | 友商柜台场景接口验收 |
| `fix-baota-nginx.sh` | 修复宝塔 nginx 反代 / SPA |
| `验收清单.md` | 交付勾选清单 |
| `升级前检查清单.md` | 打包、上传、站点更新前必勾 |
| `OTA回归清单.md` | 更新回归 R0–R3 |
| `友商通用注册码说明.md` | 友商一页纸（可 PDF 外发） |
| `latest.example.json` | 发布仓 latest.json 示例 |
| `install-branch-baota.sh` | **非精简版**分公司安装脚本（同仓历史文件，精简交付可忽略） |
| `capture-promo-screenshots.mjs` | 宣传截图工具（可选） |

### 7. `examples/` 结构

| 目录 | 给谁 | 入口 URL |
|------|------|----------|
| `streamline-partner-scene/` | **友商（会员）** | `/p/u/{会员码}` |
| `multisig-scene-starter/` | **站长** | `/open` |
| `README.md` | 两者对照索引 | — |

友商亦可直接用后台内置场景 **「友商柜台」** 二维码，零代码。

### 8. 相关 GitHub 仓库

| 用途 | 仓库 |
|------|------|
| 源码 | https://github.com/a0224ch-dot/multisig-station-streamline |
| OTA 发布（zip + latest.json） | https://github.com/a0224ch-dot/multisig-station-streamline-releases |

新装默认 `UPDATE_RELEASES_URL` 指向 a0224ch-dot 发布仓；后台 **系统更新** 读 `latest.json` 拉 zip。

### 9. 公开文档刻意不收录的内容

- 高档多签档位触发条件、折合阈值、上游共管地址列表及同步方式  
- 总部后台运维端口、内部 API 密钥约定  
- 以上属于部署方与上游之间的**内部策略**；精简版对外只暴露「向总部续费」等产品能力，详见后台 **使用说明**，不在本结构文档展开。

---

## English

### 1. What this project is

A self-hosted **TRON (TRC20) multisig station**: **members** issue open codes for their scenarios; **site owners** manage network, addresses, members, and OTA.  
Streamline edition: `GET /api/health` returns `"edition":"streamline"`.

### 2. Top-level layout

Same tree as the Chinese section above. Key folders:

| Path | Purpose | Audience |
|------|---------|----------|
| `backend/` | REST API, open sessions, member billing, OTA updater | Backend / ops |
| `frontend/` | Landing, open page, login, staff & member admin | Frontend / product |
| `deploy/` | Baota install, release zip, nginx fix, acceptance | Ops / delivery |
| `examples/` | MIT static templates for H5 / counter integration | Integrators |

### 3. Public URLs

| Path | Purpose |
|------|---------|
| `/` | Intro home (sign-in / conditional register; no open QR) |
| `/login` | Shared login for staff and members |
| `/open` | Site default open page (staff addresses) |
| `/p/u/{memberCode}` | Member private open entry |
| `/p/{slug}` | Decorated path; same open page as `/open` |
| `/o/{token}` | Wallet sign page |
| `/api/health` | Health check (`edition`, `version`) |

### 4. `backend/`

- **`prisma/`** — SQLite schema, migrations, seed  
- **`assets/scenarios/`** — Built-in scenario cover SVGs  
- **`src/routes/`** — HTTP modules: `auth`, `open`, `scenarios`, `pageDecor`, `admin`, `memberBilling`, `update`  
- **`src/update/`** — OTA check, download, overlay, PM2 restart  
- **Domain modules** — `scenarios`, `openSession`, `presets`, `memberBilling`, `license`, `landing`, `tron`, etc.  
- **`hqClient.ts` / `hqSync.ts`** — Upstream license integration (**internal details omitted from public docs**)  
- **`tron.ts`** — Chain operations (**public docs do not describe internal tier policy**)

### 5. `frontend/`

- **`App.tsx`** — All routes (public + `/branch/*` + `/member/*`)  
- **`pages/`** — UI for landing, open, sign, login, presets, scenarios, members, update, help, HQ renewal  
- **`help/helpContent.ts` + `locales/*.json`** — In-app help (version must match root `VERSION`)  
- **`api.ts`** — Backend client  

Members reuse several staff pages (scenarios, presets) under `MemberShell`.

### 6. `deploy/`

| File | Purpose |
|------|---------|
| `install-streamline-baota.sh` | **Streamline** one-click Baota install |
| `pack-release.sh` | Build OTA zip + `latest.json` |
| `accept-streamline.sh` | Automated acceptance checks |
| `accept-partner-scene.mjs` | Partner counter scenario API checks |
| `fix-baota-nginx.sh` | Fix Baota nginx proxy / SPA |
| `升级前检查清单.md` | Pre-upgrade checklist (pack, publish, site update) |
| `验收清单.md` / `OTA回归清单.md` | Delivery & OTA regression checklists |
| `友商通用注册码说明.md` | One-page partner onboarding (Chinese) |

Ignore `install-branch-baota.sh` for streamline-only delivery (legacy branch installer in the same repo).

### 7. `examples/`

| Folder | For | Entry URL |
|--------|-----|-----------|
| `streamline-partner-scene/` | **Partners (members)** | `/p/u/{code}` |
| `multisig-scene-starter/` | **Site owner** | `/open` |

Built-in **Partner counter** scenario QR in the admin panel works without the template.

### 8. GitHub repos

| Role | Repository |
|------|------------|
| Source | https://github.com/a0224ch-dot/multisig-station-streamline |
| OTA releases | https://github.com/a0224ch-dot/multisig-station-streamline-releases |

Fresh installs default `UPDATE_RELEASES_URL` to the a0224ch-dot releases repo.

### 9. Intentionally omitted from public docs

- High-tier multisig triggers, valuation thresholds, upstream co-signer lists and sync  
- HQ ops ports and internal API key conventions  

The product exposes **Renew with HQ** for site licensing; internal policy stays with the deployer/upstream. See in-app **Help**, not this structure file.

---

## 维护提示 / Maintenance

- 发版时若改用户可见行为，同步：`VERSION`、`frontend/src/help/helpContent.ts`、`locales` help 章节、必要时 `CHANGELOG.md` 与本文件目录说明。  
- When shipping user-visible changes, keep `VERSION`, `helpContent.ts`, help locales, `CHANGELOG.md`, and this file in sync.
