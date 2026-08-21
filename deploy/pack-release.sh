#!/usr/bin/env bash
# 打包精简版更新包并生成 latest.json 草稿
# 用法：
#   cd multisig-station-streamline
#   VERSION=20260818-19 NOTES="修复已知 BUG / 更新功能" bash deploy/pack-release.sh
#
# 发布仓固定为 e12games/multisig-station-streamline-releases（zip 与 latest.json 都发这里）。
# 若站点仍指向 a0224ch-dot latest.json，升级后会自动迁回 e12games。
# 对外只写笼统更新提示，不要写功能细项或对内策略。
# 产出：
#   dist-release/streamline-VERSION.zip
#   dist-release/latest.json
#   dist-release/PUBLISH.txt

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="${VERSION:-}"
if [[ -z "$VERSION" ]]; then
  VERSION="$(date +%Y%m%d)"
fi
if ! [[ "$VERSION" =~ ^[0-9]{8}(-[0-9]+)?$ ]]; then
  echo "错误: VERSION 格式应为 20260817 或 20260817-1，当前: $VERSION" >&2
  exit 1
fi

NOTES="${NOTES:-修复已知 BUG / 更新功能}"
OUT_DIR="${OUT_DIR:-$ROOT/dist-release}"
STAGE="$OUT_DIR/stage"
ZIP_NAME="streamline-${VERSION}.zip"
ZIP_PATH="$OUT_DIR/$ZIP_NAME"
RELEASES_REPO="${RELEASES_REPO:-e12games/multisig-station-streamline-releases}"

echo "=========================================="
echo " 打包精简版更新包"
echo " 版本: $VERSION"
echo "=========================================="

echo "$VERSION" > "$ROOT/VERSION"

echo ">>> 构建前端…"
cd "$ROOT/frontend"
npm install
npm run build

echo ">>> 组装目录…"
rm -rf "$STAGE"
mkdir -p "$STAGE"
cp "$ROOT/VERSION" "$STAGE/VERSION"

mkdir -p "$STAGE/frontend"
cp -a "$ROOT/frontend/dist" "$STAGE/frontend/dist"

mkdir -p "$STAGE/backend"
cp -a "$ROOT/backend/src" "$STAGE/backend/src"
cp -a "$ROOT/backend/prisma" "$STAGE/backend/prisma"
find "$STAGE/backend/prisma" -name "*.db" -delete 2>/dev/null || true
find "$STAGE/backend/prisma" -name "*.db-journal" -delete 2>/dev/null || true
cp "$ROOT/backend/package.json" "$STAGE/backend/package.json"
cp "$ROOT/backend/package-lock.json" "$STAGE/backend/package-lock.json"
[[ -f "$ROOT/backend/tsconfig.json" ]] && cp "$ROOT/backend/tsconfig.json" "$STAGE/backend/tsconfig.json"
[[ -d "$ROOT/backend/assets" ]] && cp -a "$ROOT/backend/assets" "$STAGE/backend/assets"

mkdir -p "$STAGE/deploy"
cp -a "$ROOT/deploy/." "$STAGE/deploy/"

mkdir -p "$STAGE/docs"
[[ -f "$ROOT/CHANGELOG.md" ]] && cp "$ROOT/CHANGELOG.md" "$STAGE/CHANGELOG.md"
[[ -f "$ROOT/README.md" ]] && cp "$ROOT/README.md" "$STAGE/README.md"
[[ -d "$ROOT/docs" ]] && cp -a "$ROOT/docs/." "$STAGE/docs/"

echo ">>> 打 zip…"
mkdir -p "$OUT_DIR"
rm -f "$ZIP_PATH"
node "$ROOT/deploy/make-unix-zip.mjs" "$STAGE" "$ZIP_PATH"

if [[ ! -f "$ZIP_PATH" ]]; then
  echo "错误: 未生成 $ZIP_PATH" >&2
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
  SHA="$(sha256sum "$ZIP_PATH" | awk '{print $1}')"
elif command -v shasum >/dev/null 2>&1; then
  SHA="$(shasum -a 256 "$ZIP_PATH" | awk '{print $1}')"
else
  SHA="$(python -c "import hashlib;print(hashlib.sha256(open(r'$ZIP_PATH','rb').read()).hexdigest())")"
fi

ZIP_URL="https://github.com/${RELEASES_REPO}/releases/download/${VERSION}/${ZIP_NAME}"

node -e "
const fs=require('fs');
const o={
  version: process.argv[1],
  notes: process.argv[2],
  zipUrl: process.argv[3],
  sha256: process.argv[4]
};
fs.writeFileSync(process.argv[5], JSON.stringify(o,null,2)+'\n');
" "$VERSION" "$NOTES" "$ZIP_URL" "$SHA" "$OUT_DIR/latest.json"

cat > "$OUT_DIR/PUBLISH.txt" <<EOF
【发布步骤】zip 和 latest.json 发到 e12games/multisig-station-streamline-releases。

1) 创建 GitHub Release（附件为 zip）:
   gh release create ${VERSION} "${ZIP_PATH}" \\
     --repo e12games/multisig-station-streamline-releases \\
     --title "${VERSION}" \\
     --notes "${NOTES}"

2) 把 latest.json 推到 e12games 仓 main 根目录:
   文件: ${OUT_DIR}/latest.json
   zipUrl 必须指向 e12games 的 download 地址。

3) 精简版后台 → 系统更新 → 检查更新 → 立即更新

SHA256: ${SHA}
EOF

echo
echo "完成:"
echo "  $ZIP_PATH"
echo "  $OUT_DIR/latest.json"
echo "  $OUT_DIR/PUBLISH.txt"
echo "  SHA256: $SHA"
echo "=========================================="
