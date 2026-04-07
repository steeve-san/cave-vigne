// src/pages/WinesPage.jsx
import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { winesAPI } from '../services/api';
import { useLang } from '../context/LangContext';
import toast from 'react-hot-toast';

const TYPES = ['rouge', 'blanc', 'rosé', 'pétillant'];
const TYPE_ICONS = { rouge: '🍷', blanc: '🥂', rosé: '🌸', pétillant: '✨' };
const EMPTY_FORM = {
  name: '', appellation: '', vintage: '', type: 'rouge', producer: '', region: '', grapes: '',
  country: 'France', quantity: 1, position: '', price: '', keep_until: '', notes: '',
  domain_website: '', domain_description: '', soil_type: '', altitude: '',
};

function PhotoPicker({ label, current, onChange, t }) {
  const ref = useRef();
  const [preview, setPreview] = useState(current || null);
  const handleFile = e => {
    const f = e.target.files[0];
    if (!f) return;
    onChange(f);
    const r = new FileReader();
    r.onload = ev => setPreview(ev.target.result);
    r.readAsDataURL(f);
  };
  const API_BASE = import.meta.env.REACT_APP_API_URL?.replace('/api', '') || '';
  const src = preview?.startsWith('data:') ? preview : preview ? `${API_BASE}${preview}` : null;
  return (
    <div>
      <label className="form-label">{label}</label>
      {src && <img src={src} alt={label} style={{ width: '100%', maxHeight: 180, objectFit: 'contain', borderRadius: 8, marginBottom: 8, background: '#1a0f0f' }} />}
      <div className="d-flex gap-2">
        <button type="button" className="btn btn-sm btn-outline-gold" onClick={() => ref.current.click()}>
          <i className="bi bi-image me-1"></i>{src ? t('wines.changePhoto') : t('wines.choosePhoto')}
        </button>
        {src && <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => { setPreview(null); onChange(null); }}>{t('wines.removePhoto')}</button>}
      </div>
      <input ref={ref} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
    </div>
  );
}

function WineModal({ wine, onClose, onSave }) {
  const { t } = useLang();
  const [tab, setTab] = useState('vin');
  const [form, setForm] = useState(wine ? {
    ...EMPTY_FORM, ...wine,
    vintage: wine.vintage || '', price: wine.price || '', keep_until: wine.keep_until || '',
    position: wine.position || '', notes: wine.notes || '',
    domain_website: wine.domain_website || '', domain_description: wine.domain_description || '',
    soil_type: wine.soil_type || '', altitude: wine.altitude || '',
  } : { ...EMPTY_FORM });
  const [labelFile, setLabelFile] = useState(null);
  const [bottleFile, setBottleFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichResults, setEnrichResults] = useState(null);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleEnrich = async () => {
    if (!wine?.id || !form.name) return;
    setEnriching(true);
    try {
      const r = await winesAPI.enrich(wine.id);
      setEnrichResults(r.data.results || []);
      if (!r.data.results?.length) toast('Aucun résultat trouvé', { icon: 'ℹ️' });
    } catch { toast.error('Erreur enrichissement'); }
    finally { setEnriching(false); }
  };

  const applyEnrichResult = r => {
    setForm(f => ({
      ...f,
      producer: r.producer || f.producer,
      country: r.country?.split(',')[0]?.trim() || f.country,
      grapes: r.grapes || f.grapes,
    }));
    setEnrichResults(null);
    toast.success('Données appliquées');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v !== '' && v !== null && v !== undefined) fd.append(k, v); });
      if (labelFile)  fd.append('label',        labelFile);
      if (bottleFile) fd.append('bottle_photo',  bottleFile);
      await onSave(fd);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur lors de l\'enregistrement');
    } finally { setLoading(false); }
  };

  const tabStyle = active => ({
    background: 'none', border: 'none', padding: '8px 16px', cursor: 'pointer',
    color: active ? 'var(--cv-gold)' : 'var(--cv-text2)',
    borderBottom: active ? '2px solid var(--cv-gold)' : '2px solid transparent',
    fontSize: '0.85rem', fontWeight: active ? 600 : 400,
  });

  return (
    <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header" style={{ paddingBottom: 0, flexDirection: 'column', alignItems: 'flex-start' }}>
            <div className="d-flex justify-content-between w-100 mb-2">
              <h5 className="modal-title">{wine ? 'Modifier le vin' : 'Ajouter un vin'}</h5>
              <button className="btn-close" onClick={onClose} />
            </div>
            <div style={{ borderBottom: '1px solid var(--cv-border)', width: '100%' }}>
              {[['vin', t('wines.tabWine')], ['domaine', t('wines.tabDomain')], ['photos', t('wines.tabPhotos')]].map(([key, label]) => (
                <button key={key} type="button" style={tabStyle(tab === key)} onClick={() => setTab(key)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="modal-body">

              {/* ── Tab Vin ─────────────────────────────────── */}
              {tab === 'vin' && (
                <div className="row g-3">
                  {wine?.id && (
                    <div className="col-12 d-flex gap-2 align-items-center flex-wrap">
                      <button type="button" className="btn btn-sm btn-outline-gold" onClick={handleEnrich} disabled={enriching}>
                        {enriching ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="bi bi-search me-1"></i>}
                        {t('wines.enrichBtn')}
                      </button>
                      <span style={{ fontSize: '0.72rem', color: 'var(--cv-text3)' }}>{t('wines.enrichSource')}</span>
                    </div>
                  )}
                  {enrichResults?.length > 0 && (
                    <div className="col-12">
                      <div className="card p-2" style={{ background: 'var(--cv-bg3)', borderColor: 'var(--cv-border)' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--cv-gold)', marginBottom: 6 }}>{t('wines.enrichResults')}</div>
                        {enrichResults.map((r, i) => (
                          <button key={i} type="button" className="d-flex align-items-center gap-2 w-100 mb-1 p-1" style={{ background: 'none', border: '0.5px solid var(--cv-border)', borderRadius: 6, cursor: 'pointer', textAlign: 'left' }} onClick={() => applyEnrichResult(r)}>
                            {r.label_image && <img src={r.label_image} alt="" style={{ width: 32, height: 40, objectFit: 'contain' }} />}
                            <div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--cv-text)' }}>{r.name}</div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--cv-text2)' }}>{r.producer} · {r.country}</div>
                            </div>
                          </button>
                        ))}
                        <button type="button" style={{ background: 'none', border: 'none', color: 'var(--cv-text3)', fontSize: '0.72rem', padding: 0, cursor: 'pointer' }} onClick={() => setEnrichResults(null)}>Fermer</button>
                      </div>
                    </div>
                  )}
                  <div className="col-md-8"><label className="form-label">{t('wines.name')} *</label><input className="form-control" required value={form.name} onChange={set('name')} placeholder="Château Margaux" /></div>
                  <div className="col-md-4"><label className="form-label">{t('wines.vintage')}</label><input className="form-control" type="number" value={form.vintage} onChange={set('vintage')} placeholder="2019" min="1900" max="2030" /></div>
                  <div className="col-md-6"><label className="form-label">{t('wines.appellation')}</label><input className="form-control" value={form.appellation} onChange={set('appellation')} placeholder="Margaux AOC" /></div>
                  <div className="col-md-6"><label className="form-label">{t('common.type')} *</label>
                    <select className="form-select" value={form.type} onChange={set('type')}>
                      {TYPES.map(tp => <option key={tp} value={tp}>{t(`wines.type.${tp}`)}</option>)}
                    </select>
                  </div>
                  <div className="col-md-6"><label className="form-label">{t('wines.producer')}</label><input className="form-control" value={form.producer} onChange={set('producer')} placeholder="Château Margaux" /></div>
                  <div className="col-md-6"><label className="form-label">{t('wines.region')}</label><input className="form-control" value={form.region} onChange={set('region')} placeholder="Bordeaux" /></div>
                  <div className="col-md-8"><label className="form-label">{t('wines.grapes')}</label><input className="form-control" value={form.grapes} onChange={set('grapes')} placeholder="Cabernet Sauvignon, Merlot" /></div>
                  <div className="col-md-4"><label className="form-label">{t('wines.country')}</label><input className="form-control" value={form.country} onChange={set('country')} /></div>
                  <div className="col-md-3"><label className="form-label">{t('wines.quantity')}</label><input className="form-control" type="number" min="0" value={form.quantity} onChange={set('quantity')} /></div>
                  <div className="col-md-3"><label className="form-label">{t('wines.position')}</label><input className="form-control" value={form.position} onChange={set('position')} placeholder="A3" maxLength={10} /></div>
                  <div className="col-md-3"><label className="form-label">{t('wines.price')}</label><input className="form-control" type="number" min="0" step="0.01" value={form.price} onChange={set('price')} /></div>
                  <div className="col-md-3"><label className="form-label">{t('wines.keepUntil')}</label><input className="form-control" type="number" min="2024" max="2100" value={form.keep_until} onChange={set('keep_until')} placeholder="2035" /></div>
                  <div className="col-12"><label className="form-label">{t('wines.notes')}</label><textarea className="form-control" rows={3} value={form.notes} onChange={set('notes')} placeholder="Arômes, impressions de dégustation..." /></div>
                </div>
              )}

              {/* ── Tab Domaine ──────────────────────────────── */}
              {tab === 'domaine' && (
                <div className="row g-3">
                  <div className="col-12"><label className="form-label">{t('wines.domainWebsite')}</label>
                    <input className="form-control" value={form.domain_website} onChange={set('domain_website')} placeholder="https://www.chateau-margaux.com" type="url" /></div>
                  <div className="col-md-6"><label className="form-label">{t('wines.soilType')}</label>
                    <input className="form-control" value={form.soil_type} onChange={set('soil_type')} placeholder="Graves, argilo-calcaire..." /></div>
                  <div className="col-md-6"><label className="form-label">{t('wines.altitude')}</label>
                    <input className="form-control" value={form.altitude} onChange={set('altitude')} placeholder="ex: 250 m" /></div>
                  <div className="col-12"><label className="form-label">{t('wines.domainDescription')}</label>
                    <textarea className="form-control" rows={5} value={form.domain_description} onChange={set('domain_description')} placeholder="Histoire du domaine, viticulture, vinification..." /></div>
                </div>
              )}

              {tab === 'photos' && (
                <div className="row g-4">
                  <div className="col-md-6">
                    <PhotoPicker label={t('wines.labelPhoto')} current={wine?.label_image} onChange={setLabelFile} t={t} />
                  </div>
                  <div className="col-md-6">
                    <PhotoPicker label={t('wines.bottlePhoto')} current={wine?.bottle_photo} onChange={setBottleFile} t={t} />
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-outline-gold" onClick={onClose}>{t('common.cancel')}</button>
              <button type="submit" className="btn btn-gold" disabled={loading}>
                {loading ? <span className="spinner-border spinner-border-sm me-1" /> : null}
                {wine ? t('common.save') : t('wines.add')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function AccordModal({ wine, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ food: '', stars: 0, notes: '' });
  const [hover, setHover] = useState(0);
  const mutation = useMutation({
    mutationFn: (data) => winesAPI.addAccord(wine.id, data),
    onSuccess: () => { qc.invalidateQueries(['wines']); toast.success('Accord ajouté !'); onClose(); },
    onError: () => toast.error('Erreur lors de l\'ajout'),
  });
  return (
    <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header"><h5 className="modal-title">Ajouter un accord — {wine.name}</h5><button className="btn-close" onClick={onClose} /></div>
          <div className="modal-body">
            <div className="mb-3"><label className="form-label">Accompagnement *</label><input className="form-control" placeholder="Côte de bœuf, Saint-Jacques..." value={form.food} onChange={e => setForm(f => ({ ...f, food: e.target.value }))} /></div>
            <div className="mb-3"><label className="form-label">Note de l'accord</label>
              <div className="d-flex gap-1 mt-1">
                {[1,2,3,4,5].map(n => (
                  <span key={n} style={{ fontSize: '1.6rem', cursor: 'pointer', color: n <= (hover || form.stars) ? 'var(--cv-gold)' : 'var(--cv-text3)' }}
                    onClick={() => setForm(f => ({ ...f, stars: n }))} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}>★</span>
                ))}
              </div>
            </div>
            <div className="mb-0"><label className="form-label">Commentaire</label><textarea className="form-control" rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes de dégustation..." /></div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-outline-gold" onClick={onClose}>Annuler</button>
            <button className="btn btn-gold" disabled={!form.food || !form.stars || mutation.isPending}
              onClick={() => mutation.mutate(form)}>
              {mutation.isPending ? <span className="spinner-border spinner-border-sm me-1" /> : null}Ajouter
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WinesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [typeF, setTypeF] = useState('all');
  const [statusF, setStatusF] = useState('all');
  const [modal, setModal] = useState(null); // null | { mode: 'add'|'edit'|'accord', wine? }

  const params = { search: search || undefined, type: typeF !== 'all' ? typeF : undefined, status: statusF !== 'all' ? statusF : undefined, limit: 100 };
  const { data, isLoading } = useQuery({ queryKey: ['wines', params], queryFn: () => winesAPI.list(params).then(r => r.data) });

  const addMutation = useMutation({ mutationFn: winesAPI.create, onSuccess: () => { qc.invalidateQueries(['wines']); qc.invalidateQueries(['wine-stats']); toast.success('Vin ajouté !'); } });
  const editMutation = useMutation({ mutationFn: ({ id, fd }) => winesAPI.update(id, fd), onSuccess: () => { qc.invalidateQueries(['wines']); qc.invalidateQueries(['wine-stats']); toast.success('Vin modifié !'); } });
  const delMutation = useMutation({ mutationFn: winesAPI.remove, onSuccess: () => { qc.invalidateQueries(['wines']); qc.invalidateQueries(['wine-stats']); toast.success('Vin supprimé'); } });
  const toggleDrunk = useMutation({
    mutationFn: ({ id, is_drunk, quantity }) => { const fd = new FormData(); fd.append('is_drunk', !is_drunk ? 1 : 0); if (!is_drunk) fd.append('quantity', 0); else fd.append('quantity', 1); return winesAPI.update(id, fd); },
    onSuccess: () => { qc.invalidateQueries(['wines']); qc.invalidateQueries(['wine-stats']); },
  });

  const wines = data?.wines || [];
  const total = data?.total || 0;

  return (
    <div className="fade-in">
      {/* Filters */}
      <div className="card mb-3 p-3">
        <div className="row g-2 align-items-center">
          <div className="col-12 col-md-4">
            <div className="input-group input-group-sm">
              <span className="input-group-text"><i className="bi bi-search"></i></span>
              <input className="form-control" placeholder="Rechercher nom, région, cépage..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="col-6 col-md-2">
            <select className="form-select form-select-sm" value={typeF} onChange={e => setTypeF(e.target.value)}>
              <option value="all">Tous les types</option>
              {TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
          <div className="col-6 col-md-2">
            <select className="form-select form-select-sm" value={statusF} onChange={e => setStatusF(e.target.value)}>
              <option value="all">Tout statut</option>
              <option value="stock">En cave</option>
              <option value="drunk">Dégustées</option>
            </select>
          </div>
          <div className="col-12 col-md-4 d-flex justify-content-md-end gap-2">
            <span style={{ fontSize: '0.78rem', color: 'var(--cv-text2)', alignSelf: 'center' }}>{total} résultat{total > 1 ? 's' : ''}</span>
            <button className="btn btn-gold btn-sm ms-auto" onClick={() => setModal({ mode: 'add' })}>
              <i className="bi bi-plus me-1"></i>Ajouter un vin
            </button>
          </div>
        </div>
      </div>

      {/* Filter pills */}
      <div className="filter-pills mb-3">
        {['all', ...TYPES].map(t => (
          <button key={t} className={`filter-pill ${typeF === t ? 'active' : ''}`} onClick={() => setTypeF(t)}>
            {t === 'all' ? 'Tout' : (TYPE_ICONS[t] + ' ' + t.charAt(0).toUpperCase() + t.slice(1))}
          </button>
        ))}
        <button className={`filter-pill ${statusF === 'stock' ? 'active' : ''}`} onClick={() => setStatusF(s => s === 'stock' ? 'all' : 'stock')}>En cave seulement</button>
        <button className={`filter-pill ${statusF === 'drunk' ? 'active' : ''}`} onClick={() => setStatusF(s => s === 'drunk' ? 'all' : 'drunk')}>Dégustées</button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center p-5"><div className="spinner-border" style={{ color: 'var(--cv-gold)' }} /></div>
      ) : wines.length === 0 ? (
        <div className="text-center p-5" style={{ color: 'var(--cv-text3)' }}>
          <i className="bi bi-grid d-block mb-3" style={{ fontSize: '3rem' }}></i>
          <p>Aucun vin trouvé</p>
          <button className="btn btn-gold" onClick={() => setModal({ mode: 'add' })}>Ajouter votre premier vin</button>
        </div>
      ) : (
        <div className="row g-2">
          {wines.map(w => (
            <div className="col-12 col-lg-6" key={w.id}>
              <div className="item-card">
                <span className="item-icon">{TYPE_ICONS[w.type] || '🍷'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="item-name">{w.name}</div>
                  <div className="item-meta">{[w.vintage, w.appellation, w.grapes].filter(Boolean).join(' · ')}</div>
                </div>
                <div className="d-flex align-items-center gap-2">
                  {w.is_drunk || w.quantity === 0 ? <span className="badge-drunk">bue</span> : <span className="badge-stock">cave</span>}
                  <span className="item-qty">{w.is_drunk ? '✓' : w.quantity}</span>
                  <div className="dropdown">
                    <button className="btn btn-sm" style={{ color: 'var(--cv-text3)', background: 'none', border: 'none' }} data-bs-toggle="dropdown">
                      <i className="bi bi-three-dots-vertical"></i>
                    </button>
                    <ul className="dropdown-menu dropdown-menu-end">
                      <li><button className="dropdown-item" onClick={() => setModal({ mode: 'edit', wine: w })}><i className="bi bi-pencil me-2"></i>Modifier</button></li>
                      <li><button className="dropdown-item" onClick={() => setModal({ mode: 'accord', wine: w })}><i className="bi bi-fork-knife me-2"></i>Ajouter accord</button></li>
                      <li><button className="dropdown-item" onClick={() => toggleDrunk.mutate(w)}>
                        <i className={`bi bi-${w.is_drunk ? 'arrow-counterclockwise' : 'check-circle'} me-2`}></i>
                        {w.is_drunk ? 'Remettre en stock' : 'Marquer comme bue'}
                      </button></li>
                      <li><hr className="dropdown-divider" style={{ borderColor: 'var(--cv-border)' }} /></li>
                      <li><button className="dropdown-item" style={{ color: '#dc3545' }} onClick={() => { if (window.confirm('Supprimer ce vin ?')) delMutation.mutate(w.id); }}>
                        <i className="bi bi-trash me-2"></i>Supprimer
                      </button></li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {modal?.mode === 'add' && <WineModal onClose={() => setModal(null)} onSave={(fd) => addMutation.mutateAsync(fd)} />}
      {modal?.mode === 'edit' && <WineModal wine={modal.wine} onClose={() => setModal(null)} onSave={(fd) => editMutation.mutateAsync({ id: modal.wine.id, fd })} />}
      {modal?.mode === 'accord' && <AccordModal wine={modal.wine} onClose={() => setModal(null)} />}
    </div>
  );
}
