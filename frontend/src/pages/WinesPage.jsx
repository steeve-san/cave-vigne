// src/pages/WinesPage.jsx
import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { winesAPI, tastingAPI } from '../services/api';
import { useLang } from '../context/LangContext';
import toast from 'react-hot-toast';

// Print-to-PDF: open a print window with a styled sheet of all visible wines
function printWinesPDF(wines) {
  const rows = wines.map(w => `
    <tr>
      <td>${w.name}</td>
      <td>${w.vintage || '—'}</td>
      <td>${w.type}</td>
      <td>${w.appellation || w.region || '—'}</td>
      <td>${w.grapes || '—'}</td>
      <td>${w.quantity}</td>
      <td>${w.price ? w.price + ' €' : '—'}</td>
      <td>${w.keep_until || '—'}</td>
    </tr>`).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Cave &amp; Vigne</title>
  <style>
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#1a0f0f;padding:20px}
    h1{font-size:18px;font-family:Georgia,serif;color:#8b1a1a;margin-bottom:4px}
    p{font-size:10px;color:#888;margin-bottom:12px}
    table{width:100%;border-collapse:collapse}
    th{background:#8b1a1a;color:#fff;padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.5px}
    td{padding:5px 8px;border-bottom:1px solid #eee;vertical-align:top}
    tr:nth-child(even) td{background:#fdf8f2}
    @media print{@page{margin:1.5cm}}
  </style></head><body>
  <h1>Cave &amp; Vigne — Export cave</h1>
  <p>Généré le ${new Date().toLocaleDateString('fr-FR')} · ${wines.length} vin(s)</p>
  <table><thead><tr>
    <th>Nom</th><th>Mill.</th><th>Type</th><th>Appellation / Région</th>
    <th>Cépages</th><th>Qté</th><th>Prix</th><th>Garder jusqu'à</th>
  </tr></thead><tbody>${rows}</tbody></table>
  <script>window.onload=()=>{window.print();window.close();}<\/script>
  </body></html>`;
  const w = window.open('', '_blank', 'width=900,height=700');
  if (w) { w.document.write(html); w.document.close(); }
}

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

function WineModal({ wine, prefill, onClose, onSave }) {
  const { t } = useLang();
  const [tab, setTab] = useState('vin');
  const [form, setForm] = useState(wine ? {
    ...EMPTY_FORM, ...wine,
    vintage: wine.vintage || '', price: wine.price || '', keep_until: wine.keep_until || '',
    position: wine.position || '', notes: wine.notes || '',
    domain_website: wine.domain_website || '', domain_description: wine.domain_description || '',
    soil_type: wine.soil_type || '', altitude: wine.altitude || '',
  } : prefill ? { ...EMPTY_FORM, ...prefill } : { ...EMPTY_FORM });
  const [labelFile, setLabelFile] = useState(null);
  const [bottleFile, setBottleFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichResults, setEnrichResults] = useState(null);
  const [aiEnriching, setAiEnriching] = useState(false);
  const [aiEnrichData, setAiEnrichData] = useState(null);
  const [aiEnrichSelected, setAiEnrichSelected] = useState({});
  const [newTasting, setNewTasting] = useState({ tasted_at: new Date().toISOString().slice(0,10), rating: '', color_desc: '', nose: '', palate: '', finish: '', overall: '' });
  const [savingTasting, setSavingTasting] = useState(false);
  const qcInner = useQueryClient();
  const { data: tastingNotes = [] } = useQuery({
    queryKey: ['tasting', wine?.id],
    queryFn: () => wine?.id ? tastingAPI.list(wine.id).then(r => r.data) : [],
    enabled: !!wine?.id && tab === 'dégustation',
  });
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

  const AI_ENRICH_FIELDS = [
    ['region', 'Région'], ['country', 'Pays'], ['appellation', 'Appellation'],
    ['grapes', 'Cépages'], ['domain_description', 'Description domaine'],
    ['soil_type', 'Type de sol'], ['keep_until', 'Garder jusqu\'à'], ['notes', 'Notes'],
  ];

  const handleAiEnrich = async () => {
    if (!wine?.id) return;
    setAiEnriching(true);
    setAiEnrichData(null);
    try {
      const r = await winesAPI.aiEnrich(wine.id);
      const d = r.data.enriched;
      // Pre-select only fields that are currently empty in the form
      const sel = {};
      AI_ENRICH_FIELDS.forEach(([k]) => { if (d[k] != null && !form[k]) sel[k] = true; });
      setAiEnrichData(d);
      setAiEnrichSelected(sel);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur enrichissement IA');
    } finally { setAiEnriching(false); }
  };

  const applyAiEnrich = () => {
    const updates = {};
    AI_ENRICH_FIELDS.forEach(([k]) => { if (aiEnrichSelected[k] && aiEnrichData[k] != null) updates[k] = String(aiEnrichData[k]); });
    setForm(f => ({ ...f, ...updates }));
    setAiEnrichData(null);
    toast.success(t('wines.aiEnrichApply'));
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
              {[['vin', t('wines.tabWine')], ['domaine', t('wines.tabDomain')], ['photos', t('wines.tabPhotos')], ...(wine?.id ? [['dégustation', '📓 Dégustation']] : [])].map(([key, label]) => (
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
                      <button type="button" className="btn btn-sm btn-outline-secondary" onClick={handleAiEnrich} disabled={aiEnriching}>
                        {aiEnriching ? <span className="spinner-border spinner-border-sm me-1" /> : null}
                        {aiEnriching ? t('wines.aiEnrichLoading') : t('wines.aiEnrichBtn')}
                      </button>
                      <span style={{ fontSize: '0.72rem', color: 'var(--cv-text3)' }}>{t('wines.enrichSource')}</span>
                    </div>
                  )}
                  {/* AI Enrich results panel */}
                  {aiEnrichData && (
                    <div className="col-12">
                      <div className="card p-3" style={{ background: 'var(--cv-bg3)', border: '1px solid var(--cv-gold)' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--cv-gold)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                          {t('wines.aiEnrichTitle')}
                        </div>
                        {AI_ENRICH_FIELDS.filter(([k]) => aiEnrichData[k] != null).map(([k, label]) => (
                          <label key={k} className="d-flex align-items-start gap-2 mb-2" style={{ cursor: 'pointer' }}>
                            <input type="checkbox" checked={!!aiEnrichSelected[k]}
                              onChange={e => setAiEnrichSelected(s => ({ ...s, [k]: e.target.checked }))}
                              style={{ marginTop: 3, flexShrink: 0 }} />
                            <div>
                              <span style={{ fontSize: '0.72rem', color: 'var(--cv-text2)', fontWeight: 600 }}>{label}</span>
                              <div style={{ fontSize: '0.82rem', color: 'var(--cv-text)' }}>{String(aiEnrichData[k])}</div>
                            </div>
                          </label>
                        ))}
                        {aiEnrichData.food_pairings?.length > 0 && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--cv-text2)', marginTop: 4 }}>
                            <strong>{t('wines.aiEnrichPairings')} :</strong> {aiEnrichData.food_pairings.join(', ')}
                          </div>
                        )}
                        <div className="d-flex gap-2 mt-3">
                          <button type="button" className="btn btn-sm btn-outline-gold" onClick={applyAiEnrich}
                            disabled={!Object.values(aiEnrichSelected).some(Boolean)}>
                            {t('wines.aiEnrichApply')}
                          </button>
                          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setAiEnrichData(null)}>
                            {t('common.cancel')}
                          </button>
                        </div>
                      </div>
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

              {/* ── Tab Dégustation ──────────────────────────── */}
              {tab === 'dégustation' && wine?.id && (
                <div>
                  {/* Existing notes */}
                  {tastingNotes.length > 0 && (
                    <div className="mb-4">
                      {tastingNotes.map(note => (
                        <div key={note.id} className="card mb-2" style={{ background: 'var(--cv-bg3)' }}>
                          <div className="card-body p-3">
                            <div className="d-flex justify-content-between align-items-start mb-2">
                              <div>
                                <span style={{ fontSize: '0.78rem', color: 'var(--cv-gold)' }}>{note.tasted_at}</span>
                                {note.rating && <span className="ms-2" style={{ fontSize: '0.78rem', color: 'var(--cv-text2)' }}>{note.rating}/100</span>}
                              </div>
                              <button className="btn btn-sm" style={{ color: 'var(--cv-text3)', background: 'none', border: 'none', padding: 0 }}
                                onClick={async () => { await tastingAPI.remove(note.id); qcInner.invalidateQueries(['tasting', wine.id]); }}>
                                <i className="bi bi-x"></i>
                              </button>
                            </div>
                            {note.color_desc && <div style={{ fontSize: '0.8rem', color: 'var(--cv-text)' }}><strong>Robe:</strong> {note.color_desc}</div>}
                            {note.nose && <div style={{ fontSize: '0.8rem', color: 'var(--cv-text)' }}><strong>Nez:</strong> {note.nose}</div>}
                            {note.palate && <div style={{ fontSize: '0.8rem', color: 'var(--cv-text)' }}><strong>Bouche:</strong> {note.palate}</div>}
                            {note.finish && <div style={{ fontSize: '0.8rem', color: 'var(--cv-text)' }}><strong>Finale:</strong> {note.finish}</div>}
                            {note.overall && <div style={{ fontSize: '0.82rem', color: 'var(--cv-text2)', fontStyle: 'italic', marginTop: 4 }}>{note.overall}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Add new note */}
                  <div style={{ borderTop: tastingNotes.length ? '0.5px solid var(--cv-border)' : 'none', paddingTop: tastingNotes.length ? '1rem' : 0 }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--cv-gold)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Nouvelle note de dégustation</div>
                    <div className="row g-2">
                      <div className="col-md-6">
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>Date</label>
                        <input className="form-control form-control-sm" type="date" value={newTasting.tasted_at}
                          onChange={e => setNewTasting(f => ({ ...f, tasted_at: e.target.value }))} />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>Note /100</label>
                        <input className="form-control form-control-sm" type="number" min="1" max="100" value={newTasting.rating}
                          onChange={e => setNewTasting(f => ({ ...f, rating: e.target.value }))} placeholder="90" />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>Robe</label>
                        <input className="form-control form-control-sm" value={newTasting.color_desc}
                          onChange={e => setNewTasting(f => ({ ...f, color_desc: e.target.value }))} placeholder="Rubis profond, grenat…" />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>Nez</label>
                        <input className="form-control form-control-sm" value={newTasting.nose}
                          onChange={e => setNewTasting(f => ({ ...f, nose: e.target.value }))} placeholder="Fruits noirs, épices…" />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>Bouche</label>
                        <input className="form-control form-control-sm" value={newTasting.palate}
                          onChange={e => setNewTasting(f => ({ ...f, palate: e.target.value }))} placeholder="Tanins soyeux…" />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>Finale</label>
                        <input className="form-control form-control-sm" value={newTasting.finish}
                          onChange={e => setNewTasting(f => ({ ...f, finish: e.target.value }))} placeholder="Longue, persistante…" />
                      </div>
                      <div className="col-12">
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>Commentaire général</label>
                        <textarea className="form-control form-control-sm" rows={3} value={newTasting.overall}
                          onChange={e => setNewTasting(f => ({ ...f, overall: e.target.value }))} placeholder="Impressions générales, accord suggéré…" />
                      </div>
                      <div className="col-12">
                        <button type="button" className="btn btn-sm btn-outline-gold" disabled={savingTasting || !newTasting.tasted_at}
                          onClick={async () => {
                            setSavingTasting(true);
                            try {
                              await tastingAPI.create(wine.id, newTasting);
                              qcInner.invalidateQueries(['tasting', wine.id]);
                              setNewTasting({ tasted_at: new Date().toISOString().slice(0,10), rating: '', color_desc: '', nose: '', palate: '', finish: '', overall: '' });
                              toast.success('Note ajoutée !');
                            } catch { toast.error('Erreur'); }
                            finally { setSavingTasting(false); }
                          }}>
                          {savingTasting ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="bi bi-plus-circle me-1"></i>}
                          Enregistrer la note
                        </button>
                      </div>
                    </div>
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

function BarcodeModal({ onClose, onResult }) {
  const [ean, setEan] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLookup = async () => {
    const code = ean.trim();
    if (!/^\d{8,14}$/.test(code)) { setError('Code EAN invalide (8–14 chiffres)'); return; }
    setLoading(true); setError('');
    try {
      const r = await winesAPI.barcode(code);
      onResult(r.data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Produit introuvable');
    } finally { setLoading(false); }
  };

  const handleKeyDown = (e) => { if (e.key === 'Enter') handleLookup(); };

  return (
    <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 400 }}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title"><i className="bi bi-upc-scan me-2"></i>Scanner un code-barres</h5>
            <button className="btn-close" onClick={onClose} />
          </div>
          <div className="modal-body">
            <p style={{ fontSize: '0.82rem', color: 'var(--cv-text2)' }}>
              Entrez ou scannez le code EAN de la bouteille (8 à 14 chiffres) pour pré-remplir les informations depuis Open Food Facts.
            </p>
            <div className="input-group mb-2">
              <span className="input-group-text"><i className="bi bi-upc"></i></span>
              <input className="form-control" placeholder="ex: 3760076020079" value={ean}
                onChange={e => setEan(e.target.value)} onKeyDown={handleKeyDown}
                type="tel" inputMode="numeric" autoFocus />
            </div>
            {error && <div className="alert alert-danger py-2" style={{ fontSize: '0.82rem' }}>{error}</div>}
          </div>
          <div className="modal-footer">
            <button className="btn btn-outline-gold" onClick={onClose}>Annuler</button>
            <button className="btn btn-gold" onClick={handleLookup} disabled={loading || !ean.trim()}>
              {loading ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="bi bi-search me-1"></i>}
              Rechercher
            </button>
          </div>
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
  const [modal, setModal] = useState(null); // null | { mode: 'add'|'edit'|'accord'|'barcode', wine? }
  const [selected, setSelected] = useState(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [pendingBarcode, setPendingBarcode] = useState(null); // pre-filled form from barcode scan
  const importRef = useRef();

  const params = { search: search || undefined, type: typeF !== 'all' ? typeF : undefined, status: statusF !== 'all' ? statusF : undefined, limit: 100 };
  const { data, isLoading } = useQuery({ queryKey: ['wines', params], queryFn: () => winesAPI.list(params).then(r => r.data) });

  const addMutation = useMutation({ mutationFn: winesAPI.create, onSuccess: () => { qc.invalidateQueries(['wines']); qc.invalidateQueries(['wine-stats']); toast.success('Vin ajouté !'); } });
  const editMutation = useMutation({ mutationFn: ({ id, fd }) => winesAPI.update(id, fd), onSuccess: () => { qc.invalidateQueries(['wines']); qc.invalidateQueries(['wine-stats']); toast.success('Vin modifié !'); } });
  const delMutation = useMutation({ mutationFn: winesAPI.remove, onSuccess: () => { qc.invalidateQueries(['wines']); qc.invalidateQueries(['wine-stats']); toast.success('Vin supprimé'); } });
  const toggleDrunk = useMutation({
    mutationFn: ({ id, is_drunk, quantity }) => { const fd = new FormData(); fd.append('is_drunk', !is_drunk ? 1 : 0); if (!is_drunk) fd.append('quantity', 0); else fd.append('quantity', 1); return winesAPI.update(id, fd); },
    onSuccess: () => { qc.invalidateQueries(['wines']); qc.invalidateQueries(['wine-stats']); },
  });

  const handleExport = async () => {
    try {
      const resp = await winesAPI.exportCsv();
      const url = URL.createObjectURL(resp.data);
      const a = document.createElement('a');
      a.href = url; a.download = `cave-vigne-${new Date().toISOString().slice(0,10)}.csv`;
      a.click(); URL.revokeObjectURL(url);
    } catch { toast.error('Erreur export'); }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const r = await winesAPI.importCsv(file);
      qc.invalidateQueries(['wines']); qc.invalidateQueries(['wine-stats']);
      toast.success(`${r.data.inserted} vin(s) importé(s)${r.data.skipped ? `, ${r.data.skipped} ignoré(s)` : ''}`);
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur import'); }
    e.target.value = '';
  };

  const handleBulkDelete = async () => {
    if (!selected.size || !window.confirm(`Supprimer ${selected.size} vin(s) ?`)) return;
    await Promise.all([...selected].map(id => winesAPI.remove(id)));
    qc.invalidateQueries(['wines']); qc.invalidateQueries(['wine-stats']);
    setSelected(new Set()); setBulkMode(false);
    toast.success(`${selected.size} vin(s) supprimé(s)`);
  };

  const handleBulkDrunk = async () => {
    if (!selected.size) return;
    const fns = [...selected].map(id => {
      const fd = new FormData(); fd.append('is_drunk', 1); fd.append('quantity', 0);
      return winesAPI.update(id, fd);
    });
    await Promise.all(fns);
    qc.invalidateQueries(['wines']); qc.invalidateQueries(['wine-stats']);
    setSelected(new Set()); setBulkMode(false);
    toast.success(`${selected.size} vin(s) marqué(s) comme bus`);
  };

  const toggleSelect = (id) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleBarcodeResult = (data) => {
    setPendingBarcode(data);
    setModal({ mode: 'add', prefill: data });
    toast.success('Produit trouvé — vérifiez et complétez les informations');
  };

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
          <div className="col-12 col-md-4 d-flex justify-content-md-end gap-2 flex-wrap">
            <span style={{ fontSize: '0.78rem', color: 'var(--cv-text2)', alignSelf: 'center' }}>{total} résultat{total > 1 ? 's' : ''}</span>
            <div className="dropdown">
              <button className="btn btn-outline-gold btn-sm dropdown-toggle" data-bs-toggle="dropdown" title="CSV">
                <i className="bi bi-table me-1"></i>CSV
              </button>
              <ul className="dropdown-menu dropdown-menu-end">
                <li><button className="dropdown-item" onClick={handleExport}><i className="bi bi-download me-2"></i>Exporter (.csv)</button></li>
                <li><button className="dropdown-item" onClick={() => importRef.current?.click()}><i className="bi bi-upload me-2"></i>Importer (.csv)</button></li>
              </ul>
            </div>
            <input ref={importRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImport} />
            <button className={`btn btn-sm ${bulkMode ? 'btn-gold' : 'btn-outline-gold'}`} onClick={() => { setBulkMode(v => !v); setSelected(new Set()); }} title="Sélection multiple">
              <i className="bi bi-check2-square"></i>
            </button>
            <button className="btn btn-outline-gold btn-sm" onClick={() => setModal({ mode: 'barcode' })} title="Scanner code-barres">
              <i className="bi bi-upc-scan"></i>
            </button>
            <button className="btn btn-outline-gold btn-sm" onClick={() => printWinesPDF(wines)} title="Exporter en PDF" disabled={!wines.length}>
              <i className="bi bi-file-pdf"></i>
            </button>
            <button className="btn btn-gold btn-sm" onClick={() => setModal({ mode: 'add' })}>
              <i className="bi bi-plus me-1"></i>Ajouter
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

      {/* Bulk action bar */}
      {bulkMode && selected.size > 0 && (
        <div className="d-flex align-items-center gap-2 mb-3 p-2" style={{ background: 'var(--cv-bg3)', borderRadius: 8, border: '1px solid var(--cv-border)' }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--cv-gold)' }}>{selected.size} sélectionné(s)</span>
          <button className="btn btn-sm btn-outline-gold" onClick={() => setSelected(new Set(wines.map(w => w.id)))}>Tout sélectionner</button>
          <button className="btn btn-sm btn-wine" onClick={handleBulkDrunk}><i className="bi bi-check-circle me-1"></i>Marquer bus</button>
          <button className="btn btn-sm btn-outline-secondary ms-auto" style={{ color: '#dc3545', borderColor: '#dc3545' }} onClick={handleBulkDelete}><i className="bi bi-trash me-1"></i>Supprimer</button>
        </div>
      )}

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
              <div className="item-card" style={{ background: bulkMode && selected.has(w.id) ? 'var(--cv-bg3)' : undefined }}>
                {bulkMode && (
                  <input type="checkbox" className="form-check-input me-1" checked={selected.has(w.id)} onChange={() => toggleSelect(w.id)} style={{ cursor: 'pointer', flexShrink: 0 }} />
                )}
                <span className="item-icon">{TYPE_ICONS[w.type] || '🍷'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="item-name">{w.name}</div>
                  <div className="item-meta">{[w.vintage, w.appellation, w.grapes].filter(Boolean).join(' · ')}</div>
                </div>
                <div className="d-flex align-items-center gap-2">
                  {w.is_drunk || w.quantity === 0
                    ? <span className="badge-drunk">bue</span>
                    : w.quantity === 1
                      ? <span className="badge" style={{ background: 'rgba(220,53,69,0.18)', color: '#dc3545', border: '0.5px solid #dc3545', fontSize: '0.65rem', padding: '2px 6px', borderRadius: 4 }}>dernière</span>
                      : <span className="badge-stock">cave</span>
                  }
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
      {modal?.mode === 'add' && <WineModal prefill={modal.prefill} onClose={() => { setModal(null); setPendingBarcode(null); }} onSave={(fd) => addMutation.mutateAsync(fd)} />}
      {modal?.mode === 'edit' && <WineModal wine={modal.wine} onClose={() => setModal(null)} onSave={(fd) => editMutation.mutateAsync({ id: modal.wine.id, fd })} />}
      {modal?.mode === 'accord' && <AccordModal wine={modal.wine} onClose={() => setModal(null)} />}
      {modal?.mode === 'barcode' && <BarcodeModal onClose={() => setModal(null)} onResult={handleBarcodeResult} />}
    </div>
  );
}
