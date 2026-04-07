// src/pages/Dashboard.jsx
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { winesAPI, spiritsAPI, sommelierAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import toast from 'react-hot-toast';

ChartJS.register(ArcElement, Tooltip, Legend);

const TYPE_ICONS = { rouge: '🍷', blanc: '🥂', rosé: '🌸', pétillant: '✨', whisky: '🥃', rhum: '🍹', cognac: '🥃', armagnac: '🥃', calvados: '🍎', gin: '🍸', vodka: '🍸', autre: '🍶' };
const TYPE_COLORS = { rouge: '#8B1A1A', blanc: '#C9A84C', rosé: '#C06080', pétillant: '#1A3A7A' };

export default function Dashboard() {
  const { user } = useAuth();
  const { t } = useLang();
  const [analysisResult, setAnalysisResult] = useState(null);

  const { data: stats, isLoading: statsLoading } = useQuery({ queryKey: ['wine-stats'], queryFn: () => winesAPI.stats().then(r => r.data) });
  const { data: winesData } = useQuery({ queryKey: ['wines', { limit: 6, sort: 'created_at', order: 'DESC' }], queryFn: () => winesAPI.list({ limit: 6, sort: 'created_at', order: 'DESC' }).then(r => r.data) });
  const { data: spirits } = useQuery({ queryKey: ['spirits', {}], queryFn: () => spiritsAPI.list().then(r => r.data) });

  const analyseMutation = useMutation({
    mutationFn: () => sommelierAPI.analyse().then(r => r.data),
    onSuccess: (data) => setAnalysisResult(data),
    onError: (err) => toast.error(err.response?.data?.error || 'Erreur analyse'),
  });

  const recentWines = winesData?.wines || [];
  const recentSpirits = (spirits || []).filter(s => s.status !== 'empty').slice(0, 5);
  const caveValue = stats?.cave_value ? parseFloat(stats.cave_value).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }) : '—';

  const statCards = [
    { num: statsLoading ? '…' : (stats?.total_bottles || 0), label: t('dashboard.totalBottles'), icon: 'bi-grid-3x3', link: '/wines' },
    { num: statsLoading ? '…' : (stats?.total_refs || 0), label: 'Références', icon: 'bi-bookmark', link: '/wines' },
    { num: statsLoading ? '…' : (stats?.drunk_count || 0), label: 'Dégustées', icon: 'bi-check-circle', link: '/wines?status=drunk' },
    { num: statsLoading ? '…' : caveValue, label: t('dashboard.caveValue'), icon: 'bi-currency-euro', link: '/wines' },
  ];

  // Chart.js donut data
  const donutData = stats?.by_type?.length ? {
    labels: stats.by_type.map(t => t.type.charAt(0).toUpperCase() + t.type.slice(1)),
    datasets: [{
      data: stats.by_type.map(t => t.bottles),
      backgroundColor: stats.by_type.map(t => TYPE_COLORS[t.type] || '#6c757d'),
      borderColor: '#2C1A1A',
      borderWidth: 2,
    }],
  } : null;

  const donutOptions = {
    plugins: { legend: { position: 'bottom', labels: { color: '#B09070', font: { size: 11 }, padding: 12 } } },
    cutout: '68%',
    animation: { animateRotate: true },
  };

  return (
    <div className="fade-in">
      {/* Welcome */}
      <div className="mb-4">
        <h2 className="font-serif" style={{ fontSize: '1.8rem', color: 'var(--cv-gold)', fontStyle: 'italic' }}>
          Bonjour, {user?.username} 🍷
        </h2>
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
        {/* Donut chart */}
        {donutData && (
          <div className="col-lg-4">
            <div className="card h-100">
              <div className="card-header"><h6 className="card-title">Répartition par type</h6></div>
              <div className="card-body d-flex flex-column align-items-center justify-content-center p-3">
                <div style={{ width: '100%', maxWidth: 220, position: 'relative' }}>
                  <Doughnut data={donutData} options={donutOptions} />
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -60%)', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.6rem', fontFamily: 'Cormorant Garamond,serif', color: 'var(--cv-gold)', fontWeight: 700 }}>{stats?.total_bottles || 0}</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--cv-text3)', textTransform: 'uppercase', letterSpacing: 1 }}>btl.</div>
                  </div>
                </div>
                {stats?.avg_rating && (
                  <div className="mt-3 pt-3 w-100" style={{ borderTop: '0.5px solid var(--cv-border)', textAlign: 'center' }}>
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
            <div className="card-header"><h6 className="card-title">{t('dashboard.quickActions')}</h6></div>
            <div className="card-body p-3 d-flex flex-column gap-2">
              {[
                { to: '/scan',      icon: 'bi-camera',  label: t('dashboard.scanLabel'),    cls: 'btn-gold' },
                { to: '/sommelier', icon: 'bi-stars',   label: t('dashboard.askSommelier'), cls: 'btn-wine' },
                { to: '/wishlist',  icon: 'bi-heart',   label: 'Liste de souhaits',         cls: 'btn-outline-gold' },
                { to: '/wines',     icon: 'bi-plus',    label: t('dashboard.addWine'),       cls: 'btn-outline-gold' },
                { to: '/spirits',   icon: 'bi-plus',    label: t('dashboard.addSpirit'),     cls: 'btn-outline-gold' },
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

      {/* AI Cave Analysis */}
      <div className="row g-3 mb-4">
        <div className="col-12">
          <div className="card">
            <div className="card-header d-flex align-items-center justify-content-between">
              <h6 className="card-title mb-0"><i className="bi bi-stars me-2" style={{ color: 'var(--cv-gold)' }}></i>Analyse IA de votre cave</h6>
              <button className="btn btn-sm btn-outline-gold" onClick={() => analyseMutation.mutate()} disabled={analyseMutation.isPending}>
                {analyseMutation.isPending ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="bi bi-arrow-repeat me-1"></i>}
                Analyser
              </button>
            </div>
            {analysisResult ? (
              <div className="card-body">
                <div className="row g-3">
                  <div className="col-md-4">
                    <div className="d-flex gap-3 mb-3">
                      {[['Diversité', analysisResult.score_diversite], ['Équilibre', analysisResult.score_equilibre]].map(([lbl, score]) => (
                        <div key={lbl} className="text-center flex-grow-1" style={{ background: 'var(--cv-bg2)', borderRadius: 8, padding: '0.75rem' }}>
                          <div style={{ fontSize: '1.8rem', fontFamily: 'Cormorant Garamond,serif', color: 'var(--cv-gold)', fontWeight: 700 }}>{score}/10</div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--cv-text3)', textTransform: 'uppercase', letterSpacing: 1 }}>{lbl}</div>
                        </div>
                      ))}
                    </div>
                    {analysisResult.conseil_principal && (
                      <p style={{ fontSize: '0.82rem', color: 'var(--cv-text2)', fontStyle: 'italic', lineHeight: 1.6 }}>{analysisResult.conseil_principal}</p>
                    )}
                  </div>
                  <div className="col-md-4">
                    {analysisResult.points_forts?.length > 0 && (
                      <div className="mb-3">
                        <div style={{ fontSize: '0.68rem', letterSpacing: 2, color: '#4CAF50', textTransform: 'uppercase', marginBottom: 4 }}>Points forts</div>
                        {analysisResult.points_forts.map((p, i) => (
                          <div key={i} style={{ fontSize: '0.8rem', color: 'var(--cv-text)', padding: '2px 0' }}>✓ {p}</div>
                        ))}
                      </div>
                    )}
                    {analysisResult.axes_amelioration?.length > 0 && (
                      <div>
                        <div style={{ fontSize: '0.68rem', letterSpacing: 2, color: 'var(--cv-gold)', textTransform: 'uppercase', marginBottom: 4 }}>À améliorer</div>
                        {analysisResult.axes_amelioration.map((p, i) => (
                          <div key={i} style={{ fontSize: '0.8rem', color: 'var(--cv-text)', padding: '2px 0' }}>→ {p}</div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="col-md-4">
                    {analysisResult.a_deguster_maintenant?.length > 0 && (
                      <div className="mb-3">
                        <div style={{ fontSize: '0.68rem', letterSpacing: 2, color: 'var(--cv-wine)', textTransform: 'uppercase', marginBottom: 4 }}>🍷 À déguster maintenant</div>
                        {analysisResult.a_deguster_maintenant.map((w, i) => (
                          <div key={i} style={{ fontSize: '0.8rem', color: 'var(--cv-text)', padding: '2px 0' }}>{w}</div>
                        ))}
                      </div>
                    )}
                    {analysisResult.occasion_parfaite && (
                      <div style={{ background: 'var(--cv-bg2)', borderRadius: 8, padding: '0.75rem' }}>
                        <div style={{ fontSize: '0.68rem', color: 'var(--cv-gold)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Occasion parfaite</div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--cv-text)', fontWeight: 600 }}>{analysisResult.occasion_parfaite.occasion}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--cv-text2)' }}>{analysisResult.occasion_parfaite.vin}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--cv-text3)', fontStyle: 'italic', marginTop: 4 }}>{analysisResult.occasion_parfaite.pourquoi}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="card-body text-center p-4" style={{ color: 'var(--cv-text3)' }}>
                <i className="bi bi-cpu d-block mb-2" style={{ fontSize: '2rem', color: 'var(--cv-gold)' }}></i>
                <p style={{ fontSize: '0.85rem' }}>Obtenez une analyse personnalisée de votre cave par l'IA : points forts, manques, recommandations.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="row g-3">
        {/* Recent wines */}
        <div className="col-lg-6">
          <div className="card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h6 className="card-title">{t('dashboard.recentWines')}</h6>
              <Link to="/wines" style={{ fontSize: '0.75rem', color: 'var(--cv-gold)', textDecoration: 'none' }}>Voir tout →</Link>
            </div>
            <div className="card-body p-2">
              {recentWines.length === 0 ? (
                <div className="text-center p-4" style={{ color: 'var(--cv-text3)' }}>
                  <i className="bi bi-grid d-block mb-2" style={{ fontSize: '2rem' }}></i>
                  <Link to="/wines" className="btn btn-gold btn-sm">{t('dashboard.addWine')}</Link>
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
                  <Link to="/spirits" className="btn btn-wine btn-sm">{t('dashboard.addSpirit')}</Link>
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
