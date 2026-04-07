# Changelog

Toutes les modifications notables de ce projet sont documentées dans ce fichier.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

---

## [1.2.0] — 2026-04-07

### Stack

- **Node.js** 20 → **24** (LTS) — mise à jour `engines.node`
- **React** 18 → **19.2** — APIs modernes, suppression des dépréciations
- **MariaDB** 11 → **12** — compatibilité `mysql2` driver
- **Build frontend** : migration **CRA (react-scripts)** → **Vite 6** + `@vitejs/plugin-react`
  - Nouveau `frontend/vite.config.js` — proxy `/api`, `envPrefix: 'REACT_APP_'`, `outDir: build`
  - Nouveau `frontend/index.html` (entrée Vite à la racine du projet frontend)
  - `process.env.REACT_APP_*` → `import.meta.env.REACT_APP_*` dans `api.js`, `WinesPage`, `SpiritsPage`
- **Sharp** 0.33 → **0.34** — bindings natifs Node 24
- **mysql2** → 3.14 — compatibilité MariaDB 12

---

## [1.1.0] — 2026-04-07

### Ajouté

- 🛡️ **2FA TOTP** — double authentification (Google Authenticator, FreeOTP, Authy)
  - Endpoints : `POST /auth/totp/setup`, `/confirm`, `/disable`, `GET /status`
  - Page Profil avec QR code, saisie du code, désactivation par mot de passe
- 📸 **Photo bouteille** — second champ photo (`bottle_photo`) pour vins et spiritueux
- 🏡 **Infos domaine** — champs `domain_website`, `domain_description`, `soil_type`, `altitude`
  - Modales avec onglets : Vin / Domaine / Photos (Vins) et Spirit / Distillerie / Photos (Spiritueux)
- 🔍 **Enrichissement Open Food Facts** — `GET /wines/:id/enrich` importe les données depuis la base ouverte
- 🍽️ **Recettes associées** — `GET /sommelier/recipes?food=...` via TheMealDB (gratuit, sans clé)
- 🌐 **Catalogue public** — `optionalAuth` sur `GET /wines` et `GET /spirits` ; accès visiteur si `public_catalog=1`
- ⚙️ **Paramètres admin** (UI + API `/api/settings`)
  - Clé API Anthropic configurable à chaud sans redémarrage
  - Configuration SMTP complète (host, port, user, password, from, TLS) avec test d'envoi
  - Toggle catalogue public
- 👤 **Page Profil** — informations utilisateur, badge rôle, gestion 2FA
- 📧 **Nodemailer** — transport email dynamique depuis `system_settings` (BDD)
- 🔑 **optionalAuth middleware** — laisse passer les requêtes sans token (utilisé sur lecture publique)

### Corrigé

- 🇫🇷 **Carte France** — refonte complète : coordonnées géographiques réelles (lon/lat) projetées dynamiquement par D3 (plus de cx/cy hardcodés) ; source GeoJSON `france-geojson` (métropole uniquement)
- ✦ **Sommelier** — expose le message d'erreur réel (401 API, clé absente, etc.) au lieu d'un 500 générique
- 📷 **Scan étiquette** — idem, message d'erreur détaillé (avec hint `npm rebuild sharp` si pertinent)

### Modifié

- Toutes les chaînes UI externalisées dans `fr.js` / `en.js` (i18n complet via `useLang`/`t()`)
- `spirits API` envoie désormais `multipart/form-data` pour supporter les uploads photos
- `migrate.js` : `ADD COLUMN IF NOT EXISTS` pour toutes les nouvelles colonnes (upgrades en place)
- `backend/package.json` : ajout `nodemailer`, `qrcode`, `speakeasy`

---

## [1.0.0] — 2025-04-06

### Ajouté

- 🔐 Authentification complète (register, login, JWT refresh token, logout)
- 🍷 Gestion de cave à vins — CRUD complet, quantités, position, prix, millésime
- 🥃 Collection spiritueux — whisky, rhum, cognac, armagnac, calvados, gin, vodka
- ✦ Sommelier IA — recommandations d'accords mets/vins via Claude, priorisés depuis la cave
- 📸 Scanner d'étiquettes — caméra ou photo importée, analyse par Claude Vision
- ⭐ Accords mets/vins notés 1–5 étoiles avec commentaire
- 🌍 Carte mondiale interactive D3.js — vignobles avec surbrillance cave
- 🇫🇷 Carte France interactive — régions viticoles, cépages, AOC
- 🗺 Carte origines des spiritueux
- 📊 Tableau de bord — stats, valeur de cave, régions, types
- 💾 Cache Redis — requêtes API et résultats sommelier
- 📱 Application Android — WebView Kotlin, caméra, swipe-to-refresh
- 🔒 Sécurité — Helmet, CORS, rate limiting, bcrypt salt 12
- ⚙️ Config Nginx production — Cloudflare, SSL, headers sécurité, gzip
- 📖 Guide déploiement complet (VPS Debian 13 + MariaDB + Redis + PM2)

---

## À venir

- [ ] Import/export CSV de la cave
- [ ] Notifications keep_until (rappel garder jusqu'à)
- [ ] Application iOS (Swift WebView)
- [ ] Mode hors-ligne avec Service Worker / PWA
- [ ] Partage de cave entre utilisateurs
- [ ] Graphiques statistiques avancés (Chart.js)
- [ ] Mode dégustation (fiche de dégustation complète)
- [ ] Recherche full-text (MariaDB FTS)
