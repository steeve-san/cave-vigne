// src/pages/CellarPage.jsx — Vue 3D des casiers à vin
// ─────────────────────────────────────────────────────────────────────────────
// Fonctionnalités :
//   • Choix du type de cave (Casier / Conservation / Vieillissement / Polyvalente)
//   • Édition des dimensions de chaque casier (colonnes × rangées)
//   • Mode déplacement : clic source → clic destination pour échanger des bouteilles
//   • Layout persisté en localStorage, synchronisé avec les vins de la cave
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { winesAPI } from '../services/api';
import { useLang } from '../context/LangContext';

// ── Constants ─────────────────────────────────────────────────────────────────
const CELL_W   = 52;
const CELL_H   = 52;
const RACK_GAP = 18;
const DEPTH    = 38;

const TYPE_COLOR = {
  rouge: '#8b1a1a', blanc: '#c9a84c', rosé: '#d4687a', pétillant: '#4a8cb5',
};
const TYPE_LABEL = {
  rouge: 'Rouge', blanc: 'Blanc', rosé: 'Rosé', pétillant: 'Pétillant',
};

const CAVE_TYPES = [
  { id: 'casier',         label: 'Casier',         icon: 'bi-grid-3x3-gap',     desc: 'Rangement standard en casiers' },
  { id: 'conservation',   label: 'Conservation',   icon: 'bi-thermometer-snow', desc: 'Cave de conservation long terme' },
  { id: 'vieillissement', label: 'Vieillissement',  icon: 'bi-hourglass-split',  desc: 'Cave de vieillissement / élevage' },
  { id: 'polyvalente',    label: 'Polyvalente',    icon: 'bi-layout-split',     desc: 'Cave polyvalente mixte' },
];

const DEFAULT_COLS = 6;
const DEFAULT_ROWS = 5;
const defaultSize = () => ({ cols: DEFAULT_COLS, rows: DEFAULT_ROWS });

// ── LocalStorage helpers ──────────────────────────────────────────────────────
const LS = {
  get: (k, fb) => { try { const v = localStorage.getItem(k); return v !== null ? JSON.parse(v) : fb; } catch { return fb; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ── Color utils ───────────────────────────────────────────────────────────────
function lighten(hex, amount) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, (n >> 16) + amount);
  const g = Math.min(255, ((n >> 8) & 0xff) + amount);
  const b = Math.min(255, (n & 0xff) + amount);
  return `#${[r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')}`;
}

// ── Sync layout with actual wine data ─────────────────────────────────────────
// Preserves manual positions, adds new wines, removes stale ones.
function syncLayout(wines, savedLayout, savedSizes) {
  const active = wines.filter(w => !w.is_drunk && w.quantity > 0);

  // Flat list: one wineId per bottle unit
  const needed = [];
  active.forEach(w => { for (let i = 0; i < (w.quantity || 1); i++) needed.push(w.id); });

  // ── Fresh build (no saved layout) ─────────────────────────────────────────
  if (!savedLayout?.length) {
    const sizes = savedSizes?.length ? [...savedSizes] : [];
    const layout = [];
    let placed = 0, ri = 0;

    while (placed < needed.length) {
      const sz = sizes[ri] ?? defaultSize();
      if (!sizes[ri]) sizes.push(sz);
      const cap = sz.cols * sz.rows;
      const rack = Array(cap).fill(null);
      const n = Math.min(cap, needed.length - placed);
      for (let i = 0; i < n; i++) rack[i] = needed[placed + i];
      layout.push(rack);
      placed += n;
      ri++;
    }
    // Trailing empty rack
    const empSz = sizes[ri] ?? defaultSize();
    if (!sizes[ri]) sizes.push(empSz);
    layout.push(Array(empSz.cols * empSz.rows).fill(null));
    return { layout, rackSizes: sizes };
  }

  // ── Incremental sync ──────────────────────────────────────────────────────
  const lyt = savedLayout.map(r => [...r]);
  const szs = lyt.map((_, i) => savedSizes?.[i] ?? defaultSize());

  const expCount = {};
  needed.forEach(id => { expCount[id] = (expCount[id] || 0) + 1; });

  const inCount = {};
  lyt.forEach(rack => rack.forEach(id => { if (id != null) inCount[id] = (inCount[id] || 0) + 1; }));

  // Remove stale/excess entries
  lyt.forEach((rack, ri) => rack.forEach((id, ci) => {
    if (id == null) return;
    if (!expCount[id] || (inCount[id] || 0) > expCount[id]) {
      lyt[ri][ci] = null;
      if (inCount[id]) inCount[id]--;
    }
  }));

  // Collect missing entries
  const toAdd = [];
  Object.entries(expCount).forEach(([id, cnt]) => {
    const have = inCount[+id] || 0;
    for (let i = have; i < cnt; i++) toAdd.push(+id);
  });

  // Fill empty slots
  let ai = 0;
  for (let ri = 0; ri < lyt.length && ai < toAdd.length; ri++)
    for (let ci = 0; ci < lyt[ri].length && ai < toAdd.length; ci++)
      if (lyt[ri][ci] == null) lyt[ri][ci] = toAdd[ai++];

  // Overflow → new racks
  while (ai < toAdd.length) {
    const sz = defaultSize(); szs.push(sz);
    const rack = Array(sz.cols * sz.rows).fill(null);
    const n = Math.min(rack.length, toAdd.length - ai);
    for (let i = 0; i < n; i++) rack[i] = toAdd[ai++];
    lyt.push(rack);
  }

  // Ensure trailing rack has at least one empty slot
  if (!lyt.length || lyt[lyt.length - 1].every(c => c != null)) {
    const sz = defaultSize(); szs.push(sz);
    lyt.push(Array(sz.cols * sz.rows).fill(null));
  }

  return { layout: lyt, rackSizes: szs };
}

// ── Cell ──────────────────────────────────────────────────────────────────────
function Cell({ wine, isSelected, isMoveSource, moveMode, isEmpty, onClick }) {
  const color  = wine ? (TYPE_COLOR[wine.type] || '#555') : 'transparent';
  const filled = !!wine;

  let border = `2px solid ${filled ? color : 'rgba(201,168,76,0.15)'}`;
  let shadow = filled ? 'inset 0 2px 4px rgba(255,255,255,0.15), 0 2px 4px rgba(0,0,0,0.4)' : 'none';
  let bg     = filled
    ? `radial-gradient(circle at 35% 35%, ${lighten(color, 40)}, ${color})`
    : 'rgba(0,0,0,0.25)';

  if (isSelected)    shadow = `0 0 0 2px #fff, 0 0 12px ${color}`;
  if (isMoveSource)  { border = '2px solid #fff'; shadow = '0 0 0 3px rgba(255,255,255,0.5), 0 0 16px rgba(255,255,255,0.25)'; }
  if (moveMode && isEmpty) { bg = 'rgba(201,168,76,0.07)'; border = '2px dashed rgba(201,168,76,0.3)'; }

  return (
    <div
      onClick={onClick}
      style={{
        width: CELL_W, height: CELL_H,
        border, borderRadius: 4, background: bg, boxShadow: shadow,
        cursor: (filled || (moveMode && isEmpty)) ? 'pointer' : 'default',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column',
        transition: 'box-shadow 0.2s, transform 0.15s',
        transform: isSelected ? 'scale(1.08)' : 'scale(1)',
        position: 'relative', overflow: 'hidden',
      }}
      title={filled ? `${wine.name}${wine.vintage ? ' ' + wine.vintage : ''}` : (moveMode ? 'Déposer ici' : '')}
    >
      {filled && (
        <>
          <div style={{ position:'absolute', top:4, left:'50%', transform:'translateX(-50%)', width:10, height:14, background:'rgba(255,255,255,0.18)', borderRadius:'3px 3px 0 0' }} />
          <div style={{ position:'absolute', bottom:4, left:'50%', transform:'translateX(-50%)', width:22, height:26, background:'rgba(255,255,255,0.1)', borderRadius:'2px 2px 4px 4px' }} />
          {wine.vintage && (
            <span style={{ position:'absolute', bottom:3, fontSize:8, color:'rgba(255,255,255,0.75)', letterSpacing:-0.5, fontWeight:600, textShadow:'0 1px 2px rgba(0,0,0,0.6)' }}>
              {wine.vintage}
            </span>
          )}
        </>
      )}
    </div>
  );
}

// ── Rack 3D ───────────────────────────────────────────────────────────────────
function Rack({
  cells, wineMap, rackIndex, cols, rows, rotX, rotY,
  selectedWine, onCellClick, moveMode, moveSource,
  onEditSize, editingRack, onConfirmEditSize, onCancelEdit,
  editCols, editRows, setEditCols, setEditRows,
}) {
  const rackW  = cols * (CELL_W + 4) + RACK_GAP;
  const rackH  = rows * (CELL_H + 4) + RACK_GAP;
  const isEdit = editingRack === rackIndex;

  return (
    <div style={{ display:'inline-block', margin:'0 20px 40px', perspective:900 }}>
      {/* Label / inline editor */}
      <div style={{ textAlign:'center', fontSize:'0.7rem', color:'var(--cv-text2)', marginBottom:6, letterSpacing:1, textTransform:'uppercase', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
        {isEdit ? (
          <div style={{ display:'flex', alignItems:'center', gap:4 }} onMouseDown={e => e.stopPropagation()}>
            <input
              type="number" min={1} max={24} value={editCols}
              onChange={e => setEditCols(Math.max(1, Math.min(24, +e.target.value || 1)))}
              style={{ width:40, padding:'1px 4px', fontSize:'0.72rem', background:'var(--cv-bg3)', border:'1px solid var(--cv-gold)', borderRadius:3, color:'var(--cv-text)', textAlign:'center' }}
              title="Colonnes (largeur)"
            />
            <span style={{ color:'var(--cv-text3)' }}>×</span>
            <input
              type="number" min={1} max={24} value={editRows}
              onChange={e => setEditRows(Math.max(1, Math.min(24, +e.target.value || 1)))}
              style={{ width:40, padding:'1px 4px', fontSize:'0.72rem', background:'var(--cv-bg3)', border:'1px solid var(--cv-gold)', borderRadius:3, color:'var(--cv-text)', textAlign:'center' }}
              title="Rangées (hauteur)"
            />
            <button
              className="btn btn-sm"
              style={{ padding:'1px 7px', fontSize:'0.7rem', background:'var(--cv-gold)', color:'#1a0d07', border:'none', borderRadius:3, fontWeight:600 }}
              onClick={() => onConfirmEditSize(rackIndex)}
            >✓</button>
            <button
              className="btn btn-sm"
              style={{ padding:'1px 6px', fontSize:'0.7rem', background:'transparent', color:'var(--cv-text3)', border:'1px solid var(--cv-border)', borderRadius:3 }}
              onClick={onCancelEdit}
            >✕</button>
          </div>
        ) : (
          <>
            <span>Casier {rackIndex + 1} · {cols}×{rows}</span>
            <button
              className="btn btn-sm"
              style={{ padding:'0 4px', fontSize:'0.65rem', color:'var(--cv-text3)', background:'transparent', border:'none', lineHeight:1, opacity:0.7 }}
              onMouseDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onEditSize(rackIndex, cols, rows); }}
              title="Modifier les dimensions du casier"
            >
              <i className="bi bi-pencil" />
            </button>
          </>
        )}
      </div>

      {/* 3D container */}
      <div style={{
        position:'relative', width:rackW, height:rackH,
        transformStyle:'preserve-3d',
        transform:`rotateX(${rotX}deg) rotateY(${rotY}deg)`,
        transition:'transform 0.08s',
      }}>
        {/* Front face */}
        <div style={{
          position:'absolute', inset:0,
          background:'linear-gradient(180deg, #2a1a0e 0%, #1a0d07 100%)',
          border:'2px solid rgba(201,168,76,0.35)', borderRadius:6,
          display:'grid',
          gridTemplateColumns:`repeat(${cols}, ${CELL_W}px)`,
          gridTemplateRows:`repeat(${rows}, ${CELL_H}px)`,
          gap:4, padding:RACK_GAP / 2,
          boxShadow:'0 8px 32px rgba(0,0,0,0.6)',
        }}>
          {cells.map((wineId, i) => {
            const wine    = wineId != null ? wineMap[wineId] : null;
            const isSrc   = moveSource?.rackIdx === rackIndex && moveSource?.cellIdx === i;
            const isSel   = !moveMode && selectedWine && wine && selectedWine.id === wine.id;
            return (
              <Cell
                key={i}
                wine={wine}
                isSelected={isSel}
                isMoveSource={isSrc}
                moveMode={moveMode}
                isEmpty={wineId == null}
                onClick={() => onCellClick(rackIndex, i, wine)}
              />
            );
          })}
        </div>

        {/* Top */}
        <div style={{ position:'absolute', top:0, left:0, right:0, height:DEPTH, background:'linear-gradient(90deg, #3d2510, #2a1a0e)', border:'1px solid rgba(201,168,76,0.2)', transform:`rotateX(90deg) translateZ(-${DEPTH}px)`, transformOrigin:'top' }} />
        {/* Left */}
        <div style={{ position:'absolute', top:0, left:0, width:DEPTH, height:rackH, background:'linear-gradient(180deg, #3d2510, #2a1a0e)', border:'1px solid rgba(201,168,76,0.15)', transform:`rotateY(-90deg) translateZ(0px)`, transformOrigin:'left' }} />
        {/* Right */}
        <div style={{ position:'absolute', top:0, right:0, width:DEPTH, height:rackH, background:'linear-gradient(180deg, #2a1a0e, #1a0d07)', border:'1px solid rgba(201,168,76,0.15)', transform:`rotateY(90deg) translateZ(0px)`, transformOrigin:'right' }} />
        {/* Bottom */}
        <div style={{ position:'absolute', bottom:0, left:0, right:0, height:DEPTH, background:'#1a0d07', transform:`rotateX(-90deg) translateZ(-${DEPTH}px)`, transformOrigin:'bottom' }} />
      </div>
    </div>
  );
}

// ── CellarPage ────────────────────────────────────────────────────────────────
export default function CellarPage() {
  const { t } = useLang();

  // ── Persisted state ─────────────────────────────────────────────────────────
  const [caveType,   setCaveTypeRaw]   = useState(() => LS.get('cellar_caveType',   'casier'));
  const [rackSizes,  setRackSizesRaw]  = useState(() => LS.get('cellar_rackSizes',  []));
  const [layout,     setLayoutRaw]     = useState(() => LS.get('cellar_layout',     null));

  const setCaveType  = v => { setCaveTypeRaw(v);  LS.set('cellar_caveType',  v); };
  const setRackSizes = v => { setRackSizesRaw(v); LS.set('cellar_rackSizes', v); };
  const setLayout    = v => { setLayoutRaw(v);    LS.set('cellar_layout',    v); };

  // ── UI state ────────────────────────────────────────────────────────────────
  const [rot,          setRot]          = useState({ x: -12, y: 8 });
  const [selectedWine, setSelectedWine] = useState(null);
  const [moveMode,     setMoveMode]     = useState(false);
  const [moveSource,   setMoveSource]   = useState(null);  // {rackIdx, cellIdx}
  const [editingRack,  setEditingRack]  = useState(null);  // rack index
  const [editCols,     setEditCols]     = useState(DEFAULT_COLS);
  const [editRows,     setEditRows]     = useState(DEFAULT_ROWS);

  const drag  = useRef(null);
  const touch = useRef(null);
  const layoutRef    = useRef(layout);
  const rackSizesRef = useRef(rackSizes);
  layoutRef.current    = layout;
  rackSizesRef.current = rackSizes;

  // ── Wines query ─────────────────────────────────────────────────────────────
  const { data: wines = [], isLoading } = useQuery({
    queryKey: ['wines-all-cellar'],
    queryFn: () => winesAPI.list({ limit: 999, status: 'stock' }).then(r => r.data?.wines || r.data || []),
    staleTime: 30_000,
  });

  // ── Sync layout with API data ───────────────────────────────────────────────
  useEffect(() => {
    if (isLoading) return;
    const { layout: nl, rackSizes: ns } = syncLayout(wines, layoutRef.current, rackSizesRef.current);
    setLayout(nl);
    setRackSizes(ns);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wines, isLoading]);

  // ── Wine lookup map ─────────────────────────────────────────────────────────
  const wineMap = useMemo(() => {
    const m = {};
    wines.forEach(w => { m[w.id] = w; });
    return m;
  }, [wines]);

  const totalBottles = useMemo(() =>
    wines.filter(w => !w.is_drunk).reduce((s, w) => s + (w.quantity || 1), 0), [wines]);

  const stats = useMemo(() => {
    const c = {};
    wines.filter(w => !w.is_drunk).forEach(w => { c[w.type] = (c[w.type] || 0) + (w.quantity || 1); });
    return c;
  }, [wines]);

  const currentCaveType = CAVE_TYPES.find(c => c.id === caveType) || CAVE_TYPES[0];

  // ── Cell click ──────────────────────────────────────────────────────────────
  const handleCellClick = useCallback((rackIdx, cellIdx, wine) => {
    if (moveMode) {
      if (!moveSource) {
        if (wine) setMoveSource({ rackIdx, cellIdx });
      } else {
        if (moveSource.rackIdx === rackIdx && moveSource.cellIdx === cellIdx) {
          setMoveSource(null);
        } else {
          const nl = layoutRef.current.map(r => [...r]);
          const srcId = nl[moveSource.rackIdx][moveSource.cellIdx];
          const dstId = nl[rackIdx][cellIdx];
          nl[moveSource.rackIdx][moveSource.cellIdx] = dstId;
          nl[rackIdx][cellIdx] = srcId;
          setLayout(nl);
          setMoveSource(null);
        }
      }
    } else {
      if (wine) setSelectedWine(prev => prev?.id === wine.id ? null : wine);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveMode, moveSource]);

  // ── Rack size editing ───────────────────────────────────────────────────────
  const handleEditSize = useCallback((rackIdx, cols, rows) => {
    setEditingRack(rackIdx);
    setEditCols(cols);
    setEditRows(rows);
  }, []);

  const handleConfirmEditSize = useCallback((rackIdx) => {
    const newCols = Math.max(1, Math.min(24, editCols));
    const newRows = Math.max(1, Math.min(24, editRows));
    const newCap  = newCols * newRows;
    const oldRack = layoutRef.current[rackIdx] || [];
    const newRack = Array(newCap).fill(null);

    // Keep cells that fit; collect overflow
    const overflow = [];
    oldRack.forEach((id, i) => {
      if (i < newCap) newRack[i] = id;
      else if (id != null) overflow.push(id);
    });

    const nl  = layoutRef.current.map(r => [...r]);
    const ns  = [...rackSizesRef.current];
    nl[rackIdx] = newRack;
    ns[rackIdx] = { cols: newCols, rows: newRows };

    // Place overflow in first available empty slots
    let oi = 0;
    for (let ri = 0; ri < nl.length && oi < overflow.length; ri++) {
      if (ri === rackIdx) continue;
      for (let ci = 0; ci < nl[ri].length && oi < overflow.length; ci++) {
        if (nl[ri][ci] == null) nl[ri][ci] = overflow[oi++];
      }
    }
    // Still overflow → new rack
    if (oi < overflow.length) {
      const sz = defaultSize(); ns.push(sz);
      const extra = Array(sz.cols * sz.rows).fill(null);
      for (let i = 0; i < overflow.length - oi; i++) extra[i] = overflow[oi + i];
      nl.push(extra);
    }

    setRackSizes(ns);
    setLayout(nl);
    setEditingRack(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editCols, editRows]);

  // ── 3D rotation ─────────────────────────────────────────────────────────────
  const onMouseDown = useCallback(e => { drag.current = { x: e.clientX, y: e.clientY, rot: { ...rot } }; }, [rot]);
  const onMouseMove = useCallback(e => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
    setRot({ x: Math.max(-35, Math.min(35, drag.current.rot.x - dy * 0.3)), y: Math.max(-45, Math.min(45, drag.current.rot.y + dx * 0.3)) });
  }, []);
  const onMouseUp = useCallback(() => { drag.current = null; }, []);
  const onTouchStart = e => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, rot: { ...rot } }; };
  const onTouchMove  = e => {
    if (!touch.current) return;
    const dx = e.touches[0].clientX - touch.current.x, dy = e.touches[0].clientY - touch.current.y;
    setRot({ x: Math.max(-35, Math.min(35, touch.current.rot.x - dy * 0.3)), y: Math.max(-45, Math.min(45, touch.current.rot.y + dx * 0.3)) });
  };

  if (isLoading) return (
    <div className="d-flex justify-content-center align-items-center" style={{ height: 300 }}>
      <div className="spinner-border" style={{ color: 'var(--cv-gold)' }} />
    </div>
  );

  const racksCount = layout?.length || 0;

  return (
    <div style={{ userSelect: 'none' }}>

      {/* ── Type de cave ────────────────────────────────────────────────────── */}
      <div className="mb-3 d-flex align-items-center gap-2 flex-wrap">
        <span style={{ fontSize:'0.75rem', color:'var(--cv-text3)', letterSpacing:1, textTransform:'uppercase' }}>Type :</span>
        {CAVE_TYPES.map(ct => (
          <button
            key={ct.id}
            className={`btn btn-sm ${caveType === ct.id ? 'btn-gold' : 'btn-outline-gold'}`}
            style={{ fontSize:'0.78rem', fontWeight: caveType === ct.id ? 600 : 400 }}
            onClick={() => setCaveType(ct.id)}
            title={ct.desc}
          >
            <i className={`bi ${ct.icon} me-1`} />
            {ct.label}
          </button>
        ))}
      </div>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <div>
          <h2 className="font-serif mb-0" style={{ color: 'var(--cv-gold)' }}>
            <i className={`bi ${currentCaveType.icon} me-2`} />
            {currentCaveType.desc}
          </h2>
          <small style={{ color: 'var(--cv-text2)' }}>
            {totalBottles} bouteille{totalBottles > 1 ? 's' : ''} · {racksCount} casier{racksCount > 1 ? 's' : ''}
          </small>
        </div>

        {/* Legend */}
        <div className="d-flex gap-3 flex-wrap">
          {Object.entries(TYPE_COLOR).map(([type, color]) =>
            stats[type] ? (
              <span key={type} className="d-flex align-items-center gap-1" style={{ fontSize:'0.8rem', color:'var(--cv-text2)' }}>
                <span style={{ display:'inline-block', width:12, height:12, borderRadius:3, background:color }} />
                {TYPE_LABEL[type]} ({stats[type]})
              </span>
            ) : null
          )}
        </div>
      </div>

      {/* ── Action bar ──────────────────────────────────────────────────────── */}
      <div className="mb-3 d-flex align-items-center gap-2 flex-wrap" style={{ fontSize:'0.78rem', color:'var(--cv-text3)' }}>
        <button
          className={`btn btn-sm ${moveMode ? 'btn-gold' : 'btn-outline-gold'}`}
          style={{ fontSize:'0.78rem' }}
          onClick={() => { setMoveMode(m => !m); setMoveSource(null); setSelectedWine(null); }}
        >
          <i className="bi bi-arrows-move me-1" />
          {moveMode ? 'Terminer le déplacement' : 'Déplacer des bouteilles'}
        </button>

        {moveMode ? (
          <span style={{ color: moveSource ? 'var(--cv-gold)' : 'var(--cv-text3)' }}>
            <i className="bi bi-info-circle me-1" />
            {moveSource
              ? 'Cliquez sur la cellule de destination (ou la même pour annuler)'
              : 'Cliquez sur une bouteille à déplacer'}
          </span>
        ) : (
          <span>
            <i className="bi bi-arrows-move me-1" />
            Glissez pour faire pivoter · Cliquez sur une bouteille pour les détails ·{' '}
            <i className="bi bi-pencil me-1" />
            Crayon pour modifier les dimensions d'un casier
          </span>
        )}
      </div>

      <div className="row g-3">
        {/* ── Vue 3D ──────────────────────────────────────────────────────────── */}
        <div className="col-12 col-xl-8">
          <div
            className="stat-card"
            style={{ overflow:'auto', cursor: !moveMode ? (drag.current ? 'grabbing' : 'grab') : 'default', padding:'1.5rem' }}
            onMouseDown={!moveMode ? onMouseDown : undefined}
            onMouseMove={!moveMode ? onMouseMove : undefined}
            onMouseUp={!moveMode ? onMouseUp : undefined}
            onMouseLeave={!moveMode ? onMouseUp : undefined}
            onTouchStart={!moveMode ? onTouchStart : undefined}
            onTouchMove={!moveMode ? onTouchMove : undefined}
            onTouchEnd={!moveMode ? () => { touch.current = null; } : undefined}
          >
            <div style={{ display:'flex', flexWrap:'wrap', justifyContent:'flex-start', padding:'20px 10px 10px', minHeight:300 }}>
              {(layout || []).map((cells, i) => {
                const sz = rackSizes[i] || defaultSize();
                return (
                  <Rack
                    key={i}
                    cells={cells}
                    wineMap={wineMap}
                    rackIndex={i}
                    cols={sz.cols}
                    rows={sz.rows}
                    rotX={rot.x}
                    rotY={rot.y}
                    selectedWine={selectedWine}
                    onCellClick={handleCellClick}
                    moveMode={moveMode}
                    moveSource={moveSource}
                    onEditSize={handleEditSize}
                    editingRack={editingRack}
                    onConfirmEditSize={handleConfirmEditSize}
                    onCancelEdit={() => setEditingRack(null)}
                    editCols={editCols}
                    editRows={editRows}
                    setEditCols={setEditCols}
                    setEditRows={setEditRows}
                  />
                );
              })}
            </div>

            <div className="text-end mt-1">
              <button
                className="btn btn-sm btn-outline-gold"
                style={{ fontSize:'0.72rem' }}
                onMouseDown={e => e.stopPropagation()}
                onClick={() => setRot({ x: -12, y: 8 })}
              >
                <i className="bi bi-arrow-counterclockwise me-1" />
                Réinitialiser l'angle
              </button>
            </div>
          </div>
        </div>

        {/* ── Panneau détail ───────────────────────────────────────────────────── */}
        <div className="col-12 col-xl-4">
          <div className="stat-card h-100" style={{ minHeight: 200 }}>
            {selectedWine && !moveMode ? (
              <WineDetail wine={selectedWine} onClose={() => setSelectedWine(null)} />
            ) : (
              <div
                className="d-flex flex-column align-items-center justify-content-center h-100 text-center"
                style={{ color:'var(--cv-text3)', padding:'2rem', minHeight:200 }}
              >
                {moveMode ? (
                  <>
                    <i className="bi bi-arrows-move" style={{ fontSize:'2rem', marginBottom:8 }} />
                    <p style={{ fontSize:'0.85rem', margin:0 }}>
                      {moveSource
                        ? 'Cliquez sur la cellule de destination'
                        : 'Cliquez sur une bouteille pour la sélectionner'}
                    </p>
                  </>
                ) : (
                  <>
                    <i className="bi bi-hand-index" style={{ fontSize:'2rem', marginBottom:8 }} />
                    <p style={{ fontSize:'0.85rem', margin:0 }}>Cliquez sur une bouteille pour voir les détails</p>
                  </>
                )}
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
    <div style={{ padding:'0.5rem 0.25rem' }}>
      <div className="d-flex align-items-start justify-content-between mb-2">
        <span style={{ display:'inline-block', padding:'2px 8px', borderRadius:4, background:color, color:'#fff', fontSize:'0.7rem', fontWeight:600 }}>
          {TYPE_LABEL[wine.type] || wine.type}
        </span>
        <button className="btn btn-sm" style={{ color:'var(--cv-text3)', padding:'0 4px' }} onClick={onClose}>
          <i className="bi bi-x-lg" />
        </button>
      </div>

      <h5 className="font-serif mb-0" style={{ color:'var(--cv-gold)', lineHeight:1.3 }}>{wine.name}</h5>
      {wine.vintage && <div style={{ fontSize:'0.9rem', color:'var(--cv-text2)', marginBottom:4 }}>{wine.vintage}</div>}

      {wine.label_image && (
        <div className="text-center mb-2">
          <img src={wine.label_image} alt="étiquette" style={{ maxHeight:120, maxWidth:'100%', borderRadius:4, objectFit:'contain' }} />
        </div>
      )}

      <table style={{ width:'100%', fontSize:'0.82rem', borderCollapse:'collapse' }}>
        {[
          ['Producteur',   wine.producer],
          ['Appellation',  wine.appellation],
          ['Région',       wine.region],
          ['Pays',         wine.country],
          ['Cépages',      wine.grapes],
          ['Position',     wine.position],
          ['En cave',      `${wine.quantity} bouteille${wine.quantity > 1 ? 's' : ''}`],
          ['Prix',         wine.price ? `${wine.price} €` : null],
          ["Garder jusqu'en", wine.keep_until || null],
        ].filter(([, v]) => v).map(([label, value]) => (
          <tr key={label} style={{ borderBottom:'0.5px solid var(--cv-border)' }}>
            <td style={{ color:'var(--cv-text3)', paddingBlock:4, paddingRight:8, whiteSpace:'nowrap' }}>{label}</td>
            <td style={{ color:'var(--cv-text)', paddingBlock:4 }}>{value}</td>
          </tr>
        ))}
      </table>

      {wine.notes && (
        <div style={{ marginTop:8, padding:8, background:'rgba(0,0,0,0.2)', borderRadius:4, fontSize:'0.8rem', color:'var(--cv-text2)', fontStyle:'italic' }}>
          {wine.notes}
        </div>
      )}
    </div>
  );
}
