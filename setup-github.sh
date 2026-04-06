#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# setup-github.sh — Initialise le dépôt Git et pousse sur GitHub
#
# Usage :
#   chmod +x setup-github.sh
#   ./setup-github.sh VOTRE_USERNAME_GITHUB
#
# Prérequis :
#   - Git installé et configuré (git config user.name / user.email)
#   - GitHub CLI (gh) installé : https://cli.github.com/
#     OU un dépôt déjà créé manuellement sur GitHub
# ─────────────────────────────────────────────────────────────────

set -e

GITHUB_USER="${1:-VOTRE_USERNAME}"
REPO_NAME="cave-vigne"
REPO_DESC="🍷 Gestionnaire de cave à vin & spiritueux — Sommelier IA, scan d'étiquettes, cartes interactives. React 18 + Node.js + MariaDB + Cloudflare."

echo "╔══════════════════════════════════════════╗"
echo "║     Cave & Vigne — Setup GitHub          ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── 1. Initialiser Git ─────────────────────────────────────────
echo "▶ Initialisation Git..."
git init
git checkout -b main

# ── 2. Premier commit ──────────────────────────────────────────
echo "▶ Ajout des fichiers..."
git add .
git commit -m "feat: initial commit — Cave & Vigne v1.0.0

- Authentification JWT (register, login, refresh)
- CRUD cave à vins + spiritueux
- Sommelier IA via Claude (Anthropic)
- Scan étiquettes par vision artificielle
- Cartes interactives D3.js (France + Monde)
- App Android WebView (Kotlin)
- Config Nginx + Cloudflare production
- Guide déploiement complet"

# ── 3. Créer le dépôt GitHub (via GitHub CLI) ──────────────────
if command -v gh &> /dev/null; then
  echo "▶ Création du dépôt GitHub avec gh CLI..."
  gh repo create "$REPO_NAME" \
    --public \
    --description "$REPO_DESC" \
    --homepage "https://cavevigne.fr" \
    --source . \
    --remote origin \
    --push
  
  echo "▶ Ajout des topics..."
  gh repo edit "$GITHUB_USER/$REPO_NAME" \
    --add-topic wine,cellar,spirits,react,nodejs,mariadb,redis,bootstrap,nginx,cloudflare,ai,claude-api,d3js,android,kotlin,jwt,fullstack
else
  # ── Manuel si gh CLI non disponible ──────────────────────────
  echo ""
  echo "⚠️  GitHub CLI non détecté."
  echo ""
  echo "Créez manuellement le dépôt sur https://github.com/new"
  echo "  Nom : $REPO_NAME"
  echo "  Description : $REPO_DESC"
  echo "  Visibilité : Public"
  echo "  ⛔ Ne cochez PAS 'Initialize repository'"
  echo ""
  echo "Puis exécutez :"
  echo "  git remote add origin https://github.com/$GITHUB_USER/$REPO_NAME.git"
  echo "  git push -u origin main"
  echo ""
  read -p "Appuyez sur Entrée une fois le dépôt créé pour continuer..." 

  git remote add origin "https://github.com/$GITHUB_USER/$REPO_NAME.git"
  git push -u origin main
fi

# ── 4. Résumé ──────────────────────────────────────────────────
echo ""
echo "✅ Dépôt publié !"
echo ""
echo "🔗 URL : https://github.com/$GITHUB_USER/$REPO_NAME"
echo ""
echo "Prochaines étapes recommandées sur GitHub :"
echo "  1. Settings → About → Ajouter les topics manuellement si nécessaire"
echo "  2. Settings → Branches → Protéger la branche 'main'"
echo "  3. Settings → Secrets → Ajouter ANTHROPIC_API_KEY pour CI"
echo "  4. Activer GitHub Pages sur /docs si souhaité"
echo ""
