// src/App.jsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { LangProvider } from './context/LangContext';
import { adminAPI } from './services/api';

// ── Public config context — fetched once, no auth required ────────────────────
const PublicConfigContext = createContext({ public_catalog: '0' });
export function usePublicConfig() { return useContext(PublicConfigContext); }

function PublicConfigProvider({ children }) {
  const [cfg, setCfg] = useState(null);
  useEffect(() => {
    adminAPI.publicConfig().then(r => setCfg(r.data)).catch(() => setCfg({ public_catalog: '0' }));
  }, []);
  if (cfg === null) return (
    <div className="d-flex justify-content-center align-items-center" style={{ height: '100vh', background: 'var(--cv-bg)' }}>
      <div className="spinner-border" style={{ color: 'var(--cv-gold)' }} />
    </div>
  );
  return <PublicConfigContext.Provider value={cfg}>{children}</PublicConfigContext.Provider>;
}
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import WinesPage from './pages/WinesPage';
import SpiritsPage from './pages/SpiritsPage';
import WorldMapPage from './pages/WorldMapPage';
import FranceMapPage from './pages/FranceMapPage';
import SpiritsMapPage from './pages/SpiritsMapPage';
import SommelierPage from './pages/SommelierPage';
import ScanPage from './pages/ScanPage';
import AdminPage from './pages/AdminPage';
import ProfilePage from './pages/ProfilePage';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import WishlistPage from './pages/WishlistPage';
import SharedCavesPage from './pages/SharedCavesPage';
import CellarPage from './pages/CellarPage';
import BeersPage from './pages/BeersPage';

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 1 } } });

function PrivateRoute({ children, requiredRole = null }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="d-flex justify-content-center align-items-center" style={{ height: '100vh', background: 'var(--cv-bg)' }}>
      <div className="spinner-border" style={{ color: 'var(--cv-gold)' }} />
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  if (requiredRole && user.role !== requiredRole) return <Navigate to="/" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return !user ? children : <Navigate to="/" replace />;
}

// Routes accessible to authenticated users, OR to unauthenticated visitors when public_catalog=1
function VisitorAllowed({ children }) {
  const { user, loading } = useAuth();
  const { public_catalog } = usePublicConfig();
  if (loading) return (
    <div className="d-flex justify-content-center align-items-center" style={{ height: '100vh', background: 'var(--cv-bg)' }}>
      <div className="spinner-border" style={{ color: 'var(--cv-gold)' }} />
    </div>
  );
  if (!user && public_catalog !== '1') return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <ThemeProvider>
      <LangProvider>
        <QueryClientProvider client={qc}>
          <PublicConfigProvider>
          <AuthProvider>
            <BrowserRouter>
              <Toaster
                position="top-right"
                toastOptions={{
                  duration: 3000,
                  style: {
                    background: 'var(--cv-bg4)',
                    color: 'var(--cv-text)',
                    border: '0.5px solid var(--cv-border2)',
                    borderRadius: '10px',
                    fontSize: '0.85rem',
                  }
                }}
              />
              <Routes>
                <Route path="/login"           element={<PublicRoute><Login /></PublicRoute>} />
                <Route path="/register"        element={<PublicRoute><Register /></PublicRoute>} />
                <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
                <Route path="/reset-password"  element={<PublicRoute><ResetPassword /></PublicRoute>} />

                {/* Routes accessible to all authenticated roles */}
                <Route path="/" element={<VisitorAllowed><Layout /></VisitorAllowed>}>
                  <Route index          element={<Dashboard />} />
                  <Route path="wines"   element={<WinesPage />} />
                  <Route path="spirits" element={<SpiritsPage />} />
                  <Route path="map/world"   element={<WorldMapPage />} />
                  <Route path="map/france"  element={<FranceMapPage />} />
                  <Route path="map/spirits" element={<SpiritsMapPage />} />

                  {/* Restricted to user + admin */}
                  <Route path="sommelier" element={<PrivateRoute><SommelierPage /></PrivateRoute>} />
                  <Route path="scan"      element={<PrivateRoute><ScanPage /></PrivateRoute>} />
                  <Route path="wishlist"  element={<PrivateRoute><WishlistPage /></PrivateRoute>} />
                  <Route path="sharing"  element={<PrivateRoute><SharedCavesPage /></PrivateRoute>} />
                  <Route path="cellar"   element={<PrivateRoute><CellarPage /></PrivateRoute>} />
                  <Route path="beers"    element={<PrivateRoute><BeersPage /></PrivateRoute>} />

                  {/* Admin only */}
                  <Route path="admin" element={<PrivateRoute requiredRole="admin"><AdminPage /></PrivateRoute>} />

                  {/* User profile */}
                  <Route path="profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
                </Route>
              </Routes>
            </BrowserRouter>
          </AuthProvider>
          </PublicConfigProvider>
        </QueryClientProvider>
      </LangProvider>
    </ThemeProvider>
  );
}
