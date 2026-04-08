# Cave & Vigne — iOS App

Application iOS native (SwiftUI + WKWebView), miroir de l'app Android.

## Prérequis

- **Xcode 15+** (macOS uniquement)
- **iOS 16+** minimum deployment target
- **Compte Apple Developer** pour distribuer hors TestFlight

## Structure

```
ios/CaveVigne/
├── CaveVigneApp.swift   # App entry point (@main)
├── ContentView.swift    # Vue principale + pull-to-refresh + loading state
├── WebView.swift        # WKWebView SwiftUI wrapper + navigation delegate
├── ErrorView.swift      # Écran hors-ligne
└── Info.plist           # Permissions caméra, ATS, orientations
```

## Créer le projet Xcode

1. Ouvrir **Xcode → File → New → Project**
2. Choisir **iOS → App**
3. Paramètres :
   - **Product Name** : `CaveVigne`
   - **Bundle Identifier** : `fr.cavevigne.app`
   - **Interface** : SwiftUI
   - **Language** : Swift
   - **Minimum Deployments** : iOS 16.0
4. Sauvegarder dans ce dossier `ios/`
5. **Remplacer** les fichiers générés par ceux du dépôt (`CaveVigneApp.swift`, `ContentView.swift`, `WebView.swift`, `ErrorView.swift`)
6. Remplacer `Info.plist` par le fichier du dépôt

## Changer l'URL de l'application

Modifier la constante `APP_URL` dans [ContentView.swift](CaveVigne/ContentView.swift) :

```swift
private let APP_URL = URL(string: "https://votre-domaine.fr")!
```

## Build & Distribution

### TestFlight
1. **Product → Archive**
2. **Distribute App → TestFlight & App Store**
3. Upload via Xcode Organizer

### Développement local
1. Connecter un iPhone en USB
2. Sélectionner votre device comme target
3. **Product → Run** (nécessite un certificat de développement valide)

## Fonctionnalités natives

| Fonctionnalité | Statut |
|---|---|
| Scan étiquette (caméra) | ✅ Permission gérée |
| Import photo galerie | ✅ |
| Navigation retour (swipe) | ✅ |
| Rotation portrait/paysage | ✅ |
| Écran hors-ligne | ✅ |
| User-agent personnalisé | ✅ `CaveVigneApp/1.5 iOS` |
| Liens externes → Safari | ✅ |

## Icône & Splash Screen

- Ajouter les icônes dans `Assets.xcassets/AppIcon`
- Format requis : voir [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/app-icons)
- Taille minimale recommandée : 1024×1024 px (Xcode génère les autres tailles automatiquement)
