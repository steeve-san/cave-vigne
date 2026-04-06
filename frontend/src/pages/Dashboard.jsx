// src/pages/Dashboard.jsx
import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { winesAPI, spiritsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const TYPE_ICONS = { rouge: '🍷', blanc: '🥂', rosé: '🌸', pétillant: '✨', whisky: '🥃', rhum: '🍹', cognac: '🥃', armagnac: '🥃', calvados: '🍎', gin: '🍸', vodka: '🍸', autre: '🍶' };

export default function Dashboard() {
  const { user } = useAuth();
  const { data: stats, isLoading: statsLoading } = useQuery({ queryKey: ['wine-stats'], queryFn: () => winesAPI.stats().then(r => r.data) });
  const { data: winesData } = useQuery({ queryKey: ['wines', { limit: 6, sort: 'created_at', order: 'DESC' }], queryFn: () => winesAPI.list({ limit: 6, sort: 'created_at', order: 'DESC' }).then(r => r.data) });
  const { data: spirits } = useQuery({ queryKey: ['spirits', {}], queryFn: () => spiritsAPI.list().then(r => r.data) });

  const recentWines = winesData?.wines || [];
  const recentSpirits = (spirits || []).filter(s => s.status !== 'empty').slice(0, 5);
  const caveValue = stats?.cave_value ? parseFloat(stats.cave_value).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }) : '—';

  const statCards = [
    { num: statsLoading ? '…' : (stats?.total_bottles || 0), label: 'Bouteilles en cave', icon: 'bi-grid-3x3', link: '/wines' },
    { num: statsLoading ? '…' : (stats?.total_refs || 0), label: 'Références', icon: 'bi-bookmark', link: '/wines' },
    { num: statsLoading ? '…' : (stats?.drunk_count || 0), label: 'Dégustées', icon: 'bi-check-circle', link: '/wines?status=drunk' },
    { num: statsLoading ? '…' : caveValue, label: 'Valeur estimée', icon: 'bi-currency-euro', link: '/wines' },
  ];

  return (
    <div className="fade-in">
      {/* Welcome */}
      <div className="mb-4">
        <h2 className="font-serif" style={{ fontSize: '1.8rem', color: 'var(--cv-gold)', fontStyle: 'italic' }}>Bonjour, {user?.username} 🍷</h2>
        <p style={{ color: 'var(--cv-text2)', fontSize: '0.85rem' }}>Voici l'état de votre cave aujourd'hui</p>
      </div>

      {/* Stats */}
      <div className="row g-3 mb-4">
        {statCards.map((s, i) => (
          <div className="col-6 col-xl-3" key={i}>
            <Link to={s.link} style={{ textDecoration: 'none' }}>
              <div className="stat-card h-100">
                <div className="d-flex justify-content-between align-items-start">
                  <div>
                    <div className="stat-num">{s.num}</div>
                    <div className="stat-label">{s.label}</div>
                  </div>
                  <i className={`bi ${s.icon}`} style={{ fontSize: '1.2rem', color: 'var(--cv-text3)' }}></i>
                </div>
              </div>
            </Link>
          </div>
        ))}
      </div>

      <div className="row g-3 mb-4">
        {/* By type breakdown */}
        {stats?.by_type?.length > 0 && (
          <div className="col-lg-4">
            <div className="card h-100">
              <div className="card-header"><h6 className="card-title">Par type</h6></div>
              <div className="card-body p-3">
                {stats.by_type.map(t => (
                  <div key={t.type} className="d-flex align-items-center gap-2 mb-2">
                    <span style={{ fontSize: '1rem' }}>{TYPE_ICONS[t.type] || '🍷'}</span>
                    <span style={{ flex: 1, fontSize: '0.82rem', color: 'var(--cv-text)', textTransform: 'capitalize' }}>{t.type}</span>
                    <span className={`badge-type badge-${t.type}`}>{t.bottles} btl.</span>
                  </div>
                ))}
                {stats.avg_rating && (
                  <div className="mt-3 pt-3" style={{ borderTop: '0.5px solid var(--cv-border)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--cv-text3)', letterSpacing: 2, textTransform: 'uppercase' }}>Note moy. accords</div>
                    <div style={{ fontSize: '1.4rem', fontFamily: 'Cormorant Garamond, serif', color: 'var(--cv-gold)' }}>
                      {'★'.repeat(Math.round(stats.avg_rating))}{'☆'.repeat(5 - Math.round(stats.avg_rating))} {stats.avg_rating}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Quick actions */}
        <div className="col-lg-4">
          <div className="card h-100">
            <div className="card-header"><h6 className="card-title">Actions rapides</h6></div>
            <div className="card-body p-3 d-flex flex-column gap-2">
              {[
                { to: '/scan', icon: 'bi-camera', label: 'Scanner une étiquette', cls: 'btn-gold' },
                { to: '/sommelier', icon: 'bi-stars', label: 'Consulter le sommelier', cls: 'btn-wine' },
                { to: '/wines', icon: 'bi-plus', label: 'Ajouter un vin', cls: 'btn-outline-gold' },
                { to: '/spirits', icon: 'bi-plus', label: 'Ajouter un spiritueux', cls: 'btn-outline-gold' },
                { to: '/map/france', icon: 'bi-geo-alt', label: 'Voir la carte France', cls: 'btn-outline-gold' },
              ].map(a => (
                <Link key={a.to} to={a.to} className={`btn ${a.cls} text-start`} style={{ fontSize: '0.82rem' }}>
                  <i className={`bi ${a.icon} me-2`}></i>{a.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Top regions */}
        {stats?.by_region?.length > 0 && (
          <div className="col-lg-4">
            <div className="card h-100">
              <div className="card-header"><h6 className="card-title">Régions en cave</h6></div>
              <div className="card-body p-3">
                {stats.by_region.slice(0, 6).map((r, i) => (
                  <div key={i} className="d-flex align-items-center gap-2 mb-2">
                    <i className="bi bi-geo-alt" style={{ color: 'var(--cv-text3)', fontSize: '0.8rem' }}></i>
                    <span style={{ flex: 1, fontSize: '0.82rem', color: 'var(--cv-text)' }}>{r.region || 'Inconnue'}</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--cv-text3)' }}>{r.country}</span>
                    <span style={{ fontSize: '0.82rem', color: 'var(--cv-gold)', fontFamily: 'Cormorant Garamond,serif' }}>{r.bottles}×</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="row g-3">
        {/* Recent wines */}
        <div className="col-lg-6">
          <div className="card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h6 className="card-title">Vins récents</h6>
              <Link to="/wines" style={{ fontSize: '0.75rem', color: 'var(--cv-gold)', textDecoration: 'none' }}>Voir tout →</Link>
            </div>
            <div className="card-body p-2">
              {recentWines.length === 0 ? (
                <div className="text-center p-4" style={{ color: 'var(--cv-text3)' }}>
                  <i className="bi bi-grid d-block mb-2" style={{ fontSize: '2rem' }}></i>
                  <Link to="/wines" className="btn btn-gold btn-sm">Ajouter votre premier vin</Link>
                </div>
              ) : recentWines.map(w => (
                <div key={w.id} className="d-flex align-items-center gap-2 p-2" style={{ borderBottom: '0.5px solid var(--cv-border)' }}>
                  <span style={{ fontSize: '1.1rem' }}>{TYPE_ICONS[w.type] || '🍷'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--cv-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'Cormorant Garamond,serif' }}>{w.name}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--cv-text2)' }}>{[w.vintage, w.region].filter(Boolean).join(' · ')}</div>
                  </div>
                  {w.is_drunk || w.quantity === 0 ? <span className="badge-drunk">bue</span> : <span className="badge-stock">cave</span>}
                  <span style={{ fontSize: '1rem', fontFamily: 'Cormorant Garamond,serif', color: 'var(--cv-gold)', minWidth: 22, textAlign: 'right' }}>{w.is_drunk ? '✓' : w.quantity}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent spirits */}
        <div className="col-lg-6">
          <div className="card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h6 className="card-title">Spiritueux</h6>
              <Link to="/spirits" style={{ fontSize: '0.75rem', color: 'var(--cv-gold)', textDecoration: 'none' }}>Voir tout →</Link>
            </div>
            <div className="card-body p-2">
              {recentSpirits.length === 0 ? (
                <div className="text-center p-4" style={{ color: 'var(--cv-text3)' }}>
                  <i className="bi bi-cup-hot d-block mb-2" style={{ fontSize: '2rem' }}></i>
                  <Link to="/spirits" className="btn btn-wine btn-sm">Ajouter un spiritueux</Link>
                </div>
              ) : recentSpirits.map(s => (
                <div key={s.id} className="d-flex align-items-center gap-2 p-2" style={{ borderBottom: '0.5px solid var(--cv-border)' }}>
                  <span style={{ fontSize: '1.1rem' }}>{TYPE_ICONS[s.type] || '🥃'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--cv-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'Cormorant Garamond,serif' }}>{s.name}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--cv-text2)' }}>{[s.origin, s.age, s.abv ? s.abv + '%' : null].filter(Boolean).join(' · ')}</div>
                  </div>
                  {s.rating ? <span style={{ fontSize: '0.72rem', color: 'var(--cv-gold)' }}>{s.rating}/100</span> : null}
                  <span className={s.status === 'open' ? 'badge-open' : 'badge-stock'}>{s.status === 'open' ? 'ouvert' : 'fermé'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
