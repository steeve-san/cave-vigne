// src/components/QRCodeModal.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Génère et affiche le QR code d'une bouteille (encodant son URL)
// Permet l'impression directe ou l'enregistrement de l'image
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { winesAPI } from '../services/api';

export default function QRCodeModal({ wine, onClose }) {
  const [loading, setLoading] = useState(true);
  const [qr, setQr] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    winesAPI.qrcode(wine.id)
      .then(r => setQr(r.data))
      .catch(() => setError('Erreur lors de la génération du QR code'))
      .finally(() => setLoading(false));
  }, [wine.id]);

  const handlePrint = () => {
    if (!qr) return;
    const w = window.open('', '_blank', 'width=400,height=500');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>QR — ${wine.name}</title>
    <style>
      @page { size: 100mm 100mm; margin: 5mm; }
      body { font-family: 'Georgia', serif; background: #f0e6d3; color: #1a0f0f;
             display: flex; flex-direction: column; align-items: center;
             justify-content: center; height: 90mm; text-align: center; }
      h2 { font-size: 13px; margin: 0 0 4px; }
      p  { font-size: 10px; margin: 0 0 8px; color: #666; }
      img { border: 1px solid #ccc; border-radius: 4px; }
    </style></head><body>
    <img src="${qr.dataUrl}" width="180" height="180" />
    <h2>${wine.name}${wine.vintage ? ' ' + wine.vintage : ''}</h2>
    ${wine.producer ? `<p>${wine.producer}</p>` : ''}
    <p style="font-size:8px;color:#aaa;">${qr.url}</p>
    <script>window.onload=()=>{window.print();window.close();}<\/script>
    </body></html>`);
    w.document.close();
  };

  const handleDownload = () => {
    if (!qr) return;
    const a = document.createElement('a');
    a.href = qr.dataUrl;
    a.download = `qr-${wine.name.replace(/\s+/g, '-')}.png`;
    a.click();
  };

  return (
    <div
      className="modal show d-block"
      style={{ background: 'rgba(0,0,0,0.75)', zIndex: 1070 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 360 }}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              <i className="bi bi-qr-code me-2" style={{ color: 'var(--cv-gold)' }} />
              QR Code — <span style={{ color: 'var(--cv-gold)', fontFamily: 'Cormorant Garamond,serif' }}>
                {wine.name}{wine.vintage ? ` ${wine.vintage}` : ''}
              </span>
            </h5>
            <button className="btn-close" onClick={onClose} />
          </div>

          <div className="modal-body text-center py-4">
            {loading && (
              <div className="py-4">
                <div className="spinner-border" style={{ color: 'var(--cv-gold)' }} />
                <p style={{ fontSize: '0.82rem', color: 'var(--cv-text2)', marginTop: 12 }}>
                  Génération du QR code…
                </p>
              </div>
            )}

            {error && (
              <div className="alert alert-danger">{error}</div>
            )}

            {qr && !loading && (
              <>
                {/* QR image */}
                <div style={{
                  display: 'inline-block',
                  padding: 16,
                  background: '#f0e6d3',
                  borderRadius: 12,
                  border: '1px solid var(--cv-border)',
                  marginBottom: 12,
                }}>
                  <img src={qr.dataUrl} alt="QR Code" style={{ width: 200, height: 200, display: 'block' }} />
                </div>

                {/* Wine info */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: '1.05rem', color: 'var(--cv-text)' }}>
                    {wine.name}{wine.vintage ? ` ${wine.vintage}` : ''}
                  </div>
                  {wine.producer && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--cv-text3)' }}>{wine.producer}</div>
                  )}
                </div>

                {/* URL */}
                <div style={{ fontSize: '0.65rem', color: 'var(--cv-text3)', fontFamily: 'monospace',
                              wordBreak: 'break-all', marginBottom: 16, padding: '4px 8px',
                              background: 'var(--cv-bg3)', borderRadius: 4 }}>
                  {qr.url}
                </div>

                {/* Actions */}
                <div className="d-flex gap-2 justify-content-center">
                  <button className="btn btn-outline-gold btn-sm" onClick={handlePrint}>
                    <i className="bi bi-printer me-1" />Imprimer
                  </button>
                  <button className="btn btn-outline-gold btn-sm" onClick={handleDownload}>
                    <i className="bi bi-download me-1" />Télécharger
                  </button>
                  <button className="btn btn-outline-secondary btn-sm"
                    onClick={() => { navigator.clipboard.writeText(qr.url); }}>
                    <i className="bi bi-clipboard me-1" />Copier URL
                  </button>
                </div>

                <div style={{ marginTop: 12, fontSize: '0.68rem', color: 'var(--cv-text3)', fontStyle: 'italic' }}>
                  <i className="bi bi-info-circle me-1" />
                  Scannez ce QR code pour accéder directement à la fiche de la bouteille.
                </div>
              </>
            )}
          </div>

          <div className="modal-footer">
            <button className="btn btn-outline-gold" onClick={onClose}>Fermer</button>
          </div>
        </div>
      </div>
    </div>
  );
}
