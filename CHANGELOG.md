# Changelog

Toutes les modifications notables de ce projet sont documentées dans ce fichier.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

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
- 📖 Guide déploiement complet (VPS Ubuntu 22.04 + MariaDB + Redis + PM2)

---

## À venir

- [ ] Import/export CSV
- [ ] Notifications keep_until
- [ ] App iOS
- [ ] Mode hors-ligne (Service Worker)
- [ ] Partage de cave multi-utilisateurs
- [ ] Graphiques statistiques avancés
