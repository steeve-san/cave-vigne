// src/pages/SharedCavesPage.jsx — manage shared cave access
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sharingAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const TYPE_ICONS = { rouge: '🍷', blanc: '🥂', rosé: '🌸', pétillant: '✨' };

export default function SharedCavesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [viewOwnerId, setViewOwnerId] = useState(null);

  const { data: sharing, isLoading } = useQuery({
    queryKey: ['sharing'],
    queryFn: () => sharingAPI.list().then(r => r.data),
  });

  const { data: sharedCave, isLoading: caveLoading } = useQuery({
    queryKey: ['shared-cave', viewOwnerId],
    queryFn: () => sharingAPI.getCave(viewOwnerId).then(r => r.data),
    enabled: !!viewOwnerId,
  });

  const inviteMut = useMutation({
    mutationFn: (email) => sharingAPI.invite(email, 'read'),
    onSuccess: (r) => {
      qc.invalidateQueries(['sharing']);
      toast.success('Invitation créée !');
      const token = r.data.token;
      const link = `${window.location.origin}/sharing/accept/${token}`;
      setInviteToken(link);
      setInviteEmail('');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Erreur'),
  });

  const acceptMut = useMutation({
    mutationFn: (token) => sharingAPI.accept(token),
    onSuccess: () => { qc.invalidateQueries(['sharing']); toast.success('Cave partagée acceptée !'); },
    onError: (err) => toast.error(err.response?.data?.error || 'Invitation invalide'),
  });

  const revokeMut = useMutation({
    mutationFn: (id) => sharingAPI.revoke(id),
    onSuccess: () => { qc.invalidateQueries(['sharing']); toast.success('Accès révoqué'); },
    onError: () => toast.error('Erreur'),
  });

  const [acceptToken, setAcceptToken] = useState('');

  const handleInvite = (e) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    inviteMut.mutate(inviteEmail.trim());
  };

  const handleAccept = (e) => {
    e.preventDefault();
    // Extract token from URL or use raw
    const raw = acceptToken.trim();
    const token = raw.includes('/accept/') ? raw.split('/accept/').pop() : raw;
    if (!token) return;
    acceptMut.mutate(token);
    setAcceptToken('');
  };

  const asOwner = sharing?.as_owner || [];
  const asGuest = sharing?.as_guest || [];

  return (
    <div className="fade-in">
      <div className="row g-3">

        {/* Invite someone */}
        <div className="col-lg-6">
          <div className="card h-100">
            <div className="card-header"><h6 className="card-title"><i className="bi bi-send me-2" style={{ color: 'var(--cv-gold)' }}></i>Partager ma cave</h6></div>
            <div className="card-body p-3">
              <p style={{ fontSize: '0.82rem', color: 'var(--cv-text2)', marginBottom: 12 }}>
                Invitez quelqu'un à consulter votre cave en lecture seule. Ils devront créer un compte et accepter via le lien.
              </p>
              <form onSubmit={handleInvite} className="d-flex gap-2">
                <input className="form-control" type="email" placeholder="Email de l'invité"
                  value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required />
                <button className="btn btn-gold btn-sm" disabled={inviteMut.isPending}>
                  {inviteMut.isPending ? <span className="spinner-border spinner-border-sm" /> : <i className="bi bi-send"></i>}
                </button>
              </form>
              {inviteToken && (
                <div className="mt-3 p-2" style={{ background: 'var(--cv-bg3)', borderRadius: 8, border: '1px solid var(--cv-border)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--cv-text3)', marginBottom: 4 }}>Lien d'invitation (partagez ce lien) :</div>
                  <div className="d-flex gap-2 align-items-center">
                    <input className="form-control form-control-sm" value={inviteToken} readOnly style={{ fontSize: '0.72rem' }} />
                    <button className="btn btn-sm btn-outline-gold" onClick={() => { navigator.clipboard.writeText(inviteToken); toast.success('Copié !'); }}>
                      <i className="bi bi-clipboard"></i>
                    </button>
                  </div>
                </div>
              )}

              {/* Pending + accepted invitations I sent */}
              {asOwner.length > 0 && (
                <div className="mt-3">
                  <div style={{ fontSize: '0.72rem', color: 'var(--cv-text3)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Invitations envoyées</div>
                  {asOwner.map(s => (
                    <div key={s.id} className="d-flex align-items-center justify-content-between py-2" style={{ borderBottom: '0.5px solid var(--cv-border)', fontSize: '0.82rem' }}>
                      <div>
                        <div style={{ color: 'var(--cv-text)' }}>{s.invite_email}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--cv-text3)' }}>
                          {s.accepted
                            ? <><span style={{ color: '#4CAF50' }}>✓ Acceptée</span> · {s.guest_username}</>
                            : <span style={{ color: 'var(--cv-gold)' }}>⏳ En attente</span>
                          }
                        </div>
                      </div>
                      <button className="btn btn-sm" style={{ color: '#dc3545', background: 'none', border: 'none' }}
                        onClick={() => { if (window.confirm('Révoquer cet accès ?')) revokeMut.mutate(s.id); }}>
                        <i className="bi bi-x-circle"></i>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Accept an invitation */}
        <div className="col-lg-6">
          <div className="card h-100">
            <div className="card-header"><h6 className="card-title"><i className="bi bi-box-arrow-in-right me-2" style={{ color: 'var(--cv-gold)' }}></i>Accepter une invitation</h6></div>
            <div className="card-body p-3">
              <p style={{ fontSize: '0.82rem', color: 'var(--cv-text2)', marginBottom: 12 }}>
                Entrez le lien ou le token d'invitation reçu pour accéder à la cave d'un autre utilisateur.
              </p>
              <form onSubmit={handleAccept} className="d-flex gap-2">
                <input className="form-control" placeholder="Token ou lien d'invitation"
                  value={acceptToken} onChange={e => setAcceptToken(e.target.value)} required />
                <button className="btn btn-gold btn-sm" disabled={acceptMut.isPending}>
                  {acceptMut.isPending ? <span className="spinner-border spinner-border-sm" /> : 'Accepter'}
                </button>
              </form>

              {/* Caves shared with me */}
              {asGuest.length > 0 && (
                <div className="mt-3">
                  <div style={{ fontSize: '0.72rem', color: 'var(--cv-text3)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Caves accessibles</div>
                  {asGuest.map(s => (
                    <div key={s.id} className="d-flex align-items-center justify-content-between py-2" style={{ borderBottom: '0.5px solid var(--cv-border)', fontSize: '0.82rem' }}>
                      <div>
                        <div style={{ color: 'var(--cv-text)', fontWeight: 600 }}>{s.owner_username}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--cv-text3)' }}>Lecture seule · Acceptée le {new Date(s.accepted_at).toLocaleDateString('fr-FR')}</div>
                      </div>
                      <div className="d-flex gap-2">
                        <button className="btn btn-sm btn-outline-gold" onClick={() => setViewOwnerId(s.owner_id)}>
                          <i className="bi bi-eye me-1"></i>Voir
                        </button>
                        <button className="btn btn-sm" style={{ color: '#dc3545', background: 'none', border: 'none' }}
                          onClick={() => { if (window.confirm('Quitter cette cave partagée ?')) revokeMut.mutate(s.id); }}>
                          <i className="bi bi-box-arrow-right"></i>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {asGuest.length === 0 && !isLoading && (
                <div className="text-center p-4" style={{ color: 'var(--cv-text3)' }}>
                  <i className="bi bi-people d-block mb-2" style={{ fontSize: '2rem' }}></i>
                  <p style={{ fontSize: '0.82rem' }}>Aucune cave partagée avec vous pour l'instant.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Shared cave viewer */}
        {viewOwnerId && (
          <div className="col-12 fade-in">
            <div className="card">
              <div className="card-header d-flex justify-content-between align-items-center">
                <h6 className="card-title mb-0">
                  <i className="bi bi-eye me-2" style={{ color: 'var(--cv-gold)' }}></i>
                  Cave de {sharedCave?.owner?.username || '…'}
                  {sharedCave?.stats && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--cv-text3)', marginLeft: 12 }}>
                      {sharedCave.stats.refs} réf. · {sharedCave.stats.bottles} btl.
                      {sharedCave.stats.value > 0 ? ` · ~${parseFloat(sharedCave.stats.value).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}` : ''}
                    </span>
                  )}
                </h6>
                <button className="btn btn-sm" style={{ background: 'none', border: 'none', color: 'var(--cv-text3)' }} onClick={() => setViewOwnerId(null)}>
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
                        <div className="item-card">
                          <span className="item-icon">{TYPE_ICONS[w.type] || '🍷'}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="item-name">{w.name}</div>
                            <div className="item-meta">{[w.vintage, w.appellation, w.region].filter(Boolean).join(' · ')}</div>
                          </div>
                          <div className="d-flex align-items-center gap-2">
                            <span className="badge-stock">cave</span>
                            <span className="item-qty">{w.quantity}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                    {(sharedCave?.wines || []).length === 0 && (
                      <div className="col-12 text-center p-4" style={{ color: 'var(--cv-text3)' }}>Cave vide ou aucun accès.</div>
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
