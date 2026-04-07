// src/services/api.js
import axios from 'axios';

const API_BASE = import.meta.env.REACT_APP_API_URL || '/api';

const api = axios.create({ baseURL: API_BASE, withCredentials: false });

// Attach JWT
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('cv_access');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// Auto-refresh on 401 TOKEN_EXPIRED
let refreshing = null;
api.interceptors.response.use(
  r => r,
  async err => {
    const orig = err.config;
    if (err.response?.status === 401 && err.response?.data?.code === 'TOKEN_EXPIRED' && !orig._retry) {
      orig._retry = true;
      if (!refreshing) {
        refreshing = axios.post(`${API_BASE}/auth/refresh`, { refresh: localStorage.getItem('cv_refresh') })
          .then(r => {
            localStorage.setItem('cv_access', r.data.access);
            localStorage.setItem('cv_refresh', r.data.refresh);
            refreshing = null;
            return r.data.access;
          })
          .catch(() => {
            localStorage.removeItem('cv_access');
            localStorage.removeItem('cv_refresh');
            window.location.href = '/login';
            refreshing = null;
          });
      }
      const token = await refreshing;
      orig.headers.Authorization = `Bearer ${token}`;
      return api(orig);
    }
    return Promise.reject(err);
  }
);

export default api;

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authAPI = {
  login:    (email, password) => api.post('/auth/login', { email, password }),
  register: (email, username, password) => api.post('/auth/register', { email, username, password }),
  logout:   () => api.post('/auth/logout', { refresh: localStorage.getItem('cv_refresh') }),
  me:       () => api.get('/auth/me'),
};

// ─── Wines ────────────────────────────────────────────────────────────────────
export const winesAPI = {
  list:      (params) => api.get('/wines', { params }),
  create:    (data)   => api.post('/wines', data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  update:    (id, data) => api.put(`/wines/${id}`, data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  remove:    (id)     => api.delete(`/wines/${id}`),
  addAccord: (id, data) => api.post(`/wines/${id}/accords`, data),
  stats:     ()       => api.get('/wines/stats'),
  enrich:    (id)     => api.get(`/wines/${id}/enrich`),
};

// ─── Spirits ──────────────────────────────────────────────────────────────────
export const spiritsAPI = {
  list:   (params) => api.get('/spirits', { params }),
  create: (data)   => api.post('/spirits', data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  update: (id, data) => api.put(`/spirits/${id}`, data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  remove: (id)     => api.delete(`/spirits/${id}`),
};

// ─── Sommelier ────────────────────────────────────────────────────────────────
export const sommelierAPI = {
  accord:  (query)    => api.post('/sommelier/accord', { query }),
  scan:    (formData) => api.post('/sommelier/scan', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  history: ()         => api.get('/sommelier/history'),
  recipes: (food)     => api.get('/sommelier/recipes', { params: { food } }),
};

// ─── Admin ────────────────────────────────────────────────────────────────────
export const adminAPI = {
  listUsers:   ()           => api.get('/auth/admin/users'),
  createUser:  (data)       => api.post('/auth/admin/users', data),
  updateUser:  (id, data)   => api.put(`/auth/admin/users/${id}`, data),
  deleteUser:  (id)         => api.delete(`/auth/admin/users/${id}`),
  getSettings: ()           => api.get('/settings'),
  saveSettings:(data)       => api.put('/settings', data),
  testSmtp:    ()           => api.post('/settings/test-smtp'),
  publicConfig:()           => api.get('/settings/public'),
};

// ─── Auth 2FA ─────────────────────────────────────────────────────────────────
export const totpAPI = {
  setup:   () => api.post('/auth/totp/setup'),
  confirm: (token) => api.post('/auth/totp/confirm', { token }),
  disable: (password) => api.post('/auth/totp/disable', { password }),
  status:  () => api.get('/auth/totp/status'),
};

// ─── Health ───────────────────────────────────────────────────────────────────
export const healthAPI = {
  check: () => api.get('/health'),
};
