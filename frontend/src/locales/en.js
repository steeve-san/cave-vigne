// src/locales/en.js
const en = {
  common: {
    save: 'Save', cancel: 'Cancel', delete: 'Delete', edit: 'Edit',
    add: 'Add', search: 'Search', loading: 'Loading…', error: 'Error',
    yes: 'Yes', no: 'No', confirm: 'Confirm', back: 'Back', close: 'Close',
    actions: 'Actions', status: 'Status', type: 'Type', name: 'Name', noData: 'No data',
  },
  nav: {
    dashboard: 'Dashboard', wines: 'My cellar', spirits: 'Spirits',
    sommelier: 'AI Sommelier', scan: 'Scan', mapFrance: 'France map',
    mapWorld: 'World map', mapSpirits: 'Origins', admin: 'Administration',
    discovery: 'Discovery', collection: 'Wines', privateCollection: 'Private collection',
  },
  auth: {
    login: 'Login', register: 'Register', logout: 'Logout',
    email: 'Email', password: 'Password', username: 'Username',
    confirmPassword: 'Confirm password', loginBtn: 'Sign in',
    registerBtn: 'Create account', noAccount: 'No account yet?',
    haveAccount: 'Already have an account?', invalidCredentials: 'Invalid credentials',
    passwordMismatch: 'Passwords do not match',
    passwordTooShort: '8 characters minimum',
  },
  wines: {
    title: 'My wine cellar', add: 'Add a wine', edit: 'Edit wine',
    search: 'Search a wine…', empty: 'No wines in cellar',
    name: 'Wine name', appellation: 'Appellation', vintage: 'Vintage',
    producer: 'Producer', region: 'Region', country: 'Country', grapes: 'Grapes',
    quantity: 'Quantity', position: 'Position', price: 'Price (€)',
    keepUntil: 'Keep until', notes: 'Tasting notes',
    label: 'Label', status: 'Status', isDrunk: 'Consumed', inCave: 'In cellar',
    markDrunk: 'Mark as consumed', type: { rouge: 'Red', blanc: 'White', rosé: 'Rosé', pétillant: 'Sparkling' },
    accords: 'Food pairings', addAccord: 'Add a pairing', food: 'Dish',
    stars: 'Rating', deleteConfirm: 'Delete this wine?',
  },
  spirits: {
    title: 'Spirits collection', add: 'Add a spirit', edit: 'Edit',
    search: 'Search…', empty: 'No spirits',
    name: 'Name', producer: 'Producer', origin: 'Origin', age: 'Age',
    abv: 'ABV (%)', rating: 'Rating /100', quantity: 'Quantity', price: 'Price (€)', notes: 'Notes',
    status: { stock: 'In stock', open: 'Open', empty: 'Empty' },
    type: { whisky: 'Whisky', rhum: 'Rum', cognac: 'Cognac', armagnac: 'Armagnac',
            calvados: 'Calvados', gin: 'Gin', vodka: 'Vodka', autre: 'Other' },
    deleteConfirm: 'Delete this spirit?',
  },
  dashboard: {
    title: 'Dashboard', totalBottles: 'Bottles in cellar',
    countries: 'Countries represented', caveValue: 'Estimated value', avgRating: 'Average rating',
    recentWines: 'Recent wines', quickActions: 'Quick actions',
    addWine: 'Add a wine', addSpirit: 'Add a spirit',
    scanLabel: 'Scan a label', askSommelier: 'Ask the sommelier',
  },
  sommelier: {
    title: 'AI Sommelier', placeholder: 'Describe your dish or ask a question…',
    ask: 'Ask', history: 'History', noHistory: 'No sessions',
    caveMatch: 'In your cellar', suggestion: 'AI suggestion',
  },
  scan: {
    title: 'Scan a label', dropzone: 'Drop a photo or click to choose',
    camera: 'Take a photo', analyzing: 'Analyzing…', import: 'Import this wine',
  },
  admin: {
    title: 'Administration', users: 'Users', createUser: 'Create user',
    editUser: 'Edit user', deactivate: 'Deactivate', activate: 'Activate',
    role: 'Role', lastLogin: 'Last login', createdAt: 'Created',
    active: 'Active', inactive: 'Inactive', confirmDeactivate: 'Deactivate this user?',
    roles: { visiteur: 'Visitor', user: 'User', admin: 'Administrator' },
    roleDesc: {
      visiteur: 'Can browse the cellar, cannot edit',
      user: 'Manages their own cellar',
      admin: 'Full access + user management',
    },
  },
  maps: {
    world: 'World vineyard map', france: 'French vineyards',
    spirits: 'Spirit origins', bottles: 'bottles', noBottles: 'No bottles',
  },
  theme: { dark: 'Dark theme', light: 'Light theme', system: 'System' },
  lang: { fr: 'Français', en: 'English' },
};

export default en;
