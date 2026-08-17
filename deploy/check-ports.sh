#!/usr/bin/env bash
# 快速看端口谁占用（精简版安装前可先跑）
echo "=== 关键端口 ==="
for p in 80 443 8787 8788 8790 8791 8800; do
  if ss -tln 2>/dev/null | grep -qE ":${p}\s"; then
    echo "占用 $p"
    ss -tlnp 2>/dev/null | grep -E ":${p}\s" || true
  else
    echo "空闲 $p"
  fi
done
echo
echo "=== PM2 ==="
pm2 list 2>/dev/null || echo "无 pm2"
echo
echo "=== health ==="
for p in 8787 8788 8790 8791; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 1 "http://127.0.0.1:${p}/api/health" 2>/dev/null || echo 000)
  echo "127.0.0.1:$p/api/health -> $code"
done
