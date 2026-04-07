# Cave & Vigne — Guide de déploiement complet

## Architecture

```
Internet ──► Cloudflare (proxy/WAF/CDN)
                  │
                  ▼
             VPS Debian 13 (Trixie)
             ┌─────────────────────────────────┐
             │  Nginx :443  (SSL + reverse proxy│
             │       │              │            │
             │  /api/*        /  (Vite build)   │
             │       │                           │
             │  Node.js 24 :3001  (Express API) │
             │       │                           │
             │  MariaDB 12 :3306  (données)     │
             │  Redis      :6379  (cache)       │
             └─────────────────────────────────┘
```

---

## 1. Prérequis VPS

```bash
# Debian 13 (Trixie) — mise à jour système
sudo apt update && sudo apt upgrade -y

# Node.js 24 LTS
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs

# Vérifier
node -v   # v24.x.x
npm -v

# Nginx
sudo apt install -y nginx

# MariaDB 12
# Ajouter le dépôt MariaDB 12
curl -LsS https://r.mariadb.com/downloads/mariadb_repo_setup | sudo bash -s -- --mariadb-server-version="mariadb-12"
sudo apt install -y mariadb-server
sudo mysql_secure_installation

# Redis
sudo apt install -y redis-server
sudo systemctl enable redis-server

# Certbot (Let's Encrypt)
sudo apt install -y certbot python3-certbot-nginx

# PM2 (process manager Node.js)
sudo npm install -g pm2

# Sharp dependencies (traitement image)
sudo apt install -y libvips-dev
```

---

## 2. MariaDB 12 — Création base et utilisateur

```sql
sudo mysql -u root -p

CREATE DATABASE cave_vigne CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'cave_user'@'localhost' IDENTIFIED BY 'VOTRE_MOT_DE_PASSE_FORT';
GRANT ALL PRIVILEGES ON cave_vigne.* TO 'cave_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

**Configuration MariaDB** (`/etc/mysql/mariadb.conf.d/50-server.cnf`) :
```ini
[mysqld]
character-set-server = utf8mb4
collation-server     = utf8mb4_unicode_ci
innodb_buffer_pool_size = 256M
max_connections = 100
slow_query_log = 1
slow_query_log_file = /var/log/mysql/slow.log
long_query_time = 2
```

```bash
sudo systemctl restart mariadb
```

---

## 3. Redis — Sécurisation

Éditer `/etc/redis/redis.conf` :
```conf
bind 127.0.0.1
requirepass VOTRE_MOT_DE_PASSE_REDIS
maxmemory 128mb
maxmemory-policy allkeys-lru
```

```bash
sudo systemctl restart redis-server
```

---

## 4. Déploiement Backend

```bash
# Créer les répertoires
sudo mkdir -p /var/www/cave-vigne/{backend,frontend/build,uploads}
sudo chown -R $USER:www-data /var/www/cave-vigne
sudo chmod -R 755 /var/www/cave-vigne
sudo chmod 775 /var/www/cave-vigne/uploads

# Copier le backend
cp -r backend/* /var/www/cave-vigne/backend/
cd /var/www/cave-vigne/backend

# Configurer .env
cp .env.example .env
nano .env  # Remplir TOUS les paramètres

# Installer dépendances (rebuild sharp pour Node 24)
npm install
npm rebuild sharp

# Migration base de données (crée tables + colonnes nouvelles)
npm run migrate

# Lancer avec PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Suivre les instructions affichées
```

---

## 5. Build Frontend (Vite)

```bash
cd frontend

# Créer .env.production
echo "REACT_APP_API_URL=https://cavevigne.fr/api" > .env.production

npm install
npm run build    # → dossier build/

# Copier le build
sudo cp -r build/* /var/www/cave-vigne/frontend/build/
```

> **Note :** le build Vite produit dans `build/` (configuré via `vite.config.js → outDir`), compatible avec la config Nginx existante.

---

## 6. Nginx

```bash
# Copier la config
sudo cp nginx/cavevigne.fr.conf /etc/nginx/sites-available/cavevigne.fr
sudo ln -sf /etc/nginx/sites-available/cavevigne.fr /etc/nginx/sites-enabled/

# Créer répertoire cache
sudo mkdir -p /var/cache/nginx/cavevigne
sudo chown www-data:www-data /var/cache/nginx/cavevigne

# SSL Let's Encrypt
sudo certbot --nginx -d cavevigne.fr -d www.cavevigne.fr --email votre@email.fr --agree-tos

# Test et rechargement
sudo nginx -t
sudo systemctl reload nginx
```

---

## 7. Cloudflare — Configuration recommandée

### DNS
| Type | Nom | Valeur | Proxy |
|------|-----|--------|-------|
| A | cavevigne.fr | IP_VPS | ✅ Proxied |
| A | www | IP_VPS | ✅ Proxied |

### SSL/TLS
- Mode : **Full (strict)**
- Min TLS Version : **TLS 1.2**
- Activer : HSTS, Automatic HTTPS Rewrites

### Caching
- Caching Level : **Standard**
- Browser Cache TTL : **4 hours**

### Cache Rules
| URL | Action |
|-----|--------|
| `cavevigne.fr/api/*` | Cache Level: Bypass |
| `cavevigne.fr/uploads/*` | Cache Level: Cache Everything, Edge TTL: 7 days |
| `cavevigne.fr/assets/*` | Cache Level: Cache Everything, Edge TTL: 1 month |

### Security
- Security Level : **Medium**
- Bot Fight Mode : **ON**
- WAF : Rules pour bloquer SQLi, XSS

### Speed
- Auto Minify : JS ✅ CSS ✅ HTML ✅
- Brotli : **ON**

---

## 8. Firewall UFW

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw deny 3306   # MariaDB — accès uniquement local
sudo ufw deny 6379   # Redis — accès uniquement local
sudo ufw deny 3001   # API Node — uniquement via Nginx
sudo ufw enable
```

---

## 9. App Android — Build

1. Ouvrir le dossier `android/` dans **Android Studio**
2. Modifier `APP_URL` dans `MainActivity.kt` pour pointer sur votre domaine
3. **Build** → **Generate Signed Bundle/APK**
4. Choisir APK, créer un keystore, générer l'APK signé
5. Distribuer via Google Play ou installation directe

**Prérequis** : Android Studio Hedgehog+, Android SDK 34, Kotlin 1.9+

---

## 10. Configuration admin (interface web)

Après le premier déploiement, connectez-vous avec un compte `admin` et accédez à **Admin → Paramètres** pour :

- Renseigner la **clé API Anthropic** (Sommelier IA + Scan)
- Configurer le **serveur SMTP** pour les emails (création de compte, 2FA)
- Activer/désactiver le **catalogue public** (accès sans authentification)

Ces paramètres sont stockés en base et pris en compte immédiatement sans redémarrage.

---

## 11. Maintenance

```bash
# Logs backend
pm2 logs cave-vigne-api

# Mise à jour backend
cd /var/www/cave-vigne/backend
git pull
npm install
npm rebuild sharp
npm run migrate    # Applique les nouvelles colonnes si nécessaire
pm2 restart cave-vigne-api

# Mise à jour frontend
cd /path/to/repo/frontend
npm run build
sudo cp -r build/* /var/www/cave-vigne/frontend/build/

# Renouvellement SSL automatique
sudo certbot renew --dry-run
# Cron : 0 12 * * * /usr/bin/certbot renew --quiet

# Backup MariaDB quotidien
# Ajouter dans crontab -e :
# 0 3 * * * mysqldump -u cave_user -pPASSWORD cave_vigne | gzip > /backup/cave_$(date +\%Y\%m\%d).sql.gz

# Purge cache Cloudflare
curl -X POST "https://api.cloudflare.com/client/v4/zones/ZONE_ID/purge_cache" \
     -H "Authorization: Bearer CF_TOKEN" \
     -H "Content-Type: application/json" \
     --data '{"purge_everything":true}'
```

---

## 12. Variables d'environnement requises

| Variable | Description |
|----------|-------------|
| `DB_PASSWORD` | Mot de passe MariaDB fort (min 20 chars) |
| `JWT_SECRET` | Clé JWT 64+ caractères aléatoires |
| `REDIS_PASSWORD` | Mot de passe Redis |
| `ANTHROPIC_API_KEY` | Clé API Anthropic (Sommelier + Scan) — configurable aussi depuis l'UI admin |
| `CF_ZONE_ID` | Zone ID Cloudflare (dashboard → Overview) |
| `CF_API_TOKEN` | Token API Cloudflare (Zone:Cache Purge) |

Générer un JWT_SECRET fort :
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
