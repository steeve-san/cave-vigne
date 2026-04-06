# Guide de contribution

Merci de votre intérêt pour Cave & Vigne ! 🍷

## Avant de commencer

1. Vérifiez les [Issues](https://github.com/VOTRE_USERNAME/cave-vigne/issues) existantes
2. Pour une nouvelle fonctionnalité, ouvrez d'abord une Issue pour en discuter
3. Respectez le style de code existant (ESLint + Prettier recommandés)

## Workflow

```bash
# 1. Forker le repo sur GitHub

# 2. Cloner votre fork
git clone https://github.com/VOTRE_USERNAME/cave-vigne.git
cd cave-vigne

# 3. Configurer le remote upstream
git remote add upstream https://github.com/OWNER/cave-vigne.git

# 4. Créer une branche descriptive
git checkout -b feature/scan-barcode
# ou
git checkout -b fix/sommelier-timeout

# 5. Coder, tester, commiter (convention Conventional Commits)
git commit -m "feat(scan): ajouter support code-barres EAN-13"
git commit -m "fix(sommelier): augmenter timeout Claude API à 30s"

# 6. Pousser et ouvrir une Pull Request
git push origin feature/scan-barcode
```

## Convention de commits

Préfixes : `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

```
feat(wines): ajouter filtre par millésime
fix(auth): corriger la rotation des refresh tokens
docs(deploy): mettre à jour guide Redis sur Ubuntu 24
```

## Tests avant PR

```bash
# Backend : vérifier que le serveur démarre sans erreur
cd backend && npm start

# Frontend : vérifier que le build passe
cd frontend && npm run build

# Vérifier que la migration tourne sans erreur sur une BDD vide
cd backend && npm run migrate
```

## Code de conduite

- Soyez respectueux et constructif
- Privilégiez la clarté du code à la concision excessive
- Documentez les fonctions complexes
- Ne commitez jamais de secrets ou fichiers `.env`

Merci ! 🙏
