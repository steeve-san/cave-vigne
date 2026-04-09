// src/components/LabelPrinter.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Générateur d'étiquettes d'inventaire pour imprimantes thermiques / étiquettes
//
// Formats supportés :
//   • S  — 57 × 32 mm  : nom + millésime + type (étiquette mini)
//   • M  — 89 × 36 mm  : infos essentielles (standard Brother / Dymo)
//   • L  — 100 × 62 mm : inventaire complet (grande étiquette)
//   • A4 — Feuille A4   : grille 12 étiquettes par feuille
//
// Impression : fenêtre popup avec @page CSS dimensionné au format choisi.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback } from 'react';

// ── Tailles prédéfinies ───────────────────────────────────────────────────────
const SIZES = {
  s:  { label: 'Mini  (57 × 32 mm)',   w: 57,  h: 32,  desc: 'Nom + millésime' },
  m:  { label: 'Standard  (89 × 36 mm)', w: 89,  h: 36,  desc: 'Infos essentielles' },
  l:  { label: 'Grande  (100 × 62 mm)', w: 100, h: 62,  desc: 'Inventaire complet' },
  a4: { label: 'Feuille A4  (12 par page)', w: 210, h: 297, desc: 'Grille A4' },
};

const TYPE_COLOR_HEX = {
  rouge: '#8b1a1a', blanc: '#b08a20', rosé: '#c05060', pétillant: '#3a6c99',
  whisky: '#7a4510', rhum: '#5c3510', cognac: '#8a6020', armagnac: '#6a4818',
  calvados: '#4a7030', gin: '#28608a', vodka: '#607080', autre: '#555555',
};

const TYPE_LABEL = {
  rouge: 'Rouge', blanc: 'Blanc', rosé: 'Rosé', pétillant: 'Pétillant',
  whisky: 'Whisky', rhum: 'Rhum', cognac: 'Cognac', armagnac: 'Armagnac',
  calvados: 'Calvados', gin: 'Gin', vodka: 'Vodka', autre: 'Autre',
};

// ── Générateurs HTML par format ───────────────────────────────────────────────
function labelHtmlSmall(item, itemType) {
  const color = TYPE_COLOR_HEX[item.type] || '#555';
  const name  = (item.name || '').slice(0, 40);
  const sub   = [item.vintage || '', item.appellation || item.origin || ''].filter(Boolean).join(' · ');
  return `
    <div style="width:100%;height:100%;display:flex;flex-direction:column;justify-content:space-between;padding:1mm;box-sizing:border-box;overflow:hidden;">
      <div style="font-size:8pt;font-weight:bold;line-height:1.2;max-height:12mm;overflow:hidden;">${name}</div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:2mm;">
        <span style="font-size:7pt;color:#444;">${sub}</span>
        <span style="font-size:6pt;background:${color};color:#fff;padding:1px 3px;border-radius:2px;white-space:nowrap;">${TYPE_LABEL[item.type] || item.type || ''}</span>
      </div>
    </div>`;
}

function labelHtmlMedium(item, itemType) {
  const color   = TYPE_COLOR_HEX[item.type] || '#555';
  const name    = (item.name || '').slice(0, 50);
  const vintage = item.vintage ? `<span style="font-weight:bold;">${item.vintage}</span>` : '';
  const appel   = item.appellation || item.origin || '';
  const prod    = item.producer || '';
  const qty     = item.quantity != null ? `Qté : <b>${item.quantity}</b>` : '';
  const pos     = item.position ? ` · Pos. ${item.position}` : '';
  return `
    <div style="width:100%;height:100%;display:flex;flex-direction:column;justify-content:space-between;padding:1.5mm;box-sizing:border-box;overflow:hidden;">
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5mm;">
          <span style="font-size:9pt;font-weight:bold;line-height:1.2;max-width:70mm;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${name}</span>
          <span style="font-size:6pt;background:${color};color:#fff;padding:1px 4px;border-radius:2px;flex-shrink:0;">${TYPE_LABEL[item.type] || item.type || ''}</span>
        </div>
        <div style="font-size:7.5pt;color:#333;">${[vintage, appel].filter(Boolean).join(' — ')}</div>
        ${prod ? `<div style="font-size:7pt;color:#666;margin-top:0.5mm;">${prod}</div>` : ''}
      </div>
      <div style="font-size:7pt;color:#555;border-top:0.3mm solid #ddd;padding-top:1mm;">${qty}${pos}</div>
    </div>`;
}

function labelHtmlLarge(item, itemType) {
  const color   = TYPE_COLOR_HEX[item.type] || '#555';
  const name    = (item.name || '').slice(0, 60);
  const vintage = item.vintage || '';
  const appel   = item.appellation || item.origin || '';
  const prod    = item.producer || '';
  const region  = [item.region, item.country].filter(Boolean).join(', ');
  const grapes  = item.grapes || '';
  const qty     = item.quantity != null ? item.quantity : '—';
  const pos     = item.position || '—';
  const price   = item.price ? `${item.price} €` : '—';
  const keep    = item.keep_until || '';
  const notes   = (item.notes || '').slice(0, 80);
  const refId   = `Réf. #${item.id || '?'}`;

  const rows = [
    ['Type',      TYPE_LABEL[item.type] || item.type || '—'],
    ['Millésime', vintage || '—'],
    ['Producteur',prod || '—'],
    ['Région',    region || '—'],
    grapes ? ['Cépages', grapes] : null,
    ['Quantité',  `${qty} bouteille${qty > 1 ? 's' : ''}`],
    ['Position',  pos],
    ['Prix',      price],
    keep ? ['Garder jusqu\'en', keep] : null,
  ].filter(Boolean);

  return `
    <div style="width:100%;height:100%;display:flex;flex-direction:column;padding:2mm;box-sizing:border-box;overflow:hidden;font-size:7.5pt;font-family:Arial,sans-serif;">
      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1.5mm;padding-bottom:1mm;border-bottom:0.4mm solid ${color};">
        <div>
          <div style="font-size:11pt;font-weight:bold;line-height:1.2;max-width:75mm;">${name}</div>
          ${appel ? `<div style="font-size:8pt;color:#555;">${appel}</div>` : ''}
        </div>
        <div style="background:${color};color:#fff;padding:2px 5px;border-radius:3px;font-size:6.5pt;font-weight:bold;white-space:nowrap;">${TYPE_LABEL[item.type] || item.type || ''}</div>
      </div>
      <!-- Grid infos -->
      <table style="width:100%;border-collapse:collapse;flex:1;">
        ${rows.map(([k, v]) => `
          <tr>
            <td style="color:#888;padding:0.4mm 1.5mm 0.4mm 0;white-space:nowrap;font-size:6.5pt;vertical-align:top;">${k}</td>
            <td style="color:#222;padding:0.4mm 0;font-size:7pt;font-weight:500;">${v}</td>
          </tr>`).join('')}
      </table>
      <!-- Notes -->
      ${notes ? `<div style="font-size:6.5pt;color:#666;margin-top:1mm;padding-top:1mm;border-top:0.3mm solid #ddd;font-style:italic;overflow:hidden;max-height:6mm;">${notes}</div>` : ''}
      <!-- Footer -->
      <div style="font-size:6pt;color:#aaa;text-align:right;margin-top:auto;padding-top:1mm;">
        Cave & Vigne · ${refId} · ${new Date().toLocaleDateString('fr-FR')}
      </div>
    </div>`;
}

function labelHtmlA4Grid(item, itemType, count) {
  const single = labelHtmlMedium(item, itemType);
  const labelStyle = `display:inline-block;width:89mm;height:36mm;border:0.3mm solid #ccc;box-sizing:border-box;vertical-align:top;overflow:hidden;page-break-inside:avoid;`;
  const labels = Array.from({ length: count }, (_, i) =>
    `<div style="${labelStyle}">${single}</div>`
  ).join('');
  return `<div style="width:210mm;font-size:0;line-height:0;">${labels}</div>`;
}

// ── Lancer l'impression dans un popup ─────────────────────────────────────────
function doPrint(item, itemType, sizeKey, a4count) {
  const dim = SIZES[sizeKey];
  let bodyHtml, pageSize;

  if (sizeKey === 'a4') {
    bodyHtml = labelHtmlA4Grid(item, itemType, a4count);
    pageSize = '210mm 297mm';
  } else {
    const fn = sizeKey === 's' ? labelHtmlSmall : sizeKey === 'm' ? labelHtmlMedium : labelHtmlLarge;
    bodyHtml = `<div style="width:${dim.w}mm;height:${dim.h}mm;overflow:hidden;">${fn(item, itemType)}</div>`;
    pageSize = `${dim.w}mm ${dim.h}mm`;
  }

  const win = window.open('', '_blank', 'width=700,height=500,menubar=no,toolbar=no');
  if (!win) { alert('Autorisez les popups pour imprimer.'); return; }

  win.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  @page { size: ${pageSize}; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 0; font-family: Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style>
</head>
<body>${bodyHtml}</body>
<script>window.onload = () => { window.print(); setTimeout(() => window.close(), 1000); }<\/script>
</html>`);
  win.document.close();
}

// ── Composant principal ───────────────────────────────────────────────────────
export default function LabelPrinter({ item, itemType = 'wine', onClose }) {
  const [sizeKey, setSizeKey] = useState('m');
  const [a4count, setA4count] = useState(12);

  const dim = SIZES[sizeKey];

  // ── Preview HTML (scaled down for display) ────────────────────────────────
  const previewHtml = useCallback(() => {
    if (sizeKey === 'a4') return labelHtmlA4Grid(item, itemType, Math.min(a4count, 4));
    const fn = sizeKey === 's' ? labelHtmlSmall : sizeKey === 'm' ? labelHtmlMedium : labelHtmlLarge;
    return fn(item, itemType);
  }, [item, itemType, sizeKey, a4count]);

  // Echelle de la preview
  const previewW  = sizeKey === 'a4' ? 210 : dim.w;
  const previewH  = sizeKey === 'a4' ? 160 : dim.h;
  const scaleBase = 220; // px wide in the modal
  const scale     = scaleBase / previewW;

  return (
    <div
      className="modal show d-block"
      style={{ background: 'rgba(0,0,0,0.75)', zIndex: 1070 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 540 }}>
        <div className="modal-content">

          {/* Header */}
          <div className="modal-header">
            <h5 className="modal-title">
              <i className="bi bi-tag me-2" style={{ color: 'var(--cv-gold)' }} />
              Imprimer étiquette
            </h5>
            <button className="btn-close" onClick={onClose} />
          </div>

          <div className="modal-body">
            {/* Nom du produit */}
            <div className="mb-3 d-flex align-items-center gap-2">
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--cv-gold)' }}>{item.name}</span>
              {item.vintage && <span style={{ fontSize: '0.8rem', color: 'var(--cv-text2)' }}>{item.vintage}</span>}
            </div>

            {/* Sélecteur de format */}
            <div className="mb-3">
              <label className="form-label" style={{ fontSize: '0.8rem', color: 'var(--cv-text2)' }}>
                Format d'étiquette
              </label>
              <div className="d-flex flex-wrap gap-2">
                {Object.entries(SIZES).map(([k, s]) => (
                  <button
                    key={k}
                    className={`btn btn-sm ${sizeKey === k ? 'btn-gold' : 'btn-outline-gold'}`}
                    style={{ fontSize: '0.75rem' }}
                    onClick={() => setSizeKey(k)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--cv-text3)', marginTop: 4 }}>
                {dim.desc} — {sizeKey !== 'a4' ? `${dim.w} × ${dim.h} mm` : 'Compatible Brother QL / Dymo 400'}
              </div>
            </div>

            {/* Nombre d'étiquettes pour A4 */}
            {sizeKey === 'a4' && (
              <div className="mb-3 d-flex align-items-center gap-2">
                <label className="form-label mb-0" style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>Nb. d'étiquettes :</label>
                <input
                  type="number" min={1} max={12} value={a4count}
                  onChange={e => setA4count(Math.max(1, Math.min(12, +e.target.value || 1)))}
                  className="form-control form-control-sm"
                  style={{ width: 70 }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--cv-text3)' }}>(max 12 par page)</span>
              </div>
            )}

            {/* Aperçu */}
            <div className="mb-2">
              <label className="form-label" style={{ fontSize: '0.8rem', color: 'var(--cv-text2)' }}>Aperçu</label>
              <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0', background: 'rgba(0,0,0,0.2)', borderRadius: 6 }}>
                <div style={{
                  width:  previewW * scale,
                  height: previewH * scale,
                  overflow: 'hidden',
                  border: '0.5px solid #888',
                  background: '#fff',
                  position: 'relative',
                }}>
                  <div
                    style={{
                      transform: `scale(${scale})`,
                      transformOrigin: 'top left',
                      width: previewW + 'mm',
                      height: previewH + 'mm',
                      fontFamily: 'Arial, sans-serif',
                      color: '#000',
                    }}
                    dangerouslySetInnerHTML={{ __html: previewHtml() }}
                  />
                </div>
              </div>
            </div>

            {/* Conseils imprimante */}
            <div style={{ fontSize: '0.72rem', color: 'var(--cv-text3)', padding: '8px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 6 }}>
              <i className="bi bi-info-circle me-1" />
              <strong>Conseil :</strong> Dans la boîte de dialogue d'impression, sélectionnez votre imprimante d'étiquettes
              et désactivez « Mise à l'échelle » ou choisissez « Taille réelle ».
              {sizeKey === 'm' && ' Compatible Brother QL-800/820, Dymo LabelWriter 400/450.'}
              {sizeKey === 'l' && ' Compatible Brother QL-1110NWB, Zebra ZD421.'}
              {sizeKey === 's' && ' Compatible imprimantes de tickets 58mm.'}
            </div>
          </div>

          {/* Footer */}
          <div className="modal-footer">
            <button className="btn btn-outline-gold" onClick={onClose}>Fermer</button>
            <button
              className="btn btn-gold"
              onClick={() => doPrint(item, itemType, sizeKey, a4count)}
            >
              <i className="bi bi-printer me-1" />
              Imprimer
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
