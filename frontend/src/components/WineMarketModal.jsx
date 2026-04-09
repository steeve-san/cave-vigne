// src/components/WineMarketModal.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Recherche de prix de marché et disponibilité pour racheter une bouteille
// Sources : Vivino · Vinatis · iDéalwine
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { winesAPI, wishlistAPI } from '../services/api';
import toast from 'react-hot-toast';

const SOURCE_ICONS = {
  Vivino:    { icon: 'bi-graph-up',      col: '#aa336a' },
  Vinatis:   { icon: 'bi-shop',          col: '#8B1A1A' },
  iDéalwine: { icon: 'bi-hammer',        col: '#7A4A10' },
};

export default function WineMarketModal({ wine, onClose }) {
  const [loading,    setLoading]    = useState(true);
  const [results,    setResults]    = useState([]);
  const [error,      setError]      = useState(null);
  const [query,      setQuery]      = useState('');
  const [addedToWL,  setAddedToWL]  = useState(new Set());

  const addToWishlist = async (r) => {
    try {
      await wishlistAPI.create({
        name:      wine.name,
        producer:  wine.producer || null,
        vintage:   wine.vintage  || null,
        type:      wine.type     || 'rouge',
        region:    wine.region   || null,
        priority:  'medium',
        price_max: r.price_avg   || null,
        url:       r.source_url  || null,
        notes:     `Prix de référence : ${r.price_avg ? r.price_avg.toFixed(2) + ' € (' + r.source + ')' : r.source}`,
      });
      setAddedToWL(s => new Set([...s, r.source]));
      toast.success('Ajouté à la liste de souhaits !');
    } catch {
      toast.error('Erreur lors de l\'ajout à la wishlist');
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    winesAPI.marketSearch(wine.id)
      .then(r => {
        if (cancelled) return;
        setResults(r.data?.results || []);
        setQuery(r.data?.query || wine.name);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err.response?.data?.error || 'Erreur de recherche');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [wine.id]);

  const pricesAvg = results.filter(r => r.price_avg).map(r => r.price_avg);
  const lowestPrice  = pricesAvg.length ? Math.min(...pricesAvg) : null;
  const avgPrice     = pricesAvg.length ? pricesAvg.reduce((a, b) => a + b, 0) / pricesAvg.length : null;

  return (
    <div
      className="modal show d-block"
      style={{ background: 'rgba(0,0,0,0.75)', zIndex: 1070 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-dialog modal-dialog-centered modal-lg">
        <div className="modal-content">

          {/* Header */}
          <div className="modal-header">
            <h5 className="modal-title">
              <i className="bi bi-cart-check me-2" style={{ color: 'var(--cv-gold)' }} />
              Racheter — <span style={{ color: 'var(--cv-gold)', fontFamily: 'Cormorant Garamond,serif' }}>{wine.name}{wine.vintage ? ` ${wine.vintage}` : ''}</span>
            </h5>
            <button className="btn-close" onClick={onClose} />
          </div>

          <div className="modal-body">
            {loading && (
              <div className="text-center py-4">
                <div className="spinner-border" style={{ color: 'var(--cv-gold)' }} />
                <p style={{ fontSize: '0.85rem', color: 'var(--cv-text2)', marginTop: 12 }}>
                  Recherche des prix sur Vivino, Vinatis, iDéalwine…
                </p>
              </div>
            )}

            {error && !loading && (
              <div className="alert alert-danger">
                <i className="bi bi-exclamation-triangle me-2" />{error}
              </div>
            )}

            {!loading && !error && results.length === 0 && (
              <div className="text-center py-4" style={{ color: 'var(--cv-text3)' }}>
                <i className="bi bi-search d-block mb-2" style={{ fontSize: '2rem' }} />
                <p style={{ fontSize: '0.85rem' }}>Aucun résultat trouvé pour « {query} »</p>
                <p style={{ fontSize: '0.75rem' }}>Essayez de modifier le nom ou le millésime dans la fiche du vin.</p>
              </div>
            )}

            {!loading && results.length > 0 && (
              <>
                {/* Price summary */}
                <div className="row g-3 mb-3">
                  {lowestPrice && (
                    <div className="col-6">
                      <div className="stat-card text-center">
                        <div style={{ fontSize: '1.6rem', fontFamily: 'Cormorant Garamond,serif', color: '#4ade80', fontWeight: 700 }}>
                          {lowestPrice.toFixed(2)} €
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--cv-text3)', textTransform: 'uppercase', letterSpacing: 1 }}>
                          Prix le plus bas
                        </div>
                      </div>
                    </div>
                  )}
                  {avgPrice && pricesAvg.length > 1 && (
                    <div className="col-6">
                      <div className="stat-card text-center">
                        <div style={{ fontSize: '1.6rem', fontFamily: 'Cormorant Garamond,serif', color: 'var(--cv-gold)', fontWeight: 700 }}>
                          {avgPrice.toFixed(2)} €
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--cv-text3)', textTransform: 'uppercase', letterSpacing: 1 }}>
                          Prix moyen ({pricesAvg.length} sources)
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Results list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {results.map((r, i) => {
                    const src = SOURCE_ICONS[r.source] || { icon: 'bi-globe', col: '#888' };
                    return (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        background: 'var(--cv-bg3)', borderRadius: 8,
                        padding: '12px 14px', border: '1px solid var(--cv-border)',
                      }}>
                        {/* Source badge */}
                        <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 68 }}>
                          <i className={`bi ${src.icon}`} style={{ fontSize: '1.1rem', color: src.col, display: 'block' }} />
                          <span style={{ fontSize: '0.65rem', color: 'var(--cv-text3)', letterSpacing: 0.5 }}>{r.source}</span>
                        </div>

                        {/* Details */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.88rem', color: 'var(--cv-text)', fontFamily: 'Cormorant Garamond,serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.name}{r.vintage ? ` ${r.vintage}` : ''}
                          </div>
                          <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                            {r.availability && (
                              <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: 3, background: 'rgba(74,222,128,0.15)', color: '#4ade80' }}>
                                <i className="bi bi-check-circle me-1" />{r.availability}
                              </span>
                            )}
                            {r.rating && (
                              <span style={{ fontSize: '0.7rem', color: 'var(--cv-gold)' }}>
                                ★ {Number(r.rating).toFixed(1)}{r.ratings_count ? ` (${r.ratings_count.toLocaleString()})` : ''}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Price + link + wishlist */}
                        <div style={{ flexShrink: 0, textAlign: 'right' }}>
                          {r.price_avg ? (
                            <div style={{ fontSize: '1.1rem', fontFamily: 'Cormorant Garamond,serif', color: r.price_avg === lowestPrice ? '#4ade80' : 'var(--cv-gold)', fontWeight: 700 }}>
                              {r.price_avg.toFixed(2)} {r.currency || '€'}
                            </div>
                          ) : (
                            <div style={{ fontSize: '0.75rem', color: 'var(--cv-text3)' }}>Prix NC</div>
                          )}
                          <div className="d-flex gap-1 justify-content-end mt-1 flex-wrap">
                            {r.source_url && (
                              <a
                                href={r.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-sm btn-outline-gold"
                                style={{ fontSize: '0.68rem', padding: '2px 8px' }}
                              >
                                Voir <i className="bi bi-box-arrow-up-right ms-1" />
                              </a>
                            )}
                            <button
                              className="btn btn-sm"
                              style={{ fontSize: '0.68rem', padding: '2px 8px',
                                       color: addedToWL.has(r.source) ? '#4ade80' : 'var(--cv-text2)',
                                       border: `0.5px solid ${addedToWL.has(r.source) ? '#4ade80' : 'var(--cv-border)'}`,
                                       borderRadius: 4, background: 'none' }}
                              onClick={() => addToWishlist(r)}
                              title="Ajouter à la liste de souhaits"
                            >
                              <i className={`bi bi-${addedToWL.has(r.source) ? 'heart-fill' : 'heart'}`} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Disclaimer */}
                <div style={{ marginTop: 12, fontSize: '0.7rem', color: 'var(--cv-text3)', fontStyle: 'italic' }}>
                  <i className="bi bi-info-circle me-1" />
                  Les prix sont indicatifs et peuvent varier. Cliquez sur "Voir" pour accéder à la page officielle.
                </div>
              </>
            )}
          </div>

          <div className="modal-footer">
            <button className="btn btn-outline-gold" onClick={onClose}>Fermer</button>
          </div>
        </div>
      </div>
    </div>
  );
}
