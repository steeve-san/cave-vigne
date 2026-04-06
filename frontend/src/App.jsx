// src/App.jsx
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
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

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 1 } } });

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="d-flex justify-content-center align-items-center" style={{ height: '100vh', background: 'var(--cv-bg)' }}><div className="spinner-border" style={{ color: 'var(--cv-gold)' }} /></div>;
  return user ? children : <Navigate to="/login" replace />;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return !user ? children : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <BrowserRouter>
          <Toaster position="top-right" toastOptions={{ duration: 3000, style: { background: 'var(--cv-bg4)', color: 'var(--cv-text)', border: '0.5px solid var(--cv-border2)', borderRadius: '10px', fontSize: '0.85rem' } }} />
          <Routes>
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
            <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
              <Route index element={<Dashboard />} />
              <Route path="wines" element={<WinesPage />} />
              <Route path="spirits" element={<SpiritsPage />} />
              <Route path="map/world" element={<WorldMapPage />} />
              <Route path="map/france" element={<FranceMapPage />} />
              <Route path="map/spirits" element={<SpiritsMapPage />} />
              <Route path="sommelier" element={<SommelierPage />} />
              <Route path="scan" element={<ScanPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
