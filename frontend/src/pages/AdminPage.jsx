// src/pages/AdminPage.jsx
import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminAPI } from '../services/api';
import { useLang } from '../context/LangContext';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const ROLES = ['visiteur', 'user', 'admin'];

function RoleBadge({ role, t }) {
  const cls = { visiteur: 'badge-role-visiteur', user: 'badge-role-user', admin: 'badge-role-admin' };
  return (
    <span className={`badge-type ${cls[role] || ''}`} style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
      {t(`admin.roles.${role}`)}
    </span>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────
function SettingsTab() {
  const { t } = useLang();
  const { logout } = useAuth();
  const qc = useQueryClient();
  const [vals, setVals] = useState({});
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [logoutCountdown, setLogoutCountdown] = useState(null);

  // Auto-logout countdown after settings save
  useEffect(() => {
    if (logoutCountdown === null) return;
    if (logoutCountdown === 0) { logout(); return; }
    const t = setTimeout(() => setLogoutCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [logoutCountdown, logout]);

  const { data: settings = [], isLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => adminAPI.getSettings().then(r => r.data),
    onSuccess: (data) => {
      const init = {};
      data.forEach(s => { init[s.setting_key] = s.setting_value === '***set***' ? '' : (s.setting_value || ''); });
      setVals(init);
    },
  });

  const saveMut = useMutation({
    mutationFn: (data) => adminAPI.saveSettings(data),
    onSuccess: (res) => {
      qc.invalidateQueries(['admin-settings']);
      if (res.data?.force_logout) {
        toast.success('Paramètres sauvegardés — cache et sessions vidés. Déconnexion dans 3s…', { duration: 4000 });
        setLogoutCountdown(3);
      } else {
        toast.success('Paramètres enregistrés');
      }
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  });

  const testSmtp = async () => {
    setTestingSmtp(true);
    try {
      const r = await adminAPI.testSmtp();
      toast.success(r.data.message);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erreur SMTP');
    } finally { setTestingSmtp(false); }
  };

  const get = (k) => vals[k] ?? '';
  const set = (k) => (e) => setVals(v => ({ ...v, [k]: e.target.type === 'checkbox' ? (e.target.checked ? '1' : '0') : e.target.value }));

  const isSet = (key) => settings.find(s => s.setting_key === key)?.is_set;

  if (isLoading) return <div className="text-center py-5"><div className="spinner-border" style={{ color: 'var(--cv-gold)' }} /></div>;

  return (
    <div className="row g-4">
      {/* API Keys */}
      <div className="col-12">
        <div className="card">
          <div className="card-header"><h6 className="card-title mb-0"><i className="bi bi-key me-2"></i>{t('admin.settings.apiKeys')}</h6></div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-12">
                <label className="form-label">{t('admin.settings.anthropicKey')}</label>
                <div className="d-flex gap-2">
                  <input className="form-control" type="password"
                    placeholder={isSet('anthropic_key') ? `••••••••••• (${t('admin.settings.configured')})` : 'sk-ant-...'}
                    value={get('anthropic_key')} onChange={set('anthropic_key')} />
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--cv-text3)', marginTop: 4 }}>
                  {t('admin.settings.anthropicHint')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Catalogue public */}
      <div className="col-12">
        <div className="card">
          <div className="card-header"><h6 className="card-title mb-0"><i className="bi bi-globe me-2"></i>{t('admin.settings.publicAccess')}</h6></div>
          <div className="card-body">
            <div className="form-check form-switch">
              <input className="form-check-input" type="checkbox" id="publicCatalog"
                checked={get('public_catalog') === '1'} onChange={set('public_catalog')} />
              <label className="form-check-label" htmlFor="publicCatalog" style={{ fontSize: '0.85rem' }}>
                {t('admin.settings.publicCatalog')}
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* SMTP */}
      <div className="col-12">
        <div className="card">
          <div className="card-header"><h6 className="card-title mb-0"><i className="bi bi-envelope me-2"></i>{t('admin.settings.smtp')}</h6></div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-md-8"><label className="form-label">{t('admin.settings.smtpHost')}</label>
                <input className="form-control" placeholder="smtp.gmail.com" value={get('smtp_host')} onChange={set('smtp_host')} /></div>
              <div className="col-md-4"><label className="form-label">{t('admin.settings.smtpPort')}</label>
                <input className="form-control" placeholder="587" value={get('smtp_port')} onChange={set('smtp_port')} /></div>
              <div className="col-md-6"><label className="form-label">{t('admin.settings.smtpUser')}</label>
                <input className="form-control" placeholder="user@gmail.com" value={get('smtp_user')} onChange={set('smtp_user')} /></div>
              <div className="col-md-6"><label className="form-label">{t('admin.settings.smtpPass')}</label>
                <input className="form-control" type="password"
                  placeholder={isSet('smtp_pass') ? `••••••••• (${t('admin.settings.configured')})` : ''}
                  value={get('smtp_pass')} onChange={set('smtp_pass')} /></div>
              <div className="col-md-8"><label className="form-label">{t('admin.settings.smtpFrom')}</label>
                <input className="form-control" placeholder="Cave & Vigne <noreply@votre-domaine.fr>" value={get('smtp_from')} onChange={set('smtp_from')} /></div>
              <div className="col-md-4 d-flex align-items-end">
                <div className="form-check form-switch">
                  <input className="form-check-input" type="checkbox" id="smtpTls"
                    checked={get('smtp_secure') === '1'} onChange={set('smtp_secure')} />
                  <label className="form-check-label" htmlFor="smtpTls" style={{ fontSize: '0.8rem' }}>{t('admin.settings.smtpTls')}</label>
                </div>
              </div>
            </div>
            <div className="mt-3">
              <button className="btn btn-sm btn-outline-gold me-2" onClick={testSmtp} disabled={testingSmtp || !get('smtp_host')}>
                {testingSmtp ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="bi bi-send me-1"></i>}
                {t('admin.settings.testSmtp')}
              </button>
              <span style={{ fontSize: '0.72rem', color: 'var(--cv-text3)' }}>{t('admin.settings.testSmtpHint')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* AI Provider */}
      <div className="col-12">
        <div className="card">
          <div className="card-header"><h6 className="card-title mb-0"><i className="bi bi-cpu me-2"></i>Fournisseur IA (Sommelier & Scan)</h6></div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-12">
                <label className="form-label">Fournisseur actif</label>
                <select className="form-select" value={get('ai_provider')} onChange={set('ai_provider')}>
                  <option value="anthropic">Claude (Anthropic)</option>
                  <option value="openai">ChatGPT (OpenAI)</option>
                  <option value="mistral">Mistral AI</option>
                  <option value="openwebui">OpenWebUI / Ollama (auto-hébergé)</option>
                </select>
              </div>

              {/* Anthropic */}
              {(get('ai_provider') || 'anthropic') === 'anthropic' && (
                <>
                  <div className="col-md-8">
                    <label className="form-label">Clé API Anthropic</label>
                    <input className="form-control" type="password"
                      placeholder={isSet('anthropic_key') ? `••••••••••• (${t('admin.settings.configured')})` : 'sk-ant-...'}
                      value={get('anthropic_key')} onChange={set('anthropic_key')} />
                    <div style={{ fontSize: '0.72rem', color: 'var(--cv-text3)', marginTop: 4 }}>{t('admin.settings.anthropicHint')}</div>
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Modèle</label>
                    <input className="form-control" placeholder="claude-sonnet-4-6" value={get('anthropic_model')} onChange={set('anthropic_model')} />
                  </div>
                </>
              )}

              {/* OpenAI */}
              {get('ai_provider') === 'openai' && (
                <>
                  <div className="col-md-8">
                    <label className="form-label">Clé API OpenAI</label>
                    <input className="form-control" type="password"
                      placeholder={isSet('openai_key') ? `••••••••••• (${t('admin.settings.configured')})` : 'sk-...'}
                      value={get('openai_key')} onChange={set('openai_key')} />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Modèle</label>
                    <input className="form-control" placeholder="gpt-4o-mini" value={get('openai_model')} onChange={set('openai_model')} />
                    <div style={{ fontSize: '0.72rem', color: 'var(--cv-text3)', marginTop: 4 }}>gpt-4o, gpt-4o-mini, gpt-4-turbo…</div>
                  </div>
                </>
              )}

              {/* Mistral */}
              {get('ai_provider') === 'mistral' && (
                <>
                  <div className="col-md-8">
                    <label className="form-label">Clé API Mistral</label>
                    <input className="form-control" type="password"
                      placeholder={isSet('mistral_key') ? `••••••••••• (${t('admin.settings.configured')})` : '...'}
                      value={get('mistral_key')} onChange={set('mistral_key')} />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Modèle</label>
                    <input className="form-control" placeholder="mistral-small-latest" value={get('mistral_model')} onChange={set('mistral_model')} />
                    <div style={{ fontSize: '0.72rem', color: 'var(--cv-text3)', marginTop: 4 }}>mistral-large-latest, open-mistral-7b…</div>
                  </div>
                </>
              )}

              {/* OpenWebUI / Ollama */}
              {get('ai_provider') === 'openwebui' && (
                <>
                  <div className="col-md-6">
                    <label className="form-label">URL du serveur</label>
                    <input className="form-control" placeholder="http://localhost:11434" value={get('openwebui_url')} onChange={set('openwebui_url')} />
                    <div style={{ fontSize: '0.72rem', color: 'var(--cv-text3)', marginTop: 4 }}>Ollama: http://localhost:11434 · OpenWebUI: http://localhost:3000</div>
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">Modèle</label>
                    <input className="form-control" placeholder="llama3" value={get('openwebui_model')} onChange={set('openwebui_model')} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">API Key (optionnel)</label>
                    <input className="form-control" placeholder="sk-..." value={get('openwebui_key')} onChange={set('openwebui_key')} />
                  </div>
                </>
              )}

              <div className="col-12">
                <div style={{ fontSize: '0.78rem', color: 'var(--cv-text3)', padding: '8px 12px', background: 'var(--cv-bg2)', borderRadius: 6 }}>
                  <i className="bi bi-info-circle me-1" style={{ color: 'var(--cv-gold)' }}></i>
                  Note: le scan d'étiquette (vision) nécessite un modèle supportant les images. Anthropic (Claude) et OpenAI (GPT-4o) sont recommandés.
                  Mistral et OpenWebUI utilisent uniquement le texte pour le scan.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Media integrations */}
      <div className="col-12">
        <div className="card">
          <div className="card-header">
            <h6 className="card-title mb-0"><i className="bi bi-film me-2" style={{ color: '#a855f7' }} />Intégrations média (Soirée cinéma / série)</h6>
          </div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-12">
                <div style={{ fontSize: '0.78rem', color: 'var(--cv-text3)', padding: '8px 12px', background: 'var(--cv-bg2)', borderRadius: 6, marginBottom: 8 }}>
                  <i className="bi bi-info-circle me-1" style={{ color: '#a855f7' }}></i>
                  Quand l'occasion est "soirée cinéma" ou "soirée série", le sommelier récupère les films/séries en cours
                  depuis les services configurés pour personnaliser sa recommandation.
                </div>
              </div>
              {/* TMDB */}
              <div className="col-12">
                <div style={{ fontSize: '0.75rem', color: '#a855f7', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>TMDB — The Movie Database</div>
              </div>
              <div className="col-12">
                <label className="form-label">Clé API TMDB</label>
                <input type="password" className="form-control" placeholder={isSet('tmdb_api_key') ? '••••••••• (configuré)' : 'Clé API TMDB (gratuite sur themoviedb.org)'}
                  value={get('tmdb_api_key')} onChange={set('tmdb_api_key')} />
              </div>
              {/* Plex */}
              <div className="col-12 mt-2">
                <div style={{ fontSize: '0.75rem', color: '#a855f7', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Plex Media Server</div>
              </div>
              <div className="col-md-8">
                <label className="form-label">URL Plex</label>
                <input className="form-control" placeholder="http://192.168.1.10:32400"
                  value={get('plex_url')} onChange={set('plex_url')} />
              </div>
              <div className="col-md-4">
                <label className="form-label">X-Plex-Token</label>
                <input type="password" className="form-control" placeholder={isSet('plex_token') ? '••••••••• (configuré)' : 'Token Plex'}
                  value={get('plex_token')} onChange={set('plex_token')} />
              </div>
              {/* Ombi */}
              <div className="col-12 mt-2">
                <div style={{ fontSize: '0.75rem', color: '#a855f7', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Ombi</div>
              </div>
              <div className="col-md-8">
                <label className="form-label">URL Ombi</label>
                <input className="form-control" placeholder="http://192.168.1.10:5000"
                  value={get('ombi_url')} onChange={set('ombi_url')} />
              </div>
              <div className="col-md-4">
                <label className="form-label">Clé API Ombi</label>
                <input type="password" className="form-control" placeholder={isSet('ombi_key') ? '••••••••• (configuré)' : 'Clé API Ombi'}
                  value={get('ombi_key')} onChange={set('ombi_key')} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bouton save */}
      <div className="col-12 d-flex align-items-center justify-content-between">
        <div style={{ fontSize: '0.75rem', color: 'var(--cv-text3)' }}>
          <i className="bi bi-shield-lock me-1" style={{ color: 'var(--cv-gold)' }} />
          La sauvegarde vide le cache Redis et déconnecte toutes les sessions.
        </div>
        <button className="btn btn-gold" onClick={() => saveMut.mutate(vals)} disabled={saveMut.isPending || logoutCountdown !== null}>
          {saveMut.isPending
            ? <span className="spinner-border spinner-border-sm me-1" />
            : logoutCountdown !== null
              ? <span className="me-1">{logoutCountdown}s</span>
              : <i className="bi bi-check2 me-1" />}
          {logoutCountdown !== null ? `Déconnexion…` : t('admin.settings.save')}
        </button>
      </div>
    </div>
  );
}

// ─── Cache & Sessions Tab ──────────────────────────────────────────────────────
function CacheTab() {
  const { logout } = useAuth();
  const qc = useQueryClient();
  const [clearing, setClearing] = useState(null);

  const { data: cacheData, isLoading: cacheLoading, refetch: refetchCache } = useQuery({
    queryKey: ['cache-stats'],
    queryFn: () => adminAPI.cacheStats().then(r => r.data),
    refetchInterval: 10000,
  });

  const { data: sessData, isLoading: sessLoading, refetch: refetchSess } = useQuery({
    queryKey: ['sessions-stats'],
    queryFn: () => adminAPI.getSessions().then(r => r.data),
  });

  const clearCache = async (category) => {
    setClearing(category);
    try {
      const r = await adminAPI.clearCache(category);
      toast.success(r.data.message);
      refetchCache();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erreur Redis');
    } finally { setClearing(null); }
  };

  const revokeUser = async (userId, username) => {
    try {
      const r = await adminAPI.revokeUserSessions(userId);
      toast.success(r.data.message);
      refetchSess();
    } catch (e) { toast.error(e.response?.data?.error || 'Erreur'); }
  };

  const revokeAll = async () => {
    try {
      const r = await adminAPI.revokeAllSessions();
      toast.success(r.data.message, { duration: 4000 });
      if (r.data.force_logout) setTimeout(() => logout(), 2000);
    } catch (e) { toast.error(e.response?.data?.error || 'Erreur'); }
  };

  const CATEGORY_ICONS = { stats: 'bi-bar-chart', enrich: 'bi-stars', sommelier: 'bi-chat-square-dots', barcode: 'bi-upc', other: 'bi-archive' };

  return (
    <div className="row g-4">
      {/* Cache Redis */}
      <div className="col-12">
        <div className="card">
          <div className="card-header d-flex align-items-center justify-content-between">
            <h6 className="card-title mb-0"><i className="bi bi-lightning me-2" style={{ color: 'var(--cv-gold)' }} />Cache Redis</h6>
            <div className="d-flex align-items-center gap-2">
              {cacheData && (
                <span style={{ fontSize: '0.72rem', color: 'var(--cv-text3)' }}>
                  {cacheData.total} clé{cacheData.total !== 1 ? 's' : ''} en cache
                </span>
              )}
              <button className="btn btn-sm btn-wine" onClick={() => clearCache('all')} disabled={clearing === 'all'}>
                {clearing === 'all' ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="bi bi-trash me-1" />}
                Tout vider
              </button>
            </div>
          </div>
          <div className="card-body p-3">
            {cacheLoading ? (
              <div className="placeholder-glow d-flex flex-wrap gap-2">
                {[1,2,3,4].map(i => <div key={i} className="placeholder rounded" style={{ width: 160, height: 52, opacity: 0.12 }} />)}
              </div>
            ) : (
              <div className="row g-2">
                {(cacheData?.categories || []).map(cat => (
                  <div className="col-6 col-md-3" key={cat.id}>
                    <div style={{ background: 'var(--cv-bg2)', borderRadius: 8, padding: '10px 14px', border: '1px solid var(--cv-border)' }}>
                      <div className="d-flex align-items-center justify-content-between mb-1">
                        <span style={{ fontSize: '0.72rem', color: 'var(--cv-text3)' }}>
                          <i className={`bi ${CATEGORY_ICONS[cat.id] || 'bi-archive'} me-1`} />{cat.label}
                        </span>
                        <span style={{ fontSize: '1rem', fontFamily: 'Cormorant Garamond,serif', color: cat.count > 0 ? 'var(--cv-gold)' : 'var(--cv-text3)', fontWeight: 700 }}>
                          {cat.count}
                        </span>
                      </div>
                      <button className="btn btn-sm w-100" disabled={cat.count === 0 || clearing === cat.id}
                        style={{ fontSize: '0.68rem', padding: '2px 6px', border: '1px solid var(--cv-border)', background: 'none', color: cat.count > 0 ? 'var(--cv-text2)' : 'var(--cv-text3)' }}
                        onClick={() => clearCache(cat.id === 'other' ? 'all' : cat.id)}>
                        {clearing === cat.id ? <span className="spinner-border spinner-border-sm" style={{ width: 10, height: 10 }} /> : <i className="bi bi-x me-1" />}
                        Vider
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sessions actives */}
      <div className="col-12">
        <div className="card">
          <div className="card-header d-flex align-items-center justify-content-between">
            <h6 className="card-title mb-0">
              <i className="bi bi-people me-2" style={{ color: 'var(--cv-gold)' }} />
              Sessions actives
              {sessData && (
                <span className="ms-2" style={{ fontSize: '0.72rem', color: 'var(--cv-text3)', fontFamily: 'Inter,sans-serif', fontWeight: 400 }}>
                  {sessData.total} token{sessData.total !== 1 ? 's' : ''} refresh valide{sessData.total !== 1 ? 's' : ''}
                </span>
              )}
            </h6>
            <button className="btn btn-sm btn-wine" onClick={revokeAll} disabled={sessLoading || !sessData?.total}>
              <i className="bi bi-door-closed me-1" />Déconnecter tous
            </button>
          </div>
          <div className="card-body p-3">
            {sessLoading ? (
              <div className="placeholder-glow"><div className="placeholder w-100 rounded" style={{ height: 40, opacity: 0.12 }} /></div>
            ) : !sessData?.users?.length ? (
              <div style={{ fontSize: '0.82rem', color: 'var(--cv-text3)', textAlign: 'center', padding: '16px 0' }}>
                <i className="bi bi-check-circle me-2" />Aucune session active
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm mb-0" style={{ fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ color: 'var(--cv-text3)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 1 }}>
                      <th style={{ background: 'none', border: 'none' }}>Utilisateur</th>
                      <th style={{ background: 'none', border: 'none' }}>Rôle</th>
                      <th style={{ background: 'none', border: 'none', textAlign: 'center' }}>Sessions</th>
                      <th style={{ background: 'none', border: 'none' }}>Expire</th>
                      <th style={{ background: 'none', border: 'none' }} />
                    </tr>
                  </thead>
                  <tbody>
                    {sessData.users.map(u => (
                      <tr key={u.id} style={{ borderColor: 'var(--cv-border)' }}>
                        <td style={{ color: 'var(--cv-text)', verticalAlign: 'middle' }}>
                          <div style={{ fontWeight: 500 }}>{u.username}</div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--cv-text3)' }}>{u.email}</div>
                        </td>
                        <td style={{ verticalAlign: 'middle' }}>
                          <span style={{ fontSize: '0.68rem', padding: '2px 7px', borderRadius: 4, background: u.role === 'admin' ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.06)', color: u.role === 'admin' ? 'var(--cv-gold)' : 'var(--cv-text2)' }}>
                            {u.role}
                          </span>
                        </td>
                        <td style={{ verticalAlign: 'middle', textAlign: 'center', color: 'var(--cv-gold)', fontFamily: 'Cormorant Garamond,serif', fontSize: '1rem' }}>
                          {u.session_count}
                        </td>
                        <td style={{ verticalAlign: 'middle', color: 'var(--cv-text3)', fontSize: '0.72rem' }}>
                          {new Date(u.last_expires).toLocaleDateString('fr-FR')}
                        </td>
                        <td style={{ verticalAlign: 'middle', textAlign: 'right' }}>
                          <button className="btn btn-sm" style={{ fontSize: '0.68rem', border: '1px solid rgba(220,53,69,0.3)', color: '#dc3545', background: 'none', padding: '2px 8px' }}
                            onClick={() => revokeUser(u.id, u.username)}>
                            <i className="bi bi-x me-1" />Révoquer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────
export default function AdminPage() {
  const { t } = useLang();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState('users');
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [form, setForm] = useState({ email: '', username: '', password: '', role: 'user' });

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => adminAPI.listUsers().then(r => r.data),
  });

  const createMut = useMutation({
    mutationFn: (data) => adminAPI.createUser(data),
    onSuccess: () => {
      qc.invalidateQueries(['admin-users']);
      toast.success('Utilisateur créé');
      setShowModal(false);
      setForm({ email: '', username: '', password: '', role: 'user' });
    },
    onError: (e) => toast.error(e.response?.data?.error || t('common.error')),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => adminAPI.updateUser(id, data),
    onSuccess: () => { qc.invalidateQueries(['admin-users']); toast.success('Modifié'); setEditUser(null); },
    onError: (e) => toast.error(e.response?.data?.error || t('common.error')),
  });

  const toggleActive = (user) =>
    updateMut.mutate({ id: user.id, data: { is_active: !user.is_active } });

  const changeRole = (user, role) =>
    updateMut.mutate({ id: user.id, data: { role } });

  const handleCreate = (e) => {
    e.preventDefault();
    if (form.password.length < 8) return toast.error(t('auth.passwordTooShort'));
    createMut.mutate(form);
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString() : '—';

  const tabStyle = (active) => ({
    background: 'none', border: 'none', padding: '8px 18px', cursor: 'pointer',
    color: active ? 'var(--cv-gold)' : 'var(--cv-text2)',
    borderBottom: active ? '2px solid var(--cv-gold)' : '2px solid transparent',
    fontSize: '0.88rem', fontWeight: active ? 600 : 400,
  });

  return (
    <div className="fade-in">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h2 className="font-serif mb-0" style={{ color: 'var(--cv-gold)', fontSize: '1.6rem' }}>
          {t('admin.title')}
        </h2>
        {activeTab === 'users' && (
          <button className="btn btn-wine btn-sm" onClick={() => setShowModal(true)}>
            <i className="bi bi-person-plus me-1"></i>{t('admin.createUser')}
          </button>
        )}
      </div>

      {/* Onglets */}
      <div style={{ borderBottom: '1px solid var(--cv-border)', marginBottom: '1.5rem' }}>
        <button style={tabStyle(activeTab === 'users')} onClick={() => setActiveTab('users')}>
          <i className="bi bi-people me-1"></i>{t('admin.tabUsers')}
        </button>
        <button style={tabStyle(activeTab === 'settings')} onClick={() => setActiveTab('settings')}>
          <i className="bi bi-gear me-1"></i>{t('admin.tabSettings')}
        </button>
        <button style={tabStyle(activeTab === 'cache')} onClick={() => setActiveTab('cache')}>
          <i className="bi bi-lightning me-1"></i>Cache & Sessions
        </button>
      </div>

      {activeTab === 'settings' && <SettingsTab />}
      {activeTab === 'cache'    && <CacheTab />}

      {activeTab === 'users' && <>
      {/* Stats rapides */}
      <div className="row g-3 mb-4">
        {ROLES.map(role => {
          const count = users.filter(u => u.role === role).length;
          return (
            <div key={role} className="col-4">
              <div className="stat-card text-center">
                <div className="stat-num">{count}</div>
                <div className="stat-label">{t(`admin.roles.${role}`)}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Table utilisateurs */}
      <div className="card">
        <div className="card-header d-flex align-items-center justify-content-between">
          <span className="card-title">{t('admin.users')}</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--cv-text3)' }}>{users.length} total</span>
        </div>
        <div className="card-body p-0">
          {isLoading ? (
            <div className="text-center py-5"><div className="spinner-border" style={{ color: 'var(--cv-gold)' }} /></div>
          ) : (
            <div className="table-responsive">
              <table className="table mb-0">
                <thead>
                  <tr>
                    <th>{t('common.name')}</th>
                    <th>Email</th>
                    <th>{t('admin.role')}</th>
                    <th>{t('admin.status')}</th>
                    <th>{t('admin.lastLogin')}</th>
                    <th>{t('admin.createdAt')}</th>
                    <th>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{u.username}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--cv-text3)' }}>#{u.id}</div>
                      </td>
                      <td style={{ fontSize: '0.82rem' }}>{u.email}</td>
                      <td>
                        {editUser?.id === u.id ? (
                          <select
                            className="form-select form-select-sm"
                            style={{ width: 120 }}
                            value={editUser.role}
                            onChange={e => setEditUser({ ...editUser, role: e.target.value })}
                          >
                            {ROLES.map(r => <option key={r} value={r}>{t(`admin.roles.${r}`)}</option>)}
                          </select>
                        ) : (
                          <RoleBadge role={u.role} t={t} />
                        )}
                      </td>
                      <td>
                        <span className={u.is_active ? 'badge-stock' : 'badge-drunk'}>
                          {u.is_active ? t('admin.active') : t('admin.inactive')}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--cv-text2)' }}>{fmtDate(u.last_login)}</td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--cv-text2)' }}>{fmtDate(u.created_at)}</td>
                      <td>
                        <div className="d-flex gap-1">
                          {editUser?.id === u.id ? (
                            <>
                              <button className="btn btn-gold btn-sm px-2"
                                onClick={() => changeRole(u, editUser.role)}
                                disabled={updateMut.isPending}
                              >
                                <i className="bi bi-check"></i>
                              </button>
                              <button className="btn btn-outline-gold btn-sm px-2" onClick={() => setEditUser(null)}>
                                <i className="bi bi-x"></i>
                              </button>
                            </>
                          ) : (
                            <>
                              <button className="btn btn-outline-gold btn-sm px-2"
                                onClick={() => setEditUser({ ...u })}
                                title={t('admin.editUser')}
                              >
                                <i className="bi bi-pencil"></i>
                              </button>
                              <button
                                className={`btn btn-sm px-2 ${u.is_active ? 'btn-outline-danger' : 'btn-outline-success'}`}
                                style={{ borderRadius: 8 }}
                                onClick={() => {
                                  if (window.confirm(t('admin.confirmDeactivate'))) toggleActive(u);
                                }}
                                title={u.is_active ? t('admin.deactivate') : t('admin.activate')}
                                disabled={updateMut.isPending}
                              >
                                <i className={`bi ${u.is_active ? 'bi-person-x' : 'bi-person-check'}`}></i>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Role descriptions */}
      <div className="row g-3 mt-2">
        {ROLES.map(role => (
          <div key={role} className="col-md-4">
            <div className="stat-card">
              <div className="d-flex align-items-center gap-2 mb-1">
                <RoleBadge role={role} t={t} />
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--cv-text2)', margin: 0 }}>
                {t(`admin.roleDesc.${role}`)}
              </p>
            </div>
          </div>
        ))}
      </div>

      </>}

      {/* Create user modal */}
      {showModal && (
        <div className="modal show d-block" style={{ background: 'var(--cv-modal-overlay)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{t('admin.createUser')}</h5>
                <button className="btn-close" onClick={() => setShowModal(false)}></button>
              </div>
              <form onSubmit={handleCreate}>
                <div className="modal-body d-flex flex-column gap-3">
                  <div>
                    <label className="form-label">{t('auth.email')}</label>
                    <input className="form-control" type="email" required
                      value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div>
                    <label className="form-label">{t('auth.username')}</label>
                    <input className="form-control" required minLength={2}
                      value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
                  </div>
                  <div>
                    <label className="form-label">{t('auth.password')}</label>
                    <input className="form-control" type="password" required minLength={8}
                      value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
                  </div>
                  <div>
                    <label className="form-label">{t('admin.role')}</label>
                    <select className="form-select"
                      value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                      {ROLES.map(r => (
                        <option key={r} value={r}>{t(`admin.roles.${r}`)} — {t(`admin.roleDesc.${r}`)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline-gold btn-sm" onClick={() => setShowModal(false)}>
                    {t('common.cancel')}
                  </button>
                  <button type="submit" className="btn btn-wine btn-sm" disabled={createMut.isPending}>
                    {createMut.isPending ? <span className="spinner-border spinner-border-sm me-1" /> : null}
                    {t('admin.createUser')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
