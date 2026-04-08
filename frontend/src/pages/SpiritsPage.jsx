// src/pages/SpiritsPage.jsx
import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { spiritsAPI } from '../services/api';
import { useLang } from '../context/LangContext';
import toast from 'react-hot-toast';
import BarcodeScannerModal from '../components/BarcodeScannerModal';

const SPIRIT_TYPES = ['whisky','rhum','cognac','armagnac','calvados','gin','vodka','autre'];
const TYPE_ICONS = { whisky:'🥃', rhum:'🍹', cognac:'🥃', armagnac:'🥃', calvados:'🍎', gin:'🍸', vodka:'🍸', autre:'🍶' };
const EMPTY = { name:'', type:'whisky', producer:'', origin:'', age:'', abv:'', status:'stock', price:'', rating:'', quantity:1, notes:'', domain_website:'', domain_description:'' };

function PhotoPicker({ label, current, onChange, t }) {
  const ref = useRef();
  const [preview, setPreview] = useState(current || null);
  const handleFile = e => {
    const f = e.target.files[0]; if (!f) return;
    onChange(f);
    const r = new FileReader(); r.onload = ev => setPreview(ev.target.result); r.readAsDataURL(f);
  };
  const API_BASE = import.meta.env.REACT_APP_API_URL?.replace('/api','') || '';
  const src = preview?.startsWith('data:') ? preview : preview ? `${API_BASE}${preview}` : null;
  return (
    <div>
      <label className="form-label">{label}</label>
      {src && <img src={src} alt={label} style={{ width:'100%', maxHeight:180, objectFit:'contain', borderRadius:8, marginBottom:8, background:'#1a0f0f' }} />}
      <div className="d-flex gap-2">
        <button type="button" className="btn btn-sm btn-outline-gold" onClick={() => ref.current.click()}>
          <i className="bi bi-image me-1"></i>{src ? t('wines.changePhoto') : t('wines.choosePhoto')}
        </button>
        {src && <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => { setPreview(null); onChange(null); }}>{t('wines.removePhoto')}</button>}
      </div>
      <input ref={ref} type="file" accept="image/*" style={{ display:'none' }} onChange={handleFile} />
    </div>
  );
}

function SpiritModal({ spirit, prefill, onClose, onSave }) {
  const { t } = useLang();
  const [tab, setTab] = useState('spirit');
  const [form, setForm] = useState(() => {
    if (spirit) return { ...EMPTY, ...spirit };
    if (prefill) return { ...EMPTY, ...prefill };
    return { ...EMPTY };
  });
  const [labelFile,  setLabelFile]  = useState(null);
  const [bottleFile, setBottleFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async e => {
    e.preventDefault(); setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k,v]) => { if (v !== '' && v !== null && v !== undefined) fd.append(k, v); });
      if (labelFile)  fd.append('label',       labelFile);
      if (bottleFile) fd.append('bottle_photo', bottleFile);
      await onSave(fd); onClose();
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setLoading(false); }
  };

  const tabStyle = active => ({
    background:'none', border:'none', padding:'8px 16px', cursor:'pointer',
    color: active ? 'var(--cv-gold)' : 'var(--cv-text2)',
    borderBottom: active ? '2px solid var(--cv-gold)' : '2px solid transparent',
    fontSize:'0.85rem', fontWeight: active ? 600 : 400,
  });

  return (
    <div className="modal show d-block" style={{ background:'rgba(0,0,0,0.7)' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header" style={{ paddingBottom:0, flexDirection:'column', alignItems:'flex-start' }}>
            <div className="d-flex justify-content-between w-100 mb-2">
              <h5 className="modal-title">{spirit ? 'Modifier' : 'Ajouter un spiritueux'}</h5>
              <button className="btn-close" onClick={onClose} />
            </div>
            <div style={{ borderBottom:'1px solid var(--cv-border)', width:'100%' }}>
              {[['spirit', t('spirits.tabSpirit')], ['distillerie', t('spirits.tabDistillery')], ['photos', t('spirits.tabPhotos')]].map(([key, label]) => (
                <button key={key} type="button" style={tabStyle(tab === key)} onClick={() => setTab(key)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="modal-body">

              {tab === 'spirit' && (
                <div className="row g-3">
                  <div className="col-md-8"><label className="form-label">{t('spirits.name')} *</label><input className="form-control" required value={form.name} onChange={set('name')} placeholder="Glenfarclas 25 ans" /></div>
                  <div className="col-md-4"><label className="form-label">{t('common.type')} *</label>
                    <select className="form-select" value={form.type} onChange={set('type')}>
                      {SPIRIT_TYPES.map(tp => <option key={tp} value={tp}>{t(`spirits.type.${tp}`)}</option>)}
                    </select>
                  </div>
                  <div className="col-md-6"><label className="form-label">{t('spirits.producer')}</label><input className="form-control" value={form.producer} onChange={set('producer')} placeholder="Glenfarclas Distillery" /></div>
                  <div className="col-md-6"><label className="form-label">{t('spirits.origin')}</label><input className="form-control" value={form.origin} onChange={set('origin')} placeholder="Écosse, Speyside" /></div>
                  <div className="col-md-4"><label className="form-label">{t('spirits.age')}</label><input className="form-control" value={form.age} onChange={set('age')} placeholder="25 ans ou 2008" /></div>
                  <div className="col-md-4"><label className="form-label">{t('spirits.abv')}</label><input className="form-control" type="number" step="0.1" min="0" max="100" value={form.abv} onChange={set('abv')} placeholder="46" /></div>
                  <div className="col-md-4"><label className="form-label">{t('common.status')}</label>
                    <select className="form-select" value={form.status} onChange={set('status')}>
                      <option value="stock">{t('spirits.status.stock')}</option>
                      <option value="open">{t('spirits.status.open')}</option>
                      <option value="empty">{t('spirits.status.empty')}</option>
                    </select>
                  </div>
                  <div className="col-md-4"><label className="form-label">{t('spirits.price')}</label><input className="form-control" type="number" min="0" step="0.01" value={form.price} onChange={set('price')} /></div>
                  <div className="col-md-4"><label className="form-label">{t('spirits.rating')}</label><input className="form-control" type="number" min="0" max="100" value={form.rating} onChange={set('rating')} placeholder="88" /></div>
                  <div className="col-md-4"><label className="form-label">{t('spirits.quantity')}</label><input className="form-control" type="number" min="0" value={form.quantity} onChange={set('quantity')} /></div>
                  <div className="col-12"><label className="form-label">{t('spirits.notes')}</label><textarea className="form-control" rows={3} value={form.notes} onChange={set('notes')} placeholder="Tourbé, vanille, fruits secs, épices..." /></div>
                </div>
              )}

              {tab === 'distillerie' && (
                <div className="row g-3">
                  <div className="col-12"><label className="form-label">{t('spirits.distilleryWebsite')}</label>
                    <input className="form-control" value={form.domain_website} onChange={set('domain_website')} placeholder="https://www.glenfarclas.com" type="url" /></div>
                  <div className="col-12"><label className="form-label">{t('spirits.distilleryDesc')}</label>
                    <textarea className="form-control" rows={6} value={form.domain_description} onChange={set('domain_description')} placeholder="Histoire de la distillerie, méthodes de production..." /></div>
                </div>
              )}

              {tab === 'photos' && (
                <div className="row g-4">
                  <div className="col-md-6"><PhotoPicker label={t('spirits.labelPhoto')} current={spirit?.label_image} onChange={setLabelFile} t={t} /></div>
                  <div className="col-md-6"><PhotoPicker label={t('spirits.bottlePhoto')} current={spirit?.bottle_photo} onChange={setBottleFile} t={t} /></div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-gold" onClick={onClose}>{t('common.cancel')}</button>
              <button type="submit" className="btn btn-gold" disabled={loading}>
                {loading && <span className="spinner-border spinner-border-sm me-1" />}
                {spirit ? t('common.save') : t('spirits.add')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function SpiritsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [typeF, setTypeF] = useState('all');
  const [statusF, setStatusF] = useState('all');
  const [modal, setModal] = useState(null); // null | { mode: 'add'|'edit'|'barcode', spirit?, prefill? }

  const handleBarcodeResult = (data) => {
    // Map barcode result → spirit fields
    const prefill = {
      name:     data.name     || '',
      producer: data.producer || '',
      origin:   data.origin   || [data.region, data.country].filter(Boolean).join(', ') || '',
      notes:    data.notes    || '',
    };
    setModal({ mode: 'add', prefill });
    toast.success('Produit trouvé — vérifiez et complétez les informations');
  };

  const params = { search: search || undefined, type: typeF !== 'all' ? typeF : undefined, status: statusF !== 'all' ? statusF : undefined };
  const { data: spirits = [], isLoading } = useQuery({ queryKey: ['spirits', params], queryFn: () => spiritsAPI.list(params).then(r => r.data) });

  const addM = useMutation({ mutationFn: spiritsAPI.create, onSuccess: () => { qc.invalidateQueries(['spirits']); toast.success('Spiritueux ajouté !'); } });
  const editM = useMutation({ mutationFn: ({ id, data }) => spiritsAPI.update(id, data), onSuccess: () => { qc.invalidateQueries(['spirits']); toast.success('Modifié !'); } });
  const delM = useMutation({ mutationFn: spiritsAPI.remove, onSuccess: () => { qc.invalidateQueries(['spirits']); toast.success('Supprimé'); } });

  const summary = { total: spirits.length, whisky: spirits.filter(s => s.type === 'whisky').length, rhum: spirits.filter(s => s.type === 'rhum').length, cognac: spirits.filter(s => ['cognac','armagnac','calvados'].includes(s.type)).length };

  return (
    <div className="fade-in">
      {/* Stats mini */}
      <div className="row g-2 mb-3">
        {[['bi-collection', summary.total, 'Total'], ['bi-cup-hot', summary.whisky, 'Whisky'], ['bi-tropical-storm', summary.rhum, 'Rhum'], ['bi-award', summary.cognac, 'Cognac/Armagnac']].map(([icon, num, lbl], i) => (
          <div className="col-6 col-lg-3" key={i}>
            <div className="stat-card">
              <div className="d-flex justify-content-between">
                <div><div className="stat-num">{num}</div><div className="stat-label">{lbl}</div></div>
                <i className={`bi ${icon}`} style={{ fontSize:'1.1rem', color:'var(--cv-text3)' }}></i>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card mb-3 p-3">
        <div className="row g-2 align-items-center">
          <div className="col-12 col-md-4">
            <div className="input-group input-group-sm">
              <span className="input-group-text"><i className="bi bi-search"></i></span>
              <input className="form-control" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="col-6 col-md-3">
            <select className="form-select form-select-sm" value={typeF} onChange={e => setTypeF(e.target.value)}>
              <option value="all">Tous les types</option>
              {SPIRIT_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
          <div className="col-6 col-md-3">
            <select className="form-select form-select-sm" value={statusF} onChange={e => setStatusF(e.target.value)}>
              <option value="all">Tout statut</option>
              <option value="stock">Non ouvert</option>
              <option value="open">Ouvert</option>
              <option value="empty">Terminé</option>
            </select>
          </div>
          <div className="col-12 col-md-2 d-flex justify-content-md-end gap-2">
            <button className="btn btn-outline-gold btn-sm" onClick={() => setModal({ mode: 'barcode' })} title="Scanner code-barres">
              <i className="bi bi-upc-scan"></i>
            </button>
            <button className="btn btn-gold btn-sm" onClick={() => setModal({ mode: 'add' })}><i className="bi bi-plus me-1"></i>Ajouter</button>
          </div>
        </div>
      </div>

      {/* Filter pills */}
      <div className="filter-pills mb-3">
        {['all', ...SPIRIT_TYPES].map(t => (
          <button key={t} className={`filter-pill ${typeF === t ? 'active' : ''}`} onClick={() => setTypeF(t)}>
            {t === 'all' ? 'Tout' : (TYPE_ICONS[t] + ' ' + t.charAt(0).toUpperCase() + t.slice(1))}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? <div className="text-center p-5"><div className="spinner-border" style={{ color:'var(--cv-gold)' }} /></div>
        : spirits.length === 0 ? (
          <div className="text-center p-5" style={{ color:'var(--cv-text3)' }}>
            <i className="bi bi-cup-hot d-block mb-3" style={{ fontSize:'3rem' }}></i>
            <button className="btn btn-gold" onClick={() => setModal({ mode:'add' })}>Ajouter votre premier spiritueux</button>
          </div>
        ) : (
          <div className="row g-2">
            {spirits.map(s => (
              <div className="col-12 col-lg-6" key={s.id}>
                <div className="item-card">
                  <span className="item-icon">{TYPE_ICONS[s.type] || '🥃'}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div className="item-name">{s.name}</div>
                    <div className="item-meta">{[s.origin, s.age, s.abv ? s.abv + '%' : null].filter(Boolean).join(' · ')}</div>
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    {s.rating ? <span style={{ fontSize:'0.72rem', color:'var(--cv-gold)' }}>{s.rating}/100</span> : null}
                    <span className={s.status === 'open' ? 'badge-open' : s.status === 'empty' ? 'badge-drunk' : 'badge-stock'}>
                      {s.status === 'open' ? 'ouvert' : s.status === 'empty' ? 'terminé' : 'fermé'}
                    </span>
                    <span className="item-qty">{s.quantity}</span>
                    <div className="dropdown">
                      <button className="btn btn-sm" style={{ color:'var(--cv-text3)', background:'none', border:'none' }} data-bs-toggle="dropdown">
                        <i className="bi bi-three-dots-vertical"></i>
                      </button>
                      <ul className="dropdown-menu dropdown-menu-end">
                        <li><button className="dropdown-item" onClick={() => setModal({ mode:'edit', spirit:s })}><i className="bi bi-pencil me-2"></i>Modifier</button></li>
                        <li><button className="dropdown-item" onClick={() => editM.mutate({ id:s.id, data:{ status: s.status === 'open' ? 'stock' : 'open' } })}>
                          <i className={`bi bi-${s.status === 'open' ? 'lock' : 'unlock'} me-2`}></i>{s.status === 'open' ? 'Marquer fermé' : 'Marquer ouvert'}
                        </button></li>
                        <li><hr className="dropdown-divider" style={{ borderColor:'var(--cv-border)' }} /></li>
                        <li><button className="dropdown-item" style={{ color:'#dc3545' }} onClick={() => { if (window.confirm('Supprimer ?')) delM.mutate(s.id); }}>
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

      {modal?.mode === 'add' && <SpiritModal prefill={modal.prefill} onClose={() => setModal(null)} onSave={d => addM.mutateAsync(d)} />}
      {modal?.mode === 'edit' && <SpiritModal spirit={modal.spirit} onClose={() => setModal(null)} onSave={d => editM.mutateAsync({ id: modal.spirit.id, data: d })} />}
      {modal?.mode === 'barcode' && (
        <BarcodeScannerModal
          title="Scanner un spiritueux"
          lookupFn={ean => spiritsAPI.barcode(ean)}
          onClose={() => setModal(null)}
          onResult={(data) => handleBarcodeResult(data)}
        />
      )}
    </div>
  );
}
