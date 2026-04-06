// src/context/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('cv_access');
    if (!token) { setLoading(false); return; }
    authAPI.me().then(r => setUser(r.data.user)).catch(() => { localStorage.removeItem('cv_access'); localStorage.removeItem('cv_refresh'); }).finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const r = await authAPI.login(email, password);
    localStorage.setItem('cv_access', r.data.access);
    localStorage.setItem('cv_refresh', r.data.refresh);
    setUser(r.data.user);
    return r.data.user;
  }, []);

  const register = useCallback(async (email, username, password) => {
    const r = await authAPI.register(email, username, password);
    localStorage.setItem('cv_access', r.data.access);
    localStorage.setItem('cv_refresh', r.data.refresh);
    setUser(r.data.user);
    return r.data.user;
  }, []);

  const logout = useCallback(async () => {
    try { await authAPI.logout(); } catch {}
    localStorage.removeItem('cv_access');
    localStorage.removeItem('cv_refresh');
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, register, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
