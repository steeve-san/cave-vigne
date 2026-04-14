// src/pages/StatsPage.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Statistiques avancées : répartition par région/type/pays, rotation annuelle
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend,
  BarElement, LineElement, PointElement, LinearScale, CategoryScale, Filler,
} from 'chart.js';
import { statsAPI } from '../services/api';
import { useLang } from '../context/LangContext';

ChartJS.register(ArcElement, Tooltip, Legend, BarElement, LineElement, PointElement, LinearScale, CategoryScale, Filler);

const TYPE_COLORS = {
  rouge: '#8B1A1A', blanc: '#C9A84C', rosé: '#C06080', pétillant: '#1A3A7A',
};

const chartDefaults = {
  responsive: true,
  plugins: {
    legend: { labels: { color: '#B09070', font: { size: 11 }, padding: 12 } },
  },
};

export default function StatsPage() {
  const { t } = useLang();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['stats-advanced'],
    queryFn: () => statsAPI.advanced().then(r => r.data),
    staleTime: 120_000,
  });

  if (isLoading) return (
    <div className="d-flex justify-content-center align-items-center" style={{ minHeight: 300 }}>
      <div className="spinner-border" style={{ color: 'var(--cv-gold)' }} />
    </div>
  );

  if (isError) return (
    <div className="alert alert-danger">{t('common.error')}</div>
  );

  const { by_region = [], by_type = [], by_country = [], rotation = [], summary = {}, peak_timeline = [] } = data || {};
  const nowYear = new Date().getFullYear();

  // ── Summary cards ─────────────────────────────────────────────────────────
  const summaryCards = [
    { num: summary.total_bottles ?? '—',  label: t('stats.totalBottles'), icon: 'bi-grid-3x3' },
    { num: summary.total_refs    ?? '—',  label: t('stats.totalRefs'),    icon: 'bi-bookmark' },
    {
      num: summary.total_value
        ? parseFloat(summary.total_value).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
        : '—',
      label: t('stats.totalValue'), icon: 'bi-currency-euro',
    },
    { num: summary.drunk_count ?? '—',   label: t('stats.consumed'),     icon: 'bi-check-circle' },
  ];

  // ── Region bar chart ──────────────────────────────────────────────────────
  const regionData = by_region.length ? {
    labels: by_region.slice(0, 12).map(r => r.region || t('common.unknown')),
    datasets: [{
      label: t('stats.bottles'),
      data: by_region.slice(0, 12).map(r => r.bottles),
      backgroundColor: 'rgba(139,26,26,0.7)',
      borderColor: '#8B1A1A',
      borderWidth: 1,
      borderRadius: 4,
    }],
  } : null;

  const regionOptions = {
    ...chartDefaults,
    indexAxis: 'y',
    plugins: { ...chartDefaults.plugins, legend: { display: false } },
    scales: {
      x: { grid: { color: 'rgba(201,168,76,0.08)' }, ticks: { color: '#B09070', font: { size: 10 } } },
      y: { grid: { color: 'rgba(201,168,76,0.08)' }, ticks: { color: '#B09070', font: { size: 10 } } },
    },
  };

  // ── Type doughnut ─────────────────────────────────────────────────────────
  const typeData = by_type.length ? {
    labels: by_type.map(r => r.type.charAt(0).toUpperCase() + r.type.slice(1)),
    datasets: [{
      data: by_type.map(r => r.bottles),
      backgroundColor: by_type.map(r => TYPE_COLORS[r.type] || '#6c757d'),
      borderColor: '#1a0a0a',
      borderWidth: 2,
    }],
  } : null;

  const typeOptions = {
    ...chartDefaults,
    cutout: '65%',
    plugins: { ...chartDefaults.plugins, legend: { position: 'bottom', labels: { color: '#B09070', font: { size: 11 } } } },
  };

  // ── Rotation line chart ───────────────────────────────────────────────────
  const rotYears = [...new Set([...rotation.map(r => r.year)])].sort();
  const addedByYear = Object.fromEntries(rotation.filter(r => r.direction === 'added').map(r => [r.year, r.count]));
  const drunkByYear  = Object.fromEntries(rotation.filter(r => r.direction === 'drunk').map(r  => [r.year, r.count]));

  const rotationData = rotYears.length >= 2 ? {
    labels: rotYears,
    datasets: [
      {
        label: t('stats.added'),
        data: rotYears.map(y => addedByYear[y] || 0),
        borderColor: '#4CAF50', backgroundColor: 'rgba(76,175,80,0.08)',
        tension: 0.4, fill: true, pointRadius: 3,
      },
      {
        label: t('stats.consumed'),
        data: rotYears.map(y => drunkByYear[y] || 0),
        borderColor: '#8B1A1A', backgroundColor: 'rgba(139,26,26,0.08)',
        tension: 0.4, fill: true, pointRadius: 3,
      },
    ],
  } : null;

  const rotationOptions = {
    ...chartDefaults,
    plugins: { ...chartDefaults.plugins, legend: { position: 'top', labels: { color: '#B09070', font: { size: 11 } } } },
    scales: {
      x: { grid: { color: 'rgba(201,168,76,0.08)' }, ticks: { color: '#B09070', font: { size: 10 } } },
      y: { grid: { color: 'rgba(201,168,76,0.08)' }, ticks: { color: '#B09070', font: { size: 10 } }, beginAtZero: true },
    },
  };

  return (
    <div className="fade-in">
      {/* Summary cards */}
      <div className="row g-3 mb-4">
        {summaryCards.map((s, i) => (
          <div className="col-6 col-xl-3" key={i}>
            <div className="stat-card h-100">
              <div className="d-flex justify-content-between align-items-start">
                <div>
                  <div className="stat-num">{s.num}</div>
                  <div className="stat-label">{s.label}</div>
                </div>
                <i className={`bi ${s.icon}`} style={{ fontSize: '1.2rem', color: 'var(--cv-text3)' }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="row g-3 mb-4">
        {/* Region bar */}
        {regionData && (
          <div className="col-lg-8">
            <div className="card h-100">
              <div className="card-header">
                <h6 className="card-title"><i className="bi bi-geo-alt me-2" style={{ color: 'var(--cv-gold)' }} />{t('stats.byRegion')}</h6>
              </div>
              <div className="card-body p-3" style={{ maxHeight: 420, overflowY: 'auto' }}>
                <Bar data={regionData} options={regionOptions} />
              </div>
            </div>
          </div>
        )}

        {/* Type doughnut */}
        {typeData && (
          <div className="col-lg-4">
            <div className="card h-100">
              <div className="card-header">
                <h6 className="card-title"><i className="bi bi-pie-chart me-2" style={{ color: 'var(--cv-gold)' }} />{t('stats.byType')}</h6>
              </div>
              <div className="card-body d-flex flex-column align-items-center justify-content-center p-3">
                <div style={{ width: '100%', maxWidth: 240 }}>
                  <Doughnut data={typeData} options={typeOptions} />
                </div>
                <div className="mt-3 w-100" style={{ borderTop: '0.5px solid var(--cv-border)', paddingTop: 12 }}>
                  {by_type.map((r, i) => (
                    <div key={i} className="d-flex justify-content-between align-items-center mb-1">
                      <span style={{ fontSize: '0.8rem', color: 'var(--cv-text)' }}>
                        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: TYPE_COLORS[r.type] || '#6c757d', marginRight: 6 }} />
                        {r.type.charAt(0).toUpperCase() + r.type.slice(1)}
                      </span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--cv-gold)', fontFamily: 'Cormorant Garamond,serif' }}>
                        {r.bottles} btl.
                        {r.value > 0 ? <span style={{ color: 'var(--cv-text3)', fontSize: '0.72rem', marginLeft: 6 }}>
                          {parseFloat(r.value).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
                        </span> : null}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Peak timeline / Gantt */}
      {peak_timeline.length > 0 && (
        <div className="row g-3 mb-4">
          <div className="col-12">
            <div className="card">
              <div className="card-header">
                <h6 className="card-title"><i className="bi bi-calendar3 me-2" style={{ color: 'var(--cv-gold)' }} />Apogée des vins — calendrier de dégustation</h6>
              </div>
              <div className="card-body p-3">
                <div style={{ fontSize: '0.72rem', color: 'var(--cv-text3)', marginBottom: 12 }}>
                  Fenêtre {nowYear - 2}–{nowYear + 8} · barres proportionnelles au nombre de bouteilles
                </div>
                {(() => {
                  const maxBottles = Math.max(...peak_timeline.map(r => r.total), 1);
                  const TYPE_COLORS_GANTT = { rouge: '#8B1A1A', blanc: '#C9A84C', rosé: '#C06080', pétillant: '#1A3A7A' };
                  return peak_timeline.map(row => (
                    <div key={row.year} className="mb-2">
                      <div className="d-flex align-items-center gap-2 mb-1">
                        <div style={{ width: 42, flexShrink: 0, textAlign: 'right', fontSize: '0.78rem',
                          color: row.year < nowYear ? '#dc3545' : row.year <= nowYear + 1 ? '#4CAF50' : 'var(--cv-gold)',
                          fontWeight: row.year >= nowYear - 1 && row.year <= nowYear + 1 ? 700 : 400 }}>
                          {row.year}
                          {row.year >= nowYear - 1 && row.year <= nowYear + 1 && <span style={{ fontSize: '0.6rem', marginLeft: 2 }}>★</span>}
                        </div>
                        <div style={{ flex: 1, height: 18, borderRadius: 4, overflow: 'hidden', background: 'var(--cv-bg3)', display: 'flex' }}>
                          {Object.entries(row.byType).map(([type, bottles]) => (
                            <div key={type}
                              title={`${type}: ${bottles} btl.`}
                              style={{ width: `${(bottles / maxBottles) * 100}%`, minWidth: bottles > 0 ? 4 : 0,
                                background: TYPE_COLORS_GANTT[type] || '#6c757d',
                                opacity: row.year < nowYear ? 0.45 : 1, transition: 'width 0.5s ease' }} />
                          ))}
                        </div>
                        <div style={{ width: 28, flexShrink: 0, fontSize: '0.72rem', color: 'var(--cv-gold)', textAlign: 'right' }}>
                          {row.total}×
                        </div>
                      </div>
                      {row.sample?.slice(0, 2).map((n, i) => (
                        <div key={i} style={{ fontSize: '0.68rem', color: 'var(--cv-text3)', marginLeft: 50, marginTop: -2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {n}
                        </div>
                      ))}
                    </div>
                  ));
                })()}
                <div className="d-flex gap-3 mt-3" style={{ flexWrap: 'wrap' }}>
                  {[['rouge','#8B1A1A','Rouge'], ['blanc','#C9A84C','Blanc'], ['rosé','#C06080','Rosé'], ['pétillant','#1A3A7A','Pétillant']].map(([type, color, label]) => (
                    <div key={type} className="d-flex align-items-center gap-1" style={{ fontSize: '0.72rem', color: 'var(--cv-text3)' }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
                      {label}
                    </div>
                  ))}
                  <div className="d-flex align-items-center gap-1 ms-auto" style={{ fontSize: '0.68rem', color: 'var(--cv-text3)' }}>
                    <span style={{ color: '#4CAF50' }}>★</span> apogée maintenant
                    <span style={{ color: '#dc3545', marginLeft: 8 }}>■</span> passé
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="row g-3 mb-4">
        {/* Rotation chart */}
        {rotationData && (
          <div className="col-lg-8">
            <div className="card h-100">
              <div className="card-header">
                <h6 className="card-title"><i className="bi bi-arrow-repeat me-2" style={{ color: 'var(--cv-gold)' }} />{t('stats.rotation')}</h6>
              </div>
              <div className="card-body p-3">
                <Line data={rotationData} options={rotationOptions} />
              </div>
            </div>
          </div>
        )}

        {/* Top countries */}
        {by_country.length > 0 && (
          <div className="col-lg-4">
            <div className="card h-100">
              <div className="card-header">
                <h6 className="card-title"><i className="bi bi-globe me-2" style={{ color: 'var(--cv-gold)' }} />{t('stats.byCountry')}</h6>
              </div>
              <div className="card-body p-3">
                {by_country.map((c, i) => {
                  const max = by_country[0]?.bottles || 1;
                  return (
                    <div key={i} className="mb-2">
                      <div className="d-flex justify-content-between mb-1">
                        <span style={{ fontSize: '0.82rem', color: 'var(--cv-text)' }}>{c.country || t('common.unknown')}</span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--cv-gold)', fontFamily: 'Cormorant Garamond,serif' }}>{c.bottles}</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 2, background: 'var(--cv-bg3)' }}>
                        <div style={{ height: '100%', borderRadius: 2, background: 'var(--cv-wine)', width: `${(c.bottles / max) * 100}%`, transition: 'width 0.6s ease' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
