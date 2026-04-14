#!/usr/bin/env bash
# =============================================================================
# Cave & Vigne — Script de déploiement automatisé
# Cible : Debian 13 (Trixie) — VPS bare metal ou cloud
# Usage : sudo bash deploy.sh
# =============================================================================

set -euo pipefail

# ─── Couleurs ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERR]${NC}  $*"; exit 1; }
section() { echo -e "\n${BOLD}${BLUE}══════════════════════════════════════${NC}"; echo -e "${BOLD} $*${NC}"; echo -e "${BOLD}${BLUE}══════════════════════════════════════${NC}"; }

# ─── Vérifications initiales ──────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && error "Ce script doit être exécuté en root : sudo bash deploy.sh"
[[ -f /etc/debian_version ]] || error "Ce script est prévu pour Debian uniquement."
DEBIAN_VERSION=$(cut -d. -f1 /etc/debian_version)
[[ "$DEBIAN_VERSION" -ge 13 ]] || warn "Recommandé sur Debian 13+. Version détectée : $(cat /etc/debian_version)"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="/var/www/cave-vigne"
DEPLOY_USER="${SUDO_USER:-www-data}"

# ─── Détection install existante ─────────────────────────────────────────────
UPDATE_MODE=false
GIT_MODE=false
if [[ -f "${APP_DIR}/backend/.env" ]] && command -v pm2 &>/dev/null; then
  echo ""
  echo -e "${BOLD}Installation existante détectée${NC} (${APP_DIR})"
  echo ""
  echo "  [1] Mettre à jour depuis GitHub  (git fetch → diff → pull → rebuild)"
  echo "  [2] Mettre à jour depuis ce dossier (copie locale, conserve .env et DB)"
  echo "  [3] Déploiement complet (réinstalle tout)"
  echo ""
  read -rp "Que souhaitez-vous faire ? [1/2/3] : " INSTALL_MODE
  [[ "$INSTALL_MODE" == "1" ]] && GIT_MODE=true
  [[ "$INSTALL_MODE" == "2" ]] && UPDATE_MODE=true
fi

# ─── Helpers post-code : npm install + migrate + build + pm2 restart ─────────
do_update_steps() {
  local SRC_BACKEND="$1"   # répertoire source du backend (déjà à jour)
  local SRC_FRONTEND="$2"  # répertoire source du frontend

  section "1/3 — Dépendances backend + migration"
  cd "${SRC_BACKEND}"
  npm install --omit=dev --quiet
  npm run migrate
  success "npm install + migrations OK"

  section "2/3 — Build frontend"
  cd "${SRC_FRONTEND}"
  rm -f .env.local
  echo "REACT_APP_API_URL=/api" > .env.production
  npm install --quiet
  node node_modules/vite/bin/vite.js build
  mkdir -p "${APP_DIR}/frontend/build"
  cp -r build/. "${APP_DIR}/frontend/build/"
  success "Frontend buildé et copié"

  section "3/3 — Redémarrage PM2"
  pm2 delete cave-vigne-api 2>/dev/null || true
  if [[ -f "${APP_DIR}/backend/ecosystem.config.js" ]]; then
    cd "${APP_DIR}/backend" && pm2 start ecosystem.config.js --env production
  else
    pm2 start "${APP_DIR}/backend/src/server.js" \
      --name cave-vigne-api --cwd "${APP_DIR}/backend" \
      --max-memory-restart 250M -i max --env production
  fi
  pm2 save
  success "Application redémarrée"
}

# ─── Mode GIT UPDATE ─────────────────────────────────────────────────────────
if [[ "$GIT_MODE" == "true" ]]; then
  section "Mise à jour depuis GitHub"

  command -v git &>/dev/null || apt-get install -y -qq git

  # Répertoire source git : APP_DIR si .git présent, sinon répertoire dédié
  GIT_SRC="${APP_DIR}"
  if [[ ! -d "${GIT_SRC}/.git" ]]; then
    warn "Aucun dépôt git trouvé dans ${GIT_SRC}"
    read -rp "URL du dépôt GitHub (ex: https://github.com/user/cave-vigne.git) : " REPO_URL
    [[ -z "$REPO_URL" ]] && error "URL du dépôt obligatoire."
    read -rp "Branche à suivre [main] : " GIT_BRANCH
    GIT_BRANCH="${GIT_BRANCH:-main}"

    info "Initialisation du suivi git dans ${GIT_SRC}…"
    cd "${GIT_SRC}"
    git init -q
    git remote add origin "${REPO_URL}"
    git fetch origin "${GIT_BRANCH}" --depth=1 -q
    git checkout -B "${GIT_BRANCH}" "origin/${GIT_BRANCH}" -q
    success "Dépôt git configuré (remote: ${REPO_URL}, branche: ${GIT_BRANCH})"
  fi

  cd "${GIT_SRC}"
  GIT_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo "main")

  info "Vérification des mises à jour (branche: ${GIT_BRANCH})…"
  git fetch origin "${GIT_BRANCH}" -q 2>/dev/null \
    || error "Impossible de contacter GitHub — réseau disponible ?"

  LOCAL_SHA=$(git rev-parse HEAD)
  REMOTE_SHA=$(git rev-parse "origin/${GIT_BRANCH}" 2>/dev/null || echo "")

  if [[ "$LOCAL_SHA" == "$REMOTE_SHA" ]]; then
    success "Déjà à jour — commit local : $(git rev-parse --short HEAD)"
    echo ""
    pm2 status
    exit 0
  fi

  BEHIND=$(git rev-list HEAD.."origin/${GIT_BRANCH}" --count 2>/dev/null || echo "?")
  echo ""
  echo -e "${BOLD}${BLUE}  En retard de ${BEHIND} commit(s) :${NC}"
  echo ""
  git log HEAD.."origin/${GIT_BRANCH}" --oneline \
    --format="  %C(yellow)%h%Creset %s %C(dim)(%cr, %an)%Creset" 2>/dev/null \
    || git log HEAD.."origin/${GIT_BRANCH}" --oneline | sed 's/^/  /'
  echo ""

  echo -e "${BOLD}  Fichiers modifiés :${NC}"
  git diff --name-status HEAD "origin/${GIT_BRANCH}" \
    | awk '
        /^A/ { printf "  \033[32m[+] AJOUTÉ   \033[0m %s\n", $2 }
        /^M/ { printf "  \033[33m[~] MODIFIÉ  \033[0m %s\n", $2 }
        /^D/ { printf "  \033[31m[-] SUPPRIMÉ \033[0m %s\n", $2 }
        /^R/ { printf "  \033[34m[>] RENOMMÉ  \033[0m %s → %s\n", $2, $3 }
      '
  echo ""

  read -rp "Appliquer ces ${BEHIND} mise(s) à jour ? [o/N] " CONFIRM_GIT
  [[ "$CONFIRM_GIT" =~ ^[oO]$ ]] || { info "Annulé."; exit 0; }

  # ── Sauvegarde .env ──
  [[ -f "${APP_DIR}/backend/.env" ]] && cp "${APP_DIR}/backend/.env" /tmp/cave-vigne-env.bak

  # ── Pull ──
  section "Téléchargement des modifications"
  git pull origin "${GIT_BRANCH}" --ff-only -q 2>/dev/null || {
    warn "Fast-forward impossible (commits locaux ?). Tentative avec stash + pull…"
    git stash -q 2>/dev/null || true
    git pull origin "${GIT_BRANCH}" -q
  }
  success "Code mis à jour → $(git rev-parse --short HEAD)"

  # ── Restaurer .env (git pull ne doit jamais l'écraser) ──
  if [[ -f /tmp/cave-vigne-env.bak ]]; then
    cp /tmp/cave-vigne-env.bak "${APP_DIR}/backend/.env"
    chmod 600 "${APP_DIR}/backend/.env"
    success ".env de production restauré"
  fi

  # ── Lire le domaine ──
  DOMAIN=$(grep "^API_URL=" "${APP_DIR}/backend/.env" 2>/dev/null \
    | sed 's|.*://||;s|/.*||' || true)
  [[ -z "$DOMAIN" ]] && { read -rp "Domaine (ex: cavevigne.fr) : " DOMAIN; }

  do_update_steps "${GIT_SRC}/backend" "${GIT_SRC}/frontend"

  section "Mise à jour GitHub terminée ✓"
  PROTO=$(grep "^API_URL=" "${APP_DIR}/backend/.env" | sed 's|API_URL=||;s|://.*||' || echo "https")
  echo ""
  echo -e "  ${GREEN}Application${NC} : ${PROTO}://${DOMAIN}"
  echo -e "  ${GREEN}API health${NC}  : ${PROTO}://${DOMAIN}/api/health"
  echo -e "  ${GREEN}API docs${NC}    : ${PROTO}://${DOMAIN}/api/docs"
  echo -e "  ${GREEN}Commit${NC}      : $(git -C "${GIT_SRC}" log -1 --format='%h — %s (%cr)')"
  echo -e "  ${GREEN}Logs PM2${NC}    : pm2 logs cave-vigne-api"
  echo ""
  pm2 status
  exit 0
fi

# ─── Mode UPDATE (copie locale) ───────────────────────────────────────────────
if [[ "$UPDATE_MODE" == "true" ]]; then
  section "Mise à jour Cave & Vigne (copie locale)"

  DOMAIN=$(grep "^API_URL=" "${APP_DIR}/backend/.env" 2>/dev/null \
    | sed 's|.*://||;s|/.*||' || true)
  [[ -z "$DOMAIN" ]] && { read -rp "Domaine (ex: cavevigne.fr) : " DOMAIN; }

  echo ""
  info "Domaine   : $DOMAIN"
  info "App dir   : $APP_DIR"
  info "Source    : $SCRIPT_DIR"
  echo ""
  read -rp "Confirmer la mise à jour ? [o/N] " CONFIRM
  [[ "$CONFIRM" =~ ^[oO]$ ]] || { info "Annulé."; exit 0; }

  # ── Copie backend (protège .env) ──
  section "Copie du backend"
  cp "${APP_DIR}/backend/.env" /tmp/cave-vigne-env.bak
  cp -r "${SCRIPT_DIR}/backend/." "${APP_DIR}/backend/"
  cp /tmp/cave-vigne-env.bak "${APP_DIR}/backend/.env"
  chmod 600 "${APP_DIR}/backend/.env"
  success "Backend copié"

  do_update_steps "${APP_DIR}/backend" "${SCRIPT_DIR}/frontend"

  section "Mise à jour terminée ✓"
  PROTO=$(grep "^API_URL=" "${APP_DIR}/backend/.env" | sed 's|API_URL=||;s|://.*||' || echo "https")
  echo ""
  echo -e "  ${GREEN}Application${NC} : ${PROTO}://${DOMAIN}"
  echo -e "  ${GREEN}API health${NC}  : ${PROTO}://${DOMAIN}/api/health"
  echo -e "  ${GREEN}API docs${NC}    : ${PROTO}://${DOMAIN}/api/docs"
  echo -e "  ${GREEN}Logs PM2${NC}    : pm2 logs cave-vigne-api"
  echo ""
  pm2 status
  exit 0
fi

# ─── Configuration interactive (déploiement complet) ─────────────────────────
section "Configuration"

read -rp  "Domaine principal (ex: cavevigne.fr) : " DOMAIN
[[ -z "$DOMAIN" ]] && error "Le domaine est obligatoire."

echo ""
echo "  [1] HTTPS port 443 + SSL Let's Encrypt (production, domaine public)"
echo "  [2] HTTP port 80 uniquement (derrière HAProxy/reverse-proxy externe)"
echo ""
read -rp "Mode d'exposition [1/2] : " PORT_MODE
[[ "$PORT_MODE" != "1" && "$PORT_MODE" != "2" ]] && PORT_MODE=1

USE_SSL=false
SSL_EMAIL=""
if [[ "$PORT_MODE" == "1" ]]; then
  USE_SSL=true
  read -rp "Email Let's Encrypt : " SSL_EMAIL
  [[ -z "$SSL_EMAIL" ]] && error "L'email SSL est obligatoire pour le mode HTTPS."
fi

read -rsp "Mot de passe MariaDB (cave_user) : " DB_PASSWORD; echo
[[ ${#DB_PASSWORD} -lt 12 ]] && error "Mot de passe trop court (min 12 chars)."

read -rsp "Mot de passe Redis : " REDIS_PASSWORD; echo
[[ -z "$REDIS_PASSWORD" ]] && error "Mot de passe Redis obligatoire."

read -rsp "Clé API Anthropic (sk-ant-...) : " ANTHROPIC_API_KEY; echo
[[ -z "$ANTHROPIC_API_KEY" ]] && warn "Clé Anthropic vide — sommelier et scan désactivés."

echo ""
echo -e "${BOLD}Compte administrateur initial${NC}"
read -rp  "Email admin : "    ADMIN_EMAIL
read -rp  "Username admin : " ADMIN_USERNAME
read -rsp "Mot de passe admin (min 8 chars) : " ADMIN_PASSWORD; echo
[[ ${#ADMIN_PASSWORD} -lt 8 ]] && error "Mot de passe admin trop court."

JWT_SECRET=$(openssl rand -hex 64 2>/dev/null || tr -dc 'A-Za-z0-9' </dev/urandom | head -c 128)
DEBUG_TOKEN=$(openssl rand -hex 16 2>/dev/null || tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32)
PROTO=$( [[ "$USE_SSL" == "true" ]] && echo "https" || echo "http" )

echo ""
info "Domaine   : $DOMAIN"
info "Mode      : $( [[ "$USE_SSL" == "true" ]] && echo "HTTPS/443 + Certbot" || echo "HTTP/80 (no SSL)" )"
info "App dir   : $APP_DIR"
echo ""
read -rp "Confirmer et démarrer le déploiement ? [o/N] " CONFIRM
[[ "$CONFIRM" =~ ^[oO]$ ]] || { info "Annulé."; exit 0; }

# ─── 1. Mise à jour système ───────────────────────────────────────────────────
section "1/9 — Mise à jour système"
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
  curl wget gnupg2 ca-certificates lsb-release apt-transport-https \
  ufw git unzip libvips-dev
success "Système à jour"

# ─── 2. Node.js 24 LTS + npm ──────────────────────────────────────────────────
section "2/9 — Node.js 24 LTS"
if ! command -v node &>/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d 'v')" -lt 24 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
  success "Node.js $(node -v) installé"
else
  success "Node.js $(node -v) déjà présent"
fi

npm install -g npm@latest --quiet
npm install -g pm2 --quiet
success "npm $(npm -v) + PM2 $(pm2 -v) installés"

# ─── 3. MariaDB ───────────────────────────────────────────────────────────────
section "3/9 — MariaDB"
if ! command -v mysql &>/dev/null; then
  curl -fsSL https://dlm.mariadb.com/3/MariaDB/mariadb_repo_setup \
    | bash -s -- --mariadb-server-version="mariadb-12.2"
  apt-get update -qq
  apt-get install -y mariadb-server mariadb-client
  systemctl enable --now mariadb
  success "MariaDB $(mysql --version | awk '{print $3}') installé"
else
  success "MariaDB déjà présent"
fi

mysql -u root <<SQL
ALTER USER IF EXISTS 'root'@'localhost' IDENTIFIED VIA mysql_native_password USING PASSWORD('');
DELETE FROM mysql.user WHERE User='';
DELETE FROM mysql.user WHERE User='root' AND Host NOT IN ('localhost','127.0.0.1','::1');
DROP DATABASE IF EXISTS test;
DELETE FROM mysql.db WHERE Db='test' OR Db='test\\_%';
CREATE DATABASE IF NOT EXISTS cave_vigne CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'cave_user'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON cave_vigne.* TO 'cave_user'@'localhost';
FLUSH PRIVILEGES;
SQL

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
sed -i "s/^requirepass .*/requirepass ${REDIS_PASSWORD}/"   "$REDIS_CONF"
grep -q "^requirepass" "$REDIS_CONF" || echo "requirepass ${REDIS_PASSWORD}" >> "$REDIS_CONF"
sed -i "s/^bind .*/bind 127.0.0.1/" "$REDIS_CONF"
grep -q "^maxmemory "      "$REDIS_CONF" || echo "maxmemory 128mb"          >> "$REDIS_CONF"
grep -q "^maxmemory-policy" "$REDIS_CONF" || echo "maxmemory-policy allkeys-lru" >> "$REDIS_CONF"
systemctl enable --now redis-server && systemctl restart redis-server
success "Redis configuré (bind 127.0.0.1, mot de passe actif)"

# ─── 5. Nginx ─────────────────────────────────────────────────────────────────
section "5/9 — Nginx"
if ! command -v nginx &>/dev/null; then
  apt-get install -y nginx
  success "Nginx installé"
else
  success "Nginx déjà présent"
fi

if [[ "$USE_SSL" == "true" ]] && ! command -v certbot &>/dev/null; then
  apt-get install -y certbot python3-certbot-nginx
  success "Certbot installé"
fi

mkdir -p /var/cache/nginx/cavevigne
chown www-data:www-data /var/cache/nginx/cavevigne

NGINX_CONF_DEST="/etc/nginx/sites-available/${DOMAIN}"

# ── Config HTTP/80 seul ──
gen_nginx_http() {
cat > "$NGINX_CONF_DEST" <<NGINXCONF
limit_req_zone \$binary_remote_addr zone=api:10m rate=30r/m;
limit_req_zone \$binary_remote_addr zone=auth:10m rate=10r/m;

upstream cv_api { server 127.0.0.1:3001; keepalive 64; }

server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};

    root ${APP_DIR}/frontend/build;
    index index.html;

    gzip on; gzip_vary on; gzip_comp_level 6;
    gzip_types text/plain text/css application/json application/javascript text/xml image/svg+xml;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

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

    location /api/auth/login    { limit_req zone=auth burst=5 nodelay; proxy_pass http://cv_api; proxy_set_header Host \$host; }
    location /api/auth/register { limit_req zone=auth burst=5 nodelay; proxy_pass http://cv_api; proxy_set_header Host \$host; }

    location /uploads/ {
        alias ${APP_DIR}/uploads/;
        expires 7d; add_header Cache-Control "public, immutable";
        location ~* \.(php|sh|cgi)$ { deny all; }
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|webp)$ {
        expires 1y; add_header Cache-Control "public, immutable"; access_log off; try_files \$uri =404;
    }

    location / { try_files \$uri \$uri/ /index.html; add_header Cache-Control "no-cache, no-store, must-revalidate"; }
    location /health { access_log off; return 200 "ok\n"; add_header Content-Type text/plain; }
    location ~ /\. { deny all; }

    error_log  /var/log/nginx/${DOMAIN}_error.log warn;
    access_log /var/log/nginx/${DOMAIN}_access.log combined;
}
NGINXCONF
}

# ── Config HTTPS/443 ──
gen_nginx_https() {
# Copie depuis le projet si disponible
local SRC="${SCRIPT_DIR}/nginx/cavevigne.fr.conf"
if [[ -f "$SRC" ]]; then
  cp "$SRC" "$NGINX_CONF_DEST"
  sed -i "s/cavevigne\.fr/${DOMAIN}/g" "$NGINX_CONF_DEST"
  sed -i "s|/var/www/cave-vigne|${APP_DIR}|g" "$NGINX_CONF_DEST"
  success "Config Nginx copiée depuis le projet"
else
cat > "$NGINX_CONF_DEST" <<NGINXCONF
limit_req_zone \$binary_remote_addr zone=api:10m rate=30r/m;
limit_req_zone \$binary_remote_addr zone=auth:10m rate=10r/m;
proxy_cache_path /var/cache/nginx/cavevigne levels=1:2 keys_zone=cv_cache:10m max_size=1g inactive=60m use_temp_path=off;
upstream cv_api { server 127.0.0.1:3001; keepalive 64; }

server {
    listen 80; listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};
    location /.well-known/acme-challenge/ { root /var/www/letsencrypt; }
    location / { return 301 https://\$host\$request_uri; }
}

server {
    listen 443 ssl http2; listen [::]:443 ssl http2;
    server_name ${DOMAIN} www.${DOMAIN};

    ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_stapling on; ssl_stapling_verify on;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

    root ${APP_DIR}/frontend/build; index index.html;
    gzip on; gzip_vary on; gzip_comp_level 6;
    gzip_types text/plain text/css application/json application/javascript text/xml image/svg+xml;

    location /api/ {
        limit_req zone=api burst=60 nodelay;
        proxy_pass http://cv_api; proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        add_header Cache-Control "no-store" always;
    }
    location /api/auth/login    { limit_req zone=auth burst=5 nodelay; proxy_pass http://cv_api; proxy_set_header Host \$host; }
    location /api/auth/register { limit_req zone=auth burst=5 nodelay; proxy_pass http://cv_api; proxy_set_header Host \$host; }

    location /uploads/ {
        alias ${APP_DIR}/uploads/;
        expires 7d; add_header Cache-Control "public, immutable";
        location ~* \.(php|sh|cgi)$ { deny all; }
    }
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|webp)$ {
        expires 1y; add_header Cache-Control "public, immutable"; access_log off; try_files \$uri =404;
    }
    location / { try_files \$uri \$uri/ /index.html; add_header Cache-Control "no-cache"; }
    location /health { access_log off; return 200 "ok\n"; add_header Content-Type text/plain; }
    location ~ /\. { deny all; }

    error_log  /var/log/nginx/${DOMAIN}_error.log warn;
    access_log /var/log/nginx/${DOMAIN}_access.log combined;
}
NGINXCONF
fi
}

if [[ "$USE_SSL" == "true" ]]; then
  gen_nginx_https
else
  gen_nginx_http
fi

ln -sf "$NGINX_CONF_DEST" "/etc/nginx/sites-enabled/${DOMAIN}"
rm -f /etc/nginx/sites-enabled/default
nginx -t 2>/dev/null && systemctl reload nginx || warn "Config Nginx à vérifier"
success "Nginx configuré (mode: $( [[ "$USE_SSL" == "true" ]] && echo "HTTPS" || echo "HTTP" ))"

# ─── 6. Déploiement application ───────────────────────────────────────────────
section "6/9 — Déploiement application"
mkdir -p "${APP_DIR}"/{backend,frontend/build,uploads}
chown -R "${DEPLOY_USER}:www-data" "${APP_DIR}"
chmod -R 755 "${APP_DIR}"
chmod 775 "${APP_DIR}/uploads"

[[ -d "${SCRIPT_DIR}/backend" ]]  || error "Dossier backend/ introuvable dans ${SCRIPT_DIR}"
[[ -d "${SCRIPT_DIR}/frontend" ]] || error "Dossier frontend/ introuvable dans ${SCRIPT_DIR}"
cp -r "${SCRIPT_DIR}/backend/." "${APP_DIR}/backend/"
success "Backend copié"

cat > "${APP_DIR}/backend/.env" <<ENV
NODE_ENV=production
PORT=3001
API_URL=${PROTO}://${DOMAIN}

DB_HOST=localhost
DB_PORT=3306
DB_NAME=cave_vigne
DB_USER=cave_user
DB_PASSWORD=${DB_PASSWORD}

JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d
DEBUG_TOKEN=${DEBUG_TOKEN}

REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=${REDIS_PASSWORD}

ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}

UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760

ALLOWED_ORIGINS=http://${DOMAIN},https://${DOMAIN}
ENV
chmod 600 "${APP_DIR}/backend/.env"
success ".env backend généré"

cd "${APP_DIR}/backend"
npm install --omit=dev --quiet
npm run migrate
success "Dépendances backend installées + migration DB"

# Build frontend
cd "${SCRIPT_DIR}/frontend"
# Supprimer .env.local (priorité CRA > .env.production) pour éviter localhost dans le build
rm -f .env.local
# URL relative /api : fonctionne en HTTP et HTTPS (nginx proxifie vers :3001)
# Pas de mixed-content en cas de HAProxy TLS devant nginx HTTP
cat > .env.production <<FENV
REACT_APP_API_URL=/api
FENV
npm install --quiet
node node_modules/vite/bin/vite.js build
cp -r build/. "${APP_DIR}/frontend/build/"
success "Frontend buildé et copié"

# ─── 7. PM2 ───────────────────────────────────────────────────────────────────
section "7/9 — PM2"
pm2 delete cave-vigne-api 2>/dev/null || true

if [[ -f "${APP_DIR}/backend/ecosystem.config.js" ]]; then
  cd "${APP_DIR}/backend" && pm2 start ecosystem.config.js --env production
else
  pm2 start "${APP_DIR}/backend/src/server.js" \
    --name cave-vigne-api --cwd "${APP_DIR}/backend" \
    --max-memory-restart 250M -i max --env production
fi
pm2 save

PM2_STARTUP=$(pm2 startup systemd -u root --hp /root 2>/dev/null | grep "sudo env" | tail -1 || true)
[[ -n "$PM2_STARTUP" ]] && eval "$PM2_STARTUP" || warn "Exécute manuellement : pm2 startup"
success "PM2 configuré (cluster mode)"

# ─── 8. SSL Let's Encrypt (mode HTTPS uniquement) ────────────────────────────
if [[ "$USE_SSL" == "true" ]]; then
  section "8/9 — SSL Let's Encrypt"
  mkdir -p /var/www/letsencrypt
  systemctl reload nginx

  if certbot certonly --webroot \
    -w /var/www/letsencrypt \
    -d "${DOMAIN}" -d "www.${DOMAIN}" \
    --email "${SSL_EMAIL}" --agree-tos --non-interactive 2>/dev/null; then
    success "Certificat SSL obtenu pour ${DOMAIN}"
    systemctl reload nginx
  else
    warn "Certbot a échoué — DNS configuré ? Lance après : certbot --nginx -d ${DOMAIN} --email ${SSL_EMAIL} --agree-tos"
  fi

  { crontab -l 2>/dev/null | grep -v certbot || true; \
    echo "0 3 * * * /usr/bin/certbot renew --quiet --deploy-hook 'systemctl reload nginx'"; } | crontab -
  success "Renouvellement SSL automatique (cron 3h)"
else
  section "8/9 — SSL ignoré (mode HTTP)"
  info "Mode HTTP/80 — Certbot non installé. Configure le SSL sur ton HAProxy/reverse-proxy externe."
fi

# ─── 9. Firewall UFW ─────────────────────────────────────────────────────────
section "9/9 — Firewall UFW"
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow ssh >/dev/null
ufw allow 80/tcp >/dev/null
[[ "$USE_SSL" == "true" ]] && ufw allow 443/tcp >/dev/null
ufw deny 3306 >/dev/null
ufw deny 6379 >/dev/null
ufw deny 3001 >/dev/null
ufw --force enable >/dev/null
success "UFW configuré"

# ─── Backup automatique MariaDB ───────────────────────────────────────────────
mkdir -p /var/backups/cave-vigne
{ crontab -l 2>/dev/null | grep -v cave_vigne || true; \
  echo "0 3 * * * mysqldump -u cave_user -p'${DB_PASSWORD}' cave_vigne | gzip > /var/backups/cave-vigne/cave_\$(date +\%Y\%m\%d).sql.gz && find /var/backups/cave-vigne -mtime +30 -delete"; } | crontab -
success "Backup MariaDB quotidien (3h, rétention 30j)"

# ─── Création du premier administrateur ──────────────────────────────────────
section "Création du compte administrateur"
cd "${APP_DIR}/backend"
ADMIN_EMAIL="${ADMIN_EMAIL}" ADMIN_USERNAME="${ADMIN_USERNAME}" ADMIN_PASSWORD="${ADMIN_PASSWORD}" \
  node src/config/seed.js "${ADMIN_EMAIL}" "${ADMIN_USERNAME}" "${ADMIN_PASSWORD}" || \
  warn "Seed échoué — exécute manuellement : cd ${APP_DIR}/backend && npm run seed <email> <username> <password>"

# ─── Résumé final ─────────────────────────────────────────────────────────────
section "Déploiement terminé ✓"
echo ""
echo -e "  ${GREEN}Application${NC}  : ${PROTO}://${DOMAIN}"
echo -e "  ${GREEN}API health${NC}   : ${PROTO}://${DOMAIN}/api/health"
echo -e "  ${GREEN}API docs${NC}     : ${PROTO}://${DOMAIN}/api/docs"
echo -e "  ${GREEN}Admin UI${NC}     : ${PROTO}://${DOMAIN}/admin  (connecte-toi avec ${ADMIN_EMAIL})"
echo -e "  ${GREEN}Logs PM2${NC}     : pm2 logs cave-vigne-api"
echo -e "  ${GREEN}Logs Nginx${NC}   : tail -f /var/log/nginx/${DOMAIN}_error.log"
echo -e "  ${GREEN}Backups DB${NC}   : /var/backups/cave-vigne/"
echo ""
echo -e "  ${YELLOW}JWT_SECRET${NC}   (à sauvegarder) : ${JWT_SECRET}"
echo -e "  ${YELLOW}DEBUG_TOKEN${NC}  (endpoint debug) : ${PROTO}://${DOMAIN}/api/debug?token=${DEBUG_TOKEN}"
echo ""
pm2 status
