// src/pages/WorldMapPage.jsx — Carte mondiale vins + spiritueux + bières
import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { winesAPI, spiritsAPI, beersAPI } from '../services/api';
import { useLang } from '../context/LangContext';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';

// ── Données régionales ────────────────────────────────────────────────────────
const WINE_REGIONS = [
  { id:'FR',  name:'France',        lon:2,    lat:46,   col:'#8B2A2A', type:'mixte',  regions:['Bordeaux','Bourgogne','Champagne','Alsace','Rhône','Loire','Provence'], grapes:['Cabernet Sauvignon','Merlot','Pinot Noir','Chardonnay'], wines:'Bordeaux, Bourgognes, Champagne', country:'france' },
  { id:'IT',  name:'Italie',        lon:12,   lat:42,   col:'#9A3030', type:'rouge',  regions:['Toscane','Piémont','Vénétie'], grapes:['Sangiovese','Nebbiolo','Pinot Grigio'], wines:'Barolo, Chianti, Amarone', country:'italie' },
  { id:'ES',  name:'Espagne',       lon:-3,   lat:40,   col:'#A03828', type:'rouge',  regions:['Rioja','Ribera del Duero'], grapes:['Tempranillo','Garnacha'], wines:'Rioja, Cava', country:'espagne' },
  { id:'PT',  name:'Portugal',      lon:-8,   lat:39,   col:'#B04030', type:'rouge',  regions:['Douro','Alentejo'], grapes:['Touriga Nacional'], wines:'Porto, Vinho Verde', country:'portugal' },
  { id:'DE',  name:'Allemagne',     lon:10,   lat:51,   col:'#6A7A30', type:'blanc',  regions:['Moselle','Rhin'], grapes:['Riesling'], wines:'Riesling, Spätlese', country:'allemagne' },
  { id:'US',  name:'États-Unis',    lon:-119, lat:37,   col:'#7A3A2A', type:'rouge',  regions:['Napa Valley','Sonoma'], grapes:['Cabernet Sauvignon','Zinfandel'], wines:'Napa Cabernet', country:'états-unis' },
  { id:'AR',  name:'Argentine',     lon:-68,  lat:-34,  col:'#8A4A2A', type:'rouge',  regions:['Mendoza'], grapes:['Malbec'], wines:'Malbec de Mendoza', country:'argentine' },
  { id:'CL',  name:'Chili',         lon:-71,  lat:-33,  col:'#9A5030', type:'rouge',  regions:['Maipo','Casablanca'], grapes:['Carménère'], wines:'Carménère, Cabernet', country:'chili' },
  { id:'AU',  name:'Australie',     lon:138,  lat:-33,  col:'#8A4A20', type:'rouge',  regions:['Barossa','Clare Valley'], grapes:['Shiraz'], wines:'Barossa Shiraz', country:'australie' },
  { id:'NZ',  name:'N.-Zélande',    lon:174,  lat:-41,  col:'#6A8A30', type:'blanc',  regions:['Marlborough'], grapes:['Sauvignon Blanc'], wines:'Sauvignon Blanc', country:'nouvelle-zélande' },
  { id:'ZA',  name:'Afrique du Sud',lon:19,   lat:-33,  col:'#7A5A20', type:'mixte',  regions:['Stellenbosch'], grapes:['Pinotage'], wines:'Pinotage, Chenin Blanc', country:'afrique du sud' },
];

const SPIRIT_REGIONS = [
  { id:'SCT', name:'Écosse',      lon:-4,   lat:57,   col:'#7A4A2A', type:'whisky',    regions:['Highlands','Speyside','Islay'], products:['Scotch Whisky','Single Malt','Blended'], country:'royaume-uni' },
  { id:'IRL', name:'Irlande',     lon:-8,   lat:53,   col:'#5A7A30', type:'whisky',    regions:['Dublin','Cork','Midlands'], products:['Irish Whiskey','Pot Still'], country:'irlande' },
  { id:'KY',  name:'Kentucky',    lon:-85,  lat:37.5, col:'#8A4020', type:'bourbon',   regions:['Bardstown','Louisville'], products:['Bourbon','Rye Whiskey'], country:'états-unis' },
  { id:'JM',  name:'Jamaïque',    lon:-77,  lat:18,   col:'#8A6020', type:'rhum',      regions:['Kingston','Montego Bay'], products:['Dark Rum','Aged Rum','Overproof'], country:'jamaïque' },
  { id:'CU',  name:'Cuba',        lon:-79,  lat:22,   col:'#9A7030', type:'rhum',      regions:['Santiago de Cuba','La Havane'], products:['Ron Cubano','Light Rum'], country:'cuba' },
  { id:'BB',  name:'Barbade',     lon:-59,  lat:13.2, col:'#7A8020', type:'rhum',      regions:['Bridgetown'], products:['Barbadian Rum','Mount Gay'], country:'barbade' },
  { id:'MX',  name:'Mexique',     lon:-103, lat:20,   col:'#8A7020', type:'tequila',   regions:['Jalisco','Oaxaca'], products:['Tequila','Mezcal'], country:'mexique' },
  { id:'COG', name:'Cognac',      lon:0,    lat:45.7, col:'#8A6218', type:'cognac',    regions:['Grande Champagne','Petite Champagne','Fins Bois'], products:['Cognac VS/VSOP/XO'], country:'france' },
  { id:'ARM', name:'Armagnac',    lon:0.1,  lat:43.8, col:'#7A5418', type:'armagnac',  regions:['Bas-Armagnac','Ténarèze'], products:['Armagnac'], country:'france' },
  { id:'NOR', name:'Normandie',   lon:0.4,  lat:49,   col:'#6A7A20', type:'calvados',  regions:['Pays d\'Auge','Domfrontais'], products:['Calvados AOC'], country:'france' },
  { id:'NL',  name:'Pays-Bas',    lon:4.9,  lat:52.3, col:'#3A6080', type:'gin',       regions:['Schiedam'], products:['Genever','Dutch Gin'], country:'pays-bas' },
  { id:'GBG', name:'Angleterre',  lon:-1.5, lat:52,   col:'#3A5070', type:'gin',       regions:['London'], products:['London Dry Gin'], country:'royaume-uni' },
  { id:'RU',  name:'Russie',      lon:40,   lat:56,   col:'#5A7090', type:'vodka',     regions:['Moscou','Saint-Pétersbourg'], products:['Vodka'], country:'russie' },
  { id:'PL',  name:'Pologne',     lon:20,   lat:52,   col:'#607080', type:'vodka',     regions:['Varsovie','Poznań'], products:['Polish Vodka','Żubrówka'], country:'pologne' },
  { id:'JP',  name:'Japon',       lon:135,  lat:35.5, col:'#9A7A50', type:'whisky',    regions:['Yamazaki','Yoichi'], products:['Japanese Whisky'], country:'japon' },
];

const BEER_REGIONS = [
  { id:'BE',  name:'Belgique',       lon:4.4,  lat:50.5, col:'#C09020', type:'biere', regions:['Bruxelles','Bruges','Liège'], products:['Trappiste','Gueuze','Saison','Lambic'], country:'belgique' },
  { id:'BAY', name:'Bavière',        lon:11.5, lat:48,   col:'#B08530', type:'biere', regions:['Munich','Bamberg'], products:['Weizen','Märzen','Bock','Dunkel'], country:'allemagne' },
  { id:'CZ',  name:'Bohême',         lon:15.5, lat:49.8, col:'#A08020', type:'biere', regions:['Pilsen','Prague'], products:['Pilsner Urquell','Lager bohémienne'], country:'tchéquie' },
  { id:'GBB', name:'Grande-Bretagne',lon:-2,   lat:53,   col:'#906818', type:'biere', regions:['Burton-on-Trent','London'], products:['Pale Ale','Porter','Stout','IPA'], country:'royaume-uni' },
  { id:'IRB', name:'Irlande',        lon:-7,   lat:53.2, col:'#7A6010', type:'biere', regions:['Dublin','Cork'], products:['Stout','Irish Red Ale'], country:'irlande' },
  { id:'USC', name:'Côte Ouest US',  lon:-122, lat:45,   col:'#C08020', type:'biere', regions:['Portland','Seattle','San Francisco'], products:['IPA','APA','Craft Beer'], country:'états-unis' },
  { id:'JPB', name:'Japon',          lon:139,  lat:36,   col:'#B09030', type:'biere', regions:['Tokyo','Sapporo'], products:['Lager japonaise','Craft Beer'], country:'japon' },
  { id:'MX2', name:'Mexique',        lon:-99,  lat:19.4, col:'#C0A020', type:'biere', regions:['Monterrey'], products:['Corona','Modelo','Lager mexicaine'], country:'mexique' },
];

const SPIRIT_COLORS = {
  whisky: '#7A4A2A', bourbon: '#8A4020', rhum: '#8A6020', tequila: '#8A7020',
  cognac: '#8A6218', armagnac: '#7A5418', calvados: '#6A7A20', gin: '#3A5070',
  vodka: '#607080', autre: '#555',
};

export default function WorldMapPage() {
  const { t } = useLang();
  const svgRef       = useRef(null);
  const containerRef = useRef(null);
  const tooltipRef   = useRef(null);
  const [filter,   setFilter]   = useState('all');   // all | wines | spirits | beers | cave
  const [selected, setSelected] = useState(null);    // { region, category }

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: winesData }   = useQuery({ queryKey: ['wines', { limit: 500 }], queryFn: () => winesAPI.list({ limit: 500 }).then(r => r.data) });
  const { data: spiritsData } = useQuery({ queryKey: ['spirits', {}], queryFn: () => spiritsAPI.list().then(r => r.data) });
  const { data: beersData }   = useQuery({ queryKey: ['beers', {}], queryFn: () => beersAPI.list().then(r => r.data) });

  const wines   = winesData?.wines || [];
  const spirits = spiritsData || [];
  const beers   = beersData   || [];

  // ── Cave counts by country ─────────────────────────────────────────────────
  const wineByCountry   = {};
  const spiritByCountry = {};
  const beerByCountry   = {};

  wines.filter(w => !w.is_drunk && w.quantity > 0).forEach(w => {
    const c = (w.country || '').toLowerCase();
    wineByCountry[c] = (wineByCountry[c] || 0) + (w.quantity || 1);
  });
  spirits.filter(s => s.status !== 'empty').forEach(s => {
    const c = (s.origin || '').toLowerCase().split(',')[0].trim();
    spiritByCountry[c] = (spiritByCountry[c] || 0) + (s.quantity || 1);
  });
  beers.filter(b => (b.quantity || 0) > 0).forEach(b => {
    const c = (b.country || b.origin || '').toLowerCase();
    beerByCountry[c] = (beerByCountry[c] || 0) + (b.quantity || 1);
  });

  // ── D3 rendering ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;
    const container = containerRef.current;
    const W = container.clientWidth || 700;
    const H = Math.round(W * 0.52);

    const svg = d3.select(svgRef.current).attr('viewBox', `0 0 ${W} ${H}`);
    svg.selectAll('*').remove();

    const proj = d3.geoNaturalEarth1().scale(W / 6.28).translate([W / 2, H / 2]);
    const path = d3.geoPath(proj);

    const showWines   = filter === 'all' || filter === 'wines'   || filter === 'cave';
    const showSpirits = filter === 'all' || filter === 'spirits' || filter === 'cave';
    const showBeers   = filter === 'all' || filter === 'beers'   || filter === 'cave';

    d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json').then(world => {
      svg.append('rect').attr('width', W).attr('height', H).attr('fill', '#1A1010');
      svg.selectAll('path.country')
        .data(topojson.feature(world, world.objects.countries).features)
        .join('path').attr('class', 'country').attr('d', path)
        .attr('fill', '#2C1A1A').attr('stroke', '#3A2020').attr('stroke-width', 0.4);

      // ── Wine pins (circles) ──────────────────────────────────────────────
      if (showWines) {
        WINE_REGIONS.forEach(r => {
          if (filter === 'cave' && !wineByCountry[r.country]) return;
          const pt = proj([r.lon, r.lat]);
          if (!pt) return;
          const qty    = wineByCountry[r.country] || 0;
          const inCave = qty > 0;
          const g = svg.append('g').style('cursor', 'pointer').attr('class', 'pin-wine');
          if (inCave) g.append('circle').attr('cx', pt[0]).attr('cy', pt[1]).attr('r', 13).attr('fill', 'none').attr('stroke', '#C9A84C').attr('stroke-width', 1.5).attr('opacity', 0.7);
          g.append('circle').attr('cx', pt[0]).attr('cy', pt[1]).attr('r', inCave ? 8 : 6)
            .attr('fill', inCave ? '#C9A84C' : r.col).attr('stroke', 'rgba(255,255,255,0.2)').attr('stroke-width', 0.5);
          g.append('text').attr('x', pt[0] + 11).attr('y', pt[1] + 4).attr('fill', '#D0B880').attr('font-size', 10).attr('font-family', 'Inter,sans-serif').text(r.name);
          if (inCave) g.append('text').attr('x', pt[0]).attr('y', pt[1] + 4).attr('text-anchor', 'middle').attr('fill', '#1A0F0F').attr('font-size', 9).attr('font-weight', 'bold').text(qty);
          g.on('mousemove', ev => showTooltip(ev, container, `
            <strong>${r.name}${inCave ? ` — <span style="color:var(--cv-gold)">${qty} ${t('maps.inCave')}</span>` : ''}</strong>
            <div style="margin-top:4px"><span style="color:var(--cv-text2)">${t('maps.wineRegions')} :</span> ${r.regions.slice(0, 2).join(', ')}</div>
            <div><span style="color:var(--cv-text2)">${t('maps.mainGrapes')} :</span> ${r.grapes.slice(0, 2).join(', ')}</div>
            <div><span style="color:var(--cv-text2)">🍷</span> ${r.wines}</div>`))
            .on('mouseleave', () => tooltipRef.current?.classList.remove('visible'))
            .on('click', () => setSelected({ region: r, category: 'wine' }));
        });
      }

      // ── Spirit pins (diamonds ◆) ─────────────────────────────────────────
      if (showSpirits) {
        SPIRIT_REGIONS.forEach(r => {
          if (filter === 'cave' && !spiritByCountry[r.country]) return;
          const pt = proj([r.lon, r.lat]);
          if (!pt) return;
          const qty    = spiritByCountry[r.country] || 0;
          const inCave = qty > 0;
          const col    = SPIRIT_COLORS[r.type] || '#7A5030';
          const g = svg.append('g').style('cursor', 'pointer').attr('class', 'pin-spirit');
          // Diamond shape
          const s = inCave ? 9 : 7;
          g.append('polygon')
            .attr('points', `${pt[0]},${pt[1]-s} ${pt[0]+s},${pt[1]} ${pt[0]},${pt[1]+s} ${pt[0]-s},${pt[1]}`)
            .attr('fill', inCave ? '#C9A84C' : col).attr('stroke', 'rgba(255,255,255,0.25)').attr('stroke-width', 0.5);
          g.append('text').attr('x', pt[0] + 12).attr('y', pt[1] + 4).attr('fill', '#D0B880').attr('font-size', 9).attr('font-family', 'Inter,sans-serif').text(r.name);
          if (inCave) g.append('text').attr('x', pt[0]).attr('y', pt[1] + 4).attr('text-anchor', 'middle').attr('fill', '#1A0F0F').attr('font-size', 8).attr('font-weight', 'bold').text(qty);
          g.on('mousemove', ev => showTooltip(ev, container, `
            <strong>🥃 ${r.name}${inCave ? ` — <span style="color:var(--cv-gold)">${qty} ${t('maps.inCave')}</span>` : ''}</strong>
            <div style="margin-top:4px"><span style="color:var(--cv-text2)">${t('maps.spiritRegions')} :</span> ${r.regions.slice(0, 2).join(', ')}</div>
            <div><span style="color:var(--cv-text2)">${t('maps.products')} :</span> ${r.products.slice(0, 2).join(', ')}</div>`))
            .on('mouseleave', () => tooltipRef.current?.classList.remove('visible'))
            .on('click', () => setSelected({ region: r, category: 'spirit' }));
        });
      }

      // ── Beer pins (triangles ▲) ──────────────────────────────────────────
      if (showBeers) {
        BEER_REGIONS.forEach(r => {
          if (filter === 'cave' && !beerByCountry[r.country]) return;
          const pt = proj([r.lon, r.lat]);
          if (!pt) return;
          const qty    = beerByCountry[r.country] || 0;
          const inCave = qty > 0;
          const col    = '#C09020';
          const g = svg.append('g').style('cursor', 'pointer').attr('class', 'pin-beer');
          const s = inCave ? 9 : 7;
          g.append('polygon')
            .attr('points', `${pt[0]},${pt[1]-s} ${pt[0]+s},${pt[1]+s} ${pt[0]-s},${pt[1]+s}`)
            .attr('fill', inCave ? '#C9A84C' : col).attr('stroke', 'rgba(255,255,255,0.25)').attr('stroke-width', 0.5);
          g.append('text').attr('x', pt[0] + 12).attr('y', pt[1] + 4).attr('fill', '#D0B880').attr('font-size', 9).attr('font-family', 'Inter,sans-serif').text(r.name);
          if (inCave) g.append('text').attr('x', pt[0]).attr('y', pt[1] + 3).attr('text-anchor', 'middle').attr('fill', '#1A0F0F').attr('font-size', 8).attr('font-weight', 'bold').text(qty);
          g.on('mousemove', ev => showTooltip(ev, container, `
            <strong>🍺 ${r.name}${inCave ? ` — <span style="color:var(--cv-gold)">${qty} ${t('maps.inCave')}</span>` : ''}</strong>
            <div style="margin-top:4px"><span style="color:var(--cv-text2)">${t('maps.beerRegions')} :</span> ${r.regions.slice(0, 2).join(', ')}</div>
            <div><span style="color:var(--cv-text2)">${t('maps.products')} :</span> ${r.products.slice(0, 2).join(', ')}</div>`))
            .on('mouseleave', () => tooltipRef.current?.classList.remove('visible'))
            .on('click', () => setSelected({ region: r, category: 'beer' }));
        });
      }

    }).catch(() => {
      svg.append('rect').attr('width', W).attr('height', H).attr('fill', '#1A1010');
      svg.append('text').attr('x', W / 2).attr('y', H / 2).attr('text-anchor', 'middle').attr('fill', '#C9A84C').attr('font-size', 13).text(t('common.loading'));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, wines, spirits, beers]);

  function showTooltip(ev, container, html) {
    const tt = tooltipRef.current; if (!tt) return;
    const rect = container.getBoundingClientRect();
    tt.style.left = (ev.clientX - rect.left + 12) + 'px';
    tt.style.top  = (ev.clientY - rect.top - 12) + 'px';
    tt.innerHTML  = html;
    tt.classList.add('visible');
  }

  // ── Detail panel ───────────────────────────────────────────────────────────
  const sel = selected?.region;
  const cat = selected?.category;
  const selCaveItems = sel ? (
    cat === 'wine'
      ? wines.filter(w => !w.is_drunk && w.quantity > 0 && (w.country || '').toLowerCase() === sel.country)
      : cat === 'spirit'
        ? spirits.filter(s => s.status !== 'empty' && (s.origin || '').toLowerCase().includes(sel.country))
        : beers.filter(b => (b.quantity || 0) > 0 && (b.country || b.origin || '').toLowerCase().includes(sel.country))
  ) : [];

  const selQty = cat === 'wine' ? (wineByCountry[sel?.country] || 0)
    : cat === 'spirit' ? (spiritByCountry[sel?.country] || 0)
    : (beerByCountry[sel?.country] || 0);

  const filters = [
    { v: 'all',     l: t('maps.filterAll') },
    { v: 'wines',   l: t('maps.filterWines') },
    { v: 'spirits', l: t('maps.filterSpirits') },
    { v: 'beers',   l: t('maps.filterBeers') },
    { v: 'cave',    l: t('maps.filterMyCave') },
  ];

  return (
    <div className="fade-in">
      <div className="card mb-3">
        <div className="card-header d-flex flex-wrap gap-2 align-items-center">
          <h6 className="card-title me-3">{t('maps.world')}</h6>
          <div className="filter-pills">
            {filters.map(f => (
              <button key={f.v} className={`filter-pill ${filter === f.v ? 'active' : ''}`} onClick={() => { setFilter(f.v); setSelected(null); }}>{f.l}</button>
            ))}
          </div>
        </div>
        <div className="card-body p-2">
          <div className="map-container" ref={containerRef} style={{ minHeight: 220 }}>
            <div className="map-tooltip" ref={tooltipRef} />
            <svg ref={svgRef} style={{ width: '100%', display: 'block' }} />
          </div>

          {/* Legend */}
          <div className="d-flex gap-3 flex-wrap p-2" style={{ fontSize: '0.75rem', color: 'var(--cv-text2)' }}>
            {(filter === 'all' || filter === 'wines' || filter === 'cave') && (
              <>
                <span><span style={{ display:'inline-block', width:10, height:10, background:'#8B2A2A', borderRadius:'50%', marginRight:4 }} />{t('maps.redDom')}</span>
                <span><span style={{ display:'inline-block', width:10, height:10, background:'#6A7A30', borderRadius:'50%', marginRight:4 }} />{t('maps.whiteDom')}</span>
              </>
            )}
            {(filter === 'all' || filter === 'spirits' || filter === 'cave') && (
              <span>
                <span style={{ display:'inline-block', width:0, height:0, borderLeft:'6px solid transparent', borderRight:'6px solid transparent', borderBottom:'10px solid #7A4A2A', marginRight:4, transform:'rotate(180deg)', verticalAlign:'middle' }} />
                {t('maps.spiritRegions')}
              </span>
            )}
            {(filter === 'all' || filter === 'beers' || filter === 'cave') && (
              <span>
                <span style={{ display:'inline-block', width:0, height:0, borderLeft:'6px solid transparent', borderRight:'6px solid transparent', borderBottom:'10px solid #C09020', marginRight:4, verticalAlign:'middle' }} />
                {t('maps.beerRegions')}
              </span>
            )}
            <span><span style={{ display:'inline-block', width:10, height:10, background:'#C9A84C', borderRadius:'50%', marginRight:4 }} />{t('maps.inYourCave')}</span>
            <span style={{ color: 'var(--cv-text3)' }}>{t('maps.clickDetail')}</span>
          </div>
        </div>
      </div>

      {/* Detail panel */}
      {sel && (
        <div className="card fade-in">
          <div className="card-header d-flex justify-content-between align-items-center">
            <h6 className="card-title mb-0">
              {cat === 'wine' ? '🍷' : cat === 'spirit' ? '🥃' : '🍺'} {sel.name}
              {selQty > 0 && <span className="badge-open ms-2">{selQty} {t('maps.inCave')}</span>}
            </h6>
            <button className="btn btn-sm" style={{ color:'var(--cv-text3)', background:'none', border:'none' }} onClick={() => setSelected(null)}>
              <i className="bi bi-x-lg" />
            </button>
          </div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-md-4">
                <div style={{ fontSize:'0.65rem', letterSpacing:2, color:'var(--cv-text3)', textTransform:'uppercase', marginBottom:8 }}>
                  {cat === 'wine' ? t('maps.topRegions') : cat === 'spirit' ? t('maps.spiritRegions') : t('maps.beerRegions')}
                </div>
                {sel.regions.map(r => (
                  <div key={r} style={{ fontSize:'0.85rem', color:'var(--cv-text)', padding:'4px 0', borderBottom:'0.5px solid var(--cv-border)' }}>{r}</div>
                ))}
              </div>
              <div className="col-md-4">
                <div style={{ fontSize:'0.65rem', letterSpacing:2, color:'var(--cv-text3)', textTransform:'uppercase', marginBottom:8 }}>
                  {cat === 'wine' ? t('maps.mainGrapes') : t('maps.products')}
                </div>
                {(sel.grapes || sel.products || []).map(g => (
                  <div key={g} style={{ fontSize:'0.85rem', color:'var(--cv-text)', padding:'4px 0', borderBottom:'0.5px solid var(--cv-border)' }}>{g}</div>
                ))}
              </div>
              {selCaveItems.length > 0 && (
                <div className="col-md-4">
                  <div style={{ fontSize:'0.65rem', letterSpacing:2, color:'var(--cv-gold)', textTransform:'uppercase', marginBottom:8 }}>{t('maps.yourBottles')}</div>
                  {selCaveItems.map(item => (
                    <div key={item.id} style={{ fontSize:'0.82rem', color:'var(--cv-text)', padding:'4px 0', borderBottom:'0.5px solid var(--cv-border)', display:'flex', justifyContent:'space-between' }}>
                      <span>{item.name} {item.vintage || item.age || ''}</span>
                      <span style={{ color:'var(--cv-gold)' }}>{item.quantity}×</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {sel.wines && (
              <div style={{ marginTop:'0.75rem', fontSize:'0.82rem', color:'var(--cv-text2)', fontStyle:'italic' }}>{sel.wines}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
