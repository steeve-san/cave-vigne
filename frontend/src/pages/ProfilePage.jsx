// src/pages/ProfilePage.jsx — Profil utilisateur + configuration 2FA TOTP
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { totpAPI } from '../services/api';
import toast from 'react-hot-toast';

export default function ProfilePage() {
  const { user } = useAuth();
  const { t } = useLang();
  const [step, setStep]         = useState('idle'); // idle | setup | confirm | disable
  const [totpCode, setTotpCode] = useState('');
  const [password, setPassword] = useState('');

  const { data: status, refetch } = useQuery({
    queryKey: ['totp-status'],
    queryFn: () => totpAPI.status().then(r => r.data),
  });

  const setupMut = useMutation({
    mutationFn: () => totpAPI.setup(),
    onSuccess: (r) => { setSetupData(r.data); setStep('confirm'); },
    onError: () => toast.error('Erreur lors de la génération du secret 2FA'),
  });
  const [setupData, setSetupData] = useState(null);

  const confirmMut = useMutation({
    mutationFn: () => totpAPI.confirm(totpCode),
    onSuccess: () => { toast.success(t('profile.twofa') + ' — ' + t('profile.twofaEnabled')); setStep('idle'); setTotpCode(''); refetch(); },
    onError: (e) => toast.error(e.response?.data?.error || 'Code invalide'),
  });

  const disableMut = useMutation({
    mutationFn: () => totpAPI.disable(password),
    onSuccess: () => { toast.success(t('profile.twofa') + ' — ' + t('profile.twofaDisabled')); setStep('idle'); setPassword(''); refetch(); },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  });

  const totpEnabled = status?.totp_enabled;

  return (
    <div className="fade-in">
      <div className="row g-3">
        {/* Informations utilisateur */}
        <div className="col-md-5">
          <div className="card">
            <div className="card-header"><h6 className="card-title mb-0">{t('profile.title')}</h6></div>
            <div className="card-body">
              <div className="d-flex align-items-center gap-3 mb-3">
                <div style={{
                  width: 56, height: 56, borderRadius: '50%', background: 'var(--cv-wine)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.4rem', color: '#fff', fontWeight: 700,
                }}>
                  {(user?.username || 'U')[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--cv-text)' }}>{user?.username}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--cv-text2)' }}>{user?.email}</div>
                  <span className={`badge-type badge-role-${user?.role}`} style={{ fontSize: '0.65rem', marginTop: 4 }}>{user?.role}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 2FA */}
        <div className="col-md-7">
          <div className="card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h6 className="card-title mb-0">{t('profile.twofa')}</h6>
              <span className={`badge-type ${totpEnabled ? 'badge-role-admin' : ''}`} style={{ fontSize: '0.7rem', padding: '2px 10px', background: totpEnabled ? undefined : 'var(--cv-bg3)', color: totpEnabled ? undefined : 'var(--cv-text3)' }}>
                {totpEnabled ? t('profile.twofaEnabled') : t('profile.twofaDisabled')}
              </span>
            </div>
            <div className="card-body">
              <p style={{ fontSize: '0.83rem', color: 'var(--cv-text2)', marginBottom: '1rem' }}>
                {t('profile.twofaDesc')}
              </p>

              {step === 'idle' && !totpEnabled && (
                <button className="btn btn-gold btn-sm" onClick={() => setupMut.mutate()} disabled={setupMut.isPending}>
                  {setupMut.isPending ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="bi bi-shield-lock me-1"></i>}
                  {t('profile.enable2fa')}
                </button>
              )}
              {step === 'idle' && totpEnabled && (
                <button className="btn btn-outline-danger btn-sm" onClick={() => setStep('disable')}>
                  <i className="bi bi-shield-x me-1"></i>{t('profile.disable2fa')}
                </button>
              )}

              {step === 'confirm' && setupData && (
                <div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--cv-text2)', marginBottom: '0.75rem' }}>
                    {t('profile.qrInstruction')}
                  </p>
                  <div className="text-center mb-3">
                    <img src={setupData.qr_code} alt="QR 2FA" style={{ width: 180, height: 180, borderRadius: 8, background: '#fff', padding: 4 }} />
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--cv-text3)', marginBottom: '0.75rem', textAlign: 'center' }}>
                    {t('profile.manualEntry')} <code style={{ color: 'var(--cv-gold)', userSelect: 'all' }}>{setupData.secret}</code>
                  </div>
                  <div className="d-flex gap-2">
                    <input
                      className="form-control form-control-sm"
                      placeholder={t('profile.totpCode')}
                      value={totpCode}
                      onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      maxLength={6}
                      style={{ letterSpacing: 4, fontFamily: 'monospace', maxWidth: 160 }}
                    />
                    <button className="btn btn-gold btn-sm" onClick={() => confirmMut.mutate()} disabled={totpCode.length < 6 || confirmMut.isPending}>
                      {confirmMut.isPending ? <span className="spinner-border spinner-border-sm me-1" /> : null}{t('common.confirm')}
                    </button>
                    <button className="btn btn-outline-gold btn-sm" onClick={() => { setStep('idle'); setTotpCode(''); }}>{t('common.cancel')}</button>
                  </div>
                </div>
              )}

              {step === 'disable' && (
                <div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--cv-text2)', marginBottom: '0.75rem' }}>
                    {t('profile.confirmPassword')}
                  </p>
                  <div className="d-flex gap-2">
                    <input
                      className="form-control form-control-sm"
                      type="password"
                      placeholder={t('auth.password')}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      style={{ maxWidth: 220 }}
                    />
                    <button className="btn btn-danger btn-sm" onClick={() => disableMut.mutate()} disabled={!password || disableMut.isPending}>
                      {disableMut.isPending ? <span className="spinner-border spinner-border-sm me-1" /> : null}{t('profile.disable2fa')}
                    </button>
                    <button className="btn btn-outline-gold btn-sm" onClick={() => { setStep('idle'); setPassword(''); }}>{t('common.cancel')}</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
