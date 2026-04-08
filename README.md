# 🍷 Cave & Vigne

> **Gestionnaire de cave à vin et spiritueux** — Application web full-stack avec sommelier IA, cartes interactives et scan d'étiquettes par vision artificielle.

[![License: MIT](https://img.shields.io/badge/License-MIT-C9A84C.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-24.x-339933?logo=node.js)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite)](https://vitejs.dev)
[![Bootstrap](https://img.shields.io/badge/Bootstrap-5.3-7952B3?logo=bootstrap)](https://getbootstrap.com)
[![MariaDB](https://img.shields.io/badge/MariaDB-12-003545?logo=mariadb)](https://mariadb.org)

---

## 🌐 Aperçu

**Cave & Vigne** est une application web complète de gestion de cave personnelle. Elle permet de référencer ses bouteilles de vin et spiritueux, d'obtenir des recommandations d'accords mets/vins grâce à l'IA Claude (Anthropic), de visualiser ses vignobles sur des cartes interactives, et de scanner les étiquettes à la caméra pour importer automatiquement les informations.

### ✨ Fonctionnalités

| Fonctionnalité | Description |
|---|---|
| 🔐 **Authentification** | Inscription/connexion sécurisée, JWT access + refresh token, réinitialisation mot de passe |
| 🛡️ **2FA TOTP** | Double authentification (Google Authenticator, FreeOTP) |
| 🍷 **Cave à vins** | CRUD complet, quantités, position, prix, millésime, infos domaine, sélection multiple |
| 🥃 **Spiritueux** | Whisky, rhum, cognac, armagnac, calvados, gin, vodka — avec statut ouvert/fermé |
| 📸 **Photos bouteilles** | Photo étiquette + photo bouteille, infos domaine (site web, sol, altitude) |
| 🤖 **Sommelier IA multi-provider** | Accords mets/vins depuis la cave — Claude, ChatGPT, Mistral ou OpenWebUI/Ollama |
| 📷 **Scan d'étiquettes** | Caméra ou photo importée → IA Vision extrait les infos automatiquement |
| 📊 **Analyse IA de cave** | Score diversité/équilibre, points forts, occasion parfaite, axes d'amélioration |
| 🔍 **Enrichissement** | Import automatique depuis Open Food Facts |
| 🍽️ **Recettes associées** | Suggestions de recettes via TheMealDB |
| 📓 **Journal de dégustation** | Notes par bouteille (robe, nez, bouche, finale, note /100) |
| 💌 **Liste de souhaits** | Vins à acquérir avec priorité, budget max et lien boutique |
| 📤 **Export / Import CSV** | Cave exportable et importable (compatible Excel) |
| 🌍 **Carte mondiale** | Vignobles du monde avec vos bouteilles en surbrillance |
| 🇫🇷 **Carte France** | Régions viticoles françaises avec cépages, AOC et vos stocks |
| 🗺 **Carte spiritueux** | Origines mondiales de vos spiritueux |
| ⭐ **Accords notés** | Notation 5 étoiles des accords mets/vin avec commentaire |
| 🌐 **Catalogue public** | Mode visiteur sans authentification (configurable) |
| ⚙️ **Admin** | Gestion multi-provider IA, SMTP, catalogue public depuis l'UI |
| 📱 **PWA + App Android** | Installable sur mobile/desktop + WebView native (caméra, swipe-to-refresh) |

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Cloudflare CDN/WAF                │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│                  Nginx (reverse proxy)               │
│          SSL Let's Encrypt • Gzip • Cache           │
└──────────┬───────────────────────┬──────────────────┘
           │                       │
┌──────────▼──────────┐  ┌────────▼────────────────┐
│   React 19 + BS5    │  │  Node.js / Express API  │
│   Vite 6 (build)    │  │  Port 3001 (127.0.0.1)  │
└─────────────────────┘  └────────┬────────────────┘
                                  │
                    ┌─────────────┼──────────────┐
                    │             │              │
              ┌─────▼─────┐ ┌────▼────┐  ┌─────▼──────┐
              │  MariaDB  │ │  Redis  │  │  AI APIs   │
              │    12     │ │  :6379  │  │ (multi)    │
              └───────────┘ └─────────┘  └────────────┘
```

**Stack technique :**

| Couche | Technologie |
|--------|-------------|
| Frontend | React 19, Bootstrap 5, React Query v5, D3.js, Axios |
| Build | Vite 6 + @vitejs/plugin-react |
| Backend | Node.js 24, Express 4, JWT, Multer, Sharp 0.34 |
| Base de données | MariaDB 12 (mysql2 driver) |
| Cache | Redis 7 |
| IA | Claude, ChatGPT, Mistral, OpenWebUI/Ollama — Sommelier + Vision |
| Serveur web | Nginx |
| CDN/Sécurité | Cloudflare |
| Process manager | PM2 (cluster mode) |
| Mobile Android | Kotlin WebView + Swipe Refresh |

---

## 🚀 Démarrage rapide (développement local)

### Prérequis

- Node.js 24+
- MariaDB 12 (ou MySQL 8+)
- Redis (optionnel, dégrade gracieusement)
- Clé API IA : Anthropic, OpenAI, Mistral, ou instance OpenWebUI (configurable depuis l'UI admin)

### 1. Backend

```bash
cd backend
cp .env.example .env
# Éditer .env avec vos paramètres
npm install
npm run migrate    # Crée les tables
npm run dev        # Démarre en mode dev (nodemon, port 3001)
```

### 2. Frontend

```bash
cd frontend
# Créer .env.local
echo "REACT_APP_API_URL=http://localhost:3001/api" > .env.local
npm install
npm start          # Vite dev server → http://localhost:3000
```

### 3. Variables d'environnement requises

```env
# backend/.env
DB_HOST=localhost
DB_NAME=cave_vigne
DB_USER=cave_user
DB_PASSWORD=votre_mot_de_passe

JWT_SECRET=cle_secrete_64_caracteres_minimum

# Clé IA par défaut (remplacée par la config admin si renseignée en BDD)
ANTHROPIC_API_KEY=sk-ant-...     # Claude
# OPENAI_API_KEY=sk-...          # ChatGPT
# MISTRAL_API_KEY=...            # Mistral

# SMTP pour emails (reset mot de passe, notifications)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...

# Optionnel
REDIS_HOST=localhost
REDIS_PASSWORD=
```

---

## 📁 Structure du projet

```
cave-vigne/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── ai.js           # Abstraction multi-provider IA (callAI, callAIVision)
│   │   │   ├── db.js           # Pool MariaDB
│   │   │   ├── redis.js        # Cache Redis
│   │   │   ├── email.js        # Transport Nodemailer dynamique
│   │   │   └── migrate.js      # Migration BDD (tables + ALTER)
│   │   ├── jobs/
│   │   │   └── notifications.js # Cron quotidien keep_until + purge tokens
│   │   ├── middleware/
│   │   │   └── auth.js         # Vérification JWT + optionalAuth
│   │   ├── routes/
│   │   │   ├── auth.js         # Login, register, refresh, 2FA TOTP, reset password
│   │   │   ├── wines.js        # CRUD vins + accords + enrichissement + ai-enrich
│   │   │   ├── spirits.js      # CRUD spiritueux
│   │   │   ├── sommelier.js    # IA accord + scan + recettes TheMealDB
│   │   │   ├── tasting.js      # Journal de dégustation par bouteille
│   │   │   ├── wishlist.js     # Liste de souhaits
│   │   │   └── settings.js     # Config admin (IA, SMTP, catalogue)
│   │   └── server.js           # Point d'entrée Express
│   ├── ecosystem.config.js     # Config PM2
│   ├── .env.example
│   └── package.json
│
├── frontend/
│   ├── index.html              # Entrée Vite
│   ├── vite.config.js
│   ├── public/
│   │   ├── manifest.json       # PWA manifest
│   │   └── sw.js               # Service Worker (cache-first)
│   ├── src/
│   │   ├── components/
│   │   │   └── Layout.jsx      # Sidebar + Topbar responsive
│   │   ├── context/
│   │   │   └── AuthContext.jsx # Auth state global
│   │   ├── locales/
│   │   │   ├── fr.js           # Traductions françaises
│   │   │   └── en.js           # Traductions anglaises
│   │   ├── pages/
│   │   │   ├── Login.jsx       # + lien "Mot de passe oublié"
│   │   │   ├── Register.jsx
│   │   │   ├── ForgotPassword.jsx
│   │   │   ├── ResetPassword.jsx
│   │   │   ├── Dashboard.jsx   # Donut Chart.js + analyse IA cave
│   │   │   ├── WinesPage.jsx   # CRUD + dégustation + enrichissement IA/web + bulk ops
│   │   │   ├── SpiritsPage.jsx
│   │   │   ├── WishlistPage.jsx
│   │   │   ├── SommelierPage.jsx # + badge provider actif
│   │   │   ├── ScanPage.jsx    # + badge provider actif
│   │   │   ├── ProfilePage.jsx # Profil + 2FA
│   │   │   ├── AdminPage.jsx   # Admin : utilisateurs + paramètres IA multi-provider
│   │   │   ├── WorldMapPage.jsx
│   │   │   ├── FranceMapPage.jsx
│   │   │   └── SpiritsMapPage.jsx
│   │   ├── services/
│   │   │   └── api.js          # Axios + auto-refresh JWT
│   │   ├── App.jsx
│   │   ├── index.css
│   │   └── main.jsx            # + PWA service worker registration
│   └── package.json
│
├── android/                    # App Android native
│   └── app/src/main/
│       ├── java/com/cavevigne/
│       │   └── MainActivity.kt
│       └── AndroidManifest.xml
│
├── nginx/
│   └── cavevigne.fr.conf       # Config Nginx production
│
├── docs/
│   ├── DEPLOY.md               # Guide déploiement complet
│   └── GITHUB_META.md
│
├── deploy.sh                   # Script déploiement automatisé Debian 13
├── CHANGELOG.md
├── .gitignore
├── LICENSE
└── README.md
```

---

## 🌍 Déploiement production

### Script automatisé — Debian 13

Un script de déploiement complet est fourni pour **Debian 13 (Trixie)** :

```bash
# Sur le VPS, après avoir cloné le dépôt
sudo bash deploy.sh
```

Le script installe et configure **automatiquement** l'ensemble de la stack :

| Étape | Action |
|-------|--------|
| 1 | Mise à jour système + dépendances (`libvips`, `curl`, etc.) |
| 2 | Node.js 24 LTS + PM2 (cluster mode) |
| 3 | MariaDB 12 — création BDD, utilisateur, tuning InnoDB |
| 4 | Redis — sécurisé (bind 127.0.0.1, mot de passe) |
| 5 | Nginx — config copiée depuis `nginx/`, SSL Let's Encrypt |
| 6 | Backend + Frontend — copie, `.env` généré, migration BDD, build Vite |
| 7 | PM2 startup systemd |
| 8 | Certbot SSL + renouvellement automatique (cron 3h) |
| 9 | UFW — SSH + HTTPS ouverts, MariaDB/Redis/3001 bloqués |

> Le script génère automatiquement le `JWT_SECRET` et demande de manière interactive le domaine, l'email SSL, les mots de passe et la clé API Anthropic.

### Déploiement manuel

Voir le guide complet : **[docs/DEPLOY.md](./docs/DEPLOY.md)**

---

## 📱 Application Android

L'application Android est une WebView Kotlin qui encapsule l'application web avec :
- Accès caméra natif pour le scan d'étiquettes
- Swipe-to-refresh
- Gestion des permissions (caméra, stockage)
- Page d'erreur offline élégante

**Build** : Ouvrir `android/` dans Android Studio → Generate Signed APK

---

## 🔒 Sécurité

- Mots de passe hashés avec **bcrypt** (salt factor 12)
- **JWT** avec expiration courte (7j) + refresh token (30j)
- **2FA TOTP** compatible Google Authenticator, FreeOTP, Authy
- **Rate limiting** : 200 req/15min global, 20 req/15min sur auth
- **Helmet.js** — headers de sécurité HTTP
- **CORS** restreint aux origines autorisées
- **Cloudflare WAF** — protection SQLi, XSS, bots
- Uploads restreints aux images, optimisés via **Sharp** (WebP)
- Nginx : blocage des fichiers cachés, headers HSTS

---

## 🤝 Contribution

Les contributions sont les bienvenues ! Pour contribuer :

1. Forkez le dépôt
2. Créez une branche feature : `git checkout -b feature/ma-fonctionnalite`
3. Commitez vos changements : `git commit -m 'feat: ajouter ma fonctionnalité'`
4. Poussez la branche : `git push origin feature/ma-fonctionnalite`
5. Ouvrez une Pull Request

### Idées d'améliorations

- [ ] Application iOS (Swift WebView)
- [ ] Partage de cave entre utilisateurs (caves partagées)
- [ ] Recherche full-text améliorée (MariaDB FTS)

---

## 📄 Licence

Ce projet est sous licence **MIT** — voir [LICENSE](./LICENSE) pour les détails.

---

## 🙏 Crédits

- **Claude (Anthropic), ChatGPT (OpenAI), Mistral AI, OpenWebUI** — Sommelier IA, analyse d'étiquettes, enrichissement
- **D3.js** — Cartes interactives
- **Bootstrap 5** — Interface utilisateur
- **Chart.js** — Graphiques et statistiques
- **Open Food Facts** — Enrichissement des données vin
- **TheMealDB** — Suggestions de recettes associées

---

<p align="center">
  Fait avec ❤️ et 🍷 en Normandie
</p>
