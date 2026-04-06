// src/pages/SpiritsMapPage.jsx
import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { spiritsAPI } from '../services/api';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';

const SPIRIT_ORIGINS = [
  { n:'Écosse', lon:-4, lat:57, col:'#8B5E2A', types:['whisky'], detail:'Speyside, Islay, Highlands — Single malt & blends' },
  { n:'Irlande', lon:-8, lat:53, col:'#7A5020', types:['whisky'], detail:'Triple distillation, Jameson, Bushmills' },
  { n:'USA', lon:-95, lat:38, col:'#9A5030', types:['whisky'], detail:'Bourbon Kentucky, Tennessee Whiskey' },
  { n:'Japon', lon:137, lat:36, col:'#7A4A20', types:['whisky'], detail:'Nikka, Suntory — style écossais adapté' },
  { n:'Cuba', lon:-80, lat:22, col:'#8A3010', types:['rhum'], detail:'Havana Club, rhum léger' },
  { n:'Jamaïque', lon:-77, lat:18, col:'#9A4010', types:['rhum'], detail:'Appleton, rhum typé, esters élevés' },
  { n:'Martinique', lon:-61, lat:14.6, col:'#7A3008', types:['rhum'], detail:'AOC Martinique, canne fraîche' },
  { n:'Barbade', lon:-59.5, lat:13.2, col:'#8A3808', types:['rhum'], detail:'Mount Gay, plus vieux rhum du monde' },
  { n:'France', lon:2, lat:46, col:'#9A5020', types:['cognac','armagnac','calvados'], detail:'Cognac (Charente), Armagnac (Gascogne), Calvados (Normandie)' },
  { n:'Russie', lon:55, lat:55, col:'#3A3A8A', types:['vodka'], detail:'Vodka céréales & pomme de terre' },
  { n:'Pologne', lon:20, lat:52, col:'#4A4A9A', types:['vodka'], detail:'Belvedere, Żubrówka' },
  { n:'Mexique', lon:-103, lat:23, col:'#7A6A10', types:['autre'], detail:'Tequila & Mezcal (agave)' },
];

export default function SpiritsMapPage() {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const tooltipRef = useRef(null);
  const [selected, setSelected] = useState(null);
  const { data: spirits = [] } = useQuery({ queryKey: ['spirits', {}], queryFn: () => spiritsAPI.list().then(r => r.data) });

  const caveByOrigin = {};
  spirits.filter(s => s.status !== 'empty').forEach(s => {
    const orig = (s.origin || '').toLowerCase();
    SPIRIT_ORIGINS.forEach(o => { if (orig.includes(o.n.toLowerCase().split(',')[0].toLowerCase())) caveByOrigin[o.n] = (caveByOrigin[o.n] || 0) + (s.quantity || 1); });
  });

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;
    const W = containerRef.current.clientWidth || 700, H = Math.round(W * 0.52);
    const svg = d3.select(svgRef.current).attr('viewBox', `0 0 ${W} ${H}`);
    svg.selectAll('*').remove();
    const proj = d3.geoNaturalEarth1().scale(W / 6.28).translate([W / 2, H / 2]);

    d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json').then(world => {
      svg.append('rect').attr('width', W).attr('height', H).attr('fill', '#1A1010');
      svg.selectAll('path.c').data(topojson.feature(world, world.objects.countries).features).join('path').attr('class','c').attr('d', d3.geoPath(proj)).attr('fill','#2C1A1A').attr('stroke','#3A2020').attr('stroke-width',0.4);
      drawPins();
    }).catch(() => { svg.append('rect').attr('width',W).attr('height',H).attr('fill','#1A1010'); drawPins(); });

    function drawPins() {
      SPIRIT_ORIGINS.forEach(r => {
        const pt = proj([r.lon, r.lat]); if (!pt) return;
        const inCave = (caveByOrigin[r.n] || 0) > 0;
        const g = svg.append('g').style('cursor','pointer');
        if (inCave) g.append('circle').attr('cx',pt[0]).attr('cy',pt[1]).attr('r',11).attr('fill','none').attr('stroke','#C9A84C').attr('stroke-width',1.5);
        g.append('circle').attr('cx',pt[0]).attr('cy',pt[1]).attr('r',inCave?7:5).attr('fill',inCave?'#C9A84C':r.col).attr('stroke','rgba(255,255,255,0.2)').attr('stroke-width',0.5);
        g.append('text').attr('x',pt[0]+9).attr('y',pt[1]+4).attr('fill','#D0B880').attr('font-size',9).attr('font-family','Inter,sans-serif').text(r.n);
        if (inCave) g.append('text').attr('x',pt[0]).attr('y',pt[1]+4).attr('text-anchor','middle').attr('fill','#1A0F0F').attr('font-size',8).attr('font-weight','bold').text(caveByOrigin[r.n]);
        g.on('mousemove', ev => {
          const tt = tooltipRef.current; if (!tt) return;
          const rc = containerRef.current.getBoundingClientRect();
          tt.style.left=(ev.clientX-rc.left+12)+'px'; tt.style.top=(ev.clientY-rc.top-12)+'px';
          tt.innerHTML=`<strong>${r.n}${inCave?` — <span style="color:var(--cv-gold)">${caveByOrigin[r.n]} btl.</span>`:''}</strong><div style="margin-top:4px;color:var(--cv-text2)">${r.detail}</div>`;
          tt.classList.add('visible');
        }).on('mouseleave',()=>tooltipRef.current?.classList.remove('visible'))
          .on('click',()=>setSelected(r));
      });
    }
  }, [spirits]);

  return (
    <div className="fade-in">
      <div className="card mb-3">
        <div className="card-header"><h6 className="card-title">Origines des spiritueux</h6></div>
        <div className="card-body p-2">
          <div className="map-container" ref={containerRef} style={{ minHeight:200 }}>
            <div className="map-tooltip" ref={tooltipRef}></div>
            <svg ref={svgRef} style={{ width:'100%', display:'block' }} />
          </div>
          <div className="d-flex gap-3 flex-wrap p-2" style={{ fontSize:'0.72rem', color:'var(--cv-text2)' }}>
            {[['#8B5E2A','Whisky'],['#9A3010','Rhum'],['#9A5020','Cognac/Armagnac'],['#4A4A9A','Vodka'],['#7A6A10','Autre']].map(([c,l]) => (
              <span key={l}><span style={{ display:'inline-block', width:10, height:10, background:c, borderRadius:2, marginRight:4 }}></span>{l}</span>
            ))}
            <span><span style={{ display:'inline-block', width:10, height:10, background:'var(--cv-gold)', borderRadius:'50%', marginRight:4 }}></span>Dans votre cave</span>
          </div>
        </div>
      </div>
      {selected && (
        <div className="card fade-in">
          <div className="card-header d-flex justify-content-between">
            <h6 className="card-title mb-0">{selected.n} {caveByOrigin[selected.n] ? <span className="badge-open ms-2">{caveByOrigin[selected.n]} btl.</span> : null}</h6>
            <button className="btn btn-sm" style={{ color:'var(--cv-text3)', background:'none', border:'none' }} onClick={()=>setSelected(null)}><i className="bi bi-x-lg"></i></button>
          </div>
          <div className="card-body">
            <div style={{ fontSize:'0.82rem', color:'var(--cv-text2)', marginBottom:'0.75rem' }}>{selected.detail}</div>
            <div style={{ fontSize:'0.65rem', letterSpacing:2, color:'var(--cv-text3)', textTransform:'uppercase', marginBottom:6 }}>Types</div>
            <div className="d-flex gap-2 flex-wrap mb-3">{selected.types.map(t => <span key={t} className={`badge-type badge-${t}`}>{t}</span>)}</div>
            {caveByOrigin[selected.n] > 0 && <>
              <div style={{ fontSize:'0.65rem', letterSpacing:2, color:'var(--cv-gold)', textTransform:'uppercase', marginBottom:6 }}>Dans votre cave</div>
              {spirits.filter(s => s.status !== 'empty' && (s.origin||'').toLowerCase().includes(selected.n.toLowerCase().split(',')[0].toLowerCase()))
                .map(s => <div key={s.id} style={{ fontSize:'0.82rem', color:'var(--cv-text)', padding:'4px 0', borderBottom:'0.5px solid var(--cv-border)', display:'flex', justifyContent:'space-between' }}>
                  <span>{s.name}</span><span style={{ color:'var(--cv-gold)' }}>{s.quantity}×</span>
                </div>)}
            </>}
          </div>
        </div>
      )}
    </div>
  );
}
