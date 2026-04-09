// src/components/BarcodeScannerModal.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Composant universel de scan code-barres (vins ET spiritueux)
//
// • Caméra en temps réel via BarcodeDetector API (natif Chrome/Edge/Android)
// • Fallback saisie manuelle si BarcodeDetector absent
// • Support EAN-8, EAN-13, ITF-14 (caisses/cartons) → strip leading digit
// • Lookup via prop `lookupFn(ean)` → résultat renvoyé à `onResult(data)`
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// ── Normalise un code-barres (carton ITF-14 → bouteille EAN-13) ───────────────
function normalizeEan(raw) {
  const code = raw.replace(/\D/g, '');
  // ITF-14 (14 chiffres) : le premier chiffre est le "packaging indicator", on retire
  if (code.length === 14) return code.slice(1);
  return code;
}

// ── Support détection ─────────────────────────────────────────────────────────
const hasBarcodeDetector = typeof window !== 'undefined' && 'BarcodeDetector' in window;

export default function BarcodeScannerModal({ onClose, onResult, lookupFn, title = 'Scanner un code-barres' }) {
  const [mode, setMode] = useState(hasBarcodeDetector ? 'camera' : 'manual');
  // ── Douchette (physical scanner) state ───────────────────────────────────
  const [douchetteInput, setDouchetteInput]     = useState('');
  const [douchetteStatus, setDouchetteStatus]   = useState('idle'); // idle | scanning | found | error
  const [douchetteHistory, setDouchetteHistory] = useState([]); // [{ean, name, ts}]
  const douchetteRef  = useRef(null);
  const douchetteTimer = useRef(null);
  const [ean, setEan] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [lastScanned, setLastScanned] = useState('');

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const rafRef = useRef(null);
  const cooldownRef = useRef(false); // évite les doubles détections

  // ── Démarrer caméra ───────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      if (hasBarcodeDetector) {
        detectorRef.current = new window.BarcodeDetector({
          formats: ['ean_8', 'ean_13', 'itf', 'upc_a', 'upc_e', 'code_128', 'code_39'],
        });
        setScanning(true);
      }
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setCameraError('Accès caméra refusé — passez en saisie manuelle.');
      } else {
        setCameraError('Caméra indisponible — passez en saisie manuelle.');
      }
    }
  }, []);

  // ── Arrêter caméra ────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    setScanning(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  // ── Boucle de détection ───────────────────────────────────────────────────
  useEffect(() => {
    if (!scanning || !detectorRef.current || !videoRef.current) return;

    const detect = async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) {
        rafRef.current = requestAnimationFrame(detect);
        return;
      }
      try {
        const barcodes = await detectorRef.current.detect(videoRef.current);
        if (barcodes.length && !cooldownRef.current) {
          const raw = barcodes[0].rawValue;
          const normalized = normalizeEan(raw);
          if (/^\d{8,13}$/.test(normalized)) {
            cooldownRef.current = true;
            setLastScanned(normalized);
            setScanning(false);
            await handleLookup(normalized);
            setTimeout(() => { cooldownRef.current = false; }, 2000);
            return;
          }
        }
      } catch { /* frame skip */ }
      rafRef.current = requestAnimationFrame(detect);
    };

    rafRef.current = requestAnimationFrame(detect);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  // ── Montage/démontage caméra ──────────────────────────────────────────────
  useEffect(() => {
    if (mode === 'camera') startCamera();
    return () => stopCamera();
  }, [mode, startCamera, stopCamera]);

  // ── Lookup produit ────────────────────────────────────────────────────────
  const handleLookup = async (code) => {
    const finalCode = code || normalizeEan(ean.trim());
    if (!/^\d{8,13}$/.test(finalCode)) {
      setError('Code EAN invalide (8–13 chiffres, ou ITF-14 à 14 chiffres)');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const r = await lookupFn(finalCode);
      // Close scanner first so the parent can open the add-modal without collision
      onClose();
      onResult(r.data, finalCode);
    } catch (err) {
      setError(err.response?.data?.error || 'Produit introuvable — essayez un autre code ou saisissez manuellement.');
      if (mode === 'camera') {
        setScanning(false);
        startCamera().then(() => setScanning(true));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = () => handleLookup(null);
  const handleKeyDown = e => { if (e.key === 'Enter') handleManualSubmit(); };

  const switchToManual    = () => { stopCamera(); setMode('manual');    setCameraError(''); setError(''); };
  const switchToCamera    = () => { setMode('camera');    setError(''); };
  const switchToDouchette = () => { stopCamera(); setMode('douchette'); setError(''); };

  // ── Douchette: auto-focus input when tab opens ────────────────────────────
  useEffect(() => {
    if (mode === 'douchette') {
      setTimeout(() => douchetteRef.current?.focus(), 50);
    }
  }, [mode]);

  // ── Douchette: handle scan input ──────────────────────────────────────────
  const handleDouchetteChange = useCallback(e => {
    const val = e.target.value.replace(/\D/g, '');
    setDouchetteInput(val);
    setDouchetteStatus('idle');
    clearTimeout(douchetteTimer.current);
    // Auto-trigger after EAN-13 length (13 digits) without needing Enter
    if (val.length >= 13) {
      douchetteTimer.current = setTimeout(() => handleDouchetteScan(val), 80);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDouchetteScan = useCallback(async (code) => {
    const normalized = normalizeEan(code || douchetteInput);
    if (!/^\d{8,13}$/.test(normalized)) return;
    setDouchetteStatus('scanning');
    setError('');
    try {
      const r = await lookupFn(normalized);
      const name = r.data?.name || normalized;
      setDouchetteHistory(h => [{ ean: normalized, name, ts: Date.now() }, ...h.slice(0, 9)]);
      setDouchetteStatus('found');
      setDouchetteInput('');
      // Close scanner first, then pass result to parent
      onClose();
      onResult(r.data, normalized);
    } catch (err) {
      setDouchetteStatus('error');
      setError(err.response?.data?.error || 'Produit introuvable');
      setDouchetteInput('');
      setTimeout(() => { douchetteRef.current?.focus(); setDouchetteStatus('idle'); }, 1500);
    }
  }, [douchetteInput, lookupFn, onResult, onClose]);

  const handleDouchetteKeyDown = e => {
    if (e.key === 'Enter') {
      clearTimeout(douchetteTimer.current);
      handleDouchetteScan(douchetteInput);
    }
  };

  return (
    <div
      className="modal show d-block"
      style={{ background: 'rgba(0,0,0,0.8)', zIndex: 1060 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 480 }}>
        <div className="modal-content">

          {/* Header */}
          <div className="modal-header">
            <h5 className="modal-title">
              <i className="bi bi-upc-scan me-2" style={{ color: 'var(--cv-gold)' }} />
              {title}
            </h5>
            <button className="btn-close" onClick={onClose} />
          </div>

          <div className="modal-body p-0">

            {/* Mode tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--cv-border)' }}>
              {[
                ...(hasBarcodeDetector ? [['camera', 'bi-camera-video', 'Caméra']] : []),
                ['manual',    'bi-keyboard',  'Manuel'],
                ['douchette', 'bi-wifi',       'Douchette'],
              ].map(([m, icon, label]) => (
                <button
                  key={m}
                  onClick={() => m === 'camera' ? switchToCamera() : m === 'douchette' ? switchToDouchette() : switchToManual()}
                  style={{
                    flex: 1, background: 'none', border: 'none',
                    padding: '10px 0', cursor: 'pointer', fontSize: '0.83rem',
                    color: mode === m ? 'var(--cv-gold)' : 'var(--cv-text2)',
                    borderBottom: mode === m ? '2px solid var(--cv-gold)' : '2px solid transparent',
                    fontWeight: mode === m ? 600 : 400,
                  }}
                >
                  <i className={`bi ${icon} me-1`} />{label}
                </button>
              ))}
            </div>

            {/* ── Vue caméra ── */}
            {mode === 'camera' && (
              <div style={{ position: 'relative', background: '#000', minHeight: 240 }}>
                <video
                  ref={videoRef}
                  style={{ width: '100%', maxHeight: 300, display: 'block', objectFit: 'cover' }}
                  muted
                  playsInline
                />
                {/* Viseur */}
                {!cameraError && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    pointerEvents: 'none',
                  }}>
                    <div style={{
                      width: 260, height: 120,
                      border: `2px solid ${scanning ? 'var(--cv-gold)' : 'rgba(201,168,76,0.4)'}`,
                      borderRadius: 8,
                      boxShadow: scanning ? '0 0 0 4000px rgba(0,0,0,0.35)' : 'none',
                      transition: 'border-color 0.3s',
                    }}>
                      {/* Coins */}
                      {[['0 auto auto 0', '-2px 0 0 -2px'], ['0 0 auto auto', '-2px -2px 0 0'], ['auto auto 0 0', '0 -2px -2px 0'], ['auto 0 0 auto', '0 0 -2px -2px']].map(([inset, bRad], i) => (
                        <div key={i} style={{
                          position: 'absolute', width: 18, height: 18,
                          borderStyle: 'solid', borderColor: 'var(--cv-gold)',
                          borderWidth: '3px', borderRadius: bRad, inset,
                        }} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Overlay état */}
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
                  padding: '20px 12px 10px',
                  textAlign: 'center',
                }}>
                  {cameraError ? (
                    <span style={{ color: '#f87171', fontSize: '0.8rem' }}>{cameraError}</span>
                  ) : loading ? (
                    <span style={{ color: 'var(--cv-gold)', fontSize: '0.8rem' }}>
                      <span className="spinner-border spinner-border-sm me-1" />
                      Recherche du produit…
                    </span>
                  ) : lastScanned ? (
                    <span style={{ color: '#4ade80', fontSize: '0.8rem' }}>
                      <i className="bi bi-check-circle me-1" />EAN {lastScanned}
                    </span>
                  ) : (
                    <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.78rem' }}>
                      Pointez la caméra vers le code-barres
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* ── Saisie manuelle ── */}
            {mode === 'manual' && (
              <div className="p-3">
                <p style={{ fontSize: '0.82rem', color: 'var(--cv-text2)', marginBottom: 12 }}>
                  Entrez le code EAN de la bouteille <strong>ou</strong> du carton (ITF-14 à 14 chiffres).
                  Le code sera normalisé automatiquement.
                </p>
                <div className="input-group">
                  <span className="input-group-text"><i className="bi bi-upc" /></span>
                  <input
                    className="form-control"
                    placeholder="ex : 3760076020079 ou 03760076020079"
                    value={ean}
                    onChange={e => { setEan(e.target.value); setError(''); }}
                    onKeyDown={handleKeyDown}
                    type="tel"
                    inputMode="numeric"
                    autoFocus
                  />
                </div>
                {ean.replace(/\D/g, '').length === 14 && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--cv-gold)', marginTop: 4 }}>
                    <i className="bi bi-box me-1" />
                    Code carton (ITF-14) détecté — sera converti en EAN-13 automatiquement
                  </div>
                )}
              </div>
            )}

            {/* ── Mode douchette ── */}
            {mode === 'douchette' && (
              <div className="p-3">
                {/* Status banner */}
                <div style={{
                  textAlign: 'center', padding: '18px 12px', marginBottom: 16,
                  background: douchetteStatus === 'found'    ? 'rgba(74,222,128,0.12)'
                            : douchetteStatus === 'error'   ? 'rgba(248,113,113,0.12)'
                            : douchetteStatus === 'scanning' ? 'rgba(201,168,76,0.12)'
                            : 'rgba(0,0,0,0.2)',
                  borderRadius: 8,
                  border: `1px solid ${
                    douchetteStatus === 'found'    ? 'rgba(74,222,128,0.35)'
                  : douchetteStatus === 'error'   ? 'rgba(248,113,113,0.35)'
                  : douchetteStatus === 'scanning' ? 'rgba(201,168,76,0.35)'
                  : 'var(--cv-border)'}`,
                  transition: 'all 0.25s',
                }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: 6 }}>
                    {douchetteStatus === 'found'    ? '✅'
                   : douchetteStatus === 'error'   ? '❌'
                   : douchetteStatus === 'scanning' ? '🔍'
                   : '📡'}
                  </div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color:
                    douchetteStatus === 'found'    ? '#4ade80'
                  : douchetteStatus === 'error'   ? '#f87171'
                  : douchetteStatus === 'scanning' ? 'var(--cv-gold)'
                  : 'var(--cv-text2)' }}>
                    {douchetteStatus === 'found'    ? 'Produit trouvé !'
                   : douchetteStatus === 'error'   ? 'Produit introuvable'
                   : douchetteStatus === 'scanning' ? 'Recherche en cours…'
                   : 'Prêt — pointez et scannez'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--cv-text3)', marginTop: 4 }}>
                    Connectez votre douchette USB / Bluetooth et scannez directement
                  </div>
                </div>

                {/* Champ de capture douchette */}
                <div className="input-group mb-2">
                  <span className="input-group-text" style={{ background: 'var(--cv-bg3)', borderColor: 'var(--cv-border)' }}>
                    <i className="bi bi-upc" style={{ color: 'var(--cv-gold)' }} />
                  </span>
                  <input
                    ref={douchetteRef}
                    className="form-control"
                    style={{ fontFamily: 'monospace', letterSpacing: 2, fontSize: '1.1rem', textAlign: 'center' }}
                    placeholder="EAN capturé ici…"
                    value={douchetteInput}
                    onChange={handleDouchetteChange}
                    onKeyDown={handleDouchetteKeyDown}
                    type="tel"
                    inputMode="numeric"
                    disabled={douchetteStatus === 'scanning'}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  <button
                    className="btn btn-outline-gold"
                    onClick={() => handleDouchetteScan(douchetteInput)}
                    disabled={!douchetteInput || douchetteStatus === 'scanning'}
                    title="Valider"
                  >
                    <i className="bi bi-search" />
                  </button>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--cv-text3)', textAlign: 'center' }}>
                  Cliquez dans le champ ci-dessus si la douchette ne capture pas · EAN-13 auto-détecté
                </div>

                {/* Historique */}
                {douchetteHistory.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--cv-text3)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
                      <i className="bi bi-clock-history me-1" />Derniers scans
                    </div>
                    {douchetteHistory.map((h, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '0.5px solid var(--cv-border)', fontSize: '0.8rem' }}>
                        <span style={{ fontFamily: 'monospace', color: 'var(--cv-text3)' }}>{h.ean}</span>
                        <span style={{ color: 'var(--cv-text2)', flex: 1, textAlign: 'right', paddingLeft: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Erreur */}
            {error && (
              <div className="mx-3 mb-3 alert alert-danger py-2" style={{ fontSize: '0.82rem' }}>
                <i className="bi bi-exclamation-triangle me-1" />{error}
              </div>
            )}

            {/* Info formats supportés */}
            <div className="px-3 pb-3">
              <div style={{
                fontSize: '0.72rem', color: 'var(--cv-text3)',
                padding: '6px 10px', background: 'rgba(0,0,0,0.2)',
                borderRadius: 6, display: 'flex', flexWrap: 'wrap', gap: '6px',
              }}>
                <span style={{ color: 'var(--cv-text2)', fontWeight: 600, width: '100%' }}>
                  <i className="bi bi-info-circle me-1" />Formats acceptés :
                </span>
                {[['bi-circle', 'EAN-8 / EAN-13', 'bouteille'], ['bi-box', 'ITF-14', 'carton/caisse'], ['bi-grid', 'UPC-A / Code 128', 'import']].map(([icon, fmt, desc]) => (
                  <span key={fmt} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <i className={`bi ${icon}`} /> {fmt} <span style={{ opacity: 0.6 }}>({desc})</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="modal-footer">
            <button className="btn btn-outline-gold" onClick={onClose}>Annuler</button>
            {mode === 'manual' && (
              <button
                className="btn btn-gold"
                onClick={handleManualSubmit}
                disabled={loading || !ean.trim()}
              >
                {loading
                  ? <span className="spinner-border spinner-border-sm me-1" />
                  : <i className="bi bi-search me-1" />
                }
                Rechercher
              </button>
            )}
            {mode === 'camera' && cameraError && (
              <button className="btn btn-gold" onClick={switchToManual}>
                <i className="bi bi-keyboard me-1" />Saisie manuelle
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
