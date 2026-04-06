// src/locales/fr.js
const fr = {
  common: {
    save: 'Enregistrer', cancel: 'Annuler', delete: 'Supprimer', edit: 'Modifier',
    add: 'Ajouter', search: 'Rechercher', loading: 'Chargement…', error: 'Erreur',
    yes: 'Oui', no: 'Non', confirm: 'Confirmer', back: 'Retour', close: 'Fermer',
    actions: 'Actions', status: 'Statut', type: 'Type', name: 'Nom', noData: 'Aucune donnée',
  },
  nav: {
    dashboard: 'Tableau de bord', wines: 'Ma cave', spirits: 'Spiritueux',
    sommelier: 'Sommelier IA', scan: 'Scanner', mapFrance: 'Carte France',
    mapWorld: 'Carte monde', mapSpirits: 'Origines', admin: 'Administration',
    discovery: 'Découverte', collection: 'Vins', privateCollection: 'Collection privée',
  },
  auth: {
    login: 'Connexion', register: 'Inscription', logout: 'Déconnexion',
    email: 'Email', password: 'Mot de passe', username: "Nom d'utilisateur",
    confirmPassword: 'Confirmer le mot de passe', loginBtn: 'Se connecter',
    registerBtn: 'Créer un compte', noAccount: 'Pas encore de compte ?',
    haveAccount: 'Déjà un compte ?', invalidCredentials: 'Identifiants invalides',
    passwordMismatch: 'Les mots de passe ne correspondent pas',
    passwordTooShort: '8 caractères minimum',
  },
  wines: {
    title: 'Ma cave à vins', add: 'Ajouter un vin', edit: 'Modifier le vin',
    search: 'Rechercher un vin…', empty: 'Aucun vin dans la cave',
    name: 'Nom du vin', appellation: 'Appellation', vintage: 'Millésime',
    producer: 'Producteur', region: 'Région', country: 'Pays', grapes: 'Cépages',
    quantity: 'Quantité', position: 'Position', price: 'Prix (€)',
    keepUntil: "Garder jusqu'en", notes: 'Notes de dégustation',
    label: 'Étiquette', status: 'Statut', isDrunk: 'Bue', inCave: 'En cave',
    markDrunk: 'Marquer comme bue', type: { rouge: 'Rouge', blanc: 'Blanc', rosé: 'Rosé', pétillant: 'Pétillant' },
    accords: 'Accords mets/vin', addAccord: 'Ajouter un accord', food: 'Plat',
    stars: 'Note', deleteConfirm: 'Supprimer ce vin ?',
  },
  spirits: {
    title: 'Collection de spiritueux', add: 'Ajouter un spiritueux', edit: 'Modifier',
    search: 'Rechercher…', empty: 'Aucun spiritueux',
    name: 'Nom', producer: 'Producteur', origin: 'Origine', age: 'Âge',
    abv: 'TAV (%)', rating: 'Note /100', quantity: 'Quantité', price: 'Prix (€)', notes: 'Notes',
    status: { stock: 'En stock', open: 'Ouvert', empty: 'Vide' },
    type: { whisky: 'Whisky', rhum: 'Rhum', cognac: 'Cognac', armagnac: 'Armagnac',
            calvados: 'Calvados', gin: 'Gin', vodka: 'Vodka', autre: 'Autre' },
    deleteConfirm: 'Supprimer ce spiritueux ?',
  },
  dashboard: {
    title: 'Tableau de bord', totalBottles: 'Bouteilles en cave',
    countries: 'Pays représentés', caveValue: 'Valeur estimée', avgRating: 'Note moyenne',
    recentWines: 'Vins récents', quickActions: 'Actions rapides',
    addWine: 'Ajouter un vin', addSpirit: 'Ajouter un spiritueux',
    scanLabel: 'Scanner une étiquette', askSommelier: 'Demander au sommelier',
  },
  sommelier: {
    title: 'Sommelier IA', placeholder: 'Décrivez votre plat ou posez une question…',
    ask: 'Demander', history: 'Historique', noHistory: 'Aucune session',
    caveMatch: 'Dans votre cave', suggestion: 'Suggestion IA',
  },
  scan: {
    title: "Scanner une étiquette", dropzone: 'Glissez une photo ou cliquez pour choisir',
    camera: 'Prendre une photo', analyzing: "Analyse en cours…", import: 'Importer ce vin',
  },
  admin: {
    title: 'Administration', users: 'Utilisateurs', createUser: 'Créer un utilisateur',
    editUser: "Modifier l'utilisateur", deactivate: 'Désactiver', activate: 'Activer',
    role: 'Rôle', lastLogin: 'Dernière connexion', createdAt: 'Créé le',
    active: 'Actif', inactive: 'Inactif', confirmDeactivate: 'Désactiver cet utilisateur ?',
    roles: { visiteur: 'Visiteur', user: 'Utilisateur', admin: 'Administrateur' },
    roleDesc: {
      visiteur: 'Peut consulter la cave, ne peut pas modifier',
      user: 'Gère sa propre cave',
      admin: 'Accès complet + gestion des utilisateurs',
    },
  },
  maps: {
    world: 'Carte mondiale des vignobles', france: 'Vignobles de France',
    spirits: 'Origines des spiritueux', bottles: 'bouteilles', noBottles: 'Aucune bouteille',
  },
  theme: { dark: 'Thème sombre', light: 'Thème clair', system: 'Système' },
  lang: { fr: 'Français', en: 'English' },
};

export default fr;
