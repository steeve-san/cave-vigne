// src/pages/SommelierPage.jsx
import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { sommelierAPI } from '../services/api';
import toast from 'react-hot-toast';

const CHIPS = ['Lasagnes au bœuf','Côte de bœuf grillée','Foie gras poêlé','Saint-Jacques snackées','Saumon fumé','Plateau fromages','Fondant chocolat','Huîtres fraîches','Agneau rôti','Poulet rôti','Pizza margherita','Sushi & sashimi','Tajine d\'agneau','Risotto aux champignons'];

const Stars = ({ n }) => Array.from({ length: 5 }, (_, i) => (
  <span key={i} className={i < n ? 'star-full' : 'star-empty'}>★</span>
));

export default function SommelierPage() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);

  const mutation = useMutation({
    mutationFn: (q) => sommelierAPI.accord(q).then(r => r.data),
    onSuccess: (data) => setResult(data),
    onError: (err) => {
      const msg = err.response?.data?.error || 'Erreur du service IA';
      toast.error(msg, { duration: 6000 });
    },
  });

  const ask = (q) => { const v = q || query; if (!v.trim()) return; setQuery(v); mutation.mutate(v); };

  return (
    <div className="fade-in">
      <div className="row g-3">
        {/* Left: input */}
        <div className="col-12">
          <div className="card p-4">
            <div className="d-flex align-items-center gap-3 mb-3">
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(201,168,76,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.4rem', flexShrink:0 }}>✦</div>
              <div>
                <div className="font-serif" style={{ fontSize:'1.3rem', color:'var(--cv-gold)', fontStyle:'italic' }}>Votre sommelier personnel</div>
                <div style={{ fontSize:'0.8rem', color:'var(--cv-text2)' }}>Entrez un plat ou un vin — je suggère les meilleurs accords depuis votre cave</div>
              </div>
            </div>
            <div className="input-group mb-3">
              <input className="form-control form-control-lg" placeholder="Lasagnes, côte de bœuf, saumon, foie gras…" value={query}
                onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && ask()} style={{ fontSize:'0.95rem' }} />
              <button className="btn btn-gold px-4" onClick={() => ask()} disabled={mutation.isPending || !query.trim()}>
                {mutation.isPending ? <span className="spinner-border spinner-border-sm" /> : <><i className="bi bi-stars me-2"></i>Accord</>}
              </button>
            </div>
            <div className="filter-pills">
              {CHIPS.map(c => (
                <button key={c} className="filter-pill" onClick={() => ask(c)}>{c}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Loading */}
        {mutation.isPending && (
          <div className="col-12">
            <div className="card p-4 text-center">
              <div className="spinner-border mx-auto mb-3" style={{ color:'var(--cv-gold)', width:'2.5rem', height:'2.5rem' }} />
              <div style={{ color:'var(--cv-text2)', fontStyle:'italic', fontFamily:'Cormorant Garamond,serif', fontSize:'1.1rem' }}>Le sommelier consulte votre cave…</div>
            </div>
          </div>
        )}

        {/* Result */}
        {result && !mutation.isPending && (
          <div className="col-12 fade-in">
            <div className="card">
              <div className="card-header d-flex align-items-center gap-2">
                <span style={{ fontSize:'1.1rem' }}>✦</span>
                <h6 className="card-title mb-0">{result.plat_interprete || query}</h6>
                {result.cave_matches?.length > 0 && (
                  <span className="badge-open ms-auto">{result.cave_matches.length} accord{result.cave_matches.length > 1 ? 's' : ''} en cave</span>
                )}
              </div>
              <div className="card-body">
                {result.explication && (
                  <p style={{ color:'var(--cv-text2)', fontStyle:'italic', fontFamily:'Cormorant Garamond,serif', fontSize:'1rem', borderLeft:'2px solid var(--cv-gold)', paddingLeft:'1rem', marginBottom:'1.5rem' }}>
                    {result.explication}
                  </p>
                )}

                {/* Cave matches */}
                {result.cave_matches?.length > 0 && (
                  <>
                    <div style={{ fontSize:'0.65rem', letterSpacing:3, color:'var(--cv-gold)', textTransform:'uppercase', marginBottom:'0.5rem' }}>Depuis votre cave</div>
                    {[...result.cave_matches].sort((a, b) => b.score - a.score).map((m, i) => (
                      <div key={i} className="reco-card cave-match mb-2">
                        <div className="reco-cave-badge">Dans votre cave</div>
                        <div className="d-flex justify-content-between align-items-start gap-2 mt-1">
                          <div>
                            <div style={{ fontFamily:'Cormorant Garamond,serif', fontSize:'1.1rem', color:'var(--cv-text)', fontWeight:600 }}>
                              {m.accord === 'rouge' ? '🍷' : m.accord === 'blanc' ? '🥂' : m.accord === 'rosé' ? '🌸' : m.accord === 'pétillant' ? '✨' : '🥃'} {m.name}
                            </div>
                          </div>
                          <div style={{ fontSize:'1rem', flexShrink:0 }}><Stars n={m.score || 3} /></div>
                        </div>
                        <div style={{ fontSize:'0.82rem', color:'var(--cv-text2)', marginTop:'0.5rem', fontStyle:'italic', borderTop:'0.5px solid var(--cv-border)', paddingTop:'0.5rem' }}>
                          {m.why}
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {result.cave_matches?.length === 0 && (
                  <div className="alert" style={{ background:'rgba(201,168,76,0.08)', border:'0.5px solid var(--cv-border)', borderRadius:8, color:'var(--cv-text2)', fontSize:'0.85rem' }}>
                    <i className="bi bi-info-circle me-2"></i>Aucun vin en cave ne correspond parfaitement. Voici mes recommandations générales :
                  </div>
                )}

                {/* General recommendations */}
                {result.recommendations_generales?.length > 0 && (
                  <div className="mt-3">
                    <div style={{ fontSize:'0.65rem', letterSpacing:3, color:'var(--cv-text3)', textTransform:'uppercase', marginBottom:'0.5rem' }}>Suggestions générales</div>
                    <div className="row g-2">
                      {result.recommendations_generales.map((r, i) => (
                        <div className="col-md-6" key={i}>
                          <div className="reco-card">
                            <div style={{ fontSize:'0.82rem', color:'var(--cv-text)', fontWeight:500 }}>{r.type} — {r.appellation}</div>
                            {r.cepage && <div style={{ fontSize:'0.72rem', color:'var(--cv-text3)', margin:'2px 0' }}>{r.cepage}</div>}
                            <div style={{ fontSize:'0.78rem', color:'var(--cv-text2)', fontStyle:'italic', marginTop:4 }}>{r.why}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Service tips */}
                {(result.conseil_temperature || result.conseil_service) && (
                  <div className="row g-2 mt-2">
                    {result.conseil_temperature && (
                      <div className="col-md-6">
                        <div style={{ background:'var(--cv-bg4)', borderRadius:8, padding:'0.75rem', fontSize:'0.82rem' }}>
                          <div style={{ fontSize:'0.6rem', letterSpacing:2, color:'var(--cv-text3)', textTransform:'uppercase', marginBottom:4 }}>Température de service</div>
                          <div style={{ color:'var(--cv-text)' }}><i className="bi bi-thermometer-half me-1" style={{ color:'var(--cv-gold)' }}></i>{result.conseil_temperature}</div>
                        </div>
                      </div>
                    )}
                    {result.conseil_service && (
                      <div className="col-md-6">
                        <div style={{ background:'var(--cv-bg4)', borderRadius:8, padding:'0.75rem', fontSize:'0.82rem' }}>
                          <div style={{ fontSize:'0.6rem', letterSpacing:2, color:'var(--cv-text3)', textTransform:'uppercase', marginBottom:4 }}>Conseil de service</div>
                          <div style={{ color:'var(--cv-text)' }}><i className="bi bi-stars me-1" style={{ color:'var(--cv-gold)' }}></i>{result.conseil_service}</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
