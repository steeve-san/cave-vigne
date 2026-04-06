# Politique de sécurité

## Versions supportées

| Version | Support sécurité |
|---------|-----------------|
| 1.x.x   | ✅ Oui          |

## Signaler une vulnérabilité

**Ne créez pas d'Issue publique pour les failles de sécurité.**

Envoyez un email à : `security@cavevigne.fr` (ou via GitHub Private Vulnerability Reporting)

Incluez :
- Description de la vulnérabilité
- Étapes pour la reproduire
- Impact potentiel
- Suggestions de correction (optionnel)

Nous vous répondrons sous **48h** et publierons un correctif sous **7 jours** pour les failles critiques.

## Bonnes pratiques de déploiement

- Ne commitez jamais votre `.env`
- Changez tous les secrets d'exemple avant la mise en production
- Gardez vos dépendances à jour (`npm audit`)
- Activez le WAF Cloudflare
- Limitez l'accès SSH par IP si possible
