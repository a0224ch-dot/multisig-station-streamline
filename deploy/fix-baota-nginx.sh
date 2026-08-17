#!/usr/bin/env bash
# 修复宝塔 nginx：SPA 刷新回退 + /api 反代，并清理误粘贴的裸 /api/ 行。
# 用法：
#   DOMAIN=multisig-station-branch.iqiyia.cyou API_PORT=8788 bash deploy/fix-baota-nginx.sh

set -euo pipefail

DOMAIN="${DOMAIN:-multisig-station-branch.iqiyia.cyou}"
API_PORT="${API_PORT:-8788}"
VHOST_DIR="${VHOST_DIR:-/www/server/panel/vhost}"
MAIN_CONF="$VHOST_DIR/nginx/${DOMAIN}.conf"
REWRITE_CONF="$VHOST_DIR/rewrite/${DOMAIN}.conf"
PROXY_DIR="$VHOST_DIR/nginx/proxy/${DOMAIN}"
API_CONF="$PROXY_DIR/zz_multisig_api.conf"
NGINX_BIN="${NGINX_BIN:-/www/server/nginx/sbin/nginx}"

if [[ ! -x "$NGINX_BIN" ]]; then
  NGINX_BIN="$(command -v nginx || true)"
fi
if [[ -z "$NGINX_BIN" || ! -x "$NGINX_BIN" ]]; then
  echo "错误：未找到 nginx 可执行文件" >&2
  exit 1
fi
if [[ ! -f "$MAIN_CONF" ]]; then
  echo "错误：未找到站点配置 $MAIN_CONF" >&2
  exit 1
fi
if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "错误：请用 root 执行" >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="/tmp/multisig-nginx-${DOMAIN}-${STAMP}"
mkdir -p "$BACKUP"
cp -a "$MAIN_CONF" "$BACKUP/main.conf"
[[ -f "$REWRITE_CONF" ]] && cp -a "$REWRITE_CONF" "$BACKUP/rewrite.conf"
[[ -f "$API_CONF" ]] && cp -a "$API_CONF" "$BACKUP/api.conf"

rollback() {
  echo "nginx 校验失败，正在恢复原配置…" >&2
  cp -a "$BACKUP/main.conf" "$MAIN_CONF"
  if [[ -f "$BACKUP/rewrite.conf" ]]; then
    cp -a "$BACKUP/rewrite.conf" "$REWRITE_CONF"
  else
    rm -f "$REWRITE_CONF"
  fi
  if [[ -f "$BACKUP/api.conf" ]]; then
    cp -a "$BACKUP/api.conf" "$API_CONF"
  else
    rm -f "$API_CONF"
  fi
}

mkdir -p "$(dirname "$REWRITE_CONF")" "$PROXY_DIR"

# 宝塔终端多行粘贴可能把 “location /api/” 拆成独立的 “/api/”；
# 独立行不是合法 nginx 指令，注释掉后再由代理配置补齐。
python3 - "$MAIN_CONF" "$REWRITE_CONF" <<'PY'
from pathlib import Path
import re
import sys

main = Path(sys.argv[1])
rewrite = Path(sys.argv[2])

text = main.read_text(encoding="utf-8", errors="replace")
text, count = re.subn(
    r"(?m)^([ \t]*)/api/?[ \t]*;?[ \t]*$",
    r"\1# repaired invalid standalone /api/ line",
    text,
)
main.write_text(text, encoding="utf-8")

current = rewrite.read_text(encoding="utf-8", errors="replace") if rewrite.exists() else ""
if re.search(r"(?m)^\s*try_files\s+", current):
    current = re.sub(
        r"(?m)^\s*try_files\s+[^;]+;",
        "try_files $uri $uri/ /index.html;",
        current,
        count=1,
    )
else:
    current = current.rstrip() + ("\n" if current.strip() else "")
    current += "try_files $uri $uri/ /index.html;\n"
rewrite.write_text(current, encoding="utf-8")
print(f"已清理裸 /api/ 行: {count}")
PY

# 若宝塔已有 /api location 则保留；没有才新建，避免 duplicate location。
if ! grep -RqsE 'location[[:space:]]+(\^~[[:space:]]+)?/api/?[[:space:]]*\{' \
  "$MAIN_CONF" "$PROXY_DIR" 2>/dev/null; then
  cat > "$API_CONF" <<EOF
# multisig station branch API proxy (generated)
location ^~ /api/ {
    proxy_pass http://127.0.0.1:${API_PORT};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
}
EOF
  echo "已创建 API 反代: /api/ -> 127.0.0.1:${API_PORT}"

  # 非宝塔标准模板可能没有 include proxy 目录，补一个精确 include。
  if ! grep -Fqs "$API_CONF" "$MAIN_CONF" &&
     ! grep -Eq "include[[:space:]]+${PROXY_DIR//\//\\/}/(\\*\\.conf|\\*)" "$MAIN_CONF"; then
    python3 - "$MAIN_CONF" "$API_CONF" <<'PY'
from pathlib import Path
import sys

main = Path(sys.argv[1])
api_conf = sys.argv[2]
text = main.read_text(encoding="utf-8", errors="replace")
pos = text.rfind("}")
if pos < 0:
    raise SystemExit("站点配置缺少结束大括号")
text = text[:pos] + f"    include {api_conf};\n" + text[pos:]
main.write_text(text, encoding="utf-8")
PY
    echo "已把 API 代理 include 加入站点配置"
  fi
else
  echo "已存在 API 反代，保持原配置"
fi

if ! "$NGINX_BIN" -t; then
  rollback
  "$NGINX_BIN" -t || true
  exit 1
fi

"$NGINX_BIN" -s reload
echo "nginx 已重载；备份位于 $BACKUP"
echo "SPA: try_files \$uri \$uri/ /index.html;"
echo "API: http://127.0.0.1:${API_PORT}"
