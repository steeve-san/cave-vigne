// src/pages/BeersPage.jsx — Collection de bières
import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { beersAPI } from '../services/api';
import { useLang } from '../context/LangContext';
import toast from 'react-hot-toast';
import BarcodeScannerModal from '../components/BarcodeScannerModal';

// ── Types & icônes ────────────────────────────────────────────────────────────
const BEER_TYPES = ['blonde','brune','blanche','ambrée','IPA','NEIPA','stout','porter','lager','pilsner','triple','quadruple','sour','saison','lambic','autre'];
const TYPE_ICONS = {
  blonde:'🍺', brune:'🍫', blanche:'🌾', ambrée:'🍂', IPA:'🌿', NEIPA:'🌿',
  stout:'⚫', porter:'🟤', lager:'🥤', pilsner:'💛', triple:'⚜️', quadruple:'👑',
  sour:'🍋', saison:'🌻', lambic:'🍇', autre:'🍶',
};
const TYPE_COLOR = {
  blonde:'#c9a84c', brune:'#5a3010', blanche:'#e8dcc8', ambrée:'#c46a18',
  IPA:'#6a8c3a', NEIPA:'#8da84e', stout:'#1a1a1a', porter:'#3d2010',
  lager:'#e8c84c', pilsner:'#f0d86a', triple:'#c9a020', quadruple:'#8b6010',
  sour:'#c8a040', saison:'#d4b84a', lambic:'#a87040', autre:'#666',
};

const STATUS_LABEL = { stock: 'Fermée', open: 'Ouverte', empty: 'Vide' };
const STATUS_CLASS  = { stock: 'badge-stock', open: 'badge-open', empty: 'badge-drunk' };

const EMPTY = {
  name:'', brewery:'', type:'blonde', country:'France', region:'',
  abv:'', ibu:'', volume:33, quantity:1, price:'', rating:'', status:'stock', notes:'', ean:'',
};

// ── Photo picker ──────────────────────────────────────────────────────────────
function PhotoPicker({ current, onChange }) {
  const ref = useRef();
  const [preview, setPreview] = useState(current || null);
  const API_BASE = import.meta.env.REACT_APP_API_URL?.replace('/api','') || '';
  const src = preview?.startsWith('data:') ? preview : preview ? `${API_BASE}${preview}` : null;

  const handleFile = e => {
    const f = e.target.files[0]; if (!f) return;
    onChange(f);
    const r = new FileReader(); r.onload = ev => setPreview(ev.target.result); r.readAsDataURL(f);
  };
  return (
    <div>
      <label className="form-label">Étiquette</label>
      {src && <img src={src} alt="étiquette" style={{ width:'100%', maxHeight:160, objectFit:'contain', borderRadius:8, marginBottom:8, background:'#1a0f0f' }} />}
      <div className="d-flex gap-2">
        <button type="button" className="btn btn-sm btn-outline-gold" onClick={() => ref.current.click()}>
          <i className="bi bi-image me-1"></i>{src ? 'Changer' : 'Choisir'}
        </button>
        {src && <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => { setPreview(null); onChange(null); }}>Retirer</button>}
      </div>
      <input ref={ref} type="file" accept="image/*" style={{ display:'none' }} onChange={handleFile} />
    </div>
  );
}

// ── Modal ajout/édition ───────────────────────────────────────────────────────
function BeerModal({ beer, prefill, onClose, onSave }) {
  const [form, setForm] = useState(() => {
    if (beer)    return { ...EMPTY, ...beer };
    if (prefill) return { ...EMPTY, ...prefill };
    return { ...EMPTY };
  });
  const [labelFile, setLabelFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async e => {
    e.preventDefault(); setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k,v]) => { if (v !== '' && v !== null && v !== undefined) fd.append(k, v); });
      if (labelFile) fd.append('label', labelFile);
      await onSave(fd); onClose();
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal show d-block" style={{ background:'rgba(0,0,0,0.75)' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              <i className="bi bi-cup-straw me-2" style={{ color:'var(--cv-gold)' }}></i>
              {beer ? 'Modifier la bière' : 'Ajouter une bière'}
            </h5>
            <button className="btn-close" onClick={onClose} />
          </div>
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              <div className="row g-3">
                {/* Nom */}
                <div className="col-md-8">
                  <label className="form-label">Nom *</label>
                  <input className="form-control" required value={form.name} onChange={set('name')} placeholder="Leffe Blonde, Chimay Rouge…" />
                </div>
                {/* Type */}
                <div className="col-md-4">
                  <label className="form-label">Type *</label>
                  <select className="form-select" value={form.type} onChange={set('type')}>
                    {BEER_TYPES.map(t => (
                      <option key={t} value={t}>{TYPE_ICONS[t]} {t.charAt(0).toUpperCase() + t.slice(1)}</option>
                    ))}
                  </select>
                </div>
                {/* Brasserie */}
                <div className="col-md-6">
                  <label className="form-label">Brasserie</label>
                  <input className="form-control" value={form.brewery} onChange={set('brewery')} placeholder="Leffe, Chimay, Brasserie du Mont…" />
                </div>
                {/* Pays */}
                <div className="col-md-3">
                  <label className="form-label">Pays</label>
                  <input className="form-control" value={form.country} onChange={set('country')} placeholder="France" />
                </div>
                {/* Région */}
                <div className="col-md-3">
                  <label className="form-label">Région</label>
                  <input className="form-control" value={form.region} onChange={set('region')} placeholder="Alsace, Bretagne…" />
                </div>
                {/* ABV */}
                <div className="col-6 col-md-2">
                  <label className="form-label">Alcool (%)</label>
                  <input className="form-control" type="number" step="0.1" min="0" max="30" value={form.abv} onChange={set('abv')} placeholder="5.0" />
                </div>
                {/* IBU */}
                <div className="col-6 col-md-2">
                  <label className="form-label">IBU</label>
                  <input className="form-control" type="number" min="0" max="200" value={form.ibu} onChange={set('ibu')} placeholder="25" />
                </div>
                {/* Volume */}
                <div className="col-6 col-md-2">
                  <label className="form-label">Volume (cl)</label>
                  <select className="form-select" value={form.volume} onChange={set('volume')}>
                    {[25,30,33,37.5,50,66,75].map(v => <option key={v} value={v}>{v} cl</option>)}
                  </select>
                </div>
                {/* Quantité */}
                <div className="col-6 col-md-2">
                  <label className="form-label">Quantité</label>
                  <input className="form-control" type="number" min="0" value={form.quantity} onChange={set('quantity')} />
                </div>
                {/* Prix */}
                <div className="col-6 col-md-2">
                  <label className="form-label">Prix (€)</label>
                  <input className="form-control" type="number" step="0.01" min="0" value={form.price} onChange={set('price')} placeholder="2.50" />
                </div>
                {/* Statut */}
                <div className="col-6 col-md-2">
                  <label className="form-label">Statut</label>
                  <select className="form-select" value={form.status} onChange={set('status')}>
                    <option value="stock">Fermée</option>
                    <option value="open">Ouverte</option>
                    <option value="empty">Vide</option>
                  </select>
                </div>
                {/* Note */}
                <div className="col-6 col-md-2">
                  <label className="form-label">Note /100</label>
                  <input className="form-control" type="number" min="0" max="100" value={form.rating} onChange={set('rating')} placeholder="82" />
                </div>
                {/* EAN */}
                <div className="col-12 col-md-4">
                  <label className="form-label">Code-barres (EAN)</label>
                  <input className="form-control" type="tel" inputMode="numeric" value={form.ean} onChange={set('ean')} placeholder="3329780005016" />
                </div>
                {/* Notes */}
                <div className="col-12">
                  <label className="form-label">Notes de dégustation</label>
                  <textarea className="form-control" rows={3} value={form.notes} onChange={set('notes')} placeholder="Arômes, saveurs, accords…" />
                </div>
                {/* Photo */}
                <div className="col-12">
                  <PhotoPicker current={beer?.label_image} onChange={setLabelFile} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-gold" onClick={onClose}>Annuler</button>
              <button type="submit" className="btn btn-gold" disabled={loading}>
                {loading ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="bi bi-check me-1"></i>}
                {beer ? 'Enregistrer' : 'Ajouter'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function BeersPage() {
  const { t } = useLang();
  const qc = useQueryClient();
  const [search, setSearch]   = useState('');
  const [typeF, setTypeF]     = useState('all');
  const [statusF, setStatusF] = useState('all');
  const [modal, setModal]     = useState(null); // null | { mode, beer?, prefill? }

  const params = {
    search: search || undefined,
    type:   typeF   !== 'all' ? typeF   : undefined,
    status: statusF !== 'all' ? statusF : undefined,
  };

  const { data: beers = [], isLoading } = useQuery({
    queryKey: ['beers', params],
    queryFn:  () => beersAPI.list(params).then(r => r.data),
  });

  const { data: stats } = useQuery({
    queryKey: ['beers-stats'],
    queryFn:  () => beersAPI.stats().then(r => r.data),
    staleTime: 60_000,
  });

  const addM  = useMutation({ mutationFn: beersAPI.create,  onSuccess: () => { qc.invalidateQueries(['beers']); qc.invalidateQueries(['beers-stats']); toast.success('Bière ajoutée !'); } });
  const editM = useMutation({ mutationFn: ({ id, data }) => beersAPI.update(id, data), onSuccess: () => { qc.invalidateQueries(['beers']); qc.invalidateQueries(['beers-stats']); toast.success('Modifiée !'); } });
  const delM  = useMutation({ mutationFn: beersAPI.remove, onSuccess: () => { qc.invalidateQueries(['beers']); qc.invalidateQueries(['beers-stats']); toast.success('Supprimée'); } });

  const statusMut = useMutation({
    mutationFn: ({ id, status }) => {
      const fd = new FormData(); fd.append('status', status);
      return beersAPI.update(id, fd);
    },
    onSuccess: () => { qc.invalidateQueries(['beers']); },
  });

  const handleBarcodeResult = data => {
    const prefill = {
      name:    data.name    || '',
      brewery: data.brewery || data.producer || '',
      type:    data.type    || 'blonde',
      country: data.country || 'France',
      region:  data.region  || '',
      abv:     data.abv     || '',
      notes:   data.notes   || '',
      ean:     data.ean     || '',
    };
    setModal({ mode: 'add', prefill });
    toast.success('Produit trouvé — vérifiez et complétez');
  };

  const API_BASE = import.meta.env.REACT_APP_API_URL?.replace('/api','') || '';

  return (
    <div className="fade-in">
      {/* ── Stats ── */}
      <div className="row g-2 mb-3">
        {[
          ['bi-collection',    stats?.total_refs    || 0, 'Références'],
          ['bi-cup-straw',     stats?.total_bottles || 0, 'Bouteilles'],
          ['bi-building',      stats?.breweries     || 0, 'Brasseries'],
          ['bi-cash-coin',     stats?.total_value ? `${parseFloat(stats.total_value).toFixed(0)} €` : '—', 'Valeur'],
        ].map(([icon, num, lbl], i) => (
          <div className="col-6 col-lg-3" key={i}>
            <div className="stat-card">
              <div className="d-flex justify-content-between align-items-start">
                <div><div className="stat-num">{num}</div><div className="stat-label">{lbl}</div></div>
                <i className={`bi ${icon}`} style={{ fontSize:'1.1rem', color:'var(--cv-text3)' }}></i>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filtres ── */}
      <div className="card mb-3 p-3">
        <div className="row g-2 align-items-center">
          <div className="col-12 col-md-4">
            <div className="input-group input-group-sm">
              <span className="input-group-text"><i className="bi bi-search"></i></span>
              <input className="form-control" placeholder="Nom, brasserie, région…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="col-6 col-md-2">
            <select className="form-select form-select-sm" value={typeF} onChange={e => setTypeF(e.target.value)}>
              <option value="all">Tous les types</option>
              {BEER_TYPES.map(t => <option key={t} value={t}>{TYPE_ICONS[t]} {t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
          <div className="col-6 col-md-2">
            <select className="form-select form-select-sm" value={statusF} onChange={e => setStatusF(e.target.value)}>
              <option value="all">Tout statut</option>
              <option value="stock">Fermée</option>
              <option value="open">Ouverte</option>
              <option value="empty">Vide</option>
            </select>
          </div>
          <div className="col-12 col-md-4 d-flex justify-content-md-end gap-2">
            <button className="btn btn-outline-gold btn-sm" onClick={() => setModal({ mode: 'barcode' })} title="Scanner code-barres">
              <i className="bi bi-upc-scan"></i>
            </button>
            <button className="btn btn-gold btn-sm" onClick={() => setModal({ mode: 'add' })}>
              <i className="bi bi-plus me-1"></i>Ajouter
            </button>
          </div>
        </div>
      </div>

      {/* ── Filter pills ── */}
      <div className="filter-pills mb-3">
        <button className={`filter-pill ${typeF === 'all' ? 'active' : ''}`} onClick={() => setTypeF('all')}>Tout</button>
        {BEER_TYPES.map(t => (
          <button key={t} className={`filter-pill ${typeF === t ? 'active' : ''}`} onClick={() => setTypeF(t)}>
            {TYPE_ICONS[t]} {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Liste ── */}
      {isLoading ? (
        <div className="text-center p-5"><div className="spinner-border" style={{ color:'var(--cv-gold)' }} /></div>
      ) : beers.length === 0 ? (
        <div className="text-center p-5" style={{ color:'var(--cv-text3)' }}>
          <i className="bi bi-cup-straw d-block mb-3" style={{ fontSize:'3rem' }}></i>
          <p className="mb-3">Aucune bière dans votre collection</p>
          <div className="d-flex gap-2 justify-content-center">
            <button className="btn btn-outline-gold" onClick={() => setModal({ mode: 'barcode' })}>
              <i className="bi bi-upc-scan me-1"></i>Scanner un code-barres
            </button>
            <button className="btn btn-gold" onClick={() => setModal({ mode: 'add' })}>
              <i className="bi bi-plus me-1"></i>Ajouter manuellement
            </button>
          </div>
        </div>
      ) : (
        <div className="row g-2">
          {beers.map(beer => (
            <div className="col-12 col-md-6 col-xl-4" key={beer.id}>
              <div className="item-card" style={{ borderLeft: `3px solid ${TYPE_COLOR[beer.type] || 'var(--cv-gold)'}` }}>
                {/* Label image */}
                {beer.label_image ? (
                  <img
                    src={`${API_BASE}${beer.label_image}`} alt={beer.name}
                    style={{ width:44, height:56, objectFit:'cover', borderRadius:4, flexShrink:0 }}
                  />
                ) : (
                  <span className="item-icon" style={{ fontSize:'1.6rem' }}>{TYPE_ICONS[beer.type] || '🍺'}</span>
                )}

                <div style={{ flex:1, minWidth:0 }}>
                  <div className="item-name">{beer.name}</div>
                  <div className="item-meta">
                    {[beer.brewery, beer.region || beer.country, beer.abv ? `${beer.abv}%` : null, beer.ibu ? `${beer.ibu} IBU` : null].filter(Boolean).join(' · ')}
                  </div>
                  <div className="d-flex gap-1 mt-1 flex-wrap">
                    <span style={{
                      fontSize:'0.68rem', padding:'1px 6px', borderRadius:3,
                      background: TYPE_COLOR[beer.type] + '33',
                      color: TYPE_COLOR[beer.type] === '#1a1a1a' ? '#aaa' : TYPE_COLOR[beer.type],
                      border: `1px solid ${TYPE_COLOR[beer.type]}55`,
                    }}>
                      {TYPE_ICONS[beer.type]} {beer.type}
                    </span>
                    {beer.volume && <span style={{ fontSize:'0.68rem', color:'var(--cv-text3)' }}>{beer.volume} cl</span>}
                  </div>
                </div>

                <div className="d-flex align-items-center gap-2 flex-shrink-0">
                  {beer.rating ? <span style={{ fontSize:'0.72rem', color:'var(--cv-gold)' }}>{beer.rating}/100</span> : null}
                  <span className={STATUS_CLASS[beer.status] || 'badge-stock'} style={{ fontSize:'0.68rem' }}>
                    {STATUS_LABEL[beer.status] || beer.status}
                  </span>
                  <span className="item-qty">{beer.quantity}</span>
                  <div className="dropdown">
                    <button className="btn btn-sm" style={{ color:'var(--cv-text3)', background:'none', border:'none' }} data-bs-toggle="dropdown">
                      <i className="bi bi-three-dots-vertical"></i>
                    </button>
                    <ul className="dropdown-menu dropdown-menu-end">
                      <li><button className="dropdown-item" onClick={() => setModal({ mode:'edit', beer })}>
                        <i className="bi bi-pencil me-2"></i>Modifier
                      </button></li>
                      {beer.status !== 'open' && (
                        <li><button className="dropdown-item" onClick={() => statusMut.mutate({ id: beer.id, status: 'open' })}>
                          <i className="bi bi-unlock me-2"></i>Marquer ouverte
                        </button></li>
                      )}
                      {beer.status !== 'empty' && (
                        <li><button className="dropdown-item" onClick={() => statusMut.mutate({ id: beer.id, status: 'empty' })}>
                          <i className="bi bi-cup me-2"></i>Marquer vide
                        </button></li>
                      )}
                      {beer.status !== 'stock' && (
                        <li><button className="dropdown-item" onClick={() => statusMut.mutate({ id: beer.id, status: 'stock' })}>
                          <i className="bi bi-lock me-2"></i>Remettre en stock
                        </button></li>
                      )}
                      <li><hr className="dropdown-divider" style={{ borderColor:'var(--cv-border)' }} /></li>
                      <li><button className="dropdown-item" style={{ color:'#dc3545' }}
                          onClick={() => { if (window.confirm('Supprimer cette bière ?')) delM.mutate(beer.id); }}>
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

      {/* ── Modals ── */}
      {modal?.mode === 'add' && (
        <BeerModal prefill={modal.prefill} onClose={() => setModal(null)} onSave={fd => addM.mutateAsync(fd)} />
      )}
      {modal?.mode === 'edit' && (
        <BeerModal beer={modal.beer} onClose={() => setModal(null)} onSave={fd => editM.mutateAsync({ id: modal.beer.id, data: fd })} />
      )}
      {modal?.mode === 'barcode' && (
        <BarcodeScannerModal
          title="Scanner une bière"
          lookupFn={ean => beersAPI.barcode(ean)}
          onClose={() => setModal(null)}
          onResult={(data, ean) => handleBarcodeResult({ ...data, ean })}
        />
      )}
    </div>
  );
}
