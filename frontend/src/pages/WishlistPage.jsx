// src/pages/WishlistPage.jsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { wishlistAPI } from '../services/api';
import toast from 'react-hot-toast';

const TYPES = ['rouge', 'blanc', 'rosé', 'pétillant', 'autre'];
const TYPE_ICONS = { rouge: '🍷', blanc: '🥂', rosé: '🌸', pétillant: '✨', autre: '🍶' };
const PRIORITY_LABELS = { high: { label: 'Haute', cls: 'badge-stock' }, medium: { label: 'Moyenne', cls: 'badge-open' }, low: { label: 'Basse', cls: 'badge-drunk' } };
const EMPTY_FORM = { name: '', producer: '', vintage: '', type: 'rouge', region: '', priority: 'medium', price_max: '', url: '', notes: '' };

function WishModal({ item, onClose, onSave }) {
  const [form, setForm] = useState(item ? { ...EMPTY_FORM, ...item, vintage: item.vintage||'', price_max: item.price_max||'' } : { ...EMPTY_FORM });
  const [loading, setLoading] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try { await onSave(form); onClose(); }
    catch { toast.error('Erreur'); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{item ? 'Modifier' : 'Ajouter à la wishlist'}</h5>
            <button className="btn-close" onClick={onClose} />
          </div>
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              <div className="row g-2">
                <div className="col-12">
                  <label className="form-label">Nom du vin *</label>
                  <input className="form-control" required value={form.name} onChange={set('name')} placeholder="Château Margaux…" />
                </div>
                <div className="col-6">
                  <label className="form-label">Producteur</label>
                  <input className="form-control" value={form.producer} onChange={set('producer')} />
                </div>
                <div className="col-6">
                  <label className="form-label">Millésime</label>
                  <input className="form-control" type="number" min="1800" max="2100" value={form.vintage} onChange={set('vintage')} placeholder="2020" />
                </div>
                <div className="col-6">
                  <label className="form-label">Type</label>
                  <select className="form-select" value={form.type} onChange={set('type')}>
                    {TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
                <div className="col-6">
                  <label className="form-label">Priorité</label>
                  <select className="form-select" value={form.priority} onChange={set('priority')}>
                    <option value="high">Haute</option>
                    <option value="medium">Moyenne</option>
                    <option value="low">Basse</option>
                  </select>
                </div>
                <div className="col-6">
                  <label className="form-label">Région</label>
                  <input className="form-control" value={form.region} onChange={set('region')} placeholder="Bordeaux…" />
                </div>
                <div className="col-6">
                  <label className="form-label">Budget max (€)</label>
                  <input className="form-control" type="number" min="0" step="0.01" value={form.price_max} onChange={set('price_max')} />
                </div>
                <div className="col-12">
                  <label className="form-label">URL (site marchand)</label>
                  <input className="form-control" type="url" value={form.url} onChange={set('url')} placeholder="https://…" />
                </div>
                <div className="col-12">
                  <label className="form-label">Notes</label>
                  <textarea className="form-control" rows={2} value={form.notes} onChange={set('notes')} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-gold" onClick={onClose}>Annuler</button>
              <button type="submit" className="btn btn-gold" disabled={loading || !form.name}>
                {loading ? <span className="spinner-border spinner-border-sm me-1" /> : null}
                {item ? 'Enregistrer' : 'Ajouter'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function WishlistPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(null);
  const [showFound, setShowFound] = useState(false);

  const params = showFound ? {} : { found: '0' };
  const { data = [], isLoading } = useQuery({
    queryKey: ['wishlist', params],
    queryFn: () => wishlistAPI.list(params).then(r => r.data),
  });

  const addMutation = useMutation({ mutationFn: wishlistAPI.create, onSuccess: () => { qc.invalidateQueries(['wishlist']); toast.success('Ajouté !'); } });
  const editMutation = useMutation({ mutationFn: ({ id, data }) => wishlistAPI.update(id, data), onSuccess: () => { qc.invalidateQueries(['wishlist']); toast.success('Modifié !'); } });
  const delMutation = useMutation({ mutationFn: wishlistAPI.remove, onSuccess: () => { qc.invalidateQueries(['wishlist']); toast.success('Supprimé'); } });
  const toggleFound = useMutation({
    mutationFn: (item) => wishlistAPI.update(item.id, { found: item.found ? 0 : 1 }),
    onSuccess: () => qc.invalidateQueries(['wishlist']),
  });

  return (
    <div className="fade-in">
      <div className="card mb-3 p-3">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
          <div className="d-flex align-items-center gap-3">
            <h6 className="mb-0" style={{ color: 'var(--cv-text)' }}><i className="bi bi-heart me-2" style={{ color: 'var(--cv-gold)' }}></i>Liste de souhaits</h6>
            <div className="form-check mb-0">
              <input className="form-check-input" type="checkbox" id="showFound" checked={showFound} onChange={e => setShowFound(e.target.checked)} />
              <label className="form-check-label" htmlFor="showFound" style={{ fontSize: '0.82rem', color: 'var(--cv-text2)' }}>Afficher trouvés</label>
            </div>
          </div>
          <button className="btn btn-gold btn-sm" onClick={() => setModal({ mode: 'add' })}>
            <i className="bi bi-plus me-1"></i>Ajouter
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center p-5"><div className="spinner-border" style={{ color: 'var(--cv-gold)' }} /></div>
      ) : data.length === 0 ? (
        <div className="text-center p-5" style={{ color: 'var(--cv-text3)' }}>
          <i className="bi bi-heart d-block mb-3" style={{ fontSize: '3rem' }}></i>
          <p>Votre liste de souhaits est vide</p>
          <button className="btn btn-gold" onClick={() => setModal({ mode: 'add' })}>Ajouter un vin</button>
        </div>
      ) : (
        <div className="row g-2">
          {data.map(item => (
            <div key={item.id} className="col-12 col-lg-6">
              <div className="item-card" style={{ opacity: item.found ? 0.55 : 1 }}>
                <span className="item-icon">{TYPE_ICONS[item.type] || '🍷'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="item-name" style={{ textDecoration: item.found ? 'line-through' : 'none' }}>{item.name}</div>
                  <div className="item-meta">
                    {[item.producer, item.vintage, item.region].filter(Boolean).join(' · ')}
                    {item.price_max ? ` · max ${parseFloat(item.price_max).toFixed(0)}€` : ''}
                  </div>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <span className={`badge-type ${PRIORITY_LABELS[item.priority]?.cls || ''}`} style={{ fontSize: '0.62rem' }}>
                    {PRIORITY_LABELS[item.priority]?.label}
                  </span>
                  <div className="dropdown">
                    <button className="btn btn-sm" style={{ color: 'var(--cv-text3)', background: 'none', border: 'none' }} data-bs-toggle="dropdown">
                      <i className="bi bi-three-dots-vertical"></i>
                    </button>
                    <ul className="dropdown-menu dropdown-menu-end">
                      <li><button className="dropdown-item" onClick={() => setModal({ mode: 'edit', item })}>
                        <i className="bi bi-pencil me-2"></i>Modifier
                      </button></li>
                      <li><button className="dropdown-item" onClick={() => toggleFound.mutate(item)}>
                        <i className={`bi bi-${item.found ? 'x-circle' : 'check-circle'} me-2`}></i>
                        {item.found ? 'Marquer non trouvé' : 'Marquer trouvé'}
                      </button></li>
                      {item.url && <li><a className="dropdown-item" href={item.url} target="_blank" rel="noreferrer">
                        <i className="bi bi-box-arrow-up-right me-2"></i>Ouvrir le lien
                      </a></li>}
                      <li><hr className="dropdown-divider" style={{ borderColor: 'var(--cv-border)' }} /></li>
                      <li><button className="dropdown-item" style={{ color: '#dc3545' }}
                        onClick={() => { if (window.confirm('Supprimer ?')) delMutation.mutate(item.id); }}>
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

      {modal?.mode === 'add' && <WishModal onClose={() => setModal(null)} onSave={addMutation.mutateAsync} />}
      {modal?.mode === 'edit' && <WishModal item={modal.item} onClose={() => setModal(null)} onSave={(data) => editMutation.mutateAsync({ id: modal.item.id, data })} />}
    </div>
  );
}
