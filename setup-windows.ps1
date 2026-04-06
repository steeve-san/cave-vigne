# ═══════════════════════════════════════════════════════════════
#  Cave & Vigne — Setup Windows (PowerShell)
#  Lance ce script en tant qu'Administrateur :
#  Clic droit sur PowerShell → "Exécuter en tant qu'administrateur"
#  Puis : Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
#         .\setup-windows.ps1
# ═══════════════════════════════════════════════════════════════

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════╗" -ForegroundColor DarkYellow
Write-Host "║   Cave & Vigne — Installation Windows            ║" -ForegroundColor DarkYellow
Write-Host "╚══════════════════════════════════════════════════╝" -ForegroundColor DarkYellow
Write-Host ""

# ── Vérifier si Winget est disponible ─────────────────────────
function Test-Command($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

# ── 1. Node.js 20 LTS ─────────────────────────────────────────
Write-Host "▶ Vérification Node.js..." -ForegroundColor Cyan
if (Test-Command "node") {
    $nodeVer = (node --version)
    Write-Host "  ✅ Node.js déjà installé : $nodeVer" -ForegroundColor Green
} else {
    Write-Host "  📦 Installation Node.js 20 LTS via winget..." -ForegroundColor Yellow
    winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    Write-Host "  ✅ Node.js installé" -ForegroundColor Green
}

# ── 2. Git ─────────────────────────────────────────────────────
Write-Host "▶ Vérification Git..." -ForegroundColor Cyan
if (Test-Command "git") {
    Write-Host "  ✅ Git déjà installé : $(git --version)" -ForegroundColor Green
} else {
    Write-Host "  📦 Installation Git..." -ForegroundColor Yellow
    winget install Git.Git --accept-package-agreements --accept-source-agreements
    Write-Host "  ✅ Git installé" -ForegroundColor Green
}

# ── 3. MariaDB ─────────────────────────────────────────────────
Write-Host "▶ Vérification MariaDB..." -ForegroundColor Cyan
if (Test-Command "mysql") {
    Write-Host "  ✅ MariaDB déjà installé" -ForegroundColor Green
} else {
    Write-Host "  📦 Installation MariaDB 11..." -ForegroundColor Yellow
    winget install MariaDB.Server --accept-package-agreements --accept-source-agreements
    Write-Host "  ✅ MariaDB installé" -ForegroundColor Green
    Write-Host "  ⚠️  Lancez 'mysql_secure_installation' pour sécuriser MariaDB" -ForegroundColor DarkYellow
}

# ── 4. Redis (via Memurai — port Redis pour Windows) ───────────
Write-Host "▶ Vérification Redis..." -ForegroundColor Cyan
$redisRunning = Get-Process -Name "redis-server" -ErrorAction SilentlyContinue
if ($redisRunning) {
    Write-Host "  ✅ Redis déjà actif" -ForegroundColor Green
} else {
    Write-Host "  📦 Installation Memurai (Redis pour Windows)..." -ForegroundColor Yellow
    winget install Memurai.Memurai --accept-package-agreements --accept-source-agreements
    Write-Host "  ✅ Memurai (Redis) installé" -ForegroundColor Green
}

# ── 5. VS Code ─────────────────────────────────────────────────
Write-Host "▶ Vérification VS Code..." -ForegroundColor Cyan
if (Test-Command "code") {
    Write-Host "  ✅ VS Code déjà installé" -ForegroundColor Green
} else {
    Write-Host "  📦 Installation VS Code..." -ForegroundColor Yellow
    winget install Microsoft.VisualStudioCode --accept-package-agreements --accept-source-agreements
    Write-Host "  ✅ VS Code installé" -ForegroundColor Green
}

# ── 6. Extensions VS Code recommandées ────────────────────────
Write-Host "▶ Installation extensions VS Code..." -ForegroundColor Cyan
$extensions = @(
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "formulahendry.auto-rename-tag",
    "christian-kohler.path-intellisense",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-node-azure-pack",
    "PKief.material-icon-theme",
    "GitHub.github-vscode-theme",
    "ms-vscode-remote.remote-wsl",
    "streetsidesoftware.code-spell-checker-french",
    "humao.rest-client",
    "ckolkman.vscode-postgres"
)
foreach ($ext in $extensions) {
    code --install-extension $ext --force 2>$null
    Write-Host "  ✅ $ext" -ForegroundColor Green
}

# ── 7. Setup du projet ─────────────────────────────────────────
Write-Host ""
Write-Host "▶ Configuration du projet Cave & Vigne..." -ForegroundColor Cyan

$projectDir = "$env:USERPROFILE\Projects\cave-vigne"
if (-not (Test-Path $projectDir)) {
    New-Item -ItemType Directory -Path $projectDir -Force | Out-Null
    Write-Host "  📁 Dossier créé : $projectDir" -ForegroundColor Green
}

# Copier les fichiers si le script est dans le dossier du projet
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ((Test-Path "$scriptDir\backend") -and (Test-Path "$scriptDir\frontend")) {
    Write-Host "  📦 Installation dépendances backend..." -ForegroundColor Yellow
    Set-Location "$scriptDir\backend"
    npm install
    
    Write-Host "  📦 Installation dépendances frontend..." -ForegroundColor Yellow
    Set-Location "$scriptDir\frontend"
    npm install
    
    Set-Location $scriptDir
}

# ── 8. Créer la BDD ────────────────────────────────────────────
Write-Host ""
Write-Host "▶ Création de la base de données..." -ForegroundColor Cyan
Write-Host "  Entrez le mot de passe root MariaDB (laissez vide si pas encore défini) :" -ForegroundColor Yellow
$dbPass = Read-Host -AsSecureString "  Mot de passe root"
$dbPassPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($dbPass))

$sqlCmd = @"
CREATE DATABASE IF NOT EXISTS cave_vigne CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'cave_user'@'localhost' IDENTIFIED BY 'CaveVigne2025!';
GRANT ALL PRIVILEGES ON cave_vigne.* TO 'cave_user'@'localhost';
FLUSH PRIVILEGES;
"@

if ($dbPassPlain -eq "") {
    $sqlCmd | mysql -u root 2>$null
} else {
    $sqlCmd | mysql -u root -p"$dbPassPlain" 2>$null
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✅ Base de données 'cave_vigne' créée" -ForegroundColor Green
    Write-Host "  👤 Utilisateur : cave_user / CaveVigne2025!" -ForegroundColor DarkYellow
    Write-Host "  ⚠️  Changez ce mot de passe dans backend\.env !" -ForegroundColor Red
} else {
    Write-Host "  ⚠️  Erreur BDD — créez-la manuellement (voir README)" -ForegroundColor DarkYellow
}

# ── 9. Créer .env backend ──────────────────────────────────────
$envPath = "$scriptDir\backend\.env"
if (-not (Test-Path $envPath)) {
    $jwtSecret = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 64 | ForEach-Object {[char]$_})
    $envContent = @"
NODE_ENV=development
PORT=3001
API_URL=http://localhost:3001

DB_HOST=localhost
DB_PORT=3306
DB_NAME=cave_vigne
DB_USER=cave_user
DB_PASSWORD=CaveVigne2025!

JWT_SECRET=$jwtSecret
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

ANTHROPIC_API_KEY=sk-ant-REMPLACEZ_PAR_VOTRE_CLE

UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760

ALLOWED_ORIGINS=http://localhost:3000
"@
    Set-Content -Path $envPath -Value $envContent -Encoding UTF8
    Write-Host "  ✅ Fichier backend\.env créé" -ForegroundColor Green
    Write-Host "  ⚠️  Ajoutez votre clé ANTHROPIC_API_KEY dans backend\.env !" -ForegroundColor Red
}

# ── 10. Créer .env.local frontend ─────────────────────────────
$frontEnvPath = "$scriptDir\frontend\.env.local"
if (-not (Test-Path $frontEnvPath)) {
    "REACT_APP_API_URL=http://localhost:3001/api" | Set-Content -Path $frontEnvPath -Encoding UTF8
    Write-Host "  ✅ Fichier frontend\.env.local créé" -ForegroundColor Green
}

# ── 11. Migration BDD ──────────────────────────────────────────
Write-Host ""
Write-Host "▶ Migration base de données..." -ForegroundColor Cyan
Set-Location "$scriptDir\backend"
node src/config/migrate.js
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✅ Tables créées" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  Vérifiez backend\.env et relancez : node src/config/migrate.js" -ForegroundColor DarkYellow
}

# ── Résumé ─────────────────────────────────────────────────────
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║   ✅ Installation terminée !                     ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "Pour démarrer le projet :" -ForegroundColor White
Write-Host "  1. Ouvrez VS Code : code ." -ForegroundColor Cyan
Write-Host "  2. Terminal 1 — Backend  : cd backend  && npm run dev" -ForegroundColor Cyan
Write-Host "  3. Terminal 2 — Frontend : cd frontend && npm start" -ForegroundColor Cyan
Write-Host "  4. Ouvrez : http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "N'oubliez pas d'ajouter votre clé Anthropic dans backend\.env" -ForegroundColor DarkYellow
Write-Host ""

Set-Location $scriptDir
