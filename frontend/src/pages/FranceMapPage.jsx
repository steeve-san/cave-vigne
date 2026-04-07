// src/pages/FranceMapPage.jsx
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { winesAPI } from '../services/api';
import * as d3 from 'd3';

// Geographic coordinates [lon, lat] of wine region centres
const FR_REGIONS = [
  {
    id: 'bordeaux', name: 'Bordeaux', lon: -0.57, lat: 44.84, r: 26,
    col: '#8B1A1A', grapes: ['Cabernet Sauvignon', 'Merlot', 'Cabernet Franc'],
    aoc: ['Pauillac', 'Saint-Émilion', 'Pomerol', 'Graves'], type: 'rouge',
    nota: '1ers crus, rive gauche & droite',
  },
  {
    id: 'bourgogne', name: 'Bourgogne', lon: 4.83, lat: 47.05, r: 21,
    col: '#9A2A2A', grapes: ['Pinot Noir', 'Chardonnay'],
    aoc: ['Gevrey-Chambertin', 'Meursault', 'Chablis'], type: 'rouge',
    nota: 'Grands crus mythiques',
  },
  {
    id: 'champagne', name: 'Champagne', lon: 4.03, lat: 49.05, r: 18,
    col: '#1A3A7A', grapes: ['Chardonnay', 'Pinot Noir', 'Pinot Meunier'],
    aoc: ['Champagne AOC'], type: 'pétillant', nota: 'Méthode champenoise',
  },
  {
    id: 'alsace', name: 'Alsace', lon: 7.35, lat: 48.30, r: 13,
    col: '#6A7A20', grapes: ['Riesling', 'Gewürztraminer', 'Pinot Gris'],
    aoc: ['Alsace AOC', 'Alsace Grand Cru'], type: 'blanc', nota: 'Vins aromatiques',
  },
  {
    id: 'rhone', name: 'Vallée du Rhône', lon: 4.83, lat: 44.90, r: 20,
    col: '#A03020', grapes: ['Grenache', 'Syrah', 'Mourvèdre', 'Viognier'],
    aoc: ['Hermitage', 'Châteauneuf-du-Pape', 'Côte-Rôtie'], type: 'rouge',
    nota: 'Vins puissants & aromatiques',
  },
  {
    id: 'loire', name: 'Val de Loire', lon: 0.40, lat: 47.40, r: 24,
    col: '#4A8A20', grapes: ['Sauvignon Blanc', 'Chenin Blanc', 'Cabernet Franc'],
    aoc: ['Sancerre', 'Pouilly-Fumé', 'Vouvray', 'Chinon'], type: 'blanc',
    nota: 'De Muscadet à Sancerre',
  },
  {
    id: 'provence', name: 'Provence', lon: 5.90, lat: 43.60, r: 18,
    col: '#B04A5A', grapes: ['Grenache', 'Cinsault', 'Mourvèdre'],
    aoc: ['Côtes de Provence', 'Bandol'], type: 'rosé', nota: '1er rosé mondial',
  },
  {
    id: 'languedoc', name: 'Languedoc', lon: 3.50, lat: 43.50, r: 22,
    col: '#8A3A1A', grapes: ['Grenache', 'Syrah', 'Carignan'],
    aoc: ['Picpoul', 'Corbières'], type: 'rouge', nota: 'Plus grand vignoble de France',
  },
  {
    id: 'beaujolais', name: 'Beaujolais', lon: 4.60, lat: 46.10, r: 12,
    col: '#C04040', grapes: ['Gamay'],
    aoc: ['Morgon', 'Fleurie'], type: 'rouge', nota: 'Gamay fruité',
  },
  {
    id: 'sw', name: 'Sud-Ouest', lon: 0.55, lat: 44.00, r: 16,
    col: '#7A2A1A', grapes: ['Malbec', 'Tannat', 'Gros Manseng'],
    aoc: ['Cahors', 'Madiran', 'Jurançon'], type: 'rouge', nota: 'Cahors, Madiran, Jurançon',
  },
];

function matchRegion(wine) {
  const reg = (wine.region || '').toLowerCase();
  const app = (wine.appellation || '').toLowerCase();
  for (const r of FR_REGIONS) {
    if (reg.includes(r.id) || app.includes(r.id) ||
      r.aoc.some(a => app.includes(a.toLowerCase().split(' ')[0]))) return r.id;
    if (r.id === 'bordeaux' && (reg.includes('bordeaux') || reg.includes('pauillac') ||
      reg.includes('saint-émilion') || reg.includes('graves'))) return r.id;
    if (r.id === 'bourgogne' && (reg.includes('bourgogne') || reg.includes('chablis') ||
      reg.includes("côte d'or"))) return r.id;
    if (r.id === 'champagne' && reg.includes('champagne')) return r.id;
    if (r.id === 'rhone' && (reg.includes('rhône') || reg.includes('rhone'))) return r.id;
    if (r.id === 'loire' && reg.includes('loire')) return r.id;
    if (r.id === 'provence' && reg.includes('provence')) return r.id;
    if (r.id === 'alsace' && reg.includes('alsace')) return r.id;
  }
  return null;
}

// Metropolitan France only GeoJSON (gregoiredavid/france-geojson)
const GEOJSON_URL =
  'https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/regions.geojson';

const W = 480, H = 420;

export default function FranceMapPage() {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const tooltipRef = useRef(null);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const { data: winesData } = useQuery({
    queryKey: ['wines', { limit: 200 }],
    queryFn: () => winesAPI.list({ limit: 200 }).then(r => r.data),
  });
  const wines = winesData?.wines || [];

  const caveByRegion = {};
  wines
    .filter(w => !w.is_drunk && w.quantity > 0 && (w.country || '').toLowerCase() === 'france')
    .forEach(w => {
      const rid = matchRegion(w);
      if (rid) caveByRegion[rid] = (caveByRegion[rid] || 0) + w.quantity;
    });

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current).attr('viewBox', `0 0 ${W} ${H}`);
    svg.selectAll('*').remove();
    svg.append('rect').attr('width', W).attr('height', H).attr('fill', '#1A1010');

    d3.json(GEOJSON_URL)
      .then(geo => drawMap(svg, geo))
      .catch(() => drawMap(svg, null));

    function drawMap(svg, geo) {
      // Projection fitted to metropolitan France
      // Extent: lon [-5, 9.6], lat [41.3, 51.1]
      const proj = d3.geoMercator().fitExtent(
        [[20, 15], [W - 20, H - 15]],
        geo || {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [[[-5, 41.3], [9.6, 41.3], [9.6, 51.1], [-5, 51.1], [-5, 41.3]]],
            },
          }],
        }
      );
      const path = d3.geoPath(proj);

      if (geo) {
        svg.selectAll('path.dept')
          .data(geo.features)
          .join('path')
          .attr('class', 'dept')
          .attr('d', path)
          .attr('fill', '#2C1A1A')
          .attr('stroke', '#3A2020')
          .attr('stroke-width', 0.5);
      }

      FR_REGIONS.forEach(reg => {
        if (filter !== 'all' && filter !== 'cave' && reg.type !== filter) return;
        if (filter === 'cave' && !caveByRegion[reg.id]) return;

        const [px, py] = proj([reg.lon, reg.lat]);
        const inCave = (caveByRegion[reg.id] || 0) > 0;
        const g = svg.append('g').style('cursor', 'pointer');

        g.append('circle')
          .attr('cx', px).attr('cy', py).attr('r', reg.r)
          .attr('fill', inCave ? reg.col : '#2C1A1A')
          .attr('fill-opacity', inCave ? 0.75 : 0.4)
          .attr('stroke', inCave ? '#C9A84C' : reg.col)
          .attr('stroke-width', inCave ? 2 : 0.8);

        g.append('text')
          .attr('x', px).attr('y', py + reg.r + 11)
          .attr('text-anchor', 'middle')
          .attr('fill', inCave ? '#E8C97A' : '#B09070')
          .attr('font-size', inCave ? 9 : 8)
          .attr('font-family', 'Inter,sans-serif')
          .text(reg.name);

        if (inCave)
          g.append('text')
            .attr('x', px).attr('y', py + 4)
            .attr('text-anchor', 'middle')
            .attr('fill', '#F0E6D3')
            .attr('font-size', 9)
            .attr('font-family', 'Cormorant Garamond,serif')
            .attr('font-weight', 600)
            .text(caveByRegion[reg.id]);

        g.on('mousemove', ev => {
          const tt = tooltipRef.current;
          if (!tt) return;
          const rc = containerRef.current.getBoundingClientRect();
          tt.style.left = ev.clientX - rc.left + 10 + 'px';
          tt.style.top = ev.clientY - rc.top - 10 + 'px';
          tt.innerHTML = `<strong>${reg.name}${inCave ? ` — <span style="color:var(--cv-gold)">${caveByRegion[reg.id]} btl.</span>` : ''}</strong>
            <div style="margin-top:3px"><span style="color:var(--cv-text2)">AOC :</span> ${reg.aoc.slice(0, 2).join(', ')}</div>
            <div><span style="color:var(--cv-text2)">Cépages :</span> ${reg.grapes.slice(0, 2).join(', ')}</div>`;
          tt.classList.add('visible');
        })
          .on('mouseleave', () => tooltipRef.current?.classList.remove('visible'))
          .on('click', () => setSelected(reg));
      });
    }
  }, [filter, wines]);

  return (
    <div className="fade-in">
      <div className="card mb-3">
        <div className="card-header d-flex flex-wrap gap-2 align-items-center">
          <h6 className="card-title me-3">Vignobles de France</h6>
          <div className="filter-pills">
            {[
              ['all', 'Tout'], ['cave', 'Ma cave'], ['rouge', '🍷 Rouge'],
              ['blanc', '🥂 Blanc'], ['rosé', '🌸 Rosé'], ['pétillant', '✨ Pétillant'],
            ].map(([v, l]) => (
              <button key={v} className={`filter-pill ${filter === v ? 'active' : ''}`}
                onClick={() => setFilter(v)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="card-body p-2">
          <div className="map-container" ref={containerRef} style={{ minHeight: 280 }}>
            <div className="map-tooltip" ref={tooltipRef}></div>
            <svg ref={svgRef} style={{ width: '100%', display: 'block' }} />
          </div>
          <div className="d-flex gap-3 flex-wrap p-2" style={{ fontSize: '0.72rem', color: 'var(--cv-text2)' }}>
            {[['#8B1A1A', 'Rouge'], ['#6A8A20', 'Blanc'], ['#B04A5A', 'Rosé'], ['#1A3A7A', 'Pétillant']].map(([c, l]) => (
              <span key={l}>
                <span style={{ display: 'inline-block', width: 10, height: 10, background: c, borderRadius: 2, marginRight: 4 }}></span>
                {l}
              </span>
            ))}
            <span>
              <span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--cv-gold)', borderRadius: '50%', marginRight: 4 }}></span>
              Dans votre cave
            </span>
          </div>
        </div>
      </div>

      {selected && (
        <div className="card fade-in">
          <div className="card-header d-flex justify-content-between">
            <h6 className="card-title mb-0">
              {selected.name}{' '}
              {caveByRegion[selected.id] ? (
                <span className="badge-open ms-2">{caveByRegion[selected.id]} btl.</span>
              ) : null}
            </h6>
            <button className="btn btn-sm" style={{ color: 'var(--cv-text3)', background: 'none', border: 'none' }}
              onClick={() => setSelected(null)}>
              <i className="bi bi-x-lg"></i>
            </button>
          </div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-md-4">
                <div style={{ fontSize: '0.65rem', letterSpacing: 2, color: 'var(--cv-text3)', textTransform: 'uppercase', marginBottom: 6 }}>Appellations</div>
                {selected.aoc.map(a => (
                  <div key={a} style={{ fontSize: '0.82rem', color: 'var(--cv-text)', padding: '3px 0', borderBottom: '0.5px solid var(--cv-border)' }}>{a}</div>
                ))}
              </div>
              <div className="col-md-4">
                <div style={{ fontSize: '0.65rem', letterSpacing: 2, color: 'var(--cv-text3)', textTransform: 'uppercase', marginBottom: 6 }}>Cépages</div>
                {selected.grapes.map(g => (
                  <div key={g} style={{ fontSize: '0.82rem', color: 'var(--cv-text)', padding: '3px 0', borderBottom: '0.5px solid var(--cv-border)' }}>{g}</div>
                ))}
              </div>
              {caveByRegion[selected.id] > 0 && (
                <div className="col-md-4">
                  <div style={{ fontSize: '0.65rem', letterSpacing: 2, color: 'var(--cv-gold)', textTransform: 'uppercase', marginBottom: 6 }}>Vos bouteilles</div>
                  {wines
                    .filter(w => !w.is_drunk && w.quantity > 0 && matchRegion(w) === selected.id)
                    .map(w => (
                      <div key={w.id} style={{ fontSize: '0.82rem', color: 'var(--cv-text)', padding: '3px 0', borderBottom: '0.5px solid var(--cv-border)', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{w.name} {w.vintage || ''}</span>
                        <span style={{ color: 'var(--cv-gold)' }}>{w.quantity}×</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
            <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--cv-text2)', fontStyle: 'italic' }}>
              {selected.nota}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
