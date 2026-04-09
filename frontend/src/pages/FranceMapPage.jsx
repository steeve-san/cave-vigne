// src/pages/FranceMapPage.jsx — Carte vignobles France v2
// ─────────────────────────────────────────────────────────────────────────────
// • 16 régions viticoles avec contours GeoJSON
// • Zoom / pan D3 natif (molette + drag)
// • Filtres : type de vin | cépage | "Ma cave"
// • Overlay des domaines présents en cave (épingles dorées)
// • Panel détail cliquable : AOC, cépages, vos bouteilles, analyse IA
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { winesAPI, sommelierAPI } from '../services/api';
import { useLang } from '../context/LangContext';
import * as d3 from 'd3';
import toast from 'react-hot-toast';

// ── 16 régions viticoles ──────────────────────────────────────────────────────
const FR_REGIONS = [
  {
    id: 'bordeaux', name: 'Bordeaux', num: 2, lon: -0.57, lat: 44.84,
    col: '#8B1A1A', type: 'rouge',
    grapes: ['Cabernet Sauvignon', 'Merlot', 'Cabernet Franc', 'Petit Verdot'],
    aoc: ['Pauillac', 'Saint-Émilion', 'Pomerol', 'Graves', 'Médoc', 'Pessac-Léognan'],
    nota: "1ers crus, rive gauche & droite. Plus grand vignoble AOC de France.",
    keywords: ['bordeaux', 'pauillac', 'saint-émilion', 'graves', 'médoc', 'pomerol', 'gironde'],
  },
  {
    id: 'bourgogne', name: 'Bourgogne', num: 4, lon: 4.83, lat: 47.05,
    col: '#9A2A2A', type: 'rouge',
    grapes: ['Pinot Noir', 'Chardonnay', 'Aligoté', 'Gamay'],
    aoc: ['Gevrey-Chambertin', 'Meursault', 'Chablis', 'Côte de Nuits', 'Côte de Beaune'],
    nota: 'Grands crus mythiques — Romanée-Conti, Montrachet, Chambolle-Musigny.',
    keywords: ['bourgogne', 'chablis', "côte d'or", 'nuits', 'beaune', 'mâcon'],
  },
  {
    id: 'champagne', name: 'Champagne', num: 10, lon: 4.03, lat: 49.05,
    col: '#1A3A7A', type: 'pétillant',
    grapes: ['Chardonnay', 'Pinot Noir', 'Pinot Meunier'],
    aoc: ['Champagne AOC', 'Blanc de Blancs', 'Blanc de Noirs', 'Rosé de Saignée'],
    nota: 'Méthode champenoise. Reims, Épernay, Aÿ.',
    keywords: ['champagne', 'reims', 'épernay', 'marne'],
  },
  {
    id: 'alsace', name: 'Alsace', num: 1, lon: 7.45, lat: 48.30,
    col: '#6A7A20', type: 'blanc',
    grapes: ['Riesling', 'Gewürztraminer', 'Pinot Gris', 'Sylvaner', 'Muscat'],
    aoc: ['Alsace AOC', 'Alsace Grand Cru', 'Crémant d\'Alsace'],
    nota: 'Vins aromatiques et secs. Route des vins de Strasbourg à Mulhouse.',
    keywords: ['alsace', 'riesling', 'strasbourg', 'haut-rhin', 'bas-rhin'],
  },
  {
    id: 'rhone_nord', name: 'Rhône Nord', num: 3, lon: 4.80, lat: 45.50,
    col: '#A03020', type: 'rouge',
    grapes: ['Syrah', 'Viognier', 'Marsanne', 'Roussanne'],
    aoc: ['Hermitage', 'Côte-Rôtie', 'Condrieu', 'Saint-Joseph', 'Crozes-Hermitage'],
    nota: 'Syrah reine, Viognier parfumé. Hermitage, granit, terrasses.',
    keywords: ['hermitage', 'côte-rôtie', 'condrieu', 'tain', 'ampuis'],
  },
  {
    id: 'rhone_sud', name: 'Rhône Sud', num: 5, lon: 4.83, lat: 44.05,
    col: '#B03020', type: 'rouge',
    grapes: ['Grenache', 'Syrah', 'Mourvèdre', 'Cinsault'],
    aoc: ['Châteauneuf-du-Pape', 'Gigondas', 'Vacqueyras', 'Côtes du Rhône'],
    nota: 'Grenache dominant. Galets roulés, soleil provençal.',
    keywords: ['châteauneuf', 'gigondas', 'vacqueyras', 'rhône', 'vaucluse'],
  },
  {
    id: 'provence', name: 'Provence', num: 12, lon: 6.00, lat: 43.55,
    col: '#B04A5A', type: 'rosé',
    grapes: ['Grenache', 'Cinsault', 'Mourvèdre', 'Tibouren'],
    aoc: ['Côtes de Provence', 'Bandol', 'Cassis', 'Palette', 'Les Baux'],
    nota: '1er vignoble rosé mondial. Bandol rouge de garde exceptionnel.',
    keywords: ['provence', 'bandol', 'cassis', 'var', 'bouches-du-rhône'],
  },
  {
    id: 'loire', name: 'Val de Loire', num: 11, lon: 0.40, lat: 47.40,
    col: '#4A8A20', type: 'blanc',
    grapes: ['Sauvignon Blanc', 'Chenin Blanc', 'Cabernet Franc', 'Muscadet'],
    aoc: ['Sancerre', 'Pouilly-Fumé', 'Vouvray', 'Chinon', 'Bourgueil', 'Muscadet'],
    nota: 'Du Muscadet atlantique à Sancerre en passant par Vouvray et Chinon.',
    keywords: ['loire', 'sancerre', 'vouvray', 'chinon', 'muscadet', 'touraine', 'anjou'],
  },
  {
    id: 'languedoc', name: 'Languedoc', num: 9, lon: 3.50, lat: 43.55,
    col: '#8A3A1A', type: 'rouge',
    grapes: ['Grenache', 'Syrah', 'Carignan', 'Mourvèdre', 'Cinsault'],
    aoc: ['Picpoul de Pinet', 'Corbières', 'Minervois', 'Saint-Chinian', 'Faugères'],
    nota: 'Plus grand vignoble de France. Diversité exceptionnelle.',
    keywords: ['languedoc', 'corbières', 'minervois', 'hérault', 'aude', 'gard'],
  },
  {
    id: 'roussillon', name: 'Roussillon', num: 13, lon: 2.80, lat: 42.70,
    col: '#9A4A1A', type: 'rouge',
    grapes: ['Grenache', 'Carignan', 'Mourvèdre'],
    aoc: ['Rivesaltes', 'Banyuls', 'Maury', 'Collioure', 'Côtes du Roussillon'],
    nota: 'VDN (vins doux naturels) — Banyuls, Maury, Rivesaltes.',
    keywords: ['roussillon', 'banyuls', 'rivesaltes', 'pyrénées-orientales'],
  },
  {
    id: 'beaujolais', name: 'Beaujolais', num: null, lon: 4.60, lat: 46.10,
    col: '#C04040', type: 'rouge',
    grapes: ['Gamay'],
    aoc: ['Morgon', 'Fleurie', 'Moulin-à-Vent', 'Brouilly', 'Côte de Brouilly'],
    nota: 'Gamay fruité et élégant. Les crus du Beaujolais valent les meilleurs Bourgognes.',
    keywords: ['beaujolais', 'morgon', 'fleurie', 'brouilly', 'villefranche'],
  },
  {
    id: 'sw', name: 'Sud-Ouest', num: 16, lon: 0.55, lat: 43.90,
    col: '#7A2A1A', type: 'rouge',
    grapes: ['Malbec', 'Tannat', 'Gros Manseng', 'Petit Manseng', 'Négrette'],
    aoc: ['Cahors', 'Madiran', 'Jurançon', 'Bergerac', 'Fronton', 'Gaillac'],
    nota: 'Malbec de Cahors, Tannat de Madiran, Jurançon blanc moelleux.',
    keywords: ['cahors', 'madiran', 'jurançon', 'bergerac', 'dordogne', 'lot', 'gers'],
  },
  {
    id: 'jura', name: 'Jura', num: 15, lon: 5.55, lat: 46.80,
    col: '#6A6A20', type: 'blanc',
    grapes: ['Chardonnay', 'Savagnin', 'Poulsard', 'Trousseau'],
    aoc: ['Arbois', 'Château-Chalon', 'L\'Étoile', 'Côtes du Jura', 'Vin Jaune'],
    nota: 'Vin Jaune unique au monde — élevage sous voile 6 ans minimum.',
    keywords: ['jura', 'arbois', 'château-chalon', 'vin jaune', 'savagnin'],
  },
  {
    id: 'savoie', name: 'Savoie', num: 8, lon: 6.20, lat: 45.55,
    col: '#5A7A50', type: 'blanc',
    grapes: ['Jacquère', 'Altesse', 'Mondeuse', 'Chardonnay'],
    aoc: ['Vin de Savoie', 'Roussette de Savoie', 'Seyssel'],
    nota: 'Vins de montagne vifs et minéraux. Mondeuse rouge de garde.',
    keywords: ['savoie', 'jacquère', 'altesse', 'mondeuse', 'chambéry'],
  },
  {
    id: 'corse', name: 'Corse', num: 7, lon: 9.10, lat: 42.20,
    col: '#7A5A30', type: 'rouge',
    grapes: ['Nielluccio', 'Sciaccarellu', 'Vermentino'],
    aoc: ['Patrimonio', 'Ajaccio', 'Vin de Corse', 'Muscat du Cap Corse'],
    nota: 'Cépages autochtones uniques. Patrimonio, île de beauté.',
    keywords: ['corse', 'patrimonio', 'ajaccio', 'nielluccio'],
  },
  {
    id: 'cognac_region', name: 'Cognac', num: 6, lon: -0.33, lat: 45.70,
    col: '#8A6020', type: 'blanc',
    grapes: ['Ugni Blanc', 'Folle Blanche', 'Colombard'],
    aoc: ['Cognac AOC', 'Pineau des Charentes', 'Cognac Grande Champagne'],
    nota: 'Base du cognac — distillation charentaise, vieillissement en fût de Limousin.',
    keywords: ['cognac', 'charentes', 'ugni blanc', 'grande champagne'],
  },
];

// ── Tous les cépages uniques (pour filtre) ────────────────────────────────────
const ALL_GRAPES = [...new Set(FR_REGIONS.flatMap(r => r.grapes))].sort();

// ── Matcher région ↔ vin ──────────────────────────────────────────────────────
function matchRegion(wine) {
  const reg = (wine.region || '').toLowerCase();
  const app = (wine.appellation || '').toLowerCase();
  const text = reg + ' ' + app;
  for (const r of FR_REGIONS) {
    if (r.keywords.some(k => text.includes(k))) return r.id;
  }
  return null;
}

const GEOJSON_URL = 'https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/regions.geojson';
const W = 520, H = 460;

// ── Type colors ───────────────────────────────────────────────────────────────
const TYPE_COL = { rouge: '#8B1A1A', blanc: '#6A8A20', rosé: '#B04A5A', pétillant: '#1A3A7A' };

export default function FranceMapPage() {
  const { t } = useLang();
  const svgRef       = useRef(null);
  const containerRef = useRef(null);
  const tooltipRef   = useRef(null);
  const zoomRef      = useRef(null);

  const [filter,       setFilter]       = useState('all');   // all | rouge | blanc | rosé | pétillant | cave
  const [grapeFilter,  setGrapeFilter]  = useState('');       // cépage filter
  const [selected,     setSelected]     = useState(null);
  const [spotlight,    setSpotlight]    = useState(null);
  const [showDomains,  setShowDomains]  = useState(true);
  const [showGrapePanel, setShowGrapePanel] = useState(false);

  const spotlightMut = useMutation({
    mutationFn: (region) => sommelierAPI.regionSpotlight(region).then(r => r.data),
    onSuccess:  (data)   => setSpotlight(data),
    onError:    (err)    => toast.error(err.response?.data?.error || 'Erreur IA'),
  });

  const { data: winesData } = useQuery({
    queryKey: ['wines', { limit: 500 }],
    queryFn:  () => winesAPI.list({ limit: 500 }).then(r => r.data),
  });
  const wines = winesData?.wines || [];

  // Cave counts by region
  const caveByRegion = useMemo(() => {
    const m = {};
    wines.filter(w => !w.is_drunk && w.quantity > 0 && (w.country || '').toLowerCase() === 'france')
      .forEach(w => { const rid = matchRegion(w); if (rid) m[rid] = (m[rid] || 0) + w.quantity; });
    return m;
  }, [wines]);

  // Domaines in cave (unique producer names per region)
  const domainesByRegion = useMemo(() => {
    const m = {};
    wines.filter(w => !w.is_drunk && w.quantity > 0 && w.producer && (w.country || '').toLowerCase() === 'france')
      .forEach(w => {
        const rid = matchRegion(w);
        if (!rid) return;
        if (!m[rid]) m[rid] = new Set();
        m[rid].add(w.producer);
      });
    return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, [...v]]));
  }, [wines]);

  // Visible regions after filters
  const visibleRegions = useMemo(() => {
    return FR_REGIONS.filter(r => {
      if (filter === 'cave' && !caveByRegion[r.id]) return false;
      if (filter !== 'all' && filter !== 'cave' && r.type !== filter) return false;
      if (grapeFilter && !r.grapes.some(g => g.toLowerCase().includes(grapeFilter.toLowerCase()))) return false;
      return true;
    });
  }, [filter, grapeFilter, caveByRegion]);

  // ── D3 draw ───────────────────────────────────────────────────────────────
  const drawMap = useCallback((geo) => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current).attr('viewBox', `0 0 ${W} ${H}`);
    svg.selectAll('*').remove();

    svg.append('rect').attr('width', W).attr('height', H).attr('fill', '#1A1010');

    const proj = d3.geoMercator().fitExtent(
      [[20, 15], [W - 20, H - 15]],
      geo || {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[-5, 41.3], [9.6, 41.3], [9.6, 51.1], [-5, 51.1], [-5, 41.3]]] } }],
      }
    );
    const path = d3.geoPath(proj);

    // Zoomable group
    const g = svg.append('g').attr('class', 'zoom-group');

    // Zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([1, 12])
      .on('zoom', ev => g.attr('transform', ev.transform));
    zoomRef.current = zoom;
    svg.call(zoom);

    // Admin regions (background)
    if (geo) {
      g.selectAll('path.region-bg')
        .data(geo.features)
        .join('path').attr('class', 'region-bg').attr('d', path)
        .attr('fill', '#2C1A1A').attr('stroke', '#3A2020').attr('stroke-width', 0.5);
    }

    // Wine region circles
    visibleRegions.forEach(reg => {
      const [px, py] = proj([reg.lon, reg.lat]);
      const inCave = (caveByRegion[reg.id] || 0) > 0;
      const dim = grapeFilter && !reg.grapes.some(g => g.toLowerCase().includes(grapeFilter.toLowerCase()));
      const col = TYPE_COL[reg.type] || reg.col;
      const rg = g.append('g').style('cursor', 'pointer').attr('class', 'wine-region');

      // Outer glow for cave regions
      if (inCave) {
        rg.append('circle')
          .attr('cx', px).attr('cy', py).attr('r', 22)
          .attr('fill', 'none').attr('stroke', '#C9A84C').attr('stroke-width', 1.2).attr('opacity', 0.5);
      }

      rg.append('circle')
        .attr('cx', px).attr('cy', py).attr('r', inCave ? 18 : 14)
        .attr('fill', col).attr('fill-opacity', dim ? 0.2 : (inCave ? 0.85 : 0.5))
        .attr('stroke', inCave ? '#C9A84C' : col).attr('stroke-width', inCave ? 2 : 0.8);

      // Region name
      rg.append('text')
        .attr('x', px).attr('y', py + (inCave ? 28 : 23))
        .attr('text-anchor', 'middle')
        .attr('fill', inCave ? '#E8C97A' : '#B09070')
        .attr('font-size', inCave ? 9.5 : 8.5)
        .attr('font-family', 'Cormorant Garamond,serif')
        .attr('font-weight', inCave ? 600 : 400)
        .attr('pointer-events', 'none')
        .text(reg.name);

      // Bottle count
      if (inCave) {
        rg.append('text')
          .attr('x', px).attr('y', py + 4.5)
          .attr('text-anchor', 'middle')
          .attr('fill', '#F5E8C8').attr('font-size', 10)
          .attr('font-family', 'Cormorant Garamond,serif').attr('font-weight', 700)
          .attr('pointer-events', 'none')
          .text(caveByRegion[reg.id]);
      }

      // Domain pins (small dots) when showDomains
      if (showDomains && domainesByRegion[reg.id]) {
        domainesByRegion[reg.id].slice(0, 6).forEach((dom, di) => {
          const angle = (di / Math.max(domainesByRegion[reg.id].length, 6)) * Math.PI * 2 - Math.PI / 2;
          const dist = inCave ? 28 : 22;
          const dx = px + Math.cos(angle) * dist;
          const dy = py + Math.sin(angle) * dist;
          const dg = g.append('g').style('cursor', 'pointer');
          dg.append('circle').attr('cx', dx).attr('cy', dy).attr('r', 3.5)
            .attr('fill', '#C9A84C').attr('stroke', '#1A0D07').attr('stroke-width', 0.5);
          dg.on('mousemove', ev => showTip(ev, `<strong style="color:var(--cv-gold)">🏠 ${dom}</strong><div style="font-size:0.75rem;margin-top:2px;color:var(--cv-text2)">${reg.name}</div>`))
            .on('mouseleave', () => tooltipRef.current?.classList.remove('visible'));
        });
      }

      rg.on('mousemove', ev => {
        const qty = caveByRegion[reg.id] || 0;
        showTip(ev, `<strong>${reg.name}${qty ? ` — <span style="color:var(--cv-gold)">${qty} btl.</span>` : ''}</strong>
          <div style="margin-top:3px"><span style="color:var(--cv-text2)">AOC :</span> ${reg.aoc.slice(0, 2).join(', ')}</div>
          <div><span style="color:var(--cv-text2)">Cépages :</span> ${reg.grapes.slice(0, 2).join(', ')}</div>
          ${grapeFilter ? `<div style="color:var(--cv-gold);margin-top:2px">🍇 ${reg.grapes.filter(g => g.toLowerCase().includes(grapeFilter.toLowerCase())).join(', ')}</div>` : ''}`);
      })
        .on('mouseleave', () => tooltipRef.current?.classList.remove('visible'))
        .on('click', () => { setSelected(reg); setSpotlight(null); });
    });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleRegions, caveByRegion, domainesByRegion, showDomains, grapeFilter]);

  function showTip(ev, html) {
    const tt = tooltipRef.current; if (!tt) return;
    const rc = containerRef.current?.getBoundingClientRect();
    if (!rc) return;
    tt.style.left = (ev.clientX - rc.left + 12) + 'px';
    tt.style.top  = (ev.clientY - rc.top - 12) + 'px';
    tt.innerHTML  = html;
    tt.classList.add('visible');
  }

  useEffect(() => {
    d3.json(GEOJSON_URL)
      .then(geo => drawMap(geo))
      .catch(() => drawMap(null));
  }, [drawMap]);

  // Zoom controls
  const zoomIn  = () => { if (svgRef.current && zoomRef.current) d3.select(svgRef.current).transition().call(zoomRef.current.scaleBy, 1.6); };
  const zoomOut = () => { if (svgRef.current && zoomRef.current) d3.select(svgRef.current).transition().call(zoomRef.current.scaleBy, 0.625); };
  const zoomReset = () => { if (svgRef.current && zoomRef.current) d3.select(svgRef.current).transition().call(zoomRef.current.transform, d3.zoomIdentity); };

  const selectedWines  = selected ? wines.filter(w => !w.is_drunk && w.quantity > 0 && matchRegion(w) === selected.id) : [];
  const selectedDomains = selected ? (domainesByRegion[selected.id] || []) : [];

  const filters = [
    { v: 'all',       l: 'Tout' },
    { v: 'cave',      l: '⭐ Ma cave' },
    { v: 'rouge',     l: '🍷 Rouge' },
    { v: 'blanc',     l: '🥂 Blanc' },
    { v: 'rosé',      l: '🌸 Rosé' },
    { v: 'pétillant', l: '✨ Pétillant' },
  ];

  return (
    <div className="fade-in">
      <div className="card mb-3">
        <div className="card-header d-flex flex-wrap gap-2 align-items-center justify-content-between">
          <div className="d-flex flex-wrap gap-2 align-items-center">
            <h6 className="card-title me-2 mb-0">Vignobles de France</h6>
            <div className="filter-pills">
              {filters.map(f => (
                <button key={f.v} className={`filter-pill ${filter === f.v ? 'active' : ''}`}
                  onClick={() => setFilter(f.v)}>{f.l}</button>
              ))}
            </div>
          </div>
          <div className="d-flex gap-2 align-items-center flex-wrap">
            {/* Cépage filter */}
            <div className="position-relative">
              <button
                className={`btn btn-sm ${grapeFilter ? 'btn-gold' : 'btn-outline-gold'}`}
                style={{ fontSize: '0.75rem' }}
                onClick={() => setShowGrapePanel(v => !v)}
              >
                <i className="bi bi-brightness-high me-1" />
                {grapeFilter || 'Cépage'}
                {grapeFilter && <i className="bi bi-x ms-1" onClick={e => { e.stopPropagation(); setGrapeFilter(''); }} />}
              </button>
              {showGrapePanel && (
                <div style={{
                  position: 'absolute', right: 0, top: '110%', zIndex: 200,
                  background: 'var(--cv-bg2)', border: '1px solid var(--cv-border)',
                  borderRadius: 8, padding: '8px', width: 220, maxHeight: 260, overflowY: 'auto',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                }}>
                  <input
                    className="form-control form-control-sm mb-2"
                    placeholder="Filtrer cépage…"
                    autoFocus
                    value={grapeFilter}
                    onChange={e => setGrapeFilter(e.target.value)}
                  />
                  {ALL_GRAPES.filter(g => !grapeFilter || g.toLowerCase().includes(grapeFilter.toLowerCase())).map(g => (
                    <button key={g} className="dropdown-item" style={{ fontSize: '0.8rem', padding: '3px 8px' }}
                      onClick={() => { setGrapeFilter(g); setShowGrapePanel(false); }}>
                      🍇 {g}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Toggle domaines */}
            <button
              className={`btn btn-sm ${showDomains ? 'btn-gold' : 'btn-outline-gold'}`}
              style={{ fontSize: '0.75rem' }}
              onClick={() => setShowDomains(v => !v)}
              title="Afficher les domaines en cave"
            >
              <i className="bi bi-geo-alt-fill me-1" />Domaines
            </button>
          </div>
        </div>

        <div className="card-body p-0">
          <div style={{ position: 'relative' }} ref={containerRef}>
            <div className="map-tooltip" ref={tooltipRef} />

            {/* Zoom buttons */}
            <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[['bi-plus', zoomIn], ['bi-dash', zoomOut], ['bi-arrows-angle-contract', zoomReset]].map(([icon, fn], i) => (
                <button key={i} className="btn btn-sm btn-outline-gold"
                  style={{ width: 30, height: 30, padding: 0, fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={fn}>
                  <i className={`bi ${icon}`} />
                </button>
              ))}
            </div>

            <svg ref={svgRef} style={{ width: '100%', display: 'block', minHeight: 320, cursor: 'grab' }} />
          </div>

          {/* Legend */}
          <div className="d-flex gap-3 flex-wrap px-3 pb-2 pt-1" style={{ fontSize: '0.72rem', color: 'var(--cv-text2)', borderTop: '0.5px solid var(--cv-border)' }}>
            {Object.entries(TYPE_COL).map(([type, col]) => (
              <span key={type}>
                <span style={{ display: 'inline-block', width: 10, height: 10, background: col, borderRadius: '50%', marginRight: 4 }} />
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </span>
            ))}
            <span>
              <span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--cv-gold)', borderRadius: '50%', marginRight: 4 }} />
              Dans votre cave
            </span>
            {showDomains && (
              <span>
                <span style={{ display: 'inline-block', width: 8, height: 8, background: '#C9A84C', borderRadius: '50%', marginRight: 4, border: '1px solid #1A0D07' }} />
                Domaine en cave
              </span>
            )}
            <span style={{ color: 'var(--cv-text3)' }}>
              <i className="bi bi-zoom-in me-1" />Molette pour zoomer · Glisser pour déplacer
            </span>
          </div>
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="card fade-in">
          <div className="card-header d-flex justify-content-between align-items-center">
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <h6 className="card-title mb-0" style={{ color: TYPE_COL[selected.type] }}>
                {selected.name}
                {caveByRegion[selected.id] ? (
                  <span className="badge-open ms-2" style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.7rem' }}>{caveByRegion[selected.id]} btl.</span>
                ) : null}
              </h6>
              <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 4, background: TYPE_COL[selected.type] + '33', color: TYPE_COL[selected.type] }}>
                {selected.type}
              </span>
              <button
                className="btn btn-sm btn-outline-gold" style={{ fontSize: '0.72rem' }}
                onClick={() => spotlightMut.mutate(selected.name)}
                disabled={spotlightMut.isPending}
              >
                {spotlightMut.isPending ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="bi bi-stars me-1" />}
                Analyse IA
              </button>
            </div>
            <button className="btn btn-sm" style={{ color: 'var(--cv-text3)', background: 'none', border: 'none' }}
              onClick={() => { setSelected(null); setSpotlight(null); }}>
              <i className="bi bi-x-lg" />
            </button>
          </div>

          <div className="card-body">
            <div className="row g-3">
              {/* AOC */}
              <div className="col-md-3">
                <div style={{ fontSize: '0.62rem', letterSpacing: 2, color: 'var(--cv-text3)', textTransform: 'uppercase', marginBottom: 6 }}>Appellations</div>
                {selected.aoc.map(a => (
                  <div key={a} style={{ fontSize: '0.82rem', color: 'var(--cv-text)', padding: '3px 0', borderBottom: '0.5px solid var(--cv-border)' }}>{a}</div>
                ))}
              </div>

              {/* Cépages */}
              <div className="col-md-3">
                <div style={{ fontSize: '0.62rem', letterSpacing: 2, color: 'var(--cv-text3)', textTransform: 'uppercase', marginBottom: 6 }}>Cépages</div>
                {selected.grapes.map(g => (
                  <div key={g} style={{ fontSize: '0.82rem', padding: '3px 0', borderBottom: '0.5px solid var(--cv-border)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: grapeFilter && g.toLowerCase().includes(grapeFilter.toLowerCase()) ? 'var(--cv-gold)' : 'var(--cv-text)' }}>
                      🍇 {g}
                    </span>
                  </div>
                ))}
              </div>

              {/* Domaines en cave */}
              {selectedDomains.length > 0 && (
                <div className="col-md-3">
                  <div style={{ fontSize: '0.62rem', letterSpacing: 2, color: 'var(--cv-gold)', textTransform: 'uppercase', marginBottom: 6 }}>
                    🏠 Domaines en cave ({selectedDomains.length})
                  </div>
                  {selectedDomains.map(d => (
                    <div key={d} style={{ fontSize: '0.82rem', color: 'var(--cv-text)', padding: '3px 0', borderBottom: '0.5px solid var(--cv-border)' }}>{d}</div>
                  ))}
                </div>
              )}

              {/* Bouteilles */}
              {selectedWines.length > 0 && (
                <div className="col-md-3">
                  <div style={{ fontSize: '0.62rem', letterSpacing: 2, color: 'var(--cv-gold)', textTransform: 'uppercase', marginBottom: 6 }}>Vos bouteilles ({selectedWines.length})</div>
                  {selectedWines.map(w => (
                    <div key={w.id} style={{ fontSize: '0.82rem', color: 'var(--cv-text)', padding: '3px 0', borderBottom: '0.5px solid var(--cv-border)', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{w.name} {w.vintage || ''}</span>
                      <span style={{ color: 'var(--cv-gold)', flexShrink: 0 }}>{w.quantity}×</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginTop: '0.75rem', fontSize: '0.82rem', color: 'var(--cv-text2)', fontStyle: 'italic', lineHeight: 1.5 }}>
              {selected.nota}
            </div>

            {/* AI Spotlight */}
            {spotlight && spotlight.region === selected.name && (
              <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--cv-border)' }}>
                <div style={{ fontSize: '0.62rem', letterSpacing: 2, color: 'var(--cv-gold)', textTransform: 'uppercase', marginBottom: 8 }}>
                  <i className="bi bi-stars me-1" />Analyse IA — {spotlight.region}
                </div>
                {spotlight.description && (
                  <p style={{ fontSize: '1rem', color: 'var(--cv-text)', lineHeight: 1.7, fontFamily: 'Cormorant Garamond,serif' }}>
                    {spotlight.description}
                  </p>
                )}
                <div className="d-flex flex-wrap gap-2 mt-2">
                  {spotlight.garde_typique && (
                    <span style={{ fontSize: '0.75rem', background: 'var(--cv-bg3)', borderRadius: 6, padding: '4px 10px', color: 'var(--cv-text2)' }}>
                      <i className="bi bi-hourglass-split me-1" style={{ color: 'var(--cv-gold)' }} />Garde : {spotlight.garde_typique}
                    </span>
                  )}
                  {spotlight.accord_ideal && (
                    <span style={{ fontSize: '0.75rem', background: 'var(--cv-bg3)', borderRadius: 6, padding: '4px 10px', color: 'var(--cv-text2)' }}>
                      <i className="bi bi-fork-knife me-1" style={{ color: 'var(--cv-gold)' }} />{spotlight.accord_ideal}
                    </span>
                  )}
                </div>
                {spotlight.anecdote && (
                  <p style={{ fontSize: '0.78rem', color: 'var(--cv-text3)', fontStyle: 'italic', marginTop: 8 }}>
                    💡 {spotlight.anecdote}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
