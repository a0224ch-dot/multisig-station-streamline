#!/usr/bin/env bash
# 精简版自动验收（机器可判定项）
# 用法：
#   cd /www/wwwroot/multisig-station-streamline
#   SITE_DOMAIN='你的域名.com' bash deploy/accept-streamline.sh
#
# 可选：
#   INSTALL_ROOT=...   默认当前仓库根或脚本上级
#   EXPECT_PORT=8791   若设则强制核对 .env PORT

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${INSTALL_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
ENV_FILE="$ROOT/backend/.env"
PASS=0
FAIL=0
WARN=0

green() { printf '\033[32m%s\033[0m\n' "$*"; }
red() { printf '\033[31m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

ok() { green "PASS  $*"; PASS=$((PASS + 1)); }
bad() { red "FAIL  $*"; FAIL=$((FAIL + 1)); }
warn() { yellow "WARN  $*"; WARN=$((WARN + 1)); }

read_env() {
  local key="$1"
  [[ -f "$ENV_FILE" ]] || return 1
  # 去引号与首尾空白
  grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | head -n1 | cut -d= -f2- | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

echo "=========================================="
echo " 精简版自动验收"
echo " 根目录: $ROOT"
echo "=========================================="

# --- 目录与产物 ---
if [[ -f "$ROOT/frontend/dist/index.html" ]]; then
  ok "frontend/dist/index.html 存在"
else
  bad "缺少 frontend/dist/index.html（请 npm run build）"
fi

if [[ -f "$ROOT/VERSION" ]]; then
  ok "VERSION=$(tr -d '\r\n' < "$ROOT/VERSION")"
else
  bad "缺少 VERSION 文件"
fi

# --- .env ---
if [[ ! -f "$ENV_FILE" ]]; then
  bad "缺少 backend/.env"
  echo
  echo "结果: FAIL=$FAIL PASS=$PASS WARN=$WARN"
  exit 1
fi

PORT="$(read_env PORT || true)"
PM2_NAME="$(read_env PM2_NAME || true)"
PM2_UPDATER_NAME="$(read_env PM2_UPDATER_NAME || true)"
INSTALL_ROOT_ENV="$(read_env INSTALL_ROOT || true)"
UPDATE_URL="$(read_env UPDATE_RELEASES_URL || true)"
JWT="$(read_env JWT_SECRET || true)"

[[ -n "$PORT" ]] && ok "PORT=$PORT" || bad "backend/.env 缺少 PORT"
[[ -n "$JWT" ]] && ok "JWT_SECRET 已配置" || bad "backend/.env 缺少 JWT_SECRET"
[[ -n "$INSTALL_ROOT_ENV" ]] && ok "INSTALL_ROOT=$INSTALL_ROOT_ENV" || warn "未配置 INSTALL_ROOT（OTA 可能找错目录）"
[[ -n "$UPDATE_URL" ]] && ok "UPDATE_RELEASES_URL 已配置" || warn "未配置 UPDATE_RELEASES_URL（将用代码默认）"

if [[ -z "$PM2_NAME" ]]; then
  PM2_NAME="multisig-streamline-api"
  warn "未配置 PM2_NAME，按默认 $PM2_NAME 检查"
else
  ok "PM2_NAME=$PM2_NAME"
fi

if [[ -z "$PM2_UPDATER_NAME" ]]; then
  PM2_UPDATER_NAME="multisig-streamline-updater"
fi

if [[ "$PM2_NAME" == "$PM2_UPDATER_NAME" ]]; then
  bad "PM2_NAME 与更新进程名相同（$PM2_NAME），OTA 会互删"
else
  ok "API/Updater 进程名不冲突（$PM2_NAME / $PM2_UPDATER_NAME）"
fi

if [[ -n "${EXPECT_PORT:-}" && -n "$PORT" && "$EXPECT_PORT" != "$PORT" ]]; then
  bad "EXPECT_PORT=$EXPECT_PORT 与 .env PORT=$PORT 不一致"
fi

# --- 本机 health ---
if [[ -n "$PORT" ]]; then
  BODY="$(curl -sS --connect-timeout 3 "http://127.0.0.1:${PORT}/api/health" 2>/dev/null || true)"
  if echo "$BODY" | grep -q '"ok"[[:space:]]*:[[:space:]]*true' && echo "$BODY" | grep -q 'streamline'; then
    ok "本机 health edition=streamline ($BODY)"
  else
    bad "本机 health 异常: ${BODY:-无响应}"
  fi

  # 误指总部时的旁证
  for p in 8788; do
    OTHER="$(curl -sS --connect-timeout 1 "http://127.0.0.1:${p}/api/health" 2>/dev/null || true)"
    if echo "$OTHER" | grep -q '"edition"[[:space:]]*:[[:space:]]*"hq"'; then
      if [[ "$PORT" == "$p" ]]; then
        bad "当前 PORT 指向总部 8788"
      else
        warn "本机 8788 是总部 HQ（正常）；请确认 nginx 反代指到 $PORT 而非 8788"
      fi
    fi
  done
fi

# --- PM2 ---
if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
    STATUS="$(pm2 jlist 2>/dev/null | python3 -c "
import json,sys
name=sys.argv[1]
try:
  data=json.load(sys.stdin)
except Exception:
  sys.exit(0)
for p in data:
  if p.get('name')==name:
    print(p.get('pm2_env',{}).get('status',''))
    break
" "$PM2_NAME" 2>/dev/null || true)"
    if [[ "$STATUS" == "online" ]]; then
      ok "pm2 $PM2_NAME 状态 online"
    else
      bad "pm2 $PM2_NAME 存在但状态=${STATUS:-unknown}"
    fi
  else
    bad "pm2 中找不到进程 $PM2_NAME"
  fi
else
  warn "未安装 pm2，跳过进程检查"
fi

# --- 公网（可选） ---
DOMAIN="${SITE_DOMAIN:-}"
if [[ -n "$DOMAIN" ]]; then
  DOMAIN="${DOMAIN#https://}"
  DOMAIN="${DOMAIN#http://}"
  DOMAIN="${DOMAIN%/}"
  PUB="$(curl -sS --connect-timeout 5 "https://${DOMAIN}/api/health" 2>/dev/null || true)"
  if echo "$PUB" | grep -q 'streamline' && echo "$PUB" | grep -q '"ok"'; then
    ok "公网 https://${DOMAIN}/api/health → streamline"
  else
    bad "公网 health 失败（查反代/HTTPS）: ${PUB:-无响应}"
  fi

  CODE_LOGIN="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 5 "https://${DOMAIN}/login" 2>/dev/null || echo 000)"
  if [[ "$CODE_LOGIN" == "200" ]]; then
    ok "公网 /login → HTTP $CODE_LOGIN"
  else
    bad "公网 /login → HTTP $CODE_LOGIN（查伪静态与网站目录）"
  fi

  CODE_OPEN="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 5 "https://${DOMAIN}/open" 2>/dev/null || echo 000)"
  if [[ "$CODE_OPEN" == "200" ]]; then
    ok "公网 /open → HTTP $CODE_OPEN"
  else
    bad "公网 /open → HTTP $CODE_OPEN"
  fi
else
  warn "未设 SITE_DOMAIN，跳过公网检查"
fi

echo
echo "------------------------------------------"
echo " PASS=$PASS  FAIL=$FAIL  WARN=$WARN"
echo " 人工项请继续勾选: deploy/验收清单.md （D 改密 / E 首配 / F 出码）"
echo " OTA 回归: deploy/OTA回归清单.md"
echo "------------------------------------------"

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
exit 0
