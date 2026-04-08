# Changelog

Toutes les modifications notables de ce projet sont documentées dans ce fichier.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

---

## [1.5.0] — 2026-04-08

### Ajouté

- 🏚️ **Caves partagées** — invitations par email, acceptation par lien/token, lecture seule, gestion des accès (révoquer, quitter) ; nouvelle page dédiée dans la sidebar
- 📈 **Historique valeur cave** — snapshot quotidien à minuit, graphique ligne (Chart.js) sur le tableau de bord (90 jours)
- ⏳ **Tracker de maturité** — widget dashboard classifiant vos vins en 4 catégories : passé l'apogée, à l'apogée, approche, trop jeune (basé sur `keep_until`)
- 🔴 **Badge "dernière bouteille"** — alerte visuelle rouge quand `quantity === 1` dans la liste des vins
- 📦 **Scanner code-barres EAN** — bouton dans la cave, saisie du code EAN 8–14 chiffres → Open Food Facts pré-remplit les champs du formulaire
- 📄 **Export PDF** — impression de la liste des vins visible avec `window.print()` (tableau stylisé)
- 🌙 **Sommelier "Que boire ce soir ?"** — nouvel onglet dans la page Sommelier : décrivez l'occasion, les convives, l'envie → l'IA choisit depuis votre cave (chips de suggestions incluses)
- 🔎 **Région spotlight IA** — bouton "Analyse IA" sur la carte France → résumé IA de la région (terroir, cépages, garde, accord idéal, anecdote) + vos bouteilles en cave pour cette région
- 🍎 **App iOS** — application SwiftUI (WKWebView) miroir de l'app Android : caméra, swipe-back, gestion hors-ligne, permissions caméra, user-agent personnalisé ; fichiers dans `ios/`

### Backend
- Nouveau module `backend/src/routes/sharing.js` — `GET /api/sharing`, `POST /invite`, `GET /accept/:token`, `DELETE /:id`, `GET /cave/:ownerId`
- Nouvelle table SQL `shared_caves` — invitations avec token, permission, statut accepté
- Nouvelle table SQL `cave_value_history` — snapshot quotidien valeur/bouteilles/références par utilisateur
- `GET /api/wines/barcode/:ean` — lookup produit via Open Food Facts par code EAN
- `GET /api/wines/value-history` — 90 derniers jours de snapshots
- `POST /api/sommelier/recommend` — recommandation "ce soir" avec occasion/convives/humeur
- `POST /api/sommelier/region-spotlight` — résumé IA + vos vins d'une région viticole
- Cron minuit `0 0 * * *` → `snapshotCaveValues()` dans `notifications.js`

### Frontend
- Nouvelles pages : `SharedCavesPage` — invitation, acceptation, visualisation cave partagée
- `Dashboard` : `import { Line }` chart.js, `valueHistory` query, aging tracker widget
- `WinesPage` : `BarcodeModal`, `printWinesPDF()`, badge "dernière", boutons barre d'outils
- `SommelierPage` : onglets "Accord" / "Que boire ce soir ?", `tonightMut`
- `FranceMapPage` : `spotlightMut`, bouton "Analyse IA" par région, panneau résultat
- `App.jsx` : route `/sharing`
- `Layout.jsx` : lien sidebar "Caves partagées"
- `api.js` : `winesAPI.barcode`, `winesAPI.valueHistory`, `sommelierAPI.recommend`, `sommelierAPI.regionSpotlight`, `sharingAPI`
- `ios/` : app SwiftUI complète avec `CaveVigneApp.swift`, `ContentView.swift`, `WebView.swift`, `ErrorView.swift`, `Info.plist`, `README.md`

---

## [1.4.0] — 2026-04-07

### Ajouté

- 🤖 **Multi-fournisseurs IA** — support Claude (Anthropic), ChatGPT (OpenAI), Mistral AI et OpenWebUI/Ollama ; sélectionnable depuis l'interface admin sans redémarrage
- ⚙️ **Panneau IA admin** — configuration dynamique par provider (clé API, modèle, URL OpenWebUI)
- 🏷️ **Badge provider actif** — indicateur du fournisseur IA courant dans SommelierPage et ScanPage
- 🔍 **Enrichissement IA** — `POST /api/wines/:id/ai-enrich` : après ajout manuel d'un vin, l'IA complète les champs vides (région, cépages, sol, keep_until, notes, accords) avec un panneau de sélection par case à cocher

### Backend
- Nouveau module `backend/src/config/ai.js` — abstraction multi-provider (`callAI`, `callAIVision`, `checkAIAvailable`)
- `GET /api/sommelier/providers` — liste les providers disponibles avec leur statut de configuration
- 9 nouveaux paramètres `system_settings` : `ai_provider`, `anthropic_model`, `openai_key`, `openai_model`, `mistral_key`, `mistral_model`, `openwebui_url`, `openwebui_key`, `openwebui_model`
- Vision : Anthropic et OpenAI GPT-4o natifs ; Mistral/OpenWebUI avec fallback texte

---

## [1.3.0] — 2026-04-07

### Ajouté

- 🌊 **Journal de dégustation** — notes par bouteille (robe, nez, bouche, finale, note /100), onglet dédié dans le modal vin
- 💌 **Liste de souhaits** — wishlist de vins à acquérir avec priorité, budget max, URL boutique
- 📤 **Export / Import CSV** — cave exportable et importable via `.csv` (compatible Excel)
- 🔑 **Réinitialisation mot de passe par email** — lien valide 2h, révocation automatique des tokens
- 📊 **Graphique Chart.js** — donut interactif de répartition par type sur le tableau de bord
- 🤖 **Rapport d'analyse IA** — score diversité/équilibre, points forts, axes d'amélioration, occasion parfaite (widget dashboard)
- 🔔 **Notifications keep_until** — cron quotidien (08h00) envoyant un email pour les vins approchant leur apogée
- ✅ **Sélection multiple** — cases à cocher pour marquer plusieurs vins bus ou les supprimer en lot
- 📱 **PWA** — manifest + service worker, installable sur mobile/desktop
- 🗺️ **Navigation** — lien "Liste de souhaits" dans la sidebar
- 🔤 **i18n** — tous les derniers strings hardcodés en français remplacés par `t()` (`'Au revoir !'`, `'Spiritueux'`, `'Lecture seule'`)

### Backend
- Nouveaux endpoints : `GET /api/wines/export`, `POST /api/wines/import`, `GET|POST|PUT|DELETE /api/tasting/*`, `GET|POST|PUT|DELETE /api/wishlist`, `POST /api/sommelier/analyse`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`
- Nouvelles tables SQL : `password_resets`, `tasting_notes`, `wishlist`
- `node-cron ^3.0.3` ajouté pour les notifications planifiées

### Frontend
- `chart.js ^4.4`, `react-chartjs-2 ^5.2` ajoutés
- Nouvelles pages : `ForgotPassword`, `ResetPassword`, `WishlistPage`

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

- [ ] Recherche full-text avancée (facets, ElasticSearch)
- [ ] App iOS — distribution App Store (compte Developer requis)
- [ ] Caves partagées en écriture collaborative
