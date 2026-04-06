// src/pages/WorldMapPage.jsx
import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { winesAPI } from '../services/api';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';

const WORLD_REGIONS = [
  { id:'FR', name:'France', lon:2, lat:46, col:'#8B2A2A', type:'mixte', regions:['Bordeaux','Bourgogne','Champagne','Alsace','Rhône','Loire','Provence'], grapes:['Cabernet Sauvignon','Merlot','Pinot Noir','Chardonnay','Grenache'], wines:'Bordeaux, Bourgognes, Champagne', country:'france' },
  { id:'IT', name:'Italie', lon:12, lat:42, col:'#9A3030', type:'rouge', regions:['Toscane','Piémont','Vénétie'], grapes:['Sangiovese','Nebbiolo','Pinot Grigio'], wines:'Barolo, Chianti, Amarone', country:'italie' },
  { id:'ES', name:'Espagne', lon:-3, lat:40, col:'#A03828', type:'rouge', regions:['Rioja','Ribera del Duero'], grapes:['Tempranillo','Garnacha'], wines:'Rioja, Cava', country:'espagne' },
  { id:'PT', name:'Portugal', lon:-8, lat:39, col:'#B04030', type:'rouge', regions:['Douro','Alentejo'], grapes:['Touriga Nacional'], wines:'Porto, Vinho Verde', country:'portugal' },
  { id:'DE', name:'Allemagne', lon:10, lat:51, col:'#6A7A30', type:'blanc', regions:['Moselle','Rhin'], grapes:['Riesling'], wines:'Riesling, Spätlese', country:'allemagne' },
  { id:'US', name:'États-Unis', lon:-119, lat:37, col:'#7A3A2A', type:'rouge', regions:['Napa Valley','Sonoma'], grapes:['Cabernet Sauvignon','Zinfandel'], wines:'Napa Cabernet', country:'états-unis' },
  { id:'AR', name:'Argentine', lon:-68, lat:-34, col:'#8A4A2A', type:'rouge', regions:['Mendoza'], grapes:['Malbec'], wines:'Malbec de Mendoza', country:'argentine' },
  { id:'CL', name:'Chili', lon:-71, lat:-33, col:'#9A5030', type:'rouge', regions:['Maipo','Casablanca'], grapes:['Carménère'], wines:'Carménère, Cabernet', country:'chili' },
  { id:'AU', name:'Australie', lon:138, lat:-33, col:'#8A4A20', type:'rouge', regions:['Barossa','Clare Valley'], grapes:['Shiraz'], wines:'Barossa Shiraz', country:'australie' },
  { id:'NZ', name:'N.-Zélande', lon:174, lat:-41, col:'#6A8A30', type:'blanc', regions:['Marlborough'], grapes:['Sauvignon Blanc'], wines:'Sauvignon Blanc', country:'nouvelle-zélande' },
  { id:'ZA', name:'Afrique du Sud', lon:19, lat:-33, col:'#7A5A20', type:'mixte', regions:['Stellenbosch'], grapes:['Pinotage'], wines:'Pinotage, Chenin Blanc', country:'afrique du sud' },
];

export default function WorldMapPage() {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const tooltipRef = useRef(null);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const { data: stats } = useQuery({ queryKey: ['wine-stats'], queryFn: () => winesAPI.stats().then(r => r.data) });
  const { data: winesData } = useQuery({ queryKey: ['wines', { limit: 200 }], queryFn: () => winesAPI.list({ limit: 200 }).then(r => r.data) });

  const wines = winesData?.wines || [];
  const caveByCountry = {};
  wines.filter(w => !w.is_drunk && w.quantity > 0).forEach(w => {
    const c = (w.country || '').toLowerCase();
    caveByCountry[c] = (caveByCountry[c] || 0) + w.quantity;
  });

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;
    const container = containerRef.current;
    const W = container.clientWidth || 700;
    const H = Math.round(W * 0.52);

    const svg = d3.select(svgRef.current).attr('viewBox', `0 0 ${W} ${H}`);
    svg.selectAll('*').remove();

    const proj = d3.geoNaturalEarth1().scale(W / 6.28).translate([W / 2, H / 2]);
    const path = d3.geoPath(proj);

    d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json').then(world => {
      svg.append('rect').attr('width', W).attr('height', H).attr('fill', '#1A1010');
      svg.selectAll('path.country')
        .data(topojson.feature(world, world.objects.countries).features)
        .join('path').attr('class', 'country').attr('d', path)
        .attr('fill', '#2C1A1A').attr('stroke', '#3A2020').attr('stroke-width', 0.4);

      WORLD_REGIONS.forEach(r => {
        if (filter === 'cave' && !caveByCountry[r.country]) return;
        if (filter === 'rouge' && r.type === 'blanc') return;
        if (filter === 'blanc' && r.type === 'rouge') return;
        const pt = proj([r.lon, r.lat]);
        if (!pt) return;
        const inCave = (caveByCountry[r.country] || 0) > 0;
        const g = svg.append('g').style('cursor', 'pointer');
        if (inCave) g.append('circle').attr('cx', pt[0]).attr('cy', pt[1]).attr('r', 12).attr('fill', 'none').attr('stroke', '#C9A84C').attr('stroke-width', 1.5).attr('opacity', 0.7);
        g.append('circle').attr('cx', pt[0]).attr('cy', pt[1]).attr('r', inCave ? 8 : 6)
          .attr('fill', inCave ? '#C9A84C' : r.col).attr('stroke', 'rgba(255,255,255,0.2)').attr('stroke-width', 0.5);
        g.append('text').attr('x', pt[0] + 11).attr('y', pt[1] + 4).attr('fill', '#D0B880').attr('font-size', 10).attr('font-family', 'Inter,sans-serif').text(r.name);
        if (inCave) g.append('text').attr('x', pt[0]).attr('y', pt[1] + 4).attr('text-anchor', 'middle').attr('fill', '#1A0F0F').attr('font-size', 9).attr('font-weight', 'bold').text(caveByCountry[r.country]);
        g.on('mousemove', (ev) => {
          const tt = tooltipRef.current; if (!tt) return;
          const rect = container.getBoundingClientRect();
          tt.style.left = (ev.clientX - rect.left + 12) + 'px';
          tt.style.top = (ev.clientY - rect.top - 12) + 'px';
          tt.innerHTML = `<strong>${r.name}${inCave ? ` — <span style="color:var(--cv-gold)">${caveByCountry[r.country]} btl. en cave</span>` : ''}</strong>
            <div style="margin-top:4px"><span style="color:var(--cv-text2)">Régions :</span> ${r.regions.slice(0, 2).join(', ')}</div>
            <div><span style="color:var(--cv-text2)">Cépages :</span> ${r.grapes.slice(0, 2).join(', ')}</div>
            <div><span style="color:var(--cv-text2)">Phares :</span> ${r.wines}</div>`;
          tt.classList.add('visible');
        }).on('mouseleave', () => tooltipRef.current?.classList.remove('visible'))
          .on('click', () => setSelected(r));
      });
    }).catch(() => {
      svg.append('rect').attr('width', W).attr('height', H).attr('fill', '#1A1010');
      svg.append('text').attr('x', W / 2).attr('y', H / 2).attr('text-anchor', 'middle').attr('fill', '#C9A84C').attr('font-size', 13).text('Carte en chargement...');
    });
  }, [filter, wines]);

  const filters = [{ v:'all', l:'Tout' }, { v:'cave', l:'Ma cave' }, { v:'rouge', l:'🍷 Rouges' }, { v:'blanc', l:'🥂 Blancs' }];

  return (
    <div className="fade-in">
      <div className="card mb-3">
        <div className="card-header d-flex flex-wrap gap-2 align-items-center">
          <h6 className="card-title me-3">Vignobles mondiaux</h6>
          <div className="filter-pills">
            {filters.map(f => <button key={f.v} className={`filter-pill ${filter === f.v ? 'active' : ''}`} onClick={() => setFilter(f.v)}>{f.l}</button>)}
          </div>
        </div>
        <div className="card-body p-2">
          <div className="map-container" ref={containerRef} style={{ minHeight: 220 }}>
            <div className="map-tooltip" ref={tooltipRef}></div>
            <svg ref={svgRef} style={{ width: '100%', display: 'block' }} />
          </div>
          <div className="d-flex gap-3 flex-wrap p-2" style={{ fontSize:'0.75rem', color:'var(--cv-text2)' }}>
            <span><span style={{ display:'inline-block', width:10, height:10, background:'#8B2A2A', borderRadius:2, marginRight:4 }}></span>Rouge dominant</span>
            <span><span style={{ display:'inline-block', width:10, height:10, background:'#6A7A30', borderRadius:2, marginRight:4 }}></span>Blanc dominant</span>
            <span><span style={{ display:'inline-block', width:10, height:10, background:'#C9A84C', borderRadius:'50%', marginRight:4 }}></span>Dans votre cave</span>
            <span style={{ color:'var(--cv-text3)' }}>Cliquez sur un point pour le détail</span>
          </div>
        </div>
      </div>

      {selected && (
        <div className="card fade-in">
          <div className="card-header d-flex justify-content-between align-items-center">
            <h6 className="card-title mb-0">{selected.name} {caveByCountry[selected.country] ? <span className="badge-open ms-2">{caveByCountry[selected.country]} btl. en cave</span> : null}</h6>
            <button className="btn btn-sm" style={{ color:'var(--cv-text3)', background:'none', border:'none' }} onClick={() => setSelected(null)}><i className="bi bi-x-lg"></i></button>
          </div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-md-4"><div style={{ fontSize:'0.65rem', letterSpacing:2, color:'var(--cv-text3)', textTransform:'uppercase', marginBottom:8 }}>Régions phares</div>
                {selected.regions.map(r => <div key={r} style={{ fontSize:'0.85rem', color:'var(--cv-text)', padding:'4px 0', borderBottom:'0.5px solid var(--cv-border)' }}>{r}</div>)}
              </div>
              <div className="col-md-4"><div style={{ fontSize:'0.65rem', letterSpacing:2, color:'var(--cv-text3)', textTransform:'uppercase', marginBottom:8 }}>Cépages principaux</div>
                {selected.grapes.map(g => <div key={g} style={{ fontSize:'0.85rem', color:'var(--cv-text)', padding:'4px 0', borderBottom:'0.5px solid var(--cv-border)' }}>{g}</div>)}
              </div>
              {caveByCountry[selected.country] > 0 && (
                <div className="col-md-4">
                  <div style={{ fontSize:'0.65rem', letterSpacing:2, color:'var(--cv-gold)', textTransform:'uppercase', marginBottom:8 }}>Vos bouteilles</div>
                  {wines.filter(w => !w.is_drunk && w.quantity > 0 && (w.country || '').toLowerCase() === selected.country)
                    .map(w => <div key={w.id} style={{ fontSize:'0.82rem', color:'var(--cv-text)', padding:'4px 0', borderBottom:'0.5px solid var(--cv-border)', display:'flex', justifyContent:'space-between' }}>
                      <span>{w.name} {w.vintage || ''}</span><span style={{ color:'var(--cv-gold)' }}>{w.quantity}×</span>
                    </div>)}
                </div>
              )}
            </div>
            <div style={{ marginTop:'0.75rem', fontSize:'0.82rem', color:'var(--cv-text2)', fontStyle:'italic' }}>{selected.wines}</div>
          </div>
        </div>
      )}
    </div>
  );
}
