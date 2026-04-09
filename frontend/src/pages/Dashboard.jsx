// src/pages/Dashboard.jsx
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Doughnut, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend,
  LineElement, PointElement, LinearScale, CategoryScale, Filler,
} from 'chart.js';
import { winesAPI, spiritsAPI, beersAPI, sommelierAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import toast from 'react-hot-toast';

ChartJS.register(ArcElement, Tooltip, Legend, LineElement, PointElement, LinearScale, CategoryScale, Filler);

const TYPE_ICONS = {
  rouge: '🍷', blanc: '🥂', rosé: '🌸', pétillant: '✨',
  whisky: '🥃', rhum: '🍹', cognac: '🥃', armagnac: '🥃', calvados: '🍎',
  gin: '🍸', vodka: '🍸', autre: '🍶',
};
const TYPE_COLORS = {
  rouge: '#8B1A1A', blanc: '#C9A84C', rosé: '#C06080', pétillant: '#1A3A7A',
};

// ── Cocktail generator card ───────────────────────────────────────────────────
function CocktailGenerator({ spirits, beers, t }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const available = [
    ...(spirits || []).filter(s => s.status !== 'empty'),
    ...(beers   || []).filter(b => (b.quantity || 0) > 0),
  ];

  const generate = async () => {
    if (!available.length) return;
    setLoading(true);
    setError(null);
    const items = available
      .map(s => `${s.name}${s.type ? ` (${s.type})` : ''}`)
      .join(', ');
    const query = `Propose-moi 3 idées de cocktails ou apéritifs que je peux réaliser avec ces alcools disponibles dans ma cave : ${items}. Pour chaque idée, donne : un nom original, les ingrédients précis avec quantités, et la recette en 2-3 étapes. Réponds en français.`;
    try {
      const r = await sommelierAPI.accord(query);
      setResult(r.data?.result || r.data?.explication || JSON.stringify(r.data));
    } catch (err) {
      setError(err.response?.data?.error || t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  if (!available.length) return null;

  return (
    <div className="card">
      <div className="card-header d-flex align-items-center justify-content-between">
        <h6 className="card-title mb-0">
          <i className="bi bi-cup-straw me-2" style={{ color: 'var(--cv-gold)' }} />
          {t('dashboard.cocktails')}
        </h6>
        <button
          className="btn btn-sm btn-outline-gold"
          onClick={generate}
          disabled={loading}
        >
          {loading
            ? <><span className="spinner-border spinner-border-sm me-1" />{t('dashboard.cocktailsGenerating')}</>
            : <><i className="bi bi-stars me-1" />{result ? t('dashboard.cocktailsNew') : t('dashboard.generateCocktails')}</>
          }
        </button>
      </div>
      <div className="card-body p-3">
        {/* Available items */}
        <div className="mb-2" style={{ fontSize: '0.75rem', color: 'var(--cv-text3)' }}>
          <i className="bi bi-check2 me-1" />{t('dashboard.cocktailsAvailable')}{' '}
          <span style={{ color: 'var(--cv-text2)' }}>
            {available.map(s => s.name).join(' · ')}
          </span>
        </div>

        {/* Results */}
        {error && (
          <div className="alert alert-danger py-2" style={{ fontSize: '0.82rem' }}>{error}</div>
        )}
        {result && !loading && (
          <div style={{
            fontSize: '0.82rem', color: 'var(--cv-text)', lineHeight: 1.65,
            whiteSpace: 'pre-wrap', background: 'rgba(0,0,0,0.15)',
            borderRadius: 6, padding: '0.75rem',
            borderLeft: '3px solid var(--cv-gold)',
            maxHeight: 320, overflowY: 'auto',
          }}>
            {result}
          </div>
        )}
        {!result && !loading && (
          <div className="text-center py-3" style={{ color: 'var(--cv-text3)', fontSize: '0.82rem' }}>
            <i className="bi bi-magic d-block mb-2" style={{ fontSize: '1.5rem', color: 'var(--cv-gold)' }} />
            {t('dashboard.cocktailsHint')}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Soon-peak accord widget ───────────────────────────────────────────────────
function SoonPeakWidget({ wines, t }) {
  const [accords, setAccords] = useState({});
  const [loading, setLoading] = useState({});

  const getAccord = async (wine) => {
    setLoading(s => ({ ...s, [wine.id]: true }));
    const query = `Quel accord mets-vins suggères-tu pour un ${wine.name}${wine.vintage ? ' ' + wine.vintage : ''}${wine.appellation ? ', ' + wine.appellation : ''}${wine.grapes ? ', cépages ' + wine.grapes : ''} ? Donne 3 suggestions courtes de plats en 1-2 lignes.`;
    try {
      const r = await sommelierAPI.accord(query);
      setAccords(s => ({ ...s, [wine.id]: r.data?.result || r.data?.explication || '' }));
    } catch {
      setAccords(s => ({ ...s, [wine.id]: 'Erreur lors de la suggestion' }));
    } finally {
      setLoading(s => ({ ...s, [wine.id]: false }));
    }
  };

  if (!wines || wines.length === 0) return null;

  return (
    <div className="card">
      <div className="card-header">
        <h6 className="card-title mb-0">
          <i className="bi bi-alarm me-2" style={{ color: 'var(--cv-gold)' }} />
          {t('dashboard.soonPeakTitle')}
        </h6>
      </div>
      <div className="card-body p-3">
        <p style={{ fontSize: '0.78rem', color: 'var(--cv-text3)', marginBottom: 12 }}>
          {t('dashboard.soonPeakHint')}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {wines.map(w => (
            <div key={w.id} style={{ background: 'var(--cv-bg3)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--cv-border)' }}>
              <div className="d-flex align-items-start justify-content-between gap-2">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: '0.92rem', color: 'var(--cv-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {w.name}{w.vintage ? ` ${w.vintage}` : ''}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--cv-text3)', marginTop: 2 }}>
                    {[w.appellation, w.region, w.grapes].filter(Boolean).join(' · ')}
                    <span style={{ marginLeft: 6, color: 'var(--cv-gold)' }}>
                      — {t('dashboard.untilYear')} {w.keep_until}
                    </span>
                  </div>
                  {accords[w.id] && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--cv-text)', marginTop: 6, lineHeight: 1.55,
                                  borderLeft: '2px solid var(--cv-gold)', paddingLeft: 8 }}>
                      {accords[w.id]}
                    </div>
                  )}
                </div>
                <div style={{ flexShrink: 0 }}>
                  <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: 3,
                                  background: 'rgba(201,168,76,0.12)', color: 'var(--cv-gold)' }}>
                    ×{w.quantity}
                  </span>
                  {!accords[w.id] && (
                    <button className="btn btn-sm btn-outline-gold d-block mt-1"
                      style={{ fontSize: '0.65rem', padding: '2px 8px', whiteSpace: 'nowrap' }}
                      disabled={loading[w.id]}
                      onClick={() => getAccord(w)}>
                      {loading[w.id]
                        ? <span className="spinner-border spinner-border-sm" />
                        : <><i className="bi bi-fork-knife me-1" />{t('dashboard.getAccord')}</>
                      }
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth();
  const { t } = useLang();
  const [analysisResult, setAnalysisResult] = useState(null);

  const { data: stats, isLoading: statsLoading }   = useQuery({ queryKey: ['wine-stats'], queryFn: () => winesAPI.stats().then(r => r.data) });
  const { data: winesData }                         = useQuery({ queryKey: ['wines', { limit: 6, sort: 'created_at', order: 'DESC' }], queryFn: () => winesAPI.list({ limit: 6, sort: 'created_at', order: 'DESC' }).then(r => r.data) });
  const { data: spirits }                           = useQuery({ queryKey: ['spirits', {}], queryFn: () => spiritsAPI.list().then(r => r.data) });
  const { data: beers }                             = useQuery({ queryKey: ['beers', {}], queryFn: () => beersAPI.list().then(r => r.data) });
  const { data: valueHistory = [] }                 = useQuery({ queryKey: ['value-history'], queryFn: () => winesAPI.valueHistory().then(r => r.data), staleTime: 3_600_000 });
  const { data: allWinesForAging }                  = useQuery({ queryKey: ['wines', { status: 'stock', limit: 100 }], queryFn: () => winesAPI.list({ status: 'stock', limit: 100 }).then(r => r.data) });
  const { data: soonPeakWines = [] }                = useQuery({ queryKey: ['soon-peak'], queryFn: () => winesAPI.soonPeak().then(r => r.data), staleTime: 300_000 });

  const analyseMutation = useMutation({
    mutationFn: () => sommelierAPI.analyse().then(r => r.data),
    onSuccess: (data) => setAnalysisResult(data),
    onError: (err) => toast.error(err.response?.data?.error || t('common.error')),
  });

  const recentWines   = winesData?.wines || [];
  const recentSpirits = (spirits || []).filter(s => s.status !== 'empty').slice(0, 5);
  const caveValue     = stats?.cave_value
    ? parseFloat(stats.cave_value).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
    : '—';

  const statCards = [
    { num: statsLoading ? '…' : (stats?.total_bottles || 0), label: t('dashboard.totalBottles'), icon: 'bi-grid-3x3', link: '/wines' },
    { num: statsLoading ? '…' : (stats?.total_refs || 0),    label: t('dashboard.refs'),         icon: 'bi-bookmark',  link: '/wines' },
    { num: statsLoading ? '…' : (stats?.drunk_count || 0),   label: t('dashboard.drunk'),        icon: 'bi-check-circle', link: '/wines?status=drunk' },
    { num: statsLoading ? '…' : caveValue,                   label: t('dashboard.caveValue'),    icon: 'bi-currency-euro', link: '/wines' },
  ];

  // Donut chart
  const donutData = stats?.by_type?.length ? {
    labels: stats.by_type.map(it => it.type.charAt(0).toUpperCase() + it.type.slice(1)),
    datasets: [{
      data: stats.by_type.map(it => it.bottles),
      backgroundColor: stats.by_type.map(it => TYPE_COLORS[it.type] || '#6c757d'),
      borderColor: '#2C1A1A', borderWidth: 2,
    }],
  } : null;

  const donutOptions = {
    plugins: { legend: { position: 'bottom', labels: { color: '#B09070', font: { size: 11 }, padding: 12 } } },
    cutout: '68%', animation: { animateRotate: true },
  };

  // Line chart
  const lineData = valueHistory.length >= 2 ? {
    labels: valueHistory.map(r => { const d = new Date(r.recorded_at); return `${d.getDate()}/${d.getMonth() + 1}`; }),
    datasets: [{
      label: t('dashboard.valueHistory'),
      data: valueHistory.map(r => parseFloat(r.total_value) || 0),
      fill: true, borderColor: '#C9A84C', backgroundColor: 'rgba(201,168,76,0.12)',
      tension: 0.4, pointRadius: 2, pointHoverRadius: 5,
    }],
  } : null;

  const lineOptions = {
    responsive: true,
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.parsed.y.toLocaleString('fr-FR')} €` } } },
    scales: {
      x: { grid: { color: 'rgba(201,168,76,0.08)' }, ticks: { color: '#B09070', font: { size: 10 }, maxTicksLimit: 8 } },
      y: { grid: { color: 'rgba(201,168,76,0.08)' }, ticks: { color: '#B09070', font: { size: 10 }, callback: v => `${v.toLocaleString('fr-FR')} €` } },
    },
  };

  // Aging tracker
  const now = new Date().getFullYear();
  const agingWines  = (allWinesForAging?.wines || [])
    .filter(w => w.keep_until && !w.is_drunk && w.quantity > 0)
    .map(w => ({ ...w, ku: parseInt(w.keep_until) }))
    .sort((a, b) => a.ku - b.ku);
  const pastPrime   = agingWines.filter(w => w.ku < now - 1);
  const atPeak      = agingWines.filter(w => w.ku >= now - 1 && w.ku <= now + 2);
  const approaching = agingWines.filter(w => w.ku > now + 2 && w.ku <= now + 5);
  const tooYoung    = agingWines.filter(w => w.ku > now + 5);

  return (
    <div className="fade-in">
      {/* Welcome */}
      <div className="mb-4">
        <h2 className="font-serif" style={{ fontSize: '1.8rem', color: 'var(--cv-gold)', fontStyle: 'italic' }}>
          {t('dashboard.hello')} {user?.username} 🍷
        </h2>
        <p style={{ color: 'var(--cv-text2)', fontSize: '0.85rem' }}>{t('dashboard.todayStatus')}</p>
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
                  <i className={`bi ${s.icon}`} style={{ fontSize: '1.2rem', color: 'var(--cv-text3)' }} />
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
              <div className="card-header"><h6 className="card-title">{t('dashboard.byType')}</h6></div>
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
                    <div style={{ fontSize: '0.7rem', color: 'var(--cv-text3)', letterSpacing: 2, textTransform: 'uppercase' }}>{t('dashboard.avgAccordRating')}</div>
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
                { to: '/wishlist',  icon: 'bi-heart',   label: t('dashboard.wishlist'),     cls: 'btn-outline-gold' },
                { to: '/wines',     icon: 'bi-plus',    label: t('dashboard.addWine'),      cls: 'btn-outline-gold' },
                { to: '/spirits',   icon: 'bi-plus',    label: t('dashboard.addSpirit'),    cls: 'btn-outline-gold' },
              ].map(a => (
                <Link key={a.to} to={a.to} className={`btn ${a.cls} text-start`} style={{ fontSize: '0.82rem' }}>
                  <i className={`bi ${a.icon} me-2`} />{a.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Top regions */}
        {stats?.by_region?.length > 0 && (
          <div className="col-lg-4">
            <div className="card h-100">
              <div className="card-header"><h6 className="card-title">{t('dashboard.regions')}</h6></div>
              <div className="card-body p-3">
                {stats.by_region.slice(0, 6).map((r, i) => (
                  <div key={i} className="d-flex align-items-center gap-2 mb-2">
                    <i className="bi bi-geo-alt" style={{ color: 'var(--cv-text3)', fontSize: '0.8rem' }} />
                    <span style={{ flex: 1, fontSize: '0.82rem', color: 'var(--cv-text)' }}>{r.region || t('common.unknown')}</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--cv-text3)' }}>{r.country}</span>
                    <span style={{ fontSize: '0.82rem', color: 'var(--cv-gold)', fontFamily: 'Cormorant Garamond,serif' }}>{r.bottles}×</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Cocktail generator */}
      <div className="row g-3 mb-4">
        <div className="col-12">
          <CocktailGenerator spirits={spirits} beers={beers} t={t} />
        </div>
      </div>

      {/* Soon-peak accord widget */}
      {soonPeakWines.length > 0 && (
        <div className="row g-3 mb-4">
          <div className="col-12">
            <SoonPeakWidget wines={soonPeakWines} t={t} />
          </div>
        </div>
      )}

      {/* AI Cave Analysis */}
      <div className="row g-3 mb-4">
        <div className="col-12">
          <div className="card">
            <div className="card-header d-flex align-items-center justify-content-between">
              <h6 className="card-title mb-0">
                <i className="bi bi-stars me-2" style={{ color: 'var(--cv-gold)' }} />
                {t('dashboard.aiAnalysis')}
              </h6>
              <button className="btn btn-sm btn-outline-gold" onClick={() => analyseMutation.mutate()} disabled={analyseMutation.isPending}>
                {analyseMutation.isPending
                  ? <><span className="spinner-border spinner-border-sm me-1" />{t('common.loading')}</>
                  : <><i className="bi bi-arrow-repeat me-1" />{t('dashboard.analyze')}</>
                }
              </button>
            </div>
            {analysisResult ? (
              <div className="card-body">
                <div className="row g-3">
                  <div className="col-md-4">
                    <div className="d-flex gap-3 mb-3">
                      {[[t('dashboard.diversity'), analysisResult.score_diversite], [t('dashboard.balance'), analysisResult.score_equilibre]].map(([lbl, score]) => (
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
                        <div style={{ fontSize: '0.68rem', letterSpacing: 2, color: '#4CAF50', textTransform: 'uppercase', marginBottom: 4 }}>{t('dashboard.strengths')}</div>
                        {analysisResult.points_forts.map((p, i) => (
                          <div key={i} style={{ fontSize: '0.8rem', color: 'var(--cv-text)', padding: '2px 0' }}>✓ {p}</div>
                        ))}
                      </div>
                    )}
                    {analysisResult.axes_amelioration?.length > 0 && (
                      <div>
                        <div style={{ fontSize: '0.68rem', letterSpacing: 2, color: 'var(--cv-gold)', textTransform: 'uppercase', marginBottom: 4 }}>{t('dashboard.improvements')}</div>
                        {analysisResult.axes_amelioration.map((p, i) => (
                          <div key={i} style={{ fontSize: '0.8rem', color: 'var(--cv-text)', padding: '2px 0' }}>→ {p}</div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="col-md-4">
                    {analysisResult.a_deguster_maintenant?.length > 0 && (
                      <div className="mb-3">
                        <div style={{ fontSize: '0.68rem', letterSpacing: 2, color: 'var(--cv-wine)', textTransform: 'uppercase', marginBottom: 4 }}>{t('dashboard.drinkNow')}</div>
                        {analysisResult.a_deguster_maintenant.map((w, i) => (
                          <div key={i} style={{ fontSize: '0.8rem', color: 'var(--cv-text)', padding: '2px 0' }}>{w}</div>
                        ))}
                      </div>
                    )}
                    {analysisResult.occasion_parfaite && (
                      <div style={{ background: 'var(--cv-bg2)', borderRadius: 8, padding: '0.75rem' }}>
                        <div style={{ fontSize: '0.68rem', color: 'var(--cv-gold)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{t('dashboard.perfectOccasion')}</div>
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
                <i className="bi bi-cpu d-block mb-2" style={{ fontSize: '2rem', color: 'var(--cv-gold)' }} />
                <p style={{ fontSize: '0.85rem' }}>{t('dashboard.aiAnalysisHint')}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Value history + Aging tracker */}
      <div className="row g-3 mb-4">
        {lineData && (
          <div className="col-lg-7">
            <div className="card h-100">
              <div className="card-header">
                <h6 className="card-title"><i className="bi bi-graph-up me-2" style={{ color: 'var(--cv-gold)' }} />{t('dashboard.valueHistory')}</h6>
              </div>
              <div className="card-body p-3"><Line data={lineData} options={lineOptions} /></div>
            </div>
          </div>
        )}

        {agingWines.length > 0 && (
          <div className={lineData ? 'col-lg-5' : 'col-12'}>
            <div className="card h-100">
              <div className="card-header">
                <h6 className="card-title"><i className="bi bi-hourglass-split me-2" style={{ color: 'var(--cv-gold)' }} />{t('dashboard.agingTracker')}</h6>
              </div>
              <div className="card-body p-3" style={{ overflowY: 'auto', maxHeight: 280 }}>
                {pastPrime.length > 0 && (
                  <div className="mb-3">
                    <div style={{ fontSize: '0.62rem', letterSpacing: 2, color: '#dc3545', textTransform: 'uppercase', marginBottom: 4 }}>⚠ {t('dashboard.pastPrime')} ({pastPrime.length})</div>
                    {pastPrime.slice(0, 3).map(w => (
                      <div key={w.id} className="d-flex justify-content-between align-items-center py-1" style={{ borderBottom: '0.5px solid var(--cv-border)', fontSize: '0.8rem' }}>
                        <span style={{ color: 'var(--cv-text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</span>
                        <span style={{ color: '#dc3545', flexShrink: 0, marginLeft: 8 }}>{w.ku} ×{w.quantity}</span>
                      </div>
                    ))}
                    {pastPrime.length > 3 && <div style={{ fontSize: '0.72rem', color: 'var(--cv-text3)', marginTop: 2 }}>+{pastPrime.length - 3} autres</div>}
                  </div>
                )}
                {atPeak.length > 0 && (
                  <div className="mb-3">
                    <div style={{ fontSize: '0.62rem', letterSpacing: 2, color: '#4CAF50', textTransform: 'uppercase', marginBottom: 4 }}>🍷 {t('dashboard.atPeak')} ({atPeak.length})</div>
                    {atPeak.slice(0, 4).map(w => (
                      <div key={w.id} className="d-flex justify-content-between align-items-center py-1" style={{ borderBottom: '0.5px solid var(--cv-border)', fontSize: '0.8rem' }}>
                        <span style={{ color: 'var(--cv-text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</span>
                        <span style={{ color: '#4CAF50', flexShrink: 0, marginLeft: 8 }}>{w.ku} ×{w.quantity}</span>
                      </div>
                    ))}
                    {atPeak.length > 4 && <div style={{ fontSize: '0.72rem', color: 'var(--cv-text3)', marginTop: 2 }}>+{atPeak.length - 4} autres</div>}
                  </div>
                )}
                {approaching.length > 0 && (
                  <div className="mb-2">
                    <div style={{ fontSize: '0.62rem', letterSpacing: 2, color: 'var(--cv-gold)', textTransform: 'uppercase', marginBottom: 4 }}>⏳ {t('dashboard.approaching')} ({approaching.length})</div>
                    {approaching.slice(0, 3).map(w => (
                      <div key={w.id} className="d-flex justify-content-between align-items-center py-1" style={{ borderBottom: '0.5px solid var(--cv-border)', fontSize: '0.8rem' }}>
                        <span style={{ color: 'var(--cv-text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</span>
                        <span style={{ color: 'var(--cv-gold)', flexShrink: 0, marginLeft: 8 }}>{w.ku} ×{w.quantity}</span>
                      </div>
                    ))}
                  </div>
                )}
                {tooYoung.length > 0 && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--cv-text3)', marginTop: 4 }}>
                    <i className="bi bi-lock me-1" />{tooYoung.length} vin{tooYoung.length > 1 ? 's' : ''} {t('dashboard.tooYoung')}
                  </div>
                )}
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
              <h6 className="card-title">{t('dashboard.recentWines')}</h6>
              <Link to="/wines" style={{ fontSize: '0.75rem', color: 'var(--cv-gold)', textDecoration: 'none' }}>{t('dashboard.seeAll')}</Link>
            </div>
            <div className="card-body p-2">
              {recentWines.length === 0 ? (
                <div className="text-center p-4" style={{ color: 'var(--cv-text3)' }}>
                  <i className="bi bi-grid d-block mb-2" style={{ fontSize: '2rem' }} />
                  <Link to="/wines" className="btn btn-gold btn-sm">{t('dashboard.addWine')}</Link>
                </div>
              ) : recentWines.map(w => (
                <div key={w.id} className="d-flex align-items-center gap-2 p-2" style={{ borderBottom: '0.5px solid var(--cv-border)' }}>
                  <span style={{ fontSize: '1.1rem' }}>{TYPE_ICONS[w.type] || '🍷'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--cv-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'Cormorant Garamond,serif' }}>{w.name}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--cv-text2)' }}>{[w.vintage, w.region].filter(Boolean).join(' · ')}</div>
                  </div>
                  {w.is_drunk || w.quantity === 0 ? <span className="badge-drunk">{t('wines.isDrunk')}</span> : <span className="badge-stock">{t('wines.inCave')}</span>}
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
              <h6 className="card-title">{t('dashboard.spiritsSection')}</h6>
              <Link to="/spirits" style={{ fontSize: '0.75rem', color: 'var(--cv-gold)', textDecoration: 'none' }}>{t('dashboard.seeAll')}</Link>
            </div>
            <div className="card-body p-2">
              {recentSpirits.length === 0 ? (
                <div className="text-center p-4" style={{ color: 'var(--cv-text3)' }}>
                  <i className="bi bi-cup-hot d-block mb-2" style={{ fontSize: '2rem' }} />
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
                  <span className={s.status === 'open' ? 'badge-open' : 'badge-stock'}>
                    {s.status === 'open' ? t('common.opened') : t('common.closed')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
