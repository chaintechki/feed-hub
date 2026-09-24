#!/usr/bin/env bash
# Feed Panel – complete server deployment (Debian/Ubuntu).
#
# Does everything in one run and can be re-run for every update:
#   1. installs missing packages (git, nginx, certbot, rsync, Node.js 20+)
#   2. git pull of the configured branch
#   3. bumps the patch version, installs dependencies, builds
#   4. backs up the current release and publishes dist/ to the web root
#   5. writes the nginx site (SPA fallback, caching rules, security headers)
#   6. requests / renews the Let's Encrypt certificate and enables HTTPS
#
# Usage (as root, inside the cloned repository):
#   sudo ./deploy.sh
#   sudo LE_EMAIL=admin@feedarea.net ./deploy.sh
#   sudo DOMAIN=feed.feedarea.net BRANCH=main WITH_WWW=0 ./deploy.sh
#   sudo SKIP_PULL=1 ./deploy.sh      # build the working copy as-is
#   sudo NO_BUMP=1 ./deploy.sh        # keep the current version number
#
# Requirements: DNS A/AAAA record of $DOMAIN points to this server, ports 80 and 443 open.

set -euo pipefail

DOMAIN="${DOMAIN:-feed.feedarea.net}"
BRANCH="${BRANCH:-main}"
WITH_WWW="${WITH_WWW:-0}"
TARGET="${TARGET:-/var/www/html}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/feed-panel}"
STATE_DIR="${STATE_DIR:-/var/lib/feed-panel}"
ACME_ROOT="${ACME_ROOT:-/var/www/letsencrypt}"
KEEP_BACKUPS="${KEEP_BACKUPS:-10}"
NODE_MAJOR="${NODE_MAJOR:-20}"
SITE_FILE="/etc/nginx/sites-available/feed-panel.conf"
SITE_LINK="/etc/nginx/sites-enabled/feed-panel.conf"
CERT_DIR="/etc/letsencrypt/live/$DOMAIN"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
die() { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Please run as root (sudo ./deploy.sh)."
command -v apt-get >/dev/null || die "Only Debian/Ubuntu (apt) is supported."

SERVER_NAMES="$DOMAIN"
CERT_DOMAINS=(-d "$DOMAIN")
if [ "$WITH_WWW" = "1" ]; then
  SERVER_NAMES="$DOMAIN www.$DOMAIN"
  CERT_DOMAINS+=(-d "www.$DOMAIN")
fi

# ---------------------------------------------------------------- 1. packages
log "Checking system packages"
PKGS=()
for p in git nginx certbot rsync curl ca-certificates; do
  dpkg -s "$p" >/dev/null 2>&1 || PKGS+=("$p")
done
if [ "${#PKGS[@]}" -gt 0 ]; then
  apt-get update -y
  DEBIAN_FRONTEND=noninteractive apt-get install -y "${PKGS[@]}"
fi

node_ok() {
  command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge "$NODE_MAJOR" ]
}
if ! node_ok; then
  log "Installing Node.js $NODE_MAJOR"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
fi
node_ok || die "Node.js >= $NODE_MAJOR is required."

# ---------------------------------------------------------------- 2. git pull
if [ "${SKIP_PULL:-0}" != "1" ]; then
  log "Updating source (branch $BRANCH)"
  [ -d .git ] || die "$ROOT is not a git repository. Clone it first."
  git config --global --add safe.directory "$ROOT" >/dev/null 2>&1 || true
  # package.json is changed locally by the version bump; discard before pulling.
  git checkout -- package.json package-lock.json 2>/dev/null || true
  git fetch --prune origin
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
  echo "    Commit: $(git rev-parse --short HEAD)"
fi

# ---------------------------------------------------------------- 3. version + build
mkdir -p "$STATE_DIR"
if [ "${NO_BUMP:-0}" != "1" ]; then
  log "Bumping patch version"
  NEXT="$(node -e '
    const fs=require("fs");
    const repo=require("./package.json").version;
    let last="0.0.0"; try{last=fs.readFileSync(process.argv[1],"utf8").trim()||last}catch{}
    const p=v=>v.split(".").map(n=>parseInt(n,10)||0);
    const cmp=(a,b)=>{for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]-b[i]}return 0};
    const base=cmp(p(repo),p(last))>0?p(repo):p(last);
    base[2]+=1; console.log(base.join("."));
  ' "$STATE_DIR/version")"
  npm version "$NEXT" --no-git-tag-version --allow-same-version >/dev/null
  echo "$NEXT" > "$STATE_DIR/version"
fi
echo "    Version: $(node -p "require('./package.json').version")"

log "Installing dependencies"
if [ -f package-lock.json ]; then npm ci; else npm install; fi

log "Building production bundle"
npm run build
[ -f "$ROOT/dist/index.html" ] || die "Build finished but dist/index.html is missing."

# ---------------------------------------------------------------- 4. publish
if [ -d "$TARGET" ] && [ -n "$(ls -A "$TARGET" 2>/dev/null || true)" ]; then
  STAMP="$(date +%Y%m%d-%H%M%S)"
  log "Backing up current release to $BACKUP_DIR/$STAMP"
  mkdir -p "$BACKUP_DIR/$STAMP"
  cp -a "$TARGET/." "$BACKUP_DIR/$STAMP/"
  ls -1dt "$BACKUP_DIR"/*/ 2>/dev/null | tail -n +"$((KEEP_BACKUPS + 1))" | xargs -r rm -rf
fi

log "Publishing to $TARGET"
mkdir -p "$TARGET"
rsync -a --delete "$ROOT/dist/" "$TARGET/"
chown -R www-data:www-data "$TARGET"
find "$TARGET" -type d -exec chmod 755 {} +
find "$TARGET" -type f -exec chmod 644 {} +

# ---------------------------------------------------------------- 5. nginx
mkdir -p "$ACME_ROOT/.well-known/acme-challenge"
chown -R www-data:www-data "$ACME_ROOT"

write_common_locations() {
  cat <<NGINX
    root $TARGET;
    index index.html;

    # Update-critical files: never cached, so new versions are detected immediately.
    location = /index.html  { add_header Cache-Control "no-cache, no-store, must-revalidate" always; try_files \$uri =404; }
    location = /sw.js       { add_header Cache-Control "no-cache, no-store, must-revalidate" always; try_files \$uri =404; }
    location = /version.json { add_header Cache-Control "no-cache, no-store, must-revalidate" always; try_files \$uri =404; }
    location = /manifest.webmanifest { add_header Cache-Control "no-cache" always; try_files \$uri =404; }

    # Hashed build assets: cache for a year.
    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        try_files \$uri =404;
    }

    location ~* \.(?:png|jpg|jpeg|svg|ico|webp|woff2?)$ {
        add_header Cache-Control "public, max-age=604800" always;
        try_files \$uri =404;
    }

    # SPA fallback
    location / {
        add_header Cache-Control "no-cache" always;
        try_files \$uri \$uri/ /index.html;
    }
NGINX
}

write_http_only() {
  cat > "$SITE_FILE" <<NGINX
# Managed by deploy.sh – temporary HTTP config until the certificate exists
server {
    listen 80;
    listen [::]:80;
    server_name $SERVER_NAMES;

    location ^~ /.well-known/acme-challenge/ { root $ACME_ROOT; default_type text/plain; }

$(write_common_locations)
}
NGINX
}

write_https() {
  cat > "$SITE_FILE" <<NGINX
# Managed by deploy.sh – changes are overwritten on the next run
server {
    listen 80;
    listen [::]:80;
    server_name $SERVER_NAMES;

    location ^~ /.well-known/acme-challenge/ { root $ACME_ROOT; default_type text/plain; }
    location / { return 301 https://$DOMAIN\$request_uri; }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name $SERVER_NAMES;

    ssl_certificate     $CERT_DIR/fullchain.pem;
    ssl_certificate_key $CERT_DIR/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;
    ssl_stapling on;
    ssl_stapling_verify on;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

    gzip on;
    gzip_vary on;
    gzip_comp_level 5;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/javascript application/json application/xml image/svg+xml application/manifest+json;

    client_max_body_size 5m;

$(write_common_locations)
}
NGINX
}

reload_nginx() {
  nginx -t || die "nginx configuration test failed – see output above. Nothing was reloaded."
  systemctl enable --now nginx >/dev/null 2>&1 || true
  systemctl reload nginx
}

log "Configuring nginx for $SERVER_NAMES"
[ -L /etc/nginx/sites-enabled/default ] && rm -f /etc/nginx/sites-enabled/default
ln -sf "$SITE_FILE" "$SITE_LINK"

if [ ! -f "$CERT_DIR/fullchain.pem" ]; then
  write_http_only
  reload_nginx

  # ------------------------------------------------------------ 6. Let's Encrypt
  if [ -z "${LE_EMAIL:-}" ]; then
    if [ -t 0 ]; then
      read -rp "E-mail address for Let's Encrypt (expiry notices): " LE_EMAIL
    fi
    [ -n "${LE_EMAIL:-}" ] || die "LE_EMAIL is required for the first certificate (LE_EMAIL=you@example.com ./deploy.sh)."
  fi
  log "Requesting Let's Encrypt certificate for $SERVER_NAMES"
  certbot certonly --webroot -w "$ACME_ROOT" "${CERT_DOMAINS[@]}" \
    --email "$LE_EMAIL" --agree-tos --no-eff-email --non-interactive --keep-until-expiring \
    || die "Certificate request failed. Check that $DOMAIN points to this server and port 80 is reachable."
fi

write_https
reload_nginx

log "Enabling automatic certificate renewal"
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'HOOK'
#!/bin/sh
systemctl reload nginx
HOOK
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
if systemctl list-unit-files | grep -q '^certbot.timer'; then
  systemctl enable --now certbot.timer >/dev/null
else
  echo "17 3 * * * root certbot renew --quiet" > /etc/cron.d/feed-panel-certbot
fi
certbot renew --dry-run --quiet || echo "    Warning: renewal dry-run failed – check 'certbot renew --dry-run'."

# Keep the working tree clean for the next git pull.
git checkout -- package.json package-lock.json 2>/dev/null || true

log "Done"
echo "    Version $(cat "$STATE_DIR/version" 2>/dev/null || echo '?') is live at https://$DOMAIN"
