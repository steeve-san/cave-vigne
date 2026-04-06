// src/context/LangContext.jsx
import React, { createContext, useContext, useState } from 'react';
import fr from '../locales/fr';
import en from '../locales/en';

const locales = { fr, en };
const LangContext = createContext(null);

// Résout une clé dot-notation dans un objet imbriqué
// Ex: t('wines.title') → 'Ma cave à vins'
const resolve = (obj, key) => {
  const value = key.split('.').reduce((acc, part) => acc?.[part], obj);
  return value ?? key;
};

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem('cv_lang');
    if (saved && locales[saved]) return saved;
    // Détection langue navigateur
    const browser = navigator.language?.split('-')[0];
    return locales[browser] ? browser : 'fr';
  });

  const setAndPersist = (l) => {
    if (!locales[l]) return;
    setLang(l);
    localStorage.setItem('cv_lang', l);
  };

  // Fonction de traduction avec support variables {name}
  const t = (key, vars = {}) => {
    let text = resolve(locales[lang], key);
    if (typeof text !== 'string') return key;
    return Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, v), text);
  };

  return (
    <LangContext.Provider value={{ lang, setLang: setAndPersist, t, locales: Object.keys(locales) }}>
      {children}
    </LangContext.Provider>
  );
}

export const useLang = () => useContext(LangContext);
