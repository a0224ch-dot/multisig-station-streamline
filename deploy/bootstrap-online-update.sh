#!/usr/bin/env bash
# 已安装精简版站：首次加入“网页在线更新”功能。
# 本脚本不会重写 backend/.env，也不会删除数据库。
#
# 用法：
#   cd /www/wwwroot/multisig-station-branch
#   git pull origin 20260815-1746
#   bash deploy/bootstrap-online-update.sh

set -euo pipefail

ROOT="${INSTALL_ROOT:-/www/wwwroot/multisig-station-branch}"
PM2_APP="${PM2_NAME:-multisig-branch-api}"
VERSION="${BOOTSTRAP_VERSION:-20260815}"
ENV_FILE="$ROOT/backend/.env"

if [[ ! -d "$ROOT/backend" || ! -d "$ROOT/frontend" ]]; then
  echo "错误：未找到精简版站目录：$ROOT" >&2
  echo "如安装位置不同，请这样运行：" >&2
  echo "INSTALL_ROOT=/实际目录 bash deploy/bootstrap-online-update.sh" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "错误：$ENV_FILE 不存在，为保护配置已停止。" >&2
  exit 1
fi

echo "=========================================="
echo " 首次安装网页在线更新功能"
echo " 目录: $ROOT"
echo " 版本: $VERSION"
echo "=========================================="

# 先备份关键配置和数据库；失败时技术员也能人工恢复。
STAMP="$(date +%Y%m%d-%H%M%S)"
SAFETY="$ROOT/.bootstrap-backup-$STAMP"
mkdir -p "$SAFETY"
cp "$ENV_FILE" "$SAFETY/backend.env"
while IFS= read -r -d '' db; do
  rel="${db#"$ROOT/"}"
  mkdir -p "$SAFETY/$(dirname "$rel")"
  cp "$db" "$SAFETY/$rel"
done < <(find "$ROOT/backend" -type f \( -name "*.db" -o -name "*.db-journal" \) -print0)
echo "安全备份: $SAFETY"

# 只补缺失项，不改现有 PORT、密钥、总部地址等配置。
append_env_if_missing() {
  local key="$1" value="$2"
  if ! grep -qE "^${key}=" "$ENV_FILE"; then
    printf '\n%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

append_env_if_missing "PM2_NAME" "$PM2_APP"
append_env_if_missing "INSTALL_ROOT" "$ROOT"
append_env_if_missing \
  "UPDATE_RELEASES_URL" \
  "https://raw.githubusercontent.com/e12games/multisig-station-branch-releases/main/latest.json"

printf '%s\n' "$VERSION" > "$ROOT/VERSION"

echo ">>> 安装后端依赖并迁移数据库…"
cd "$ROOT/backend"
npm install
npx prisma generate
npx prisma migrate deploy

echo ">>> 构建前端…"
# 宝塔常在网站根目录放不可删的 .user.ini，Vite 清空 dist 会失败
USER_INI="$ROOT/frontend/dist/.user.ini"
USER_INI_BAK="$ROOT/frontend/.user.ini.bootstrap-bak"
if [[ -f "$USER_INI" ]]; then
  echo "检测到宝塔 .user.ini，临时移走以便构建…"
  chattr -i "$USER_INI" 2>/dev/null || true
  mv -f "$USER_INI" "$USER_INI_BAK"
fi

cd "$ROOT/frontend"
npm install
npm run build

# 构建后移回，避免面板安全策略异常
if [[ -f "$USER_INI_BAK" ]]; then
  mkdir -p "$ROOT/frontend/dist"
  mv -f "$USER_INI_BAK" "$ROOT/frontend/dist/.user.ini"
  chattr +i "$ROOT/frontend/dist/.user.ini" 2>/dev/null || true
  echo "已恢复 .user.ini"
fi

echo ">>> 重启 API…"
pm2 restart "$PM2_APP" --update-env
pm2 save

PORT="$(grep -E '^PORT=' "$ENV_FILE" | tail -n 1 | cut -d= -f2- | tr -d '"[:space:]')"
PORT="${PORT:-8790}"

echo ">>> 健康检查…"
OK=0
for _ in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/health" | grep -q '"ok":true'; then
    OK=1
    break
  fi
  sleep 1
done

if [[ "$OK" != "1" ]]; then
  echo "错误：API 健康检查失败，请执行：" >&2
  echo "pm2 logs $PM2_APP --lines 80 --nostream" >&2
  exit 1
fi

echo
echo "首次升级完成："
echo "  API: http://127.0.0.1:${PORT}/api/health"
echo "  后台菜单: /branch/update"
echo "  当前版本: $VERSION"
echo "  安全备份: $SAFETY"
echo "=========================================="
