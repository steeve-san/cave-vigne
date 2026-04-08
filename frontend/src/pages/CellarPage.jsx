// src/pages/CellarPage.jsx — Vue 3D des casiers à vin
// ─────────────────────────────────────────────────────────────────────────────
// Rendu CSS 3D (perspective + rotateX/Y) — aucune dépendance supplémentaire.
// Affiche chaque casier sous forme de grille de cellules.  Chaque cellule est
// soit vide, soit occupée par une bouteille colorée selon le type de vin.
// Clic sur cellule → détail du vin dans un mini-panneau.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useMemo, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { winesAPI } from '../services/api';
import { useLang } from '../context/LangContext';

// ── Config casiers ────────────────────────────────────────────────────────────
const RACK_COLS = 6;   // colonnes par casier
const RACK_ROWS = 5;   // rangées par casier
const CELL_W    = 52;  // px
const CELL_H    = 52;
const RACK_GAP  = 18;

// Couleur par type de vin
const TYPE_COLOR = {
  rouge:     '#8b1a1a',
  blanc:     '#c9a84c',
  rosé:      '#d4687a',
  pétillant: '#4a8cb5',
};

const TYPE_LABEL = {
  rouge: 'Rouge', blanc: 'Blanc', rosé: 'Rosé', pétillant: 'Pétillant',
};

// ── Répartit les bouteilles dans des casiers virtuels ─────────────────────────
function buildRacks(wines) {
  const RACK_SIZE = RACK_COLS * RACK_ROWS;
  const racks = [];
  let rackIdx = 0;
  let cellIdx = 0;

  // Chaque bouteille occupe autant de cellules que sa quantité
  const cells = [];
  wines.filter(w => !w.is_drunk && w.quantity > 0).forEach(wine => {
    for (let i = 0; i < (wine.quantity || 1); i++) {
      cells.push(wine);
    }
  });

  cells.forEach((wine, _i) => {
    if (cellIdx === 0) {
      racks.push(Array(RACK_SIZE).fill(null));
      rackIdx = racks.length - 1;
    }
    racks[rackIdx][cellIdx] = wine;
    cellIdx = (cellIdx + 1) % RACK_SIZE;
  });

  // Ajouter un casier vide si le dernier n'est pas plein, ou un casier vide supplémentaire
  if (!racks.length || racks[racks.length - 1].every(c => c !== null)) {
    racks.push(Array(RACK_SIZE).fill(null));
  }

  return racks;
}

// ── Composant Cellule ─────────────────────────────────────────────────────────
function Cell({ wine, onClick, selected }) {
  const filled = !!wine;
  const color = filled ? (TYPE_COLOR[wine.type] || '#555') : 'transparent';
  const isSelected = selected && wine && selected.id === wine.id;

  return (
    <div
      onClick={() => filled && onClick(wine)}
      style={{
        width: CELL_W, height: CELL_H,
        border: `2px solid ${filled ? color : 'rgba(201,168,76,0.15)'}`,
        borderRadius: 4,
        background: filled
          ? `radial-gradient(circle at 35% 35%, ${lighten(color, 40)}, ${color})`
          : 'rgba(0,0,0,0.25)',
        boxShadow: isSelected
          ? `0 0 0 2px #fff, 0 0 12px ${color}`
          : filled ? `inset 0 2px 4px rgba(255,255,255,0.15), 0 2px 4px rgba(0,0,0,0.4)` : 'none',
        cursor: filled ? 'pointer' : 'default',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column',
        transition: 'box-shadow 0.2s, transform 0.15s',
        transform: isSelected ? 'scale(1.08)' : 'scale(1)',
        position: 'relative',
        overflow: 'hidden',
      }}
      title={filled ? `${wine.name}${wine.vintage ? ' ' + wine.vintage : ''}` : ''}
    >
      {filled && (
        <>
          {/* Neck illusion */}
          <div style={{
            position: 'absolute', top: 4, left: '50%', transform: 'translateX(-50%)',
            width: 10, height: 14,
            background: `rgba(255,255,255,0.18)`,
            borderRadius: '3px 3px 0 0',
          }} />
          {/* Body */}
          <div style={{
            position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)',
            width: 22, height: 26,
            background: `rgba(255,255,255,0.1)`,
            borderRadius: '2px 2px 4px 4px',
          }} />
          {/* Vintage badge */}
          {wine.vintage && (
            <span style={{
              position: 'absolute', bottom: 3, fontSize: 8,
              color: 'rgba(255,255,255,0.75)', letterSpacing: -0.5, fontWeight: 600,
              textShadow: '0 1px 2px rgba(0,0,0,0.6)',
            }}>{wine.vintage}</span>
          )}
        </>
      )}
    </div>
  );
}

// ── Composant Casier 3D ───────────────────────────────────────────────────────
function Rack({ cells, rackIndex, rotX, rotY, selectedWine, onCellClick }) {
  const rackW = RACK_COLS * (CELL_W + 4) + RACK_GAP;
  const rackH = RACK_ROWS * (CELL_H + 4) + RACK_GAP;
  const depth = 38; // px

  return (
    <div style={{
      display: 'inline-block',
      margin: '0 20px 40px',
      perspective: 900,
    }}>
      {/* Rack label */}
      <div style={{
        textAlign: 'center',
        fontSize: '0.7rem',
        color: 'var(--cv-text2)',
        marginBottom: 6,
        letterSpacing: 1,
        textTransform: 'uppercase',
      }}>
        Casier {rackIndex + 1}
      </div>

      {/* 3D container */}
      <div style={{
        position: 'relative',
        width: rackW, height: rackH,
        transformStyle: 'preserve-3d',
        transform: `rotateX(${rotX}deg) rotateY(${rotY}deg)`,
        transition: 'transform 0.08s',
      }}>
        {/* Front face */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, #2a1a0e 0%, #1a0d07 100%)',
          border: '2px solid rgba(201,168,76,0.35)',
          borderRadius: 6,
          display: 'grid',
          gridTemplateColumns: `repeat(${RACK_COLS}, ${CELL_W}px)`,
          gridTemplateRows: `repeat(${RACK_ROWS}, ${CELL_H}px)`,
          gap: 4,
          padding: RACK_GAP / 2,
          backfaceVisibility: 'visible',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        }}>
          {cells.map((wine, i) => (
            <Cell
              key={i}
              wine={wine}
              selected={selectedWine}
              onClick={onCellClick}
            />
          ))}
        </div>

        {/* Top face */}
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: depth,
          background: 'linear-gradient(90deg, #3d2510, #2a1a0e)',
          border: '1px solid rgba(201,168,76,0.2)',
          transform: `rotateX(90deg) translateZ(-${depth}px)`,
          transformOrigin: 'top',
        }} />

        {/* Left side */}
        <div style={{
          position: 'absolute',
          top: 0, left: 0,
          width: depth, height: rackH,
          background: 'linear-gradient(180deg, #3d2510, #2a1a0e)',
          border: '1px solid rgba(201,168,76,0.15)',
          transform: `rotateY(-90deg) translateZ(0px)`,
          transformOrigin: 'left',
        }} />

        {/* Right side */}
        <div style={{
          position: 'absolute',
          top: 0, right: 0,
          width: depth, height: rackH,
          background: 'linear-gradient(180deg, #2a1a0e, #1a0d07)',
          border: '1px solid rgba(201,168,76,0.15)',
          transform: `rotateY(90deg) translateZ(0px)`,
          transformOrigin: 'right',
        }} />

        {/* Bottom */}
        <div style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          height: depth,
          background: '#1a0d07',
          transform: `rotateX(-90deg) translateZ(-${depth}px)`,
          transformOrigin: 'bottom',
        }} />
      </div>
    </div>
  );
}

// ── Lighten hex color ─────────────────────────────────────────────────────────
function lighten(hex, amount) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, (num >> 16) + amount);
  const g = Math.min(255, ((num >> 8) & 0xff) + amount);
  const b = Math.min(255, (num & 0xff) + amount);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function CellarPage() {
  const { t } = useLang();
  const [selectedWine, setSelectedWine] = useState(null);
  // 3D rotation via drag
  const [rot, setRot] = useState({ x: -12, y: 8 });
  const drag = useRef(null);

  const { data: wines = [], isLoading } = useQuery({
    queryKey: ['wines-all-cellar'],
    queryFn: () => winesAPI.list({ limit: 999, status: 'stock' }).then(r => r.data?.wines || r.data || []),
    staleTime: 30_000,
  });

  const racks = useMemo(() => buildRacks(wines), [wines]);

  // Stats for legend
  const stats = useMemo(() => {
    const counts = {};
    wines.filter(w => !w.is_drunk).forEach(w => {
      counts[w.type] = (counts[w.type] || 0) + (w.quantity || 1);
    });
    return counts;
  }, [wines]);

  // ── Mouse drag to rotate ───────────────────────────────────────────────────
  const onMouseDown = useCallback(e => {
    drag.current = { x: e.clientX, y: e.clientY, rot: { ...rot } };
  }, [rot]);

  const onMouseMove = useCallback(e => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    setRot({
      x: Math.max(-35, Math.min(35, drag.current.rot.x - dy * 0.3)),
      y: Math.max(-45, Math.min(45, drag.current.rot.y + dx * 0.3)),
    });
  }, []);

  const onMouseUp = useCallback(() => { drag.current = null; }, []);

  // Touch support
  const touch = useRef(null);
  const onTouchStart = e => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, rot: { ...rot } }; };
  const onTouchMove = e => {
    if (!touch.current) return;
    const dx = e.touches[0].clientX - touch.current.x;
    const dy = e.touches[0].clientY - touch.current.y;
    setRot({
      x: Math.max(-35, Math.min(35, touch.current.rot.x - dy * 0.3)),
      y: Math.max(-45, Math.min(45, touch.current.rot.y + dx * 0.3)),
    });
  };

  const totalBottles = wines.filter(w => !w.is_drunk).reduce((s, w) => s + (w.quantity || 1), 0);

  if (isLoading) return (
    <div className="d-flex justify-content-center align-items-center" style={{ height: 300 }}>
      <div className="spinner-border" style={{ color: 'var(--cv-gold)' }} />
    </div>
  );

  return (
    <div style={{ userSelect: 'none' }}>
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <div>
          <h2 className="font-serif mb-0" style={{ color: 'var(--cv-gold)' }}>
            <i className="bi bi-grid-3x3-gap me-2" />
            Vue 3D de la cave
          </h2>
          <small style={{ color: 'var(--cv-text2)' }}>
            {totalBottles} bouteille{totalBottles > 1 ? 's' : ''} · {racks.length} casier{racks.length > 1 ? 's' : ''}
          </small>
        </div>

        {/* Legend */}
        <div className="d-flex gap-3 flex-wrap">
          {Object.entries(TYPE_COLOR).map(([type, color]) => (
            stats[type] ? (
              <span key={type} className="d-flex align-items-center gap-1" style={{ fontSize: '0.8rem', color: 'var(--cv-text2)' }}>
                <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: color }} />
                {TYPE_LABEL[type]} ({stats[type]})
              </span>
            ) : null
          ))}
        </div>
      </div>

      {/* Hint */}
      <div className="mb-3" style={{ fontSize: '0.78rem', color: 'var(--cv-text3)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <i className="bi bi-arrows-move" />
        Glissez pour faire pivoter · Cliquez sur une bouteille pour les détails
      </div>

      <div className="row g-3">
        {/* ── 3D Cave view ── */}
        <div className="col-12 col-xl-8">
          <div
            className="stat-card"
            style={{ overflow: 'auto', cursor: drag.current ? 'grabbing' : 'grab', padding: '1.5rem' }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={() => { touch.current = null; }}
          >
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'flex-start',
              padding: '20px 10px 10px',
              minHeight: 300,
            }}>
              {racks.map((cells, i) => (
                <Rack
                  key={i}
                  cells={cells}
                  rackIndex={i}
                  rotX={rot.x}
                  rotY={rot.y}
                  selectedWine={selectedWine}
                  onCellClick={setSelectedWine}
                />
              ))}
            </div>

            {/* Angle reset */}
            <div className="text-end mt-1">
              <button
                className="btn btn-sm btn-outline-gold"
                style={{ fontSize: '0.72rem' }}
                onMouseDown={e => e.stopPropagation()}
                onClick={() => setRot({ x: -12, y: 8 })}
              >
                <i className="bi bi-arrow-counterclockwise me-1" />
                Réinitialiser l'angle
              </button>
            </div>
          </div>
        </div>

        {/* ── Detail panel ── */}
        <div className="col-12 col-xl-4">
          <div className="stat-card h-100" style={{ minHeight: 200 }}>
            {selectedWine ? (
              <WineDetail wine={selectedWine} onClose={() => setSelectedWine(null)} />
            ) : (
              <div className="d-flex flex-column align-items-center justify-content-center h-100 text-center"
                style={{ color: 'var(--cv-text3)', padding: '2rem', minHeight: 200 }}>
                <i className="bi bi-hand-index" style={{ fontSize: '2rem', marginBottom: 8 }} />
                <p style={{ fontSize: '0.85rem', margin: 0 }}>Cliquez sur une bouteille pour voir les détails</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Wine detail panel ─────────────────────────────────────────────────────────
function WineDetail({ wine, onClose }) {
  const color = TYPE_COLOR[wine.type] || '#555';

  return (
    <div style={{ padding: '0.5rem 0.25rem' }}>
      <div className="d-flex align-items-start justify-content-between mb-2">
        <span
          style={{
            display: 'inline-block', padding: '2px 8px', borderRadius: 4,
            background: color, color: '#fff', fontSize: '0.7rem', fontWeight: 600,
          }}
        >
          {TYPE_LABEL[wine.type] || wine.type}
        </span>
        <button className="btn btn-sm" style={{ color: 'var(--cv-text3)', padding: '0 4px' }} onClick={onClose}>
          <i className="bi bi-x-lg" />
        </button>
      </div>

      <h5 className="font-serif mb-0" style={{ color: 'var(--cv-gold)', lineHeight: 1.3 }}>
        {wine.name}
      </h5>
      {wine.vintage && (
        <div style={{ fontSize: '0.9rem', color: 'var(--cv-text2)', marginBottom: 4 }}>{wine.vintage}</div>
      )}

      {wine.label_image && (
        <div className="text-center mb-2">
          <img
            src={wine.label_image} alt="étiquette"
            style={{ maxHeight: 120, maxWidth: '100%', borderRadius: 4, objectFit: 'contain' }}
          />
        </div>
      )}

      <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
        {[
          ['Producteur', wine.producer],
          ['Appellation', wine.appellation],
          ['Région', wine.region],
          ['Pays', wine.country],
          ['Cépages', wine.grapes],
          ['Position', wine.position],
          ['En cave', `${wine.quantity} bouteille${wine.quantity > 1 ? 's' : ''}`],
          ['Prix', wine.price ? `${wine.price} €` : null],
          ["Garder jusqu'en", wine.keep_until || null],
        ].filter(([, v]) => v).map(([label, value]) => (
          <tr key={label} style={{ borderBottom: '0.5px solid var(--cv-border)' }}>
            <td style={{ color: 'var(--cv-text3)', paddingBlock: 4, paddingRight: 8, whiteSpace: 'nowrap' }}>{label}</td>
            <td style={{ color: 'var(--cv-text)', paddingBlock: 4 }}>{value}</td>
          </tr>
        ))}
      </table>

      {wine.notes && (
        <div style={{ marginTop: 8, padding: 8, background: 'rgba(0,0,0,0.2)', borderRadius: 4, fontSize: '0.8rem', color: 'var(--cv-text2)', fontStyle: 'italic' }}>
          {wine.notes}
        </div>
      )}
    </div>
  );
}
