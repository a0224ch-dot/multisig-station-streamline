#!/usr/bin/env bash
# 加密钱包精简多签站 - Ubuntu/宝塔 一键安装（自动选空闲端口）
# 用法（在已能访问 GitHub 的 VPS 上）：
#   cd /www/wwwroot
#   git clone -b main https://github.com/a0224ch-dot/multisig-station-streamline.git
#   bash multisig-station-streamline/deploy/install-streamline-baota.sh
#
# 可选环境变量覆盖：
#   SITE_DOMAIN=你的域名
#   SITE_PORT=8791
#   HQ_BASE_URL=...
#   BRANCH_API_KEY=...

set -uo pipefail

SITE_DOMAIN="${SITE_DOMAIN:-multisig-streamline.example.com}"
HQ_BASE_URL="${HQ_BASE_URL:-https://multisig-station.iqiyia.cyou}"
BRANCH_NAME="${BRANCH_NAME:-加密钱包多签}"
PM2_NAME="${PM2_NAME:-multisig-streamline-api}"
INSTALL_ROOT="${INSTALL_ROOT:-/www/wwwroot/multisig-station-streamline}"
GIT_BRANCH="${GIT_BRANCH:-main}"
GIT_URL="${GIT_URL:-https://github.com/a0224ch-dot/multisig-station-streamline.git}"
UPDATE_RELEASES_URL="${UPDATE_RELEASES_URL:-https://raw.githubusercontent.com/a0224ch-dot/multisig-station-streamline-releases/main/latest.json}"

RESERVED_PORTS=(80 443 3000 3001 5173 5174 8000 8080 8787 8788)
PORT_CANDIDATES=(8791 8792 8793 8794 8800 8801 8810 18891 28891)

rand_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 24
  else
    head -c 48 /dev/urandom | xxd -p | head -c 48
  fi
}

port_busy() {
  local p="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -tln 2>/dev/null | grep -qE ":${p}\s" && return 0
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1 && return 0
  fi
  return 1
}

is_reserved() {
  local p="$1" r
  for r in "${RESERVED_PORTS[@]}"; do
    [[ "$p" == "$r" ]] && return 0
  done
  return 1
}

pick_port() {
  if [[ -n "${SITE_PORT:-}" ]]; then
    if port_busy "$SITE_PORT"; then
      echo "错误: 指定端口 SITE_PORT=$SITE_PORT 已被占用" >&2
      exit 1
    fi
    if is_reserved "$SITE_PORT"; then
      echo "警告: $SITE_PORT 在预留列表中，仍按你指定使用" >&2
    fi
    echo "$SITE_PORT"
    return
  fi
  local p
  for p in "${PORT_CANDIDATES[@]}"; do
    if is_reserved "$p"; then
      continue
    fi
    if ! port_busy "$p"; then
      echo "$p"
      return
    fi
  done
  echo "错误: 候选端口均忙，请手动 SITE_PORT=xxxxx bash $0" >&2
  exit 1
}

echo "=========================================="
echo " 加密钱包精简多签站一键安装"
echo " 域名: $SITE_DOMAIN"
echo "=========================================="

if ! command -v node >/dev/null 2>&1; then
  echo "错误: 未找到 node，请先在宝塔安装 Node 18+" >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "错误: 未找到 npm" >&2
  exit 1
fi
if ! command -v pm2 >/dev/null 2>&1; then
  echo "未找到 pm2，正在安装..."
  npm i -g pm2
fi

echo
echo "【端口占用速查】"
for p in 8788 8790 8791 8800; do
  if port_busy "$p"; then
    echo "  $p : 已占用"
  else
    echo "  $p : 空闲"
  fi
done

PORT="$(pick_port)"
echo
echo ">>> 选用 API 端口: $PORT"
echo

if [[ ! -d "$INSTALL_ROOT/.git" ]]; then
  mkdir -p "$(dirname "$INSTALL_ROOT")"
  if [[ -d "$INSTALL_ROOT" ]] && [[ ! -d "$INSTALL_ROOT/.git" ]]; then
    echo "目录已存在但不是 git 仓库: $INSTALL_ROOT"
    echo "请清空或改 INSTALL_ROOT 后重试"
    exit 1
  fi
  echo "克隆仓库 -> $INSTALL_ROOT"
  git clone -b "$GIT_BRANCH" "$GIT_URL" "$INSTALL_ROOT"
else
  echo "更新已有仓库: $INSTALL_ROOT"
  cd "$INSTALL_ROOT"
  git fetch origin "$GIT_BRANCH" || true
  git checkout "$GIT_BRANCH" || true
  git pull origin "$GIT_BRANCH" || true
fi

cd "$INSTALL_ROOT/backend"

JWT_SECRET="${JWT_SECRET:-$(rand_secret)}"
BRANCH_API_KEY="${BRANCH_API_KEY:-streamline-$(rand_secret | head -c 24)}"

cat > .env <<EOF
DATABASE_URL="file:./prod.db"
JWT_SECRET="${JWT_SECRET}"
PORT=${PORT}
FRONTEND_ORIGIN=https://${SITE_DOMAIN}
OPEN_TOKEN_TTL_SECONDS=300
VALUE_THRESHOLD_USDT=500000
HQ_BASE_URL=${HQ_BASE_URL}
BRANCH_API_KEY=${BRANCH_API_KEY}
BRANCH_NAME=${BRANCH_NAME}
BRANCH_CONTACT=
BRANCH_PUBLIC_URL=https://${SITE_DOMAIN}
HQ_HEARTBEAT_MS=60000
TRON_FULL_HOST_SHASTA=https://api.shasta.trongrid.io
TRON_FULL_HOST_MAINNET=https://api.trongrid.io
TRON_API_KEY=
USDT_CONTRACT_SHASTA=TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs
USDT_CONTRACT_MAINNET=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
PM2_NAME=${PM2_NAME}
INSTALL_ROOT=${INSTALL_ROOT}
UPDATE_RELEASES_URL=${UPDATE_RELEASES_URL}
EOF

echo "已写入 backend/.env （PORT=$PORT）"

if [[ ! -f "$INSTALL_ROOT/VERSION" ]]; then
  echo "20260817-2" > "$INSTALL_ROOT/VERSION"
fi

echo "安装后端依赖..."
npm install
echo "数据库迁移..."
npx prisma migrate deploy
echo "种子数据..."
npm run seed || true

echo "启动 PM2: $PM2_NAME"
pm2 delete "$PM2_NAME" 2>/dev/null || true
pm2 start "npx tsx src/index.ts" --name "$PM2_NAME" --cwd "$INSTALL_ROOT/backend"
pm2 save

sleep 2
echo "健康检查:"
curl -s "http://127.0.0.1:${PORT}/api/health" || echo "(health 暂无响应，请看 pm2 logs)"
echo
echo "ss 确认端口:"
ss -tlnp 2>/dev/null | grep ":${PORT}\s" || true

echo
echo "构建前端..."
cd "$INSTALL_ROOT/frontend"
npm install
npm run build

echo
echo "=========================================="
echo " 安装完成"
echo "=========================================="
echo " 代码目录: $INSTALL_ROOT"
echo " API 端口: $PORT  (PM2: $PM2_NAME)"
echo " 前端产物: $INSTALL_ROOT/frontend/dist"
echo " BRANCH_API_KEY: $BRANCH_API_KEY"
echo " 默认后台账号: admin / Branch@123456  （请立刻改密）"
echo
echo "【请在宝塔完成】"
echo " 1. 添加站点域名: $SITE_DOMAIN"
echo " 2. 网站目录: $INSTALL_ROOT/frontend/dist"
echo " 3. SSL 强制 HTTPS"
echo " 4. 反向代理（先开「高级功能」）:"
echo "      代理目录 = /api"
echo "      目标URL  = http://127.0.0.1:${PORT}"
echo "      发送域名 = \$host"
echo "      不要把 / 整站反代到 Node"
echo " 5. Nginx location / 增加: try_files \$uri \$uri/ /index.html;"
echo " 6. 或站点创建后执行:"
echo "      DOMAIN=${SITE_DOMAIN} API_PORT=${PORT} bash \"$INSTALL_ROOT/deploy/fix-baota-nginx.sh\""
echo
echo "【验收】"
echo "  https://${SITE_DOMAIN}/"
echo "  https://${SITE_DOMAIN}/branch/login"
echo "  https://${SITE_DOMAIN}/api/health   → edition 应为 streamline"
echo "=========================================="
