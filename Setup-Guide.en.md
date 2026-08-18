# Streamline Multisig - Setup Guide (English)

This is the short English setup guide.  
For full Chinese instructions, see [`搭建教程.zh-CN.md`](./搭建教程.zh-CN.md).

Support: [@usdtsoft306](https://t.me/usdtsoft306)

---

## What this project provides

- Public page: users scan QR / open link and sign in wallet to enable multisig.
- Admin page: configure multisig addresses, network, wallet entries, public page style, and updates.

Health check endpoint:

- `https://your-domain.com/api/health`
- It should include `"edition":"streamline"`.

---

## Prerequisites

1. Linux server with Baota panel
2. Domain A record pointing to your server IP
3. Node.js 18+ and PM2 installed
4. Server can access GitHub

---

## 4-Step deployment

## 1) Install on server

```bash
cd /www/wwwroot
export SITE_DOMAIN='your-domain.com'
git clone -b 20260818-1044 https://github.com/a0224ch-dot/multisig-station-streamline.git
cd multisig-station-streamline
bash deploy/install-streamline-baota.sh
```

After script finishes, note:

- API port (usually `8791`)
- Default admin account: `admin` / `Branch@123456` (change password immediately)

If frontend page is blank:

```bash
cd /www/wwwroot/multisig-station-streamline/frontend
npm run build
```

## 2) Create Baota website

- Domain: `your-domain.com`
- Site root: `/www/wwwroot/multisig-station-streamline/frontend/dist`
- Enable HTTPS (Force HTTPS)

## 3) Configure reverse proxy + SPA rewrite

Reverse proxy:

- Path: `/api`
- Target: `http://127.0.0.1:8791` (replace with your real API port)
- Send domain: `$host`

Important: target URL must **not** end with `/`.

SPA rewrite rule:

```nginx
try_files $uri $uri/ /index.html;
```

Optional auto-fix script:

```bash
DOMAIN='your-domain.com' API_PORT=8791 \
  bash /www/wwwroot/multisig-station-streamline/deploy/fix-baota-nginx.sh
```

## 4) Verify

- Public page: `https://your-domain.com/`
- Admin login: `https://your-domain.com/branch/login`
- Health: `https://your-domain.com/api/health` (must contain `"edition":"streamline"`)

Then in admin panel:

1. Change default password
2. Select network (mainnet / shasta)
3. Configure 2 multisig addresses
4. Enable wallet entries
5. (Optional) Customize public page

---

## Online update

Admin panel -> `System Update` -> `Check` -> `Update now`.

Update keeps your `.env` and database.
