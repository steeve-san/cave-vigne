@echo off
:: ═══════════════════════════════════════════════════════════
::  Cave & Vigne — Démarrage rapide Windows
::  Double-cliquez sur ce fichier pour lancer l'application
:: ═══════════════════════════════════════════════════════════

title Cave ^& Vigne — Launcher
color 06

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║      Cave ^& Vigne — Démarrage           ║
echo  ╚══════════════════════════════════════════╝
echo.

:: Vérifier Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERREUR] Node.js non trouvé !
    echo  Lancez d'abord : setup-windows.ps1
    pause
    exit /b 1
)

:: Vérifier que les .env existent
if not exist "backend\.env" (
    echo  [ERREUR] backend\.env manquant !
    echo  Lancez d'abord : setup-windows.ps1
    pause
    exit /b 1
)

echo  Démarrage du backend (port 3001)...
start "Cave ^& Vigne — Backend" cmd /k "cd /d %~dp0backend && echo  Backend Cave ^& Vigne && npm run dev"

:: Attendre 3 secondes que le backend démarre
timeout /t 3 /nobreak >nul

echo  Démarrage du frontend (port 3000)...
start "Cave ^& Vigne — Frontend" cmd /k "cd /d %~dp0frontend && echo  Frontend Cave ^& Vigne && npm start"

:: Attendre 5 secondes puis ouvrir le navigateur
echo  Ouverture du navigateur dans 6 secondes...
timeout /t 6 /nobreak >nul
start "" "http://localhost:3000"

echo.
echo  ✅ Cave ^& Vigne est lancé !
echo     Backend  : http://localhost:3001
echo     Frontend : http://localhost:3000
echo.
echo  Fermez les deux fenêtres de terminal pour arrêter.
echo.
pause
