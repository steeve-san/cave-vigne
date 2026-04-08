# 🍷 Cave & Vigne — Guide Windows & VS Code

## Démarrage rapide

**Option 1 — Script automatique (recommandé)**
```powershell
# 1. Clic droit sur PowerShell → "Exécuter en tant qu'administrateur"
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
.\setup-windows.ps1
```

**Option 2 — Manuel** : suivez les étapes ci-dessous.

**Option 3 — Lancement quotidien** : double-cliquez sur `start.bat`

---

## Installation manuelle étape par étape

### 1. Logiciels requis

| Logiciel | Version | Téléchargement |
|----------|---------|----------------|
| **Node.js** | 24 LTS | https://nodejs.org/fr/ |
| **Git** | Dernier | https://git-scm.com/download/win |
| **MariaDB** | 12+ | https://mariadb.org/download/ |
| **Redis** (Memurai) | Dernier | https://www.memurai.com/get-memurai |
| **VS Code** | Dernier | https://code.visualstudio.com/ |

> **💡 Astuce** — Si vous avez `winget`, installez tout en une ligne :
> ```powershell
> winget install OpenJS.NodeJS.LTS Git.Git MariaDB.Server Memurai.Memurai Microsoft.VisualStudioCode
> ```

---

### 2. Cloner le projet

Ouvrez **Git Bash** ou **PowerShell** :
```bash
git clone https://github.com/VOTRE_USERNAME/cave-vigne.git
cd cave-vigne
code cave-vigne.code-workspace   # Ouvre VS Code avec le workspace
```

---

### 3. Configurer la base de données MariaDB

Dans le menu Démarrer, cherchez **"MySQL Client"** ou ouvrez un terminal :
```sql
-- Connectez-vous en root
mysql -u root -p

-- Créez la base et l'utilisateur
CREATE DATABASE cave_vigne CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'cave_user'@'localhost' IDENTIFIED BY 'VotreMotDePasse!';
GRANT ALL PRIVILEGES ON cave_vigne.* TO 'cave_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

---

### 4. Configurer les variables d'environnement

Créez `backend\.env` (copiez depuis `backend\.env.example`) :
```env
NODE_ENV=development
PORT=3001

DB_HOST=localhost
DB_PORT=3306
DB_NAME=cave_vigne
DB_USER=cave_user
DB_PASSWORD=VotreMotDePasse!

JWT_SECRET=GenerezUneLongueCleAleatoire64Caracteres
JWT_EXPIRES_IN=7d

ANTHROPIC_API_KEY=sk-ant-VOTRE_CLE_ICI

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

ALLOWED_ORIGINS=http://localhost:3000
UPLOAD_DIR=./uploads
```

Créez `frontend\.env.local` :
```env
REACT_APP_API_URL=http://localhost:3001/api
```

> **🔑 Clé Anthropic** : Créez votre compte sur https://console.anthropic.com
> et générez une clé API. Le Sommelier IA et le scan ne fonctionneront pas sans.

---

### 5. Installer les dépendances

Dans VS Code, ouvrez un terminal (`Ctrl+ù` ou `Ctrl+backtick`) :
```bash
# Backend
cd backend
npm install

# Frontend (nouveau terminal)
cd frontend
npm install
```

---

### 6. Migration base de données

```bash
cd backend
node src/config/migrate.js
# → ✅ Migration terminée avec succès
```

---

### 7. Lancer le projet

**Méthode A — Via VS Code Tasks** (recommandé)

`Ctrl+Shift+P` → `Tasks: Run Task` → `🚀 Démarrer tout`

**Méthode B — Terminaux séparés**

Terminal 1 (Backend) :
```bash
cd backend
npm run dev
# → ✅ API Cave & Vigne sur http://127.0.0.1:3001
```

Terminal 2 (Frontend) :
```bash
cd frontend
npm start
# → Compiled successfully!
# → http://localhost:3000
```

**Méthode C — Double-clic** sur `start.bat`

---

### 8. Accéder à l'application

Ouvrez votre navigateur sur **http://localhost:3000**

---

## 🐛 Débogage dans VS Code

Le fichier `api-tests.http` permet de tester toutes les routes API :

1. Installez l'extension **REST Client** (`humao.rest-client`)
2. Ouvrez `api-tests.http`
3. Cliquez **"Send Request"** au-dessus de chaque requête
4. Copiez le token JWT du login dans `@token` en haut du fichier

Pour déboguer le backend Node.js :
- `F5` ou menu **Run → Start Debugging** → **🐛 Debug Backend**
- Posez des breakpoints en cliquant dans la marge gauche

---

## ⚠️ Problèmes fréquents Windows

### `npm install` échoue sur `sharp`
```powershell
# Installer les outils de build Windows
npm install --global windows-build-tools
# OU
winget install Microsoft.VisualStudio.2022.BuildTools
```

### MariaDB : `ECONNREFUSED`
```powershell
# Vérifier que le service tourne
Get-Service -Name MySQL*
# Démarrer si arrêté
Start-Service -Name "MariaDB"
```

### Redis non disponible
L'application fonctionne **sans Redis** (cache désactivé automatiquement).
Memurai (Redis pour Windows) est optionnel en développement.

### Port 3000 déjà utilisé
```bash
# Changer le port React
set PORT=3001 && npm start     # Windows cmd
$env:PORT=3002; npm start      # PowerShell
```

### Erreur `CRLF` / fin de ligne
```bash
git config --global core.autocrlf false
```

---

## 📁 Structure des terminaux VS Code recommandée

```
┌─────────────────────────────────────────────┐
│  Terminal 1 : Backend  (npm run dev)        │
│  Terminal 2 : Frontend (npm start)          │
│  Terminal 3 : Git / commandes générales     │
└─────────────────────────────────────────────┘
```

Divisez le terminal VS Code : icône "+" → "Split Terminal"

---

## 🔧 Extensions VS Code installées automatiquement

| Extension | Utilité |
|-----------|---------|
| ESLint | Vérification code JS |
| Prettier | Formatage automatique |
| REST Client | Tester l'API depuis VS Code |
| GitLens | Historique Git avancé |
| Material Icons | Icônes fichiers |
| Auto Rename Tag | HTML/JSX |
| Path Intellisense | Autocomplétion chemins |
| Better Comments | Commentaires colorés |
| Kotlin | Support Android |
| Git Graph | Visualiser l'historique |

---

## 🆕 Scripts utiles (v1.6+)

```bash
# Import cache local code-barres Open Food Facts (⚠ 3 Go téléchargement)
cd backend
npm run import:off             # Télécharge + importe le dump JSONL

# Lookup barcode unitaire (sans télécharger le dump)
node src/jobs/importOpenFoodFacts.js --ean 3760076020079

# Re-télécharger le dump
npm run import:off:refresh
```

> Sans import, le lookup temps-réel fonctionne automatiquement :  
> OFF API → Vivino → Oeni → Liv-ex → cache BDD local.
