// src/pages/SommelierPage.jsx
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { sommelierAPI } from '../services/api';
import { useLang } from '../context/LangContext';
import toast from 'react-hot-toast';

const TYPE_ICONS = { rouge: '🍷', blanc: '🥂', rosé: '🌸', pétillant: '✨' };

const PROVIDER_LABELS = { anthropic: 'Claude', openai: 'ChatGPT', mistral: 'Mistral', openwebui: 'Local' };
const PROVIDER_ICONS  = { anthropic: 'bi-stars', openai: 'bi-robot', mistral: 'bi-wind', openwebui: 'bi-server' };

const CHIPS = ['Lasagnes au bœuf','Côte de bœuf grillée','Foie gras poêlé','Saint-Jacques snackées','Saumon fumé','Plateau fromages','Fondant chocolat','Huîtres fraîches','Agneau rôti','Poulet rôti','Pizza margherita','Sushi & sashimi','Tajine d\'agneau','Risotto aux champignons'];

const Stars = ({ n }) => Array.from({ length: 5 }, (_, i) => (
  <span key={i} className={i < n ? 'star-full' : 'star-empty'}>★</span>
));

export default function SommelierPage() {
  const { t } = useLang();
  const [activeTab, setActiveTab] = useState('accord'); // 'accord' | 'tonight'
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [recipes, setRecipes] = useState(null);
  const [showRecipes, setShowRecipes] = useState(false);
  // Tonight recommender
  const [tonightForm, setTonightForm] = useState({ occasion: '', guests: '', mood: '' });
  const [tonightResult, setTonightResult] = useState(null);

  const { data: providerInfo } = useQuery({
    queryKey: ['sommelier-providers'],
    queryFn: () => sommelierAPI.providers().then(r => r.data),
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: (q) => sommelierAPI.accord(q).then(r => r.data),
    onSuccess: (data) => { setResult(data); setRecipes(null); setShowRecipes(false); },
    onError: (err) => {
      const msg = err.response?.data?.error || 'Erreur du service IA';
      toast.error(msg, { duration: 6000 });
    },
  });

  const recipesMut = useMutation({
    mutationFn: (food) => sommelierAPI.recipes(food).then(r => r.data),
    onSuccess: (data) => { setRecipes(data); setShowRecipes(true); },
    onError: () => toast.error('Impossible de charger les recettes'),
  });

  const tonightMut = useMutation({
    mutationFn: (data) => sommelierAPI.recommend(data).then(r => r.data),
    onSuccess: (data) => setTonightResult(data),
    onError: (err) => toast.error(err.response?.data?.error || 'Erreur du service IA', { duration: 6000 }),
  });

  const ask = (q) => { const v = q || query; if (!v.trim()) return; setQuery(v); mutation.mutate(v); };

  const tabStyle = (active) => ({
    background: 'none', border: 'none', padding: '8px 20px', cursor: 'pointer',
    color: active ? 'var(--cv-gold)' : 'var(--cv-text2)',
    borderBottom: active ? '2px solid var(--cv-gold)' : '2px solid transparent',
    fontSize: '0.85rem', fontWeight: active ? 600 : 400,
  });

  return (
    <div className="fade-in">
      {/* Tab switcher */}
      <div className="mb-3" style={{ borderBottom: '1px solid var(--cv-border)' }}>
        <button style={tabStyle(activeTab === 'accord')} onClick={() => setActiveTab('accord')}>
          <i className="bi bi-stars me-2"></i>Accord mets/vin
        </button>
        <button style={tabStyle(activeTab === 'tonight')} onClick={() => setActiveTab('tonight')}>
          <i className="bi bi-moon-stars me-2"></i>Que boire ce soir ?
        </button>
      </div>

      {/* ═══ Tonight recommender ═══ */}
      {activeTab === 'tonight' && (
        <div className="row g-3">
          <div className="col-12">
            <div className="card p-4">
              <div className="d-flex align-items-center gap-3 mb-4">
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(201,168,76,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.4rem', flexShrink:0 }}>🌙</div>
                <div>
                  <div className="font-serif" style={{ fontSize:'1.3rem', color:'var(--cv-gold)', fontStyle:'italic' }}>Que boire ce soir ?</div>
                  <div style={{ fontSize:'0.8rem', color:'var(--cv-text2)' }}>Décrivez l'occasion et l'IA choisit le vin idéal depuis votre cave</div>
                </div>
                {providerInfo && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--cv-text3)', marginLeft: 'auto', flexShrink: 0 }}>
                    <i className={`bi ${PROVIDER_ICONS[providerInfo.current] || 'bi-cpu'} me-1`} style={{ color: 'var(--cv-gold)' }}></i>
                    {PROVIDER_LABELS[providerInfo.current] || providerInfo.current}
                  </div>
                )}
              </div>
              <div className="row g-3 mb-3">
                <div className="col-md-4">
                  <label className="form-label" style={{ fontSize:'0.78rem', color:'var(--cv-text2)' }}>Occasion</label>
                  <input className="form-control" placeholder="Dîner romantique, repas de famille…" value={tonightForm.occasion}
                    onChange={e => setTonightForm(f => ({ ...f, occasion: e.target.value }))} />
                </div>
                <div className="col-md-4">
                  <label className="form-label" style={{ fontSize:'0.78rem', color:'var(--cv-text2)' }}>Convives</label>
                  <input className="form-control" placeholder="Amis amateurs, belle-famille…" value={tonightForm.guests}
                    onChange={e => setTonightForm(f => ({ ...f, guests: e.target.value }))} />
                </div>
                <div className="col-md-4">
                  <label className="form-label" style={{ fontSize:'0.78rem', color:'var(--cv-text2)' }}>Envie du moment</label>
                  <input className="form-control" placeholder="Quelque chose de léger, rouge puissant…" value={tonightForm.mood}
                    onChange={e => setTonightForm(f => ({ ...f, mood: e.target.value }))} />
                </div>
              </div>
              <div className="filter-pills mb-3">
                {['Apéritif entre amis','Dîner romantique','Repas de fête','Soirée dégustation','Cuisine italienne','Barbecue estival'].map(c => (
                  <button key={c} className="filter-pill" onClick={() => setTonightForm(f => ({ ...f, occasion: c }))}>{c}</button>
                ))}
                <button className="filter-pill" style={{ borderColor: 'rgba(139,26,200,0.4)' }}
                  onClick={() => setTonightForm(f => ({ ...f, occasion: 'Soirée cinéma 🎬' }))}>
                  🎬 Soirée cinéma
                </button>
                <button className="filter-pill" style={{ borderColor: 'rgba(139,26,200,0.4)' }}
                  onClick={() => setTonightForm(f => ({ ...f, occasion: 'Soirée série TV 📺' }))}>
                  📺 Soirée série
                </button>
              </div>
              <button className="btn btn-gold px-4" onClick={() => tonightMut.mutate(tonightForm)}
                disabled={tonightMut.isPending}>
                {tonightMut.isPending ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="bi bi-moon-stars me-2"></i>}
                Choisir pour moi
              </button>
            </div>
          </div>

          {tonightMut.isPending && (
            <div className="col-12"><div className="card p-4 text-center">
              <div className="spinner-border mx-auto mb-3" style={{ color:'var(--cv-gold)', width:'2.5rem', height:'2.5rem' }} />
              <div style={{ color:'var(--cv-text2)', fontStyle:'italic', fontFamily:'Cormorant Garamond,serif', fontSize:'1.1rem' }}>
                {/cinéma|série|tv|film/i.test(tonightForm.occasion)
                  ? 'Le sommelier consulte votre cave et les écrans du moment…'
                  : 'Le sommelier consulte votre cave…'}
              </div>
            </div></div>
          )}

          {tonightResult && !tonightMut.isPending && tonightResult._media?.length > 0 && (
            <div className="col-12 fade-in">
              <div className="card" style={{ borderColor: 'rgba(139,26,200,0.25)', background: 'rgba(30,10,40,0.6)' }}>
                <div className="card-header" style={{ borderColor: 'rgba(139,26,200,0.25)' }}>
                  <h6 className="card-title mb-0" style={{ color: 'var(--cv-text2)', fontSize: '0.82rem' }}>
                    <i className="bi bi-film me-2" style={{ color: '#a855f7' }} />
                    Contexte média utilisé pour la recommandation
                  </h6>
                </div>
                <div className="card-body p-3">
                  {tonightResult._media.map((src, i) => (
                    <div key={i} className="mb-2">
                      <div style={{ fontSize: '0.7rem', color: '#a855f7', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                        {src.source}
                      </div>
                      {src.source === 'TMDB' ? (
                        <div className="d-flex flex-wrap gap-1">
                          {[...(src.movies || []), ...(src.shows || [])].map((m, j) => (
                            <span key={j} style={{ fontSize: '0.75rem', background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.25)', borderRadius: 4, padding: '2px 8px', color: 'var(--cv-text)' }}>
                              {m.title}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="d-flex flex-wrap gap-1">
                          {(src.items || []).map((m, j) => (
                            <span key={j} style={{ fontSize: '0.75rem', background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.25)', borderRadius: 4, padding: '2px 8px', color: 'var(--cv-text)' }}>
                              {m.title}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tonightResult && !tonightMut.isPending && (
            <div className="col-12 fade-in">
              <div className="card">
                <div className="card-header d-flex align-items-center gap-2">
                  <span style={{ fontSize:'1.1rem' }}>🌙</span>
                  <h6 className="card-title mb-0">Recommandation pour ce soir</h6>
                  {tonightResult._provider && (
                    <span className="ms-auto" style={{ fontSize:'0.72rem', color:'var(--cv-text3)' }}>
                      <i className={`bi ${PROVIDER_ICONS[tonightResult._provider] || 'bi-cpu'} me-1`}></i>
                      {PROVIDER_LABELS[tonightResult._provider] || tonightResult._provider}
                    </span>
                  )}
                </div>
                <div className="card-body">
                  {tonightResult.recommendation && (
                    <div className="reco-card cave-match mb-4">
                      <div className="reco-cave-badge">Recommandé ce soir</div>
                      <div className="mt-2">
                        <div style={{ fontFamily:'Cormorant Garamond,serif', fontSize:'1.3rem', color:'var(--cv-text)', fontWeight:600 }}>
                          {TYPE_ICONS[tonightResult.recommendation.type] || '🍷'} {tonightResult.recommendation.name}
                        </div>
                        <p style={{ fontSize:'0.88rem', color:'var(--cv-text2)', fontStyle:'italic', marginTop:8, lineHeight:1.6 }}>{tonightResult.recommendation.why}</p>
                        <div className="row g-2 mt-1">
                          {tonightResult.recommendation.temp && (
                            <div className="col-auto">
                              <span style={{ fontSize:'0.75rem', background:'var(--cv-bg4)', borderRadius:6, padding:'4px 10px', color:'var(--cv-text2)' }}>
                                <i className="bi bi-thermometer-half me-1" style={{ color:'var(--cv-gold)' }}></i>{tonightResult.recommendation.temp}
                              </span>
                            </div>
                          )}
                          {tonightResult.recommendation.decant && (
                            <div className="col-auto">
                              <span style={{ fontSize:'0.75rem', background:'var(--cv-bg4)', borderRadius:6, padding:'4px 10px', color:'var(--cv-text2)' }}>
                                <i className="bi bi-moisture me-1" style={{ color:'var(--cv-gold)' }}></i>Carafage : {tonightResult.recommendation.decant}
                              </span>
                            </div>
                          )}
                          {tonightResult.recommendation.food && (
                            <div className="col-auto">
                              <span style={{ fontSize:'0.75rem', background:'var(--cv-bg4)', borderRadius:6, padding:'4px 10px', color:'var(--cv-text2)' }}>
                                <i className="bi bi-fork-knife me-1" style={{ color:'var(--cv-gold)' }}></i>{tonightResult.recommendation.food}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  {tonightResult.alternatives?.length > 0 && (
                    <div>
                      <div style={{ fontSize:'0.65rem', letterSpacing:3, color:'var(--cv-text3)', textTransform:'uppercase', marginBottom:'0.5rem' }}>Alternatives</div>
                      <div className="row g-2">
                        {tonightResult.alternatives.map((a, i) => (
                          <div className="col-md-6" key={i}>
                            <div className="reco-card">
                              <div style={{ fontSize:'0.88rem', color:'var(--cv-text)', fontWeight:500 }}>{a.name}</div>
                              <div style={{ fontSize:'0.78rem', color:'var(--cv-text2)', fontStyle:'italic', marginTop:4 }}>{a.why}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {tonightResult.conseil_ambiance && (
                    <div className="mt-3 pt-3" style={{ borderTop:'0.5px solid var(--cv-border)', fontSize:'0.82rem', color:'var(--cv-text2)', fontStyle:'italic' }}>
                      <i className="bi bi-info-circle me-2" style={{ color:'var(--cv-gold)' }}></i>{tonightResult.conseil_ambiance}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ Food/wine accord (original) ═══ */}
      {activeTab === 'accord' && (
      <div className="row g-3">
        {/* Left: input */}
        <div className="col-12">
          <div className="card p-4">
            <div className="d-flex align-items-center gap-3 mb-3">
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(201,168,76,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.4rem', flexShrink:0 }}>✦</div>
              <div style={{ flex: 1 }}>
                <div className="font-serif" style={{ fontSize:'1.3rem', color:'var(--cv-gold)', fontStyle:'italic' }}>Votre sommelier personnel</div>
                <div style={{ fontSize:'0.8rem', color:'var(--cv-text2)' }}>Entrez un plat ou un vin — je suggère les meilleurs accords depuis votre cave</div>
              </div>
              {providerInfo && (
                <div style={{ fontSize: '0.72rem', color: 'var(--cv-text3)', textAlign: 'right', flexShrink: 0 }}>
                  <i className={`bi ${PROVIDER_ICONS[providerInfo.current] || 'bi-cpu'} me-1`} style={{ color: 'var(--cv-gold)' }}></i>
                  {PROVIDER_LABELS[providerInfo.current] || providerInfo.current}
                </div>
              )}
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

                {/* Bouton recettes */}
                <div className="mt-3 pt-3" style={{ borderTop:'0.5px solid var(--cv-border)' }}>
                  <button className="btn btn-sm btn-outline-gold" onClick={() => recipesMut.mutate(query)} disabled={recipesMut.isPending}>
                    {recipesMut.isPending ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="bi bi-journal-richtext me-1"></i>}
                    {t('sommelier.findRecipes')}
                  </button>
                  <span style={{ fontSize:'0.72rem', color:'var(--cv-text3)', marginLeft:8 }}>{t('sommelier.recipesSource')}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Recettes TheMealDB */}
        {showRecipes && recipes && (
          <div className="col-12 fade-in">
            <div className="card">
              <div className="card-header d-flex justify-content-between align-items-center">
                <h6 className="card-title mb-0"><i className="bi bi-journal-richtext me-2"></i>{t('sommelier.recipesTitle')} « {query} »</h6>
                <button className="btn btn-sm" style={{ background:'none', border:'none', color:'var(--cv-text3)' }} onClick={() => setShowRecipes(false)}>
                  <i className="bi bi-x-lg"></i>
                </button>
              </div>
              <div className="card-body">
                {recipes.meals?.length === 0 ? (
                  <p style={{ color:'var(--cv-text2)', fontSize:'0.85rem' }}>{t('sommelier.noRecipes')}</p>
                ) : (
                  <div className="row g-3">
                    {recipes.meals?.map(meal => (
                      <div className="col-md-6 col-lg-4" key={meal.id}>
                        <div className="reco-card h-100 d-flex flex-column">
                          {meal.image && <img src={meal.image} alt={meal.name} style={{ width:'100%', height:120, objectFit:'cover', borderRadius:6, marginBottom:8 }} />}
                          <div style={{ fontWeight:600, fontSize:'0.88rem', color:'var(--cv-text)', marginBottom:4 }}>{meal.name}</div>
                          <div style={{ fontSize:'0.72rem', color:'var(--cv-text3)', marginBottom:6 }}>{meal.category} · {meal.area}</div>
                          <div style={{ fontSize:'0.77rem', color:'var(--cv-text2)', flexGrow:1 }}>{meal.instructions}</div>
                          {(meal.youtube || meal.source) && (
                            <div className="d-flex gap-2 mt-2">
                              {meal.youtube && <a href={meal.youtube} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline-gold" style={{ fontSize:'0.72rem' }}><i className="bi bi-youtube me-1"></i>Vidéo</a>}
                              {meal.source && <a href={meal.source} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline-gold" style={{ fontSize:'0.72rem' }}><i className="bi bi-link-45deg me-1"></i>Recette</a>}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      )} {/* end activeTab === 'accord' */}
    </div>
  );
}
