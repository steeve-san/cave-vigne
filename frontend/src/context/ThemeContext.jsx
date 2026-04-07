// src/context/ThemeContext.jsx
import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext(null);

// Detect system preference
const getSystemTheme = () =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('cv_theme');
    return saved || 'system';
  });

  // Effective theme: resolves 'system' to dark/light
  const effective = theme === 'system' ? getSystemTheme() : theme;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', effective);
  }, [effective]);

  // Listen for system preference changes when in 'system' mode
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => document.documentElement.setAttribute('data-theme', getSystemTheme());
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const setAndPersist = (t) => {
    setTheme(t);
    localStorage.setItem('cv_theme', t);
  };

  return (
    <ThemeContext.Provider value={{ theme, effective, setTheme: setAndPersist }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
