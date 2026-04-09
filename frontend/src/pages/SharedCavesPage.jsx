// src/pages/SharedCavesPage.jsx — shared cave management + collaborative write
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sharingAPI } from '../services/api';
import { useLang } from '../context/LangContext';
import toast from 'react-hot-toast';

const TYPE_ICONS = { rouge: '🍷', blanc: '🥂', rosé: '🌸', pétillant: '✨' };
const TYPES = ['rouge', 'blanc', 'rosé', 'pétillant'];
const EMPTY_FORM = {
  name: '', appellation: '', vintage: '', type: 'rouge', producer: '', region: '', grapes: '',
  country: 'France', quantity: 1, position: '', price: '', keep_until: '', notes: '',
};

// ── Mini wine modal for add/edit in a shared cave ─────────────────────────────
function SharedWineModal({ ownerId, wine, onClose, onSave }) {
  const { t } = useLang();
  const [form, setForm] = useState(wine
    ? { ...EMPTY_FORM, ...wine, vintage: wine.vintage || '', price: wine.price || '', keep_until: wine.keep_until || '', position: wine.position || '', notes: wine.notes || '' }
    : { ...EMPTY_FORM }
  );
  const [loading, setLoading] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v !== '' && v !== null && v !== undefined) fd.append(k, v); });
      await onSave(fd);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || t('sharing.savingError'));
    } finally { setLoading(false); }
  };

  return (
    <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{wine ? t('wines.edit') : t('wines.add')}</h5>
            <button className="btn-close" onClick={onClose} />
          </div>
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              <div className="row g-3">
                <div className="col-md-8"><label className="form-label">{t('wines.name')} *</label><input className="form-control" required value={form.name} onChange={set('name')} placeholder="Château Margaux" /></div>
                <div className="col-md-4"><label className="form-label">{t('wines.vintage')}</label><input className="form-control" type="number" value={form.vintage} onChange={set('vintage')} placeholder="2019" min="1900" max="2030" /></div>
                <div className="col-md-6"><label className="form-label">{t('wines.appellation')}</label><input className="form-control" value={form.appellation} onChange={set('appellation')} /></div>
                <div className="col-md-6"><label className="form-label">{t('wines.type')} *</label>
                  <select className="form-select" value={form.type} onChange={set('type')}>
                    {TYPES.map(tp => <option key={tp} value={tp}>{t(`wines.type.${tp}`)}</option>)}
                  </select>
                </div>
                <div className="col-md-6"><label className="form-label">{t('wines.producer')}</label><input className="form-control" value={form.producer} onChange={set('producer')} /></div>
                <div className="col-md-6"><label className="form-label">{t('wines.region')}</label><input className="form-control" value={form.region} onChange={set('region')} /></div>
                <div className="col-md-8"><label className="form-label">{t('wines.grapes')}</label><input className="form-control" value={form.grapes} onChange={set('grapes')} /></div>
                <div className="col-md-4"><label className="form-label">{t('wines.country')}</label><input className="form-control" value={form.country} onChange={set('country')} /></div>
                <div className="col-md-3"><label className="form-label">{t('wines.quantity')}</label><input className="form-control" type="number" min="0" value={form.quantity} onChange={set('quantity')} /></div>
                <div className="col-md-3"><label className="form-label">{t('wines.position')}</label><input className="form-control" value={form.position} onChange={set('position')} placeholder="A3" maxLength={10} /></div>
                <div className="col-md-3"><label className="form-label">{t('wines.price')}</label><input className="form-control" type="number" min="0" step="0.01" value={form.price} onChange={set('price')} /></div>
                <div className="col-md-3"><label className="form-label">{t('wines.keepUntil')}</label><input className="form-control" type="number" min="2024" max="2100" value={form.keep_until} onChange={set('keep_until')} placeholder="2035" /></div>
                <div className="col-12"><label className="form-label">{t('wines.notes')}</label><textarea className="form-control" rows={3} value={form.notes} onChange={set('notes')} /></div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-gold" onClick={onClose}>{t('common.cancel')}</button>
              <button type="submit" className="btn btn-gold" disabled={loading}>
                {loading ? <span className="spinner-border spinner-border-sm me-1" /> : null}
                {wine ? t('common.save') : t('common.add')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Permission badge ──────────────────────────────────────────────────────────
function PermBadge({ permission }) {
  const { t } = useLang();
  return permission === 'write'
    ? <span style={{ fontSize: '0.65rem', padding: '2px 7px', borderRadius: 4, background: 'rgba(76,175,80,0.18)', color: '#4CAF50', border: '0.5px solid #4CAF50' }}>{t('sharing.permWrite')}</span>
    : <span style={{ fontSize: '0.65rem', padding: '2px 7px', borderRadius: 4, background: 'rgba(176,144,112,0.18)', color: 'var(--cv-text3)', border: '0.5px solid var(--cv-border)' }}>{t('sharing.permRead')}</span>;
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SharedCavesPage() {
  const { t } = useLang();
  const qc = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePermission, setInvitePermission] = useState('read');
  const [inviteToken, setInviteToken] = useState('');
  const [acceptToken, setAcceptToken] = useState('');
  const [viewShare, setViewShare] = useState(null); // { owner_id, permission }
  const [wineModal, setWineModal] = useState(null);  // null | { mode: 'add'|'edit', wine? }
  const [suggestModal, setSuggestModal] = useState(null); // { owner_id } | null

  const { data: sharing, isLoading } = useQuery({
    queryKey: ['sharing'],
    queryFn: () => sharingAPI.list().then(r => r.data),
  });

  const { data: pendingWines = [] } = useQuery({
    queryKey: ['pending-wines'],
    queryFn: () => sharingAPI.listPending().then(r => r.data),
    staleTime: 30_000,
  });

  const { data: sharedCave, isLoading: caveLoading } = useQuery({
    queryKey: ['shared-cave', viewShare?.owner_id],
    queryFn: () => sharingAPI.getCave(viewShare.owner_id).then(r => r.data),
    enabled: !!viewShare?.owner_id,
  });

  const canWrite = viewShare?.permission === 'write';

  // ── Mutations ──
  const inviteMut = useMutation({
    mutationFn: ({ email, permission }) => sharingAPI.invite(email, permission),
    onSuccess: (r) => {
      qc.invalidateQueries(['sharing']);
      toast.success(r.data.permission === 'write' ? t('sharing.inviteCreatedWrite') : t('sharing.inviteCreatedRead'));
      setInviteToken(`${window.location.origin}/sharing/accept/${r.data.token}`);
      setInviteEmail('');
    },
    onError: (err) => toast.error(err.response?.data?.error || t('common.error')),
  });

  const acceptMut = useMutation({
    mutationFn: (token) => sharingAPI.accept(token),
    onSuccess: (r) => { qc.invalidateQueries(['sharing']); toast.success(`${r.data.owner_username} — ${t('sharing.caveAccepted')}`); },
    onError: (err) => toast.error(err.response?.data?.error || t('sharing.inviteInvalid')),
  });

  const revokeMut = useMutation({
    mutationFn: (id) => sharingAPI.revoke(id),
    onSuccess: () => { qc.invalidateQueries(['sharing']); toast.success(t('sharing.accessRevoked')); },
  });

  const permMut = useMutation({
    mutationFn: ({ id, permission }) => sharingAPI.setPermission(id, permission),
    onSuccess: (_, { permission }) => {
      qc.invalidateQueries(['sharing']);
      toast.success(permission === 'write' ? t('sharing.permUpdatedWrite') : t('sharing.permUpdatedRead'));
    },
    onError: () => toast.error(t('common.error')),
  });

  const addWineMut = useMutation({
    mutationFn: (fd) => sharingAPI.addWine(viewShare.owner_id, fd),
    onSuccess: () => { qc.invalidateQueries(['shared-cave', viewShare.owner_id]); toast.success(t('sharing.wineAdded')); },
    onError: (err) => toast.error(err.response?.data?.error || t('common.error')),
  });

  const editWineMut = useMutation({
    mutationFn: ({ id, fd }) => sharingAPI.updateWine(viewShare.owner_id, id, fd),
    onSuccess: () => { qc.invalidateQueries(['shared-cave', viewShare.owner_id]); toast.success(t('sharing.wineEdited')); },
    onError: (err) => toast.error(err.response?.data?.error || t('common.error')),
  });

  const deleteWineMut = useMutation({
    mutationFn: (id) => sharingAPI.removeWine(viewShare.owner_id, id),
    onSuccess: () => { qc.invalidateQueries(['shared-cave', viewShare.owner_id]); toast.success(t('sharing.wineDeleted')); },
    onError: () => toast.error(t('common.error')),
  });

  const toggleDrunkMut = useMutation({
    mutationFn: (id) => sharingAPI.toggleDrunk(viewShare.owner_id, id),
    onSuccess: () => qc.invalidateQueries(['shared-cave', viewShare.owner_id]),
    onError: () => toast.error(t('common.error')),
  });

  const approvePendingMut = useMutation({
    mutationFn: (id) => sharingAPI.approvePending(id),
    onSuccess: () => { qc.invalidateQueries(['pending-wines']); toast.success(t('sharing.approved')); },
    onError: () => toast.error(t('common.error')),
  });

  const rejectPendingMut = useMutation({
    mutationFn: (id) => sharingAPI.rejectPending(id),
    onSuccess: () => { qc.invalidateQueries(['pending-wines']); toast.success(t('sharing.rejected')); },
    onError: () => toast.error(t('common.error')),
  });

  const submitPendingMut = useMutation({
    mutationFn: ({ ownerId, data }) => sharingAPI.submitPending(ownerId, data),
    onSuccess: () => { setSuggestModal(null); toast.success(t('sharing.suggestSent')); },
    onError: () => toast.error(t('sharing.suggestError')),
  });

  // ── Handlers ──
  const handleInvite = (e) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    inviteMut.mutate({ email: inviteEmail.trim(), permission: invitePermission });
  };

  const handleAccept = (e) => {
    e.preventDefault();
    const raw = acceptToken.trim();
    const token = raw.includes('/accept/') ? raw.split('/accept/').pop() : raw;
    if (!token) return;
    acceptMut.mutate(token);
    setAcceptToken('');
  };

  const asOwner = sharing?.as_owner || [];
  const asGuest = sharing?.as_guest || [];

  const permOptions = [
    { val: 'read',  label: t('sharing.permRead'),  desc: t('sharing.readDesc') },
    { val: 'write', label: t('sharing.writeCollab'), desc: t('sharing.writeDesc') },
  ];

  return (
    <div className="fade-in">
      <div className="row g-3">

        {/* ── Invite panel ─────────────────────────────────────────────────── */}
        <div className="col-lg-6">
          <div className="card h-100">
            <div className="card-header"><h6 className="card-title"><i className="bi bi-send me-2" style={{ color: 'var(--cv-gold)' }}></i>{t('sharing.shareMyCell')}</h6></div>
            <div className="card-body p-3">
              <form onSubmit={handleInvite}>
                <div className="mb-2">
                  <label className="form-label" style={{ fontSize: '0.78rem' }}>{t('sharing.inviteEmail')}</label>
                  <input className="form-control" type="email" placeholder="ami@exemple.fr"
                    value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required />
                </div>
                <div className="mb-3">
                  <label className="form-label" style={{ fontSize: '0.78rem' }}>{t('sharing.permission')}</label>
                  <div className="d-flex gap-3">
                    {permOptions.map(({ val, label, desc }) => (
                      <label key={val} className="d-flex align-items-start gap-2" style={{ cursor: 'pointer', flex: 1, padding: '8px 10px', borderRadius: 8, border: `1px solid ${invitePermission === val ? 'var(--cv-gold)' : 'var(--cv-border)'}`, background: invitePermission === val ? 'rgba(201,168,76,0.08)' : 'transparent' }}>
                        <input type="radio" name="perm" value={val} checked={invitePermission === val} onChange={() => setInvitePermission(val)} style={{ marginTop: 3 }} />
                        <div>
                          <div style={{ fontSize: '0.82rem', color: 'var(--cv-text)', fontWeight: invitePermission === val ? 600 : 400 }}>{label}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--cv-text3)', marginTop: 2 }}>{desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
                <button className="btn btn-gold btn-sm w-100" disabled={inviteMut.isPending}>
                  {inviteMut.isPending ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="bi bi-send me-1"></i>}
                  {t('sharing.createInvite')}
                </button>
              </form>

              {inviteToken && (
                <div className="mt-3 p-2" style={{ background: 'var(--cv-bg3)', borderRadius: 8, border: '1px solid var(--cv-border)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--cv-text3)', marginBottom: 4 }}>{t('sharing.inviteLinkHint')}</div>
                  <div className="d-flex gap-2 align-items-center">
                    <input className="form-control form-control-sm" value={inviteToken} readOnly style={{ fontSize: '0.72rem' }} />
                    <button className="btn btn-sm btn-outline-gold" onClick={() => { navigator.clipboard.writeText(inviteToken); toast.success(t('sharing.copied')); }}>
                      <i className="bi bi-clipboard"></i>
                    </button>
                  </div>
                </div>
              )}

              {/* Invitations sent */}
              {asOwner.length > 0 && (
                <div className="mt-3">
                  <div style={{ fontSize: '0.72rem', color: 'var(--cv-text3)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>{t('sharing.sentInvites')}</div>
                  {asOwner.map(s => (
                    <div key={s.id} className="py-2" style={{ borderBottom: '0.5px solid var(--cv-border)' }}>
                      <div className="d-flex align-items-center justify-content-between gap-2">
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '0.82rem', color: 'var(--cv-text)' }}>{s.invite_email}</div>
                          <div className="d-flex align-items-center gap-2 mt-1 flex-wrap">
                            <PermBadge permission={s.permission} />
                            {s.accepted
                              ? <span style={{ fontSize: '0.7rem', color: '#4CAF50' }}>✓ {s.guest_username}</span>
                              : <span style={{ fontSize: '0.7rem', color: 'var(--cv-gold)' }}>⏳ {t('sharing.pending')}</span>
                            }
                          </div>
                        </div>
                        <div className="d-flex align-items-center gap-1 flex-shrink-0">
                          {/* Toggle permission */}
                          {s.accepted && (
                            <button className="btn btn-sm btn-outline-gold" style={{ fontSize: '0.7rem', padding: '2px 8px' }}
                              onClick={() => permMut.mutate({ id: s.id, permission: s.permission === 'write' ? 'read' : 'write' })}
                              title={s.permission === 'write' ? t('sharing.downgradeToRead') : t('sharing.upgradeToWrite')}>
                              {s.permission === 'write' ? '👁' : '✏'}
                            </button>
                          )}
                          <button className="btn btn-sm" style={{ color: '#dc3545', background: 'none', border: 'none' }}
                            onClick={() => { if (window.confirm(t('sharing.revokeConfirm'))) revokeMut.mutate(s.id); }}>
                            <i className="bi bi-x-circle"></i>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Accept / accessible caves ──────────────────────────────────── */}
        <div className="col-lg-6">
          <div className="card h-100">
            <div className="card-header"><h6 className="card-title"><i className="bi bi-box-arrow-in-right me-2" style={{ color: 'var(--cv-gold)' }}></i>{t('sharing.acceptInvite')}</h6></div>
            <div className="card-body p-3">
              <form onSubmit={handleAccept} className="d-flex gap-2 mb-3">
                <input className="form-control" placeholder={t('sharing.acceptToken')}
                  value={acceptToken} onChange={e => setAcceptToken(e.target.value)} required />
                <button className="btn btn-gold btn-sm" disabled={acceptMut.isPending}>
                  {acceptMut.isPending ? <span className="spinner-border spinner-border-sm" /> : t('sharing.accept')}
                </button>
              </form>

              {asGuest.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--cv-text3)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>{t('sharing.myCaves')}</div>
                  {asGuest.map(s => (
                    <div key={s.id} className="d-flex align-items-center justify-content-between py-2 gap-2" style={{ borderBottom: '0.5px solid var(--cv-border)' }}>
                      <div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--cv-text)', fontWeight: 600 }}>{s.owner_username}</div>
                        <div className="d-flex align-items-center gap-2 mt-1">
                          <PermBadge permission={s.permission} />
                          <span style={{ fontSize: '0.7rem', color: 'var(--cv-text3)' }}>{t('sharing.sinceDate')} {new Date(s.accepted_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="d-flex gap-2 flex-shrink-0">
                        <button className="btn btn-sm btn-outline-gold"
                          onClick={() => { setViewShare({ owner_id: s.owner_id, permission: s.permission }); }}>
                          {s.permission === 'write'
                            ? <><i className="bi bi-pencil-square me-1"></i>{t('sharing.openCave')}</>
                            : <><i className="bi bi-eye me-1"></i>{t('sharing.seeCave')}</>
                          }
                        </button>
                        <button className="btn btn-sm" style={{ color: '#dc3545', background: 'none', border: 'none' }}
                          onClick={() => { if (window.confirm(t('sharing.leaveConfirm'))) revokeMut.mutate(s.id); }}>
                          <i className="bi bi-box-arrow-right"></i>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {asGuest.length === 0 && !isLoading && (
                <div className="text-center py-4" style={{ color: 'var(--cv-text3)' }}>
                  <i className="bi bi-people d-block mb-2" style={{ fontSize: '2rem' }}></i>
                  <p style={{ fontSize: '0.82rem' }}>{t('sharing.emptyCaves')}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Shared cave viewer (read or write) ────────────────────────── */}
        {viewShare && (
          <div className="col-12 fade-in">
            <div className="card">
              <div className="card-header d-flex justify-content-between align-items-center">
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <h6 className="card-title mb-0">
                    {canWrite ? <i className="bi bi-pencil-square me-2" style={{ color: 'var(--cv-gold)' }}></i>
                               : <i className="bi bi-eye me-2" style={{ color: 'var(--cv-gold)' }}></i>}
                    {t('sharing.caveOf')} {sharedCave?.owner?.username || '…'}
                  </h6>
                  <PermBadge permission={viewShare.permission} />
                  {sharedCave?.stats && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--cv-text3)' }}>
                      {sharedCave.stats.refs} {t('maps.bottles')} · {sharedCave.stats.bottles} btl.
                      {parseFloat(sharedCave.stats.value) > 0
                        ? ` · ~${parseFloat(sharedCave.stats.value).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}`
                        : ''}
                    </span>
                  )}
                  {canWrite && (
                    <button className="btn btn-sm btn-gold" style={{ fontSize: '0.78rem' }}
                      onClick={() => setWineModal({ mode: 'add' })}>
                      <i className="bi bi-plus me-1"></i>{t('wines.add')}
                    </button>
                  )}
                  <button className="btn btn-sm btn-outline-gold" style={{ fontSize: '0.78rem' }}
                    onClick={() => setSuggestModal({ owner_id: viewShare.owner_id })}>
                    <i className="bi bi-lightbulb me-1"></i>{t('sharing.suggestWine')}
                  </button>
                </div>
                <button className="btn btn-sm" style={{ background: 'none', border: 'none', color: 'var(--cv-text3)' }}
                  onClick={() => { setViewShare(null); setWineModal(null); }}>
                  <i className="bi bi-x-lg"></i>
                </button>
              </div>
              <div className="card-body p-2">
                {caveLoading ? (
                  <div className="text-center p-4"><div className="spinner-border" style={{ color: 'var(--cv-gold)' }} /></div>
                ) : (
                  <div className="row g-2">
                    {(sharedCave?.wines || []).map(w => (
                      <div className="col-12 col-lg-6" key={w.id}>
                        <div className="item-card" style={{ opacity: w.is_drunk || w.quantity === 0 ? 0.5 : 1 }}>
                          <span className="item-icon">{TYPE_ICONS[w.type] || '🍷'}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="item-name">{w.name}</div>
                            <div className="item-meta">{[w.vintage, w.appellation, w.region].filter(Boolean).join(' · ')}</div>
                          </div>
                          <div className="d-flex align-items-center gap-2">
                            {w.is_drunk || w.quantity === 0
                              ? <span className="badge-drunk">{t('wines.isDrunk')}</span>
                              : <span className="badge-stock">{t('wines.inCave')}</span>
                            }
                            <span className="item-qty">{w.is_drunk ? '✓' : w.quantity}</span>

                            {canWrite && (
                              <div className="dropdown">
                                <button className="btn btn-sm" style={{ color: 'var(--cv-text3)', background: 'none', border: 'none' }} data-bs-toggle="dropdown">
                                  <i className="bi bi-three-dots-vertical"></i>
                                </button>
                                <ul className="dropdown-menu dropdown-menu-end">
                                  <li><button className="dropdown-item" onClick={() => setWineModal({ mode: 'edit', wine: w })}>
                                    <i className="bi bi-pencil me-2"></i>{t('common.edit')}
                                  </button></li>
                                  <li><button className="dropdown-item" onClick={() => toggleDrunkMut.mutate(w.id)}>
                                    <i className={`bi bi-${w.is_drunk ? 'arrow-counterclockwise' : 'check-circle'} me-2`}></i>
                                    {w.is_drunk ? t('wines.restoreStock') : t('wines.markDrunk')}
                                  </button></li>
                                  <li><hr className="dropdown-divider" style={{ borderColor: 'var(--cv-border)' }} /></li>
                                  <li><button className="dropdown-item" style={{ color: '#dc3545' }}
                                    onClick={() => { if (window.confirm(t('wines.deleteConfirm'))) deleteWineMut.mutate(w.id); }}>
                                    <i className="bi bi-trash me-2"></i>{t('common.delete')}
                                  </button></li>
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {(sharedCave?.wines || []).length === 0 && (
                      <div className="col-12 text-center p-5" style={{ color: 'var(--cv-text3)' }}>
                        <i className="bi bi-grid d-block mb-2" style={{ fontSize: '2rem' }}></i>
                        <p style={{ fontSize: '0.85rem' }}>{t('sharing.emptyCave')}</p>
                        {canWrite && (
                          <button className="btn btn-gold btn-sm" onClick={() => setWineModal({ mode: 'add' })}>
                            {t('sharing.addFirstWine')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Pending wine proposals (owner view) ────────────────────────── */}
      {pendingWines.length > 0 && (
        <div className="row g-3 mt-2">
          <div className="col-12 fade-in">
            <div className="card">
              <div className="card-header">
                <h6 className="card-title mb-0">
                  <i className="bi bi-hourglass-split me-2" style={{ color: 'var(--cv-gold)' }}></i>
                  {t('sharing.pendingWines')}
                  <span style={{ marginLeft: 8, fontSize: '0.72rem', padding: '2px 8px', borderRadius: 10,
                                  background: 'rgba(201,168,76,0.15)', color: 'var(--cv-gold)' }}>
                    {pendingWines.length}
                  </span>
                </h6>
              </div>
              <div className="card-body p-3">
                <p style={{ fontSize: '0.78rem', color: 'var(--cv-text3)', marginBottom: 12 }}>{t('sharing.pendingHint')}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pendingWines.map(p => {
                    const w = typeof p.wine_data === 'string' ? JSON.parse(p.wine_data) : p.wine_data;
                    return (
                      <div key={p.id} style={{ background: 'var(--cv-bg3)', borderRadius: 8, padding: '10px 14px',
                                               border: '1px solid var(--cv-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: '0.92rem', color: 'var(--cv-text)' }}>
                            {w.name}{w.vintage ? ` ${w.vintage}` : ''}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--cv-text3)', marginTop: 2 }}>
                            {[w.appellation, w.region, w.type].filter(Boolean).join(' · ')}
                          </div>
                          {p.guest_username && (
                            <div style={{ fontSize: '0.68rem', color: 'var(--cv-text3)', marginTop: 2 }}>
                              {t('sharing.proposedBy')} {p.guest_username}
                            </div>
                          )}
                        </div>
                        <div className="d-flex gap-2 flex-shrink-0">
                          <button className="btn btn-sm btn-gold"
                            style={{ fontSize: '0.72rem', padding: '3px 10px' }}
                            disabled={approvePendingMut.isPending}
                            onClick={() => approvePendingMut.mutate(p.id)}>
                            <i className="bi bi-check-lg me-1"></i>{t('sharing.approve')}
                          </button>
                          <button className="btn btn-sm"
                            style={{ fontSize: '0.72rem', padding: '3px 10px', color: '#dc3545', border: '0.5px solid #dc3545', borderRadius: 4, background: 'none' }}
                            disabled={rejectPendingMut.isPending}
                            onClick={() => rejectPendingMut.mutate(p.id)}>
                            <i className="bi bi-x-lg me-1"></i>{t('sharing.reject')}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Wine modal for shared cave write ops */}
      {wineModal?.mode === 'add' && (
        <SharedWineModal
          ownerId={viewShare?.owner_id}
          onClose={() => setWineModal(null)}
          onSave={(fd) => addWineMut.mutateAsync(fd)}
        />
      )}
      {wineModal?.mode === 'edit' && (
        <SharedWineModal
          ownerId={viewShare?.owner_id}
          wine={wineModal.wine}
          onClose={() => setWineModal(null)}
          onSave={(fd) => editWineMut.mutateAsync({ id: wineModal.wine.id, fd })}
        />
      )}

      {/* Suggest wine modal */}
      {suggestModal && (
        <SuggestWineModal
          ownerId={suggestModal.owner_id}
          onClose={() => setSuggestModal(null)}
          onSubmit={(ownerId, data) => submitPendingMut.mutateAsync({ ownerId, data })}
          t={t}
        />
      )}
    </div>
  );
}

// ── Suggest wine modal ────────────────────────────────────────────────────────
function SuggestWineModal({ ownerId, onClose, onSubmit, t }) {
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [loading, setLoading] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== '' && v !== null && v !== undefined));
      await onSubmit(ownerId, data);
    } finally { setLoading(false); }
  };

  return (
    <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              <i className="bi bi-lightbulb me-2" style={{ color: 'var(--cv-gold)' }}></i>
              {t('sharing.suggestTitle')}
            </h5>
            <button className="btn-close" onClick={onClose} />
          </div>
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              <div className="alert alert-warning py-2" style={{ fontSize: '0.78rem' }}>
                <i className="bi bi-info-circle me-1"></i>{t('sharing.suggestHint')}
              </div>
              <div className="row g-3">
                <div className="col-md-8"><label className="form-label">{t('wines.name')} *</label><input className="form-control" required value={form.name} onChange={set('name')} /></div>
                <div className="col-md-4"><label className="form-label">{t('wines.vintage')}</label><input className="form-control" type="number" value={form.vintage} onChange={set('vintage')} min="1900" max="2030" /></div>
                <div className="col-md-6"><label className="form-label">{t('wines.appellation')}</label><input className="form-control" value={form.appellation} onChange={set('appellation')} /></div>
                <div className="col-md-6"><label className="form-label">{t('wines.type')} *</label>
                  <select className="form-select" value={form.type} onChange={set('type')}>
                    {TYPES.map(tp => <option key={tp} value={tp}>{t(`wines.type.${tp}`)}</option>)}
                  </select>
                </div>
                <div className="col-md-6"><label className="form-label">{t('wines.producer')}</label><input className="form-control" value={form.producer} onChange={set('producer')} /></div>
                <div className="col-md-6"><label className="form-label">{t('wines.region')}</label><input className="form-control" value={form.region} onChange={set('region')} /></div>
                <div className="col-md-4"><label className="form-label">{t('wines.quantity')}</label><input className="form-control" type="number" min="1" value={form.quantity} onChange={set('quantity')} /></div>
                <div className="col-md-4"><label className="form-label">{t('wines.price')}</label><input className="form-control" type="number" min="0" step="0.01" value={form.price} onChange={set('price')} /></div>
                <div className="col-md-4"><label className="form-label">{t('wines.keepUntil')}</label><input className="form-control" type="number" min="2024" max="2100" value={form.keep_until} onChange={set('keep_until')} /></div>
                <div className="col-12"><label className="form-label">{t('wines.notes')}</label><textarea className="form-control" rows={2} value={form.notes} onChange={set('notes')} /></div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-gold" onClick={onClose}>{t('common.cancel')}</button>
              <button type="submit" className="btn btn-gold" disabled={loading}>
                {loading ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="bi bi-send me-1"></i>}
                {t('sharing.suggestWine')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
