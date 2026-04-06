#!/usr/bin/env bash
# =============================================================================
# Cave & Vigne — Script de déploiement automatisé
# Cible : Debian 13 (Trixie) — VPS bare metal ou cloud
# Usage : sudo bash deploy.sh
# =============================================================================

set -euo pipefail

# ─── Couleurs ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERR]${NC}  $*"; exit 1; }
section() { echo -e "\n${BOLD}${BLUE}══════════════════════════════════════${NC}"; echo -e "${BOLD} $*${NC}"; echo -e "${BOLD}${BLUE}══════════════════════════════════════${NC}"; }

# ─── Vérifications initiales ──────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && error "Ce script doit être exécuté en root : sudo bash deploy.sh"
[[ -f /etc/debian_version ]] || error "Ce script est prévu pour Debian uniquement."

DEBIAN_VERSION=$(cat /etc/debian_version | cut -d. -f1)
[[ "$DEBIAN_VERSION" -ge 13 ]] || warn "Recommandé sur Debian 13+. Version détectée : $(cat /etc/debian_version)"

# ─── Répertoire du script (pour copier les fichiers du projet) ────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ─── Configuration interactive ───────────────────────────────────────────────
section "Configuration"

read -rp "Domaine principal (ex: cavevigne.fr) : " DOMAIN
[[ -z "$DOMAIN" ]] && error "Le domaine est obligatoire."

read -rp "Email Let's Encrypt : " SSL_EMAIL
[[ -z "$SSL_EMAIL" ]] && error "L'email SSL est obligatoire."

read -rsp "Mot de passe MariaDB (cave_user) : " DB_PASSWORD; echo
[[ ${#DB_PASSWORD} -lt 12 ]] && error "Mot de passe trop court (min 12 chars)."

read -rsp "Mot de passe Redis : " REDIS_PASSWORD; echo
[[ -z "$REDIS_PASSWORD" ]] && error "Mot de passe Redis obligatoire."

read -rsp "Clé API Anthropic (sk-ant-...) : " ANTHROPIC_API_KEY; echo
[[ -z "$ANTHROPIC_API_KEY" ]] && warn "Clé Anthropic vide — le sommelier et le scan ne fonctionneront pas."

# JWT secret auto-généré si openssl disponible
JWT_SECRET=$(openssl rand -hex 64 2>/dev/null || tr -dc 'A-Za-z0-9!@#$%^&*' </dev/urandom | head -c 64)

APP_DIR="/var/www/cave-vigne"
DEPLOY_USER="${SUDO_USER:-www-data}"

echo ""
info "Domaine      : $DOMAIN"
info "App dir      : $APP_DIR"
info "Deploy user  : $DEPLOY_USER"
echo ""
read -rp "Confirmer et démarrer le déploiement ? [o/N] " CONFIRM
[[ "$CONFIRM" =~ ^[oO]$ ]] || { info "Annulé."; exit 0; }

# ─── 1. Mise à jour système ───────────────────────────────────────────────────
section "1/9 — Mise à jour système"
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
  curl wget gnupg2 ca-certificates lsb-release apt-transport-https \
  software-properties-common ufw git unzip libvips-dev
success "Système à jour"

# ─── 2. Node.js 20 LTS ───────────────────────────────────────────────────────
section "2/9 — Node.js 20 LTS"
if ! command -v node &>/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d 'v')" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
  success "Node.js $(node -v) installé"
else
  success "Node.js $(node -v) déjà présent"
fi

npm install -g pm2 --quiet
success "PM2 $(pm2 -v) installé"

# ─── 3. MariaDB 11 ───────────────────────────────────────────────────────────
section "3/9 — MariaDB 11"
if ! command -v mysql &>/dev/null; then
  curl -fsSL https://downloads.mariadb.com/MariaDB/mariadb_repo_setup \
    | bash -s -- --mariadb-server-version="mariadb-11.4"
  apt-get update -qq
  apt-get install -y mariadb-server mariadb-client
  systemctl enable --now mariadb
  success "MariaDB $(mysql --version | awk '{print $3}') installé"
else
  success "MariaDB déjà présent"
fi

# Sécurisation + création base/user
mysql -u root <<SQL
ALTER USER 'root'@'localhost' IDENTIFIED VIA mysql_native_password USING PASSWORD('');
DELETE FROM mysql.user WHERE User='';
DELETE FROM mysql.user WHERE User='root' AND Host NOT IN ('localhost', '127.0.0.1', '::1');
DROP DATABASE IF EXISTS test;
DELETE FROM mysql.db WHERE Db='test' OR Db='test\\_%';
CREATE DATABASE IF NOT EXISTS cave_vigne CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'cave_user'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON cave_vigne.* TO 'cave_user'@'localhost';
FLUSH PRIVILEGES;
SQL

# Tuning MariaDB
cat > /etc/mysql/mariadb.conf.d/99-cave-vigne.cnf <<CONF
[mysqld]
character-set-server  = utf8mb4
collation-server      = utf8mb4_unicode_ci
innodb_buffer_pool_size = 256M
max_connections       = 100
slow_query_log        = 1
slow_query_log_file   = /var/log/mysql/slow.log
long_query_time       = 2
CONF
systemctl restart mariadb
success "MariaDB configuré (base cave_vigne + user cave_user)"

# ─── 4. Redis ─────────────────────────────────────────────────────────────────
section "4/9 — Redis"
if ! command -v redis-server &>/dev/null; then
  apt-get install -y redis-server
  success "Redis installé"
else
  success "Redis déjà présent"
fi

REDIS_CONF="/etc/redis/redis.conf"
sed -i "s/^# requirepass .*/requirepass ${REDIS_PASSWORD}/" "$REDIS_CONF"
sed -i "s/^requirepass .*/requirepass ${REDIS_PASSWORD}/" "$REDIS_CONF"
# Ajoute si absent
grep -q "^requirepass" "$REDIS_CONF" || echo "requirepass ${REDIS_PASSWORD}" >> "$REDIS_CONF"
sed -i "s/^bind .*/bind 127.0.0.1/" "$REDIS_CONF"
grep -q "^maxmemory " "$REDIS_CONF" || echo "maxmemory 128mb" >> "$REDIS_CONF"
grep -q "^maxmemory-policy" "$REDIS_CONF" || echo "maxmemory-policy allkeys-lru" >> "$REDIS_CONF"

systemctl enable --now redis-server
systemctl restart redis-server
success "Redis configuré (bind 127.0.0.1, mot de passe actif)"

# ─── 5. Nginx ─────────────────────────────────────────────────────────────────
section "5/9 — Nginx"
if ! command -v nginx &>/dev/null; then
  apt-get install -y nginx
  success "Nginx installé"
else
  success "Nginx déjà présent"
fi

# Certbot
if ! command -v certbot &>/dev/null; then
  apt-get install -y certbot python3-certbot-nginx
  success "Certbot installé"
fi

# Répertoire cache nginx
mkdir -p /var/cache/nginx/cavevigne
chown www-data:www-data /var/cache/nginx/cavevigne

# Config nginx depuis le projet (si présente), sinon depuis template
NGINX_CONF_SRC="${SCRIPT_DIR}/nginx/cavevigne.fr.conf"
NGINX_CONF_DEST="/etc/nginx/sites-available/${DOMAIN}"

if [[ -f "$NGINX_CONF_SRC" ]]; then
  cp "$NGINX_CONF_SRC" "$NGINX_CONF_DEST"
  # Remplace le domaine si différent de cavevigne.fr
  sed -i "s/cavevigne\.fr/${DOMAIN}/g" "$NGINX_CONF_DEST"
  success "Config Nginx copiée depuis le projet"
else
  warn "Fichier nginx/${DOMAIN}.conf introuvable — génération d'un template minimal"
  cat > "$NGINX_CONF_DEST" <<NGINXCONF
limit_req_zone \$binary_remote_addr zone=api:10m rate=30r/m;
limit_req_zone \$binary_remote_addr zone=auth:10m rate=10r/m;

proxy_cache_path /var/cache/nginx/cavevigne levels=1:2 keys_zone=cv_cache:10m max_size=1g inactive=60m use_temp_path=off;

upstream cv_api { server 127.0.0.1:3001; keepalive 64; }

server {
    listen 80;
    server_name ${DOMAIN} www.${DOMAIN};
    location /.well-known/acme-challenge/ { root /var/www/letsencrypt; }
    location / { return 301 https://\$host\$request_uri; }
}

server {
    listen 443 ssl http2;
    server_name ${DOMAIN} www.${DOMAIN};

    ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_stapling on;
    ssl_stapling_verify on;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

    root ${APP_DIR}/frontend/build;
    index index.html;

    gzip on; gzip_vary on; gzip_comp_level 6;
    gzip_types text/plain text/css application/json application/javascript text/xml image/svg+xml;

    location /api/ {
        limit_req zone=api burst=60 nodelay;
        proxy_pass http://cv_api;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        add_header Cache-Control "no-store" always;
    }

    location /api/auth/login {
        limit_req zone=auth burst=5 nodelay;
        proxy_pass http://cv_api;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    location /uploads/ {
        alias ${APP_DIR}/uploads/;
        expires 7d;
        add_header Cache-Control "public, immutable";
        location ~* \.(php|sh|cgi)$ { deny all; }
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|webp)$ {
        expires 1y; add_header Cache-Control "public, immutable"; access_log off; try_files \$uri =404;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    location /health { access_log off; return 200 "ok\n"; add_header Content-Type text/plain; }
    location ~ /\. { deny all; }

    error_log  /var/log/nginx/${DOMAIN}_error.log warn;
    access_log /var/log/nginx/${DOMAIN}_access.log combined;
}
NGINXCONF
fi

ln -sf "$NGINX_CONF_DEST" "/etc/nginx/sites-enabled/${DOMAIN}"
rm -f /etc/nginx/sites-enabled/default

# Validation config (sans SSL pour l'instant)
nginx -t 2>/dev/null || warn "Config Nginx invalide — vérifier après obtention du certificat SSL"
success "Nginx configuré"

# ─── 6. Déploiement application ───────────────────────────────────────────────
section "6/9 — Déploiement application"

# Répertoires
mkdir -p "${APP_DIR}"/{backend,frontend/build,uploads}
chown -R "${DEPLOY_USER}:www-data" "${APP_DIR}"
chmod -R 755 "${APP_DIR}"
chmod 775 "${APP_DIR}/uploads"

# Backend
if [[ -d "${SCRIPT_DIR}/backend" ]]; then
  cp -r "${SCRIPT_DIR}/backend/." "${APP_DIR}/backend/"
  success "Backend copié"
else
  error "Dossier backend/ introuvable dans ${SCRIPT_DIR}"
fi

# Fichier .env backend
cat > "${APP_DIR}/backend/.env" <<ENV
NODE_ENV=production
PORT=3001
API_URL=https://${DOMAIN}

DB_HOST=localhost
DB_PORT=3306
DB_NAME=cave_vigne
DB_USER=cave_user
DB_PASSWORD=${DB_PASSWORD}

JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=${REDIS_PASSWORD}

ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}

UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760

ALLOWED_ORIGINS=https://${DOMAIN}
ENV
chmod 600 "${APP_DIR}/backend/.env"
success ".env backend généré"

# Dépendances backend
cd "${APP_DIR}/backend"
npm install --omit=dev --quiet
npm run migrate
success "Dépendances backend installées + migration DB"

# Frontend build
if [[ -d "${SCRIPT_DIR}/frontend" ]]; then
  cd "${SCRIPT_DIR}/frontend"
  cat > .env.production <<FENV
REACT_APP_API_URL=https://${DOMAIN}/api
FENV
  npm install --quiet
  npm run build
  cp -r build/. "${APP_DIR}/frontend/build/"
  success "Frontend buildé et copié"
else
  error "Dossier frontend/ introuvable dans ${SCRIPT_DIR}"
fi

# ─── 7. PM2 ───────────────────────────────────────────────────────────────────
section "7/9 — PM2"
pm2 delete cave-vigne-api 2>/dev/null || true

if [[ -f "${APP_DIR}/backend/ecosystem.config.js" ]]; then
  cd "${APP_DIR}/backend"
  pm2 start ecosystem.config.js --env production
else
  pm2 start "${APP_DIR}/backend/src/server.js" \
    --name cave-vigne-api \
    --cwd "${APP_DIR}/backend" \
    --max-memory-restart 250M \
    -i max \
    --env production
fi

pm2 save

# Startup systemd
PM2_STARTUP=$(pm2 startup systemd -u root --hp /root | grep "sudo env" | tail -1)
[[ -n "$PM2_STARTUP" ]] && eval "$PM2_STARTUP" || warn "Impossible de configurer pm2 startup automatiquement — exécute manuellement : pm2 startup"

success "PM2 configuré (cluster mode)"

# ─── 8. SSL Let's Encrypt ────────────────────────────────────────────────────
section "8/9 — SSL Let's Encrypt"

mkdir -p /var/www/letsencrypt
systemctl reload nginx

# Tentative d'obtention du certificat
if certbot certonly --webroot \
  -w /var/www/letsencrypt \
  -d "${DOMAIN}" -d "www.${DOMAIN}" \
  --email "${SSL_EMAIL}" \
  --agree-tos --non-interactive 2>/dev/null; then
  success "Certificat SSL obtenu pour ${DOMAIN}"
  systemctl reload nginx
else
  warn "Certbot a échoué — Le DNS pointe-t-il sur ce serveur ?"
  warn "Lance manuellement après : certbot --nginx -d ${DOMAIN} -d www.${DOMAIN} --email ${SSL_EMAIL} --agree-tos"
fi

# Renouvellement automatique
(crontab -l 2>/dev/null | grep -v certbot; echo "0 3 * * * /usr/bin/certbot renew --quiet --deploy-hook 'systemctl reload nginx'") | crontab -
success "Renouvellement SSL automatique (cron 3h)"

# ─── 9. Firewall UFW ─────────────────────────────────────────────────────────
section "9/9 — Firewall UFW"
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow ssh >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw deny 3306 >/dev/null   # MariaDB — local uniquement
ufw deny 6379 >/dev/null   # Redis — local uniquement
ufw deny 3001 >/dev/null   # API Node — via Nginx uniquement
ufw --force enable >/dev/null
success "UFW configuré (SSH + HTTPS ouverts, DB/Redis/API bloqués depuis l'extérieur)"

# ─── Backup automatique MariaDB ───────────────────────────────────────────────
mkdir -p /var/backups/cave-vigne
(crontab -l 2>/dev/null | grep -v cave_vigne; \
  echo "0 3 * * * mysqldump -u cave_user -p'${DB_PASSWORD}' cave_vigne | gzip > /var/backups/cave-vigne/cave_\$(date +\%Y\%m\%d).sql.gz && find /var/backups/cave-vigne -mtime +30 -delete") | crontab -
success "Backup MariaDB quotidien (3h, rétention 30j)"

# ─── Résumé final ─────────────────────────────────────────────────────────────
section "Déploiement terminé"
echo ""
echo -e "  ${GREEN}Application${NC}  : https://${DOMAIN}"
echo -e "  ${GREEN}API health${NC}   : https://${DOMAIN}/health"
echo -e "  ${GREEN}Logs PM2${NC}     : pm2 logs cave-vigne-api"
echo -e "  ${GREEN}Logs Nginx${NC}   : tail -f /var/log/nginx/${DOMAIN}_error.log"
echo -e "  ${GREEN}Backups DB${NC}   : /var/backups/cave-vigne/"
echo ""
echo -e "  ${YELLOW}JWT_SECRET${NC}   : ${JWT_SECRET}"
echo -e "  ${YELLOW}(sauvegarde cette valeur en lieu sûr)${NC}"
echo ""
pm2 status
