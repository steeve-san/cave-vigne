// src/components/Layout.jsx
import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useLang } from '../context/LangContext';
import { winesAPI, spiritsAPI } from '../services/api';
import toast from 'react-hot-toast';

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { lang, setLang, t } = useLang();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Non-authenticated visitors (public catalog) are treated as read-only
  const isReadOnly = !user || user?.role === 'visiteur';
  const isAdmin    = user?.role === 'admin';

  const { data: wStats }  = useQuery({ queryKey: ['wine-stats'],    queryFn: () => winesAPI.stats().then(r => r.data),   staleTime: 120_000 });
  const { data: spirits } = useQuery({ queryKey: ['spirits-count'], queryFn: () => spiritsAPI.list().then(r => r.data),  staleTime: 120_000 });

  const wineCount   = wStats?.total_bottles || 0;
  const spiritCount = Array.isArray(spirits) ? spirits.filter(s => s.status !== 'empty').length : 0;

  const PAGE_TITLES = {
    '/': t('nav.dashboard'), '/wines': t('nav.wines'), '/spirits': t('nav.spirits'),
    '/map/world': t('maps.world'), '/map/france': t('maps.france'),
    '/map/spirits': t('maps.spirits'), '/sommelier': t('nav.sommelier'),
    '/scan': t('nav.scan'), '/admin': t('nav.admin'),
  };
  const title = PAGE_TITLES[location.pathname] || 'Cave & Vigne';

  const handleLogout = async () => { await logout(); toast.success(t('auth.goodbye')); };
  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  // Theme icon
  const themeIcon = theme === 'dark' ? 'bi-moon-fill' : theme === 'light' ? 'bi-sun-fill' : 'bi-circle-half';
  const nextTheme = theme === 'system' ? 'dark' : theme === 'dark' ? 'light' : 'system';

  const navItems = [
    { path: '/sommelier', icon: 'bi-stars',     label: t('nav.sommelier'), section: t('nav.discovery'), hide: isReadOnly },
    { path: '/',          icon: 'bi-house',      label: t('nav.dashboard'), section: t('nav.collection') },
    { path: '/wines',     icon: 'bi-grid-3x3',   label: t('nav.wines'),     badge: wineCount || null },
    { path: '/cellar',    icon: 'bi-grid-3x3-gap-fill', label: t('nav.cellar') },
    { path: '/scan',      icon: 'bi-camera',     label: t('nav.scan'),      hide: isReadOnly },
    { path: '/map/france',icon: 'bi-geo-alt',    label: t('nav.mapFrance') },
    { path: '/map/world', icon: 'bi-globe',      label: t('nav.mapWorld') },
    { path: '/wishlist',  icon: 'bi-heart',       label: t('nav.wishlist'),  hide: isReadOnly },
    { path: '/sharing',   icon: 'bi-people',      label: t('nav.sharing'),   hide: isReadOnly },
    { path: '/stats',     icon: 'bi-bar-chart',   label: t('nav.stats'),     hide: isReadOnly },
    { path: '/beers',     icon: 'bi-cup-straw',   label: t('nav.beers'),     section: t('nav.spiritsSection') },
    { path: '/spirits',   icon: 'bi-cup-hot',    label: t('nav.spirits'),   badge: spiritCount || null },
    { path: '/map/spirits',icon:'bi-map',        label: t('nav.mapSpirits') },
    ...(isAdmin ? [{ path: '/admin', icon: 'bi-shield-check', label: t('nav.admin'), section: '' }] : []),
  ].filter(item => !item.hide);

  const roleColors = { visiteur: '#6c757d', user: '#4CAF50', admin: 'var(--cv-gold)' };
  const roleBadgeClass = { visiteur: 'badge-role-visiteur', user: 'badge-role-user', admin: 'badge-role-admin' };

  const SidebarContent = () => (
    <>
      <div className="sidebar-logo">
        <h1>Cave &<br />Vigne</h1>
        <p>{t('nav.privateCollection')}</p>
      </div>

      <nav className="flex-grow-1 py-2">
        {navItems.map((item) => (
          <React.Fragment key={item.path}>
            {item.section !== undefined && item.section !== null && (
              <div className="nav-section">{item.section}</div>
            )}
            <NavLink
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <i className={`bi ${item.icon}`}></i>
              <span className="flex-grow-1">{item.label}</span>
              {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
            </NavLink>
          </React.Fragment>
        ))}
      </nav>

      {/* Theme + language controls */}
      <div className="px-3 py-2 d-flex align-items-center gap-2" style={{ borderTop: '0.5px solid var(--cv-border)' }}>
        <button
          className="btn-theme flex-grow-1 d-flex align-items-center gap-1 justify-content-center"
          onClick={() => setTheme(nextTheme)}
          title={t(`theme.${theme}`)}
        >
          <i className={`bi ${themeIcon}`} style={{ fontSize: '0.85rem' }}></i>
          <span style={{ fontSize: '0.72rem' }}>{t(`theme.${theme}`)}</span>
        </button>
        <button
          className="btn-theme d-flex align-items-center gap-1"
          onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}
          title={lang === 'fr' ? 'Switch to English' : 'Passer en français'}
        >
          <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{lang.toUpperCase()}</span>
        </button>
      </div>

      {/* Profil utilisateur */}
      <div className="p-3" style={{ borderTop: '0.5px solid var(--cv-border)' }}>
        {user ? (
          <>
            <div className="d-flex align-items-center gap-2 mb-2">
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: roleColors[user.role] || 'var(--cv-wine)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, color: user.role === 'visiteur' ? '#fff' : '#1a0f0f', fontWeight: 600
              }}>
                {(user.username || 'U')[0].toUpperCase()}
              </div>
              <div className="flex-grow-1 overflow-hidden">
                <div style={{ fontSize: '0.82rem', color: 'var(--cv-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user.username}
                </div>
                <span className={`badge-type ${roleBadgeClass[user.role] || ''}`} style={{ fontSize: '0.62rem' }}>
                  {t(`admin.roles.${user.role}`)}
                </span>
              </div>
            </div>
            {user.role === 'visiteur' && (
              <div style={{ fontSize: '0.68rem', color: 'var(--cv-text3)', marginBottom: '0.5rem', textAlign: 'center' }}>
                <i className="bi bi-eye me-1"></i>{t('nav.readOnly')}
              </div>
            )}
            <div className="d-flex gap-2 mb-2">
              <NavLink to="/profile" className="btn btn-sm btn-outline-gold flex-grow-1" style={{ fontSize: '0.78rem' }}>
                <i className="bi bi-person-gear me-1"></i>{t('nav.profile')}
              </NavLink>
            </div>
            <button className="btn btn-sm btn-outline-gold w-100" onClick={handleLogout}>
              <i className="bi bi-box-arrow-right me-1"></i>{t('auth.logout')}
            </button>
          </>
        ) : (
          /* Visiteur anonyme — catalogue public */
          <div className="d-flex flex-column gap-2">
            <div style={{ fontSize: '0.72rem', color: 'var(--cv-text3)', textAlign: 'center' }}>
              <i className="bi bi-eye me-1"></i>{t('nav.readOnly')}
            </div>
            <NavLink to="/login" className="btn btn-sm btn-outline-gold w-100" style={{ fontSize: '0.78rem' }}>
              <i className="bi bi-box-arrow-in-right me-1"></i>{t('auth.login')}
            </NavLink>
            <NavLink to="/register" className="btn btn-sm btn-gold w-100" style={{ fontSize: '0.78rem' }}>
              <i className="bi bi-person-plus me-1"></i>{t('auth.registerBtn')}
            </NavLink>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="d-flex" style={{ minHeight: '100vh' }}>
      {sidebarOpen && (
        <div className="d-lg-none" onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'var(--cv-modal-overlay)', zIndex: 1044 }}
        />
      )}

      <aside className="sidebar d-none d-lg-flex flex-column"><SidebarContent /></aside>
      <aside className={`sidebar d-flex d-lg-none flex-column ${sidebarOpen ? 'show' : ''}`}><SidebarContent /></aside>

      <div className="flex-grow-1 d-flex flex-column" style={{ minWidth: 0, minHeight: '100vh' }}>
        <header className="topbar">
          <button className="btn btn-sm d-lg-none" style={{ color: 'var(--cv-text2)' }} onClick={() => setSidebarOpen(true)}>
            <i className="bi bi-list fs-5"></i>
          </button>
          <h1 className="topbar-title">{title}</h1>
          {!isReadOnly && (
            <>
              <NavLink to="/scan"  className="btn btn-gold btn-sm"><i className="bi bi-camera me-1"></i>{t('nav.scan')}</NavLink>
              <NavLink to="/wines" className="btn btn-outline-gold btn-sm d-none d-sm-inline-flex"><i className="bi bi-plus me-1"></i>{t('common.add')}</NavLink>
            </>
          )}
        </header>
        <main className="flex-grow-1 p-3 p-lg-4 fade-in" style={{ overflowY: 'auto' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
