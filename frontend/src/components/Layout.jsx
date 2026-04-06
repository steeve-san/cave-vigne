// src/components/Layout.jsx
import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { winesAPI, spiritsAPI } from '../services/api';
import toast from 'react-hot-toast';

const PAGE_TITLES = {
  '/': 'Tableau de bord', '/wines': 'Ma cave à vins', '/spirits': 'Collection spiritueux',
  '/map/world': 'Carte mondiale des vignobles', '/map/france': 'Vignobles de France',
  '/map/spirits': 'Origines des spiritueux', '/sommelier': 'Sommelier IA', '/scan': 'Scanner une étiquette',
};

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { data: wStats } = useQuery({ queryKey: ['wine-stats'], queryFn: () => winesAPI.stats().then(r => r.data), staleTime: 120_000 });
  const { data: spirits } = useQuery({ queryKey: ['spirits-count'], queryFn: () => spiritsAPI.list().then(r => r.data), staleTime: 120_000 });

  const wineCount = wStats?.total_bottles || 0;
  const spiritCount = Array.isArray(spirits) ? spirits.filter(s => s.status !== 'empty').length : 0;
  const title = PAGE_TITLES[location.pathname] || 'Cave & Vigne';

  const handleLogout = async () => { await logout(); toast.success('Au revoir !'); };

  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  const navItems = [
    { path: '/sommelier', icon: 'bi-stars', label: 'Sommelier IA', badge: null, section: 'Découverte' },
    { path: '/', icon: 'bi-house', label: 'Tableau de bord', badge: null, section: 'Vins' },
    { path: '/wines', icon: 'bi-grid-3x3', label: 'Ma cave', badge: wineCount || null },
    { path: '/scan', icon: 'bi-camera', label: 'Scanner', badge: null },
    { path: '/map/france', icon: 'bi-geo-alt', label: 'Carte France', badge: null },
    { path: '/map/world', icon: 'bi-globe', label: 'Carte monde', badge: null },
    { path: '/spirits', icon: 'bi-cup-hot', label: 'Spiritueux', badge: spiritCount || null, section: 'Spiritueux' },
    { path: '/map/spirits', icon: 'bi-map', label: 'Origines', badge: null },
  ];

  const SidebarContent = () => (
    <>
      <div className="sidebar-logo">
        <h1>Cave &<br />Vigne</h1>
        <p>Collection privée</p>
      </div>
      <nav className="flex-grow-1 py-2">
        {navItems.map((item, i) => (
          <React.Fragment key={item.path}>
            {item.section && <div className="nav-section">{item.section}</div>}
            <NavLink to={item.path} end={item.path === '/'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <i className={`bi ${item.icon}`}></i>
              <span className="flex-grow-1">{item.label}</span>
              {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
            </NavLink>
          </React.Fragment>
        ))}
      </nav>
      <div className="p-3 border-top" style={{ borderColor: 'var(--cv-border) !important' }}>
        <div className="d-flex align-items-center gap-2 mb-2">
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--cv-wine)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#fff', fontWeight: 600 }}>
            {(user?.username || 'U')[0].toUpperCase()}
          </div>
          <div className="flex-grow-1 overflow-hidden">
            <div style={{ fontSize: '0.82rem', color: 'var(--cv-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.username}</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--cv-text3)' }}>{user?.role}</div>
          </div>
        </div>
        <button className="btn btn-sm btn-outline-gold w-100" onClick={handleLogout}><i className="bi bi-box-arrow-right me-1"></i>Déconnexion</button>
      </div>
    </>
  );

  return (
    <div className="d-flex" style={{ minHeight: '100vh' }}>
      {/* Mobile overlay */}
      {sidebarOpen && <div className="d-lg-none" onClick={() => setSidebarOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1044 }} />}

      {/* Desktop sidebar */}
      <aside className="sidebar d-none d-lg-flex flex-column"><SidebarContent /></aside>

      {/* Mobile sidebar */}
      <aside className={`sidebar d-flex d-lg-none flex-column ${sidebarOpen ? 'show' : ''}`}><SidebarContent /></aside>

      {/* Main */}
      <div className="flex-grow-1 d-flex flex-column" style={{ minWidth: 0, minHeight: '100vh' }}>
        <header className="topbar">
          <button className="btn btn-sm d-lg-none" style={{ color: 'var(--cv-text2)' }} onClick={() => setSidebarOpen(true)}><i className="bi bi-list fs-5"></i></button>
          <h1 className="topbar-title">{title}</h1>
          <NavLink to="/scan" className="btn btn-gold btn-sm"><i className="bi bi-camera me-1"></i>Scanner</NavLink>
          <NavLink to="/wines" className="btn btn-outline-gold btn-sm d-none d-sm-inline-flex"><i className="bi bi-plus me-1"></i>Ajouter</NavLink>
        </header>
        <main className="flex-grow-1 p-3 p-lg-4 fade-in" style={{ overflowY: 'auto' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
