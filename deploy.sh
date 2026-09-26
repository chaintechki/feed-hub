#!/usr/bin/env bash
# Feed Panel – complete server deployment (Ubuntu 24.04 / Debian).
#
# Works on a completely empty server and can be re-run for every update.
# Every step checks first and only installs / configures what is missing:
#   0. bootstrap: installs git, clones REPO_URL to APP_DIR, restarts itself there
#   1. system packages (nginx, certbot, ufw, fail2ban, build tools, ...)
#   2. Node.js 22+ and npm >= 10.9, swap, time sync, firewall, fail2ban, security updates
#   3. git pull, version bump, npm install, build, backup, publish to web root
#   4. nginx site (SPA fallback, caching, security headers)
#   5. DNS check, Let's Encrypt certificate, HTTPS, auto-renewal
#   6. feed worker (systemd service)
#   7. summary report
#
# First install on an empty server (as root):
#   curl -fsSL <raw-url-of-deploy.sh> -o deploy.sh
#   sudo REPO_URL=https://github.com/<you>/<repo>.git bash deploy.sh
# Updates (inside the cloned repository):
#   sudo ./deploy.sh
#   sudo DOMAIN=feed.feedarea.net BRANCH=main WITH_WWW=0 ./deploy.sh
#   sudo SKIP_PULL=1 ./deploy.sh      # build the working copy as-is
#   sudo NO_BUMP=1 ./deploy.sh        # keep the current version number
#   sudo SKIP_FIREWALL=1 ./deploy.sh  # do not touch ufw
#   sudo ROTATE_FEED_CREDENTIALS=1 ./deploy.sh  # replace saved feed credentials
#
# Requirements: DNS A/AAAA record of $DOMAIN points to this server.

set -euo pipefail

DOMAIN="${DOMAIN:-feed.feedarea.net}"
BRANCH="${BRANCH:-main}"
LE_EMAIL="${LE_EMAIL:-mail@cetoria.de}"
ENV_FILE="${ENV_FILE:-}"
WITH_WWW="${WITH_WWW:-0}"
TARGET="${TARGET:-/var/www/html}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/feed-panel}"
STATE_DIR="${STATE_DIR:-/var/lib/feed-panel}"
ACME_ROOT="${ACME_ROOT:-/var/www/letsencrypt}"
KEEP_BACKUPS="${KEEP_BACKUPS:-10}"
NODE_MAJOR="${NODE_MAJOR:-22}"
REPO_URL="${REPO_URL:-}"
APP_DIR="${APP_DIR:-/opt/feed-panel}"
SKIP_FIREWALL="${SKIP_FIREWALL:-0}"
SWAP_SIZE="${SWAP_SIZE:-2G}"
ROTATE_FEED_CREDENTIALS="${ROTATE_FEED_CREDENTIALS:-0}"
SITE_FILE="/etc/nginx/sites-available/feed-panel.conf"
SITE_LINK="/etc/nginx/sites-enabled/feed-panel.conf"
CERT_DIR="/etc/letsencrypt/live/$DOMAIN"
export DEBIAN_FRONTEND=noninteractive

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok()  { printf '    \033[32m✓\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Please run as root (sudo ./deploy.sh)."
command -v apt-get >/dev/null || die "Only Debian/Ubuntu (apt) is supported."

APT_UPDATED=0
apt_install() {
  local missing=()
  for p in "$@"; do dpkg -s "$p" >/dev/null 2>&1 || missing+=("$p"); done
  if [ "${#missing[@]}" -eq 0 ]; then ok "already installed: $*"; return; fi
  if [ "$APT_UPDATED" = 0 ]; then apt-get update -y; APT_UPDATED=1; fi
  apt-get install -y --no-install-recommends "${missing[@]}"
  ok "installed: ${missing[*]}"
}

# ---------------------------------------------------------------- 0. bootstrap
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || pwd)"
if [ ! -d "$SCRIPT_DIR/.git" ] || [ ! -f "$SCRIPT_DIR/package.json" ]; then
  log "Bootstrap: repository not found next to this script"
  apt_install git ca-certificates curl
  if [ ! -d "$APP_DIR/.git" ]; then
    if [ -z "$REPO_URL" ]; then
      [ -t 0 ] || die "Set REPO_URL=<git url> to clone the project."
      read -rp "    Git repository URL (https with token or ssh): " REPO_URL
    fi
    [ -n "$REPO_URL" ] || die "No repository URL given."
    mkdir -p "$(dirname "$APP_DIR")"
    git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
  fi
  chmod +x "$APP_DIR/deploy.sh"
  ok "repository ready in $APP_DIR – continuing there"
  exec "$APP_DIR/deploy.sh"
fi

ROOT="$SCRIPT_DIR"
cd "$ROOT"

SERVER_NAMES="$DOMAIN"
CERT_DOMAINS=(-d "$DOMAIN")
if [ "$WITH_WWW" = "1" ]; then
  SERVER_NAMES="$DOMAIN www.$DOMAIN"
  CERT_DOMAINS+=(-d "www.$DOMAIN")
fi

# ---------------------------------------------------------------- 1. packages
log "Checking system packages"
apt_install git curl ca-certificates gnupg lsb-release rsync nginx certbot \
  ufw fail2ban unattended-upgrades dnsutils openssl build-essential

# ---------------------------------------------------------------- 2. Node.js / npm
log "Checking Node.js and npm"
node_ok() {
  command -v node >/dev/null && command -v npm >/dev/null \
    && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge "$NODE_MAJOR" ]
}
if ! node_ok; then
  log "Installing Node.js $NODE_MAJOR (NodeSource)"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
node_ok || die "Node.js >= $NODE_MAJOR with npm is required."
# Older npm releases crash with "Cannot read properties of null (reading 'edgesOut')"
# when package.json uses "overrides". Make sure npm is at least 10.9.
if ! node -e 'const [a,b]=process.argv[1].split(".").map(Number);process.exit(a>10||(a===10&&b>=9)?0:1)' "$(npm -v)"; then
  log "Updating npm ($(npm -v) is too old)"
  npm install -g npm@10 --no-audit --no-fund
  hash -r
fi
ok "node $(node -v), npm $(npm -v)"

log "Checking swap"
if [ -z "$(swapon --noheadings 2>/dev/null)" ]; then
  MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
  if [ "$MEM_MB" -lt 8000 ] && [ ! -f /swapfile ]; then
    fallocate -l "$SWAP_SIZE" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
    chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    ok "swap $SWAP_SIZE created"
  else ok "no swap needed (${MEM_MB} MB RAM)"; fi
else ok "swap active"; fi

log "Checking time synchronisation"
if command -v timedatectl >/dev/null; then
  timedatectl set-ntp true 2>/dev/null || true
  ok "NTP: $(timedatectl show -p NTPSynchronized --value 2>/dev/null || echo unknown)"
fi

if [ "$SKIP_FIREWALL" != "1" ]; then
  log "Checking firewall"
  ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  if ufw status | grep -q 'Status: active'; then ok "ufw active (22, 80, 443 allowed)"
  else ufw --force enable >/dev/null; ok "ufw enabled (22, 80, 443 allowed)"; fi
fi

log "Checking fail2ban"
if [ ! -f /etc/fail2ban/jail.d/feed-panel.conf ]; then
  cat > /etc/fail2ban/jail.d/feed-panel.conf <<'JAIL'
[sshd]
enabled = true
maxretry = 5
bantime = 1h
JAIL
fi
systemctl enable --now fail2ban >/dev/null 2>&1 && systemctl restart fail2ban && ok "fail2ban active"

log "Checking automatic security updates"
if [ ! -f /etc/apt/apt.conf.d/20auto-upgrades ] || ! grep -q 'Unattended-Upgrade "1"' /etc/apt/apt.conf.d/20auto-upgrades; then
  printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' > /etc/apt/apt.conf.d/20auto-upgrades
fi
systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true
ok "unattended-upgrades active"

# ---------------------------------------------------------------- 2. git pull
if [ "${SKIP_PULL:-0}" != "1" ]; then
  log "Updating source (branch $BRANCH)"
  [ -d .git ] || die "$ROOT is not a git repository. Clone it first."
  git config --global --add safe.directory "$ROOT" >/dev/null 2>&1 || true
  # Local edits (e.g. version bump, manual npm install) must never block the pull.
  # Back them up, then reset every tracked file to the last commit.
  if ! git diff --quiet || ! git diff --cached --quiet; then
    BACKUP="$STATE_DIR/local-changes-$(date +%Y%m%d%H%M%S).patch"
    mkdir -p "$STATE_DIR"
    { git diff; git diff --cached; } > "$BACKUP" 2>/dev/null || true
    log "Local changes detected - backup saved to $BACKUP, discarding them"
    git reset --hard HEAD >/dev/null 2>&1 || true
  fi
  git fetch --prune origin
  git checkout "$BRANCH"
  git reset --hard "origin/$BRANCH" >/dev/null
  echo "    Commit: $(git rev-parse --short HEAD)"
  echo "    Commit: $(git rev-parse --short HEAD)"
fi

# ---------------------------------------------------------------- 3. version + build
mkdir -p "$STATE_DIR"
# Restore package files on ANY exit (also on errors/abort) so a manual `git pull` never gets blocked.
trap 'cd "$SCRIPT_DIR" 2>/dev/null && git checkout -- package.json package-lock.json 2>/dev/null || true' EXIT
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

log "Reading backend address"
for f in "$ENV_FILE" "$ROOT/.env" /etc/feed-panel/env; do
  [ -n "$f" ] && [ -f "$f" ] && { ENV_FILE="$f"; break; }
done
[ -n "$ENV_FILE" ] && [ -f "$ENV_FILE" ] || die "No environment file found (.env or /etc/feed-panel/env)."
UPSTREAM="$(grep -E '^VITE_SUPABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"'"'" | sed 's:/*$::')"
[ -n "$UPSTREAM" ] || die "Backend address missing in $ENV_FILE."
UPSTREAM_HOST="${UPSTREAM#https://}"
mkdir -p /etc/feed-panel && [ "$ENV_FILE" != /etc/feed-panel/env ] && cp "$ENV_FILE" /etc/feed-panel/env && chmod 600 /etc/feed-panel/env

log "Installing dependencies"
npm_install_robust() { # $1 = directory, rest = extra npm args
  local dir="$1"; shift
  local try
  # The lock file is not versioned: a leftover local copy goes stale whenever
  # package.json gains a dependency and makes `npm ci` fail. Use npm install.
  if [ -f "$dir/package-lock.json" ] && ! (cd "$dir" && git ls-files --error-unmatch package-lock.json >/dev/null 2>&1); then
    echo "    removing stale local package-lock.json"
    rm -f "$dir/package-lock.json"
  fi
  for try in 1 2 3; do
    if (cd "$dir" && npm install --no-audit --no-fund "$@"); then
      ok "dependencies installed in $dir"; return 0
    fi
    echo "    npm failed (attempt $try) – cleaning node_modules and npm cache, retrying"
    rm -rf "$dir/node_modules"
    [ "$try" -ge 2 ] && rm -f "$dir/package-lock.json"
    npm cache clean --force >/dev/null 2>&1 || true
    sleep 2
  done
  die "npm install failed in $dir after 3 attempts – see /root/.npm/_logs/"
}
npm_install_robust "$ROOT"

log "Building production bundle"
# The browser only ever talks to the own domain; nginx forwards to the backend.
FP_PRODUCTION_CLIENT=1 VITE_SUPABASE_URL="https://$DOMAIN" VITE_PUBLIC_ORIGIN="https://$DOMAIN" VITE_SW_HOSTS="$DOMAIN" npm run build
PROVIDER_RE="$(printf "%s%s" lov able)|$UPSTREAM_HOST"
if grep -rqiE "$PROVIDER_RE" dist; then
  echo "    Warning: build output still contains provider references:" && grep -rliE "$PROVIDER_RE" dist | head
fi
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

    # Backend proxy – customers and the browser only see https://$DOMAIN
    # The upstream is a variable, so nginx resolves it at request time and
    # still starts when DNS is briefly unavailable (boot, renewal reload).
$(for pair in "api:functions/v1" "functions/v1:functions/v1" "auth/v1:auth/v1" "rest/v1:rest/v1" "storage/v1:storage/v1"; do
  from="${pair%%:*}"; to="${pair#*:}"
  printf '    location ^~ /%s/ { set $fp_up %s; rewrite ^/%s/(.*)$ /%s/$1 break; proxy_pass $fp_up; include /etc/nginx/snippets/feed-panel-proxy.conf; proxy_read_timeout 60s; }\n' "$from" "$UPSTREAM" "$from" "$to"
done)
    location ^~ /realtime/v1/  {
        set \$fp_up $UPSTREAM;
        proxy_pass \$fp_up;
        include /etc/nginx/snippets/feed-panel-proxy.conf;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 1h;
    }

    # Update-critical files: never cached, so new versions are detected immediately.
    location = /index.html  { include /etc/nginx/snippets/feed-panel-security.conf; add_header Cache-Control "no-cache, no-store, must-revalidate" always; try_files \$uri =404; }
    location = /sw.js       { include /etc/nginx/snippets/feed-panel-security.conf; add_header Cache-Control "no-cache, no-store, must-revalidate" always; try_files \$uri =404; }
    location = /version.json { include /etc/nginx/snippets/feed-panel-security.conf; add_header Cache-Control "no-cache, no-store, must-revalidate" always; try_files \$uri =404; }
    location = /manifest.webmanifest { include /etc/nginx/snippets/feed-panel-security.conf; add_header Cache-Control "no-cache" always; try_files \$uri =404; }

    # Hashed build assets: cache for a year.
    location /assets/ {
        include /etc/nginx/snippets/feed-panel-security.conf; add_header Cache-Control "public, max-age=31536000, immutable" always;
        try_files \$uri =404;
    }

    location ~* \.(?:png|jpg|jpeg|svg|ico|webp|woff2?)$ {
        include /etc/nginx/snippets/feed-panel-security.conf; add_header Cache-Control "public, max-age=604800" always;
        try_files \$uri =404;
    }

    # SPA fallback
    location / {
        include /etc/nginx/snippets/feed-panel-security.conf; add_header Cache-Control "no-cache" always;
        try_files \$uri \$uri/ /index.html;
    }
NGINX
}

write_proxy_snippet() {
  mkdir -p /etc/nginx/snippets
  cat > /etc/nginx/snippets/feed-panel-proxy.conf <<NGINX
resolver 127.0.0.53 1.1.1.1 8.8.8.8 valid=300s ipv6=off;
resolver_timeout 5s;
proxy_set_header Host $UPSTREAM_HOST;
proxy_ssl_server_name on;
proxy_ssl_name $UPSTREAM_HOST;
proxy_set_header X-Real-IP \$remote_addr;
proxy_set_header X-Forwarded-For \$remote_addr;
proxy_set_header X-Forwarded-Proto https;
proxy_hide_header Access-Control-Allow-Origin;
add_header Access-Control-Allow-Origin \$http_origin always;
add_header Vary Origin always;
include /etc/nginx/snippets/feed-panel-security.conf;
proxy_buffering off;
client_max_body_size 5m;
NGINX
}

write_security_snippet() {
  cat > /etc/nginx/snippets/feed-panel-security.conf <<NGINX
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' wss://$DOMAIN; worker-src 'self'; manifest-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'" always;
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
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $SERVER_NAMES;

    ssl_certificate     $CERT_DIR/fullchain.pem;
    ssl_certificate_key $CERT_DIR/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    include /etc/nginx/snippets/feed-panel-security.conf;

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
  systemctl enable nginx >/dev/null 2>&1 || true
  if systemctl is-active --quiet nginx; then
    systemctl reload nginx || systemctl restart nginx
  else
    systemctl restart nginx
  fi
  sleep 1
  systemctl is-active --quiet nginx || die "nginx is not running – check 'journalctl -u nginx -n 50'."
}

cert_valid() { # certificate exists, is not expiring within 7 days and covers all names
  [ -f "$CERT_DIR/fullchain.pem" ] || return 1
  openssl x509 -checkend 604800 -noout -in "$CERT_DIR/fullchain.pem" >/dev/null 2>&1 || return 1
  local n sans; sans="$(openssl x509 -noout -ext subjectAltName -in "$CERT_DIR/fullchain.pem" 2>/dev/null)"
  for n in $SERVER_NAMES; do grep -q "DNS:$n\b" <<<"$sans" || return 1; done
}

# Free ports 80/443 from other web servers (e.g. preinstalled apache2)
for svc in apache2 lighttpd caddy httpd; do
  if systemctl is-active --quiet "$svc" 2>/dev/null; then
    echo "    Stopping $svc (blocks port 80/443)"
    systemctl stop "$svc"; systemctl disable "$svc" >/dev/null 2>&1 || true
  fi
done

log "Configuring nginx for $SERVER_NAMES"
rm -f /etc/nginx/sites-enabled/default
find /etc/nginx/sites-enabled -maxdepth 1 -name 'feed-panel*' ! -name "$(basename "$SITE_LINK")" -delete 2>/dev/null || true
ln -sf "$SITE_FILE" "$SITE_LINK"
write_proxy_snippet
write_security_snippet

HTTPS_OK=1
if ! cert_valid; then
  write_http_only
  reload_nginx

  # ------------------------------------------------------------ reachability check
  log "Checking that $DOMAIN reaches this server"
  PUBLIC_IP4="$(curl -4 -fsS --max-time 8 https://api.ipify.org 2>/dev/null || curl -4 -fsS --max-time 8 https://ifconfig.me 2>/dev/null || true)"
  DNS_A="$( { dig +short A "$DOMAIN" @1.1.1.1; dig +short A "$DOMAIN" @8.8.8.8; } 2>/dev/null | sort -u | tr '\n' ' ')"
  DNS_AAAA="$( { dig +short AAAA "$DOMAIN" @1.1.1.1; } 2>/dev/null | sort -u | tr '\n' ' ')"
  echo "    Server IPv4: ${PUBLIC_IP4:-unknown} | DNS A: ${DNS_A:-none} | DNS AAAA: ${DNS_AAAA:-none}"

  TOKEN="deploy-check-$RANDOM$RANDOM"
  echo "$TOKEN" > "$ACME_ROOT/.well-known/acme-challenge/$TOKEN"
  chown www-data:www-data "$ACME_ROOT/.well-known/acme-challenge/$TOKEN"
  REACH=0
  for n in $SERVER_NAMES; do
    if [ "$(curl -fsS --max-time 10 "http://$n/.well-known/acme-challenge/$TOKEN" 2>/dev/null)" = "$TOKEN" ]; then
      ok "http://$n reaches this server"; REACH=1
    else
      echo "    http://$n does NOT reach this server"; REACH=0; break
    fi
  done
  rm -f "$ACME_ROOT/.well-known/acme-challenge/$TOKEN"

  if [ "$REACH" = 1 ] || [ "${FORCE_HTTPS:-0}" = 1 ]; then
    log "Requesting Let's Encrypt certificate for $SERVER_NAMES"
    certbot certonly --webroot -w "$ACME_ROOT" "${CERT_DOMAINS[@]}" \
      --email "$LE_EMAIL" --agree-tos --no-eff-email --non-interactive \
      --expand --keep-until-expiring --cert-name "$DOMAIN" \
      || die "Certificate request failed – see /var/log/letsencrypt/letsencrypt.log. Check DNS, port 80 in the provider firewall and CAA records."
    cert_valid || die "Certificate was requested but is missing or invalid in $CERT_DIR."
    ok "certificate issued"
  else
    echo -e "\033[1;31m    HTTPS NOT set up: $DOMAIN does not reach this server over port 80.\033[0m"
    echo "    Fix: DNS A record of $DOMAIN -> ${PUBLIC_IP4:-<server IP>}, remove wrong AAAA records,"
    echo "         open port 80/443 in the hosting provider's firewall, disable CDN proxying."
    echo "    Then run deploy.sh again (or FORCE_HTTPS=1 sudo ./deploy.sh to try anyway)."
    HTTPS_OK=0
  fi
fi

if [ "$HTTPS_OK" = 1 ]; then
  write_https
  reload_nginx

  log "Enabling automatic certificate renewal"
  mkdir -p /etc/letsencrypt/renewal-hooks/deploy
  cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'HOOK'
#!/bin/sh
if nginx -t >/dev/null 2>&1; then systemctl reload nginx || systemctl restart nginx; fi
HOOK
  chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
  if systemctl list-unit-files | grep -q '^certbot.timer'; then
    systemctl enable --now certbot.timer >/dev/null
  else
    echo "17 3 * * * root certbot renew --quiet" > /etc/cron.d/feed-panel-certbot
  fi
  certbot renew --dry-run --quiet || echo "    Warning: renewal dry-run failed – check 'certbot renew --dry-run'."
fi

# ---------------------------------------------------------------- 5b. keep nginx alive
log "Hardening nginx (auto-restart, limits, watchdog)"
mkdir -p /etc/systemd/system/nginx.service.d
cat > /etc/systemd/system/nginx.service.d/feed-panel.conf <<'UNIT'
[Unit]
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=0

[Service]
Restart=always
RestartSec=3
LimitNOFILE=65536
UNIT
NGX=/etc/nginx/nginx.conf
grep -q '^worker_rlimit_nofile' "$NGX" || sed -i '/^worker_processes/a worker_rlimit_nofile 16384;' "$NGX"
sed -i -E 's/^([[:space:]]*worker_connections)[[:space:]]+[0-9]+;/\1 4096;/' "$NGX"

# Bounded logs so a full disk can never stop nginx
cat > /etc/logrotate.d/nginx <<'ROT'
/var/log/nginx/*.log {
    daily
    rotate 14
    missingok
    notifempty
    compress
    delaycompress
    sharedscripts
    create 0640 www-data adm
    postrotate
        [ -s /run/nginx.pid ] && kill -USR1 `cat /run/nginx.pid`
    endscript
}
ROT
mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nSystemMaxUse=500M\n' > /etc/systemd/journald.conf.d/feed-panel.conf
systemctl restart systemd-journald || true

# Watchdog: every minute check nginx, feed worker and the public site
cat > /usr/local/bin/feed-panel-watchdog <<WD
#!/bin/bash
DOMAIN="$DOMAIN"
WD
cat >> /usr/local/bin/feed-panel-watchdog <<'WD'
say() { logger -t feed-panel-watchdog "$*"; }
if ! systemctl is-active --quiet nginx; then
  say "nginx down – restarting"; nginx -t 2>&1 | logger -t feed-panel-watchdog; systemctl restart nginx
fi
if systemctl list-unit-files feed-worker.service >/dev/null 2>&1 && systemctl is-enabled --quiet feed-worker && ! systemctl is-active --quiet feed-worker; then
  say "feed-worker down – restarting"; systemctl restart feed-worker
fi
URL="https://$DOMAIN/version.json"; [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ] || URL="http://$DOMAIN/version.json"
CODE="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 --resolve "$DOMAIN:443:127.0.0.1" --resolve "$DOMAIN:80:127.0.0.1" "$URL" || echo 000)"
if [ "$CODE" != 200 ]; then
  sleep 5
  CODE="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 --resolve "$DOMAIN:443:127.0.0.1" --resolve "$DOMAIN:80:127.0.0.1" "$URL" || echo 000)"
  [ "$CODE" = 200 ] || { say "site answered $CODE – restarting nginx"; nginx -t && systemctl restart nginx; }
fi
WD
chmod 755 /usr/local/bin/feed-panel-watchdog
cat > /etc/systemd/system/feed-panel-watchdog.service <<'UNIT'
[Unit]
Description=Feed Panel watchdog (nginx, feed worker, site)
[Service]
Type=oneshot
ExecStart=/usr/local/bin/feed-panel-watchdog
UNIT
cat > /etc/systemd/system/feed-panel-watchdog.timer <<'UNIT'
[Unit]
Description=Run Feed Panel watchdog every minute
[Timer]
OnBootSec=2min
OnUnitActiveSec=1min
AccuracySec=10s
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now feed-panel-watchdog.timer >/dev/null
ok "nginx auto-restart + watchdog active"

# Final full restart so every change is definitely active
nginx -t && systemctl restart nginx
systemctl is-active --quiet nginx && ok "nginx restarted and running" || die "nginx failed to restart – check 'journalctl -u nginx -n 50'."
if [ "$HTTPS_OK" = 1 ]; then
  HTTPS_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://$DOMAIN/" || echo 000)"
  [ "$HTTPS_CODE" = 200 ] && ok "https://$DOMAIN answers 200" || echo "    Warning: https://$DOMAIN answered $HTTPS_CODE"
fi

# ---------------------------------------------------------------- 6. feed worker
log "Installing feed worker (odds feed connection)"
UOF_ENV=/etc/feed-panel/uof.env
if [ ! -f "$UOF_ENV" ] || [ "$ROTATE_FEED_CREDENTIALS" = "1" ]; then
  if [ -t 0 ]; then
    echo "    Feed credentials are needed (stored in $UOF_ENV, mode 600)."
    read -rp "    Access token: " A_TOKEN
    read -rp "    API host [uof.oddz.club]: " A_API; A_API="${A_API:-uof.oddz.club}"
    read -rp "    MQ host [mq-uof.oddz.club]: " A_MQ; A_MQ="${A_MQ:-mq-uof.oddz.club}"
    read -rp "    MQ port [5671]: " A_PORT; A_PORT="${A_PORT:-5671}"
    read -rp "    Virtual host: " A_VHOST
    read -rp "    MQ username: " A_USER
    read -rsp "    MQ password: " A_PASS; echo
    read -rp "    Node ID: " A_NODE
    # Copy/paste can add whitespace or carriage returns. None of these values
    # may contain surrounding whitespace in the provider configuration.
    A_TOKEN="$(printf '%s' "$A_TOKEN" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    A_API="$(printf '%s' "$A_API" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    A_MQ="$(printf '%s' "$A_MQ" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    A_PORT="$(printf '%s' "$A_PORT" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    A_VHOST="$(printf '%s' "$A_VHOST" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    A_USER="$(printf '%s' "$A_USER" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    A_PASS="$(printf '%s' "$A_PASS" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    A_NODE="$(printf '%s' "$A_NODE" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    [ -n "$A_TOKEN" ] || die "Feed access token must not be empty."
    [ -n "$A_API" ] || die "Feed API host must not be empty."
    [ -n "$A_MQ" ] || die "Feed MQ host must not be empty."
    [[ "$A_PORT" =~ ^[0-9]+$ ]] || die "Feed MQ port must be numeric."
    [ -n "$A_VHOST" ] || die "Feed virtual host must not be empty."
    [ -n "$A_USER" ] || die "Feed MQ username must not be empty."
    [ -n "$A_PASS" ] || die "Feed MQ password must not be empty."
    [[ "$A_NODE" =~ ^[0-9]+$ ]] || die "Feed node ID must be numeric."
    umask 077
    cat > "$UOF_ENV" <<EOF
UOF_ACCESS_TOKEN=$A_TOKEN
UOF_API_HOST=$A_API
UOF_MQ_HOST=$A_MQ
UOF_MQ_PORT=$A_PORT
UOF_MQ_VHOST=$A_VHOST
UOF_MQ_USER=$A_USER
UOF_MQ_PASS=$A_PASS
UOF_NODE_ID=$A_NODE
EOF
  else
    echo "    Warning: $UOF_ENV missing – run deploy.sh interactively once to enter the feed credentials. Worker skipped."
  fi
fi
if [ -f "$UOF_ENV" ]; then
  chmod 600 "$UOF_ENV"
  BACKEND_KEY="$(grep -E '^VITE_SUPABASE_PUBLISHABLE_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"'"'")"
  id -u feedworker >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin feedworker
  mkdir -p /opt/feed-worker
  rsync -a --delete --exclude node_modules "$ROOT/feed-worker/" /opt/feed-worker/
  npm_install_robust /opt/feed-worker --omit=dev
  chown -R feedworker:feedworker /opt/feed-worker
  umask 077
  printf 'FEED_BACKEND_URL=%s\nFEED_BACKEND_KEY=%s\n' "$UPSTREAM" "$BACKEND_KEY" > /etc/feed-panel/worker.env
  chown root:feedworker "$UOF_ENV" /etc/feed-panel/worker.env
  chmod 640 "$UOF_ENV" /etc/feed-panel/worker.env
  cat > /etc/systemd/system/feed-worker.service <<'UNIT'
[Unit]
Description=Feed Panel odds feed worker
After=network-online.target
Wants=network-online.target

[Service]
User=feedworker
WorkingDirectory=/opt/feed-worker
EnvironmentFile=/etc/feed-panel/uof.env
EnvironmentFile=/etc/feed-panel/worker.env
ExecStartPre=/usr/bin/env node auth-check.mjs
ExecStart=/usr/bin/env node index.mjs
Restart=always
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable feed-worker >/dev/null 2>&1
  systemctl restart feed-worker
  sleep 3
  if systemctl is-active --quiet feed-worker; then
    ok "feed authentication accepted; worker running (logs: journalctl -u feed-worker -f)"
  elif journalctl -u feed-worker --since '-2 minutes' --no-pager 2>/dev/null | grep -q 'Feed authentication failed'; then
    die "Feed authentication was rejected. Run: sudo ROTATE_FEED_CREDENTIALS=1 ./deploy.sh and enter the same access token saved in the backend. Also verify 'timedatectl status'."
  else
    die "Feed worker failed to start – check 'journalctl -u feed-worker -n 50 --no-pager'."
  fi
fi

# Keep the working tree clean for the next git pull.
git checkout -- package.json package-lock.json 2>/dev/null || true

log "Summary"
CERT_END="$( [ -f "$CERT_DIR/fullchain.pem" ] && openssl x509 -enddate -noout -in "$CERT_DIR/fullchain.pem" | cut -d= -f2 || echo 'none')"
printf '    %-16s %s\n' \
  "Node.js" "$(node -v)" \
  "npm" "$(npm -v)" \
  "nginx" "$(nginx -v 2>&1 | cut -d/ -f2) ($(systemctl is-active nginx))" \
  "certbot" "$(certbot --version 2>&1 | awk '{print $2}')" \
  "Certificate" "$CERT_END" \
  "Firewall" "$(ufw status | head -1 | cut -d' ' -f2)" \
  "fail2ban" "$(systemctl is-active fail2ban)" \
  "nginx restart" "$(systemctl show nginx -p Restart --value)" \
  "Watchdog" "$(systemctl is-active feed-panel-watchdog.timer)" \
  "Feed worker" "$(systemctl is-active feed-worker 2>/dev/null || echo 'not installed')" \
  "Version" "$(cat "$STATE_DIR/version" 2>/dev/null || echo '?')"
if [ "$HTTPS_OK" = 1 ]; then echo "    Live at https://$DOMAIN"; else echo "    Live at http://$DOMAIN (HTTPS pending DNS)"; fi
