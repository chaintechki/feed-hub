#!/usr/bin/env bash
# Build the feed panel and publish it to the local web root.
#
#   ./deploy.sh                 # build + deploy to /var/www/html
#   TARGET=/srv/www ./deploy.sh # build + deploy elsewhere
#
# Requires: node >= 20, npm, rsync.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${TARGET:-/var/www/html}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/feed-panel}"

cd "$ROOT"

echo "==> Installing dependencies"
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

echo "==> Building production bundle"
npm run build

if [ ! -d "$ROOT/dist" ]; then
  echo "Build finished but dist/ is missing. Aborting." >&2
  exit 1
fi

if [ -d "$TARGET" ] && [ -n "$(ls -A "$TARGET" 2>/dev/null || true)" ]; then
  STAMP="$(date +%Y%m%d-%H%M%S)"
  echo "==> Backing up current release to $BACKUP_DIR/$STAMP"
  mkdir -p "$BACKUP_DIR/$STAMP"
  cp -a "$TARGET/." "$BACKUP_DIR/$STAMP/"
fi

echo "==> Publishing to $TARGET"
mkdir -p "$TARGET"
rsync -a --delete "$ROOT/dist/" "$TARGET/"

if id -u www-data >/dev/null 2>&1; then
  chown -R www-data:www-data "$TARGET"
fi
find "$TARGET" -type d -exec chmod 755 {} +
find "$TARGET" -type f -exec chmod 644 {} +

echo "==> Done. Release live in $TARGET"
echo "    Remember: the web server needs an SPA fallback, e.g. for nginx"
echo "    location / { try_files \$uri \$uri/ /index.html; }"
