/* Sligo Site Models: the downloads. Contour plan (PDF/SVG/DXF/CSV + table of building heights), laser contour kit
   and terrain-only 3D print, all for one square: sq = { x0, y0, g } in local metres. */
(function (root) {
  'use strict';
  const { esc, fmtN } = AW;
  const tick = () => new Promise(r => setTimeout(r, 20));
  const lv = v => v == null ? '' : v.toFixed(2);
  const PAPERS = [['A3', 420, 297], ['A2', 594, 420], ['A1', 841, 594], ['A0', 1189, 841]];
  const MG = 15;
  // the smallest landscape sheet whose square frame takes the plan, with at least 105 mm beside it for the title panel
  function paperFor(mm) { return PAPERS.find(([, W, H]) => mm <= H - 2 * MG && W - mm - 2 * MG >= 105) || null; }
  const nice = m => [5, 10, 20, 25, 50, 100, 200, 250, 500].filter(v => v <= m).pop() || 5;

  // ---------------------------------------------------------------- contour plan
  // o: { DATA, sq, scale, name, interval, buildings, numbers, roads, water, spots, paper? ('kit' = frame only) }
  function contourPlan(o) {
    const { DATA, sq, scale } = o, K = 1000 / scale, kit = o.paper === 'kit';
    MyModel.setScale(scale);
    const G = MyModel.windowGrid(DATA.D, { x0: sq.x0, y0: sq.y0, size: sq.g });
    const fr = G.size * K;                                                   // frame, mm
    let PW, PH, pname;
    if (kit) { PW = fr + 140; PH = Math.max(fr + 2 * MG, 200); pname = 'plan'; }
    else { const p = paperFor(fr); if (!p) throw new Error(`At 1:${fmtN(scale)} this square is ${fmtN(fr)} mm across, too big for A0. Choose a smaller scale or a smaller square.`); [pname, PW, PH] = p; }
    const mx = MG, my = MG, panel = mx + fr + 12;
    const sqG = { x0: G.x0, y0: G.y0, g: G.size };
    const P = (x, y) => [mx + (x - G.x0) * K, my + fr - (y - G.y0) * K];
    const items = [];
    if (o.water) DATA.water.items.forEach(([, polys]) => polys.forEach(p => { const c = SiteData.clipPoly(p, sqG); if (c) items.push({ k: 'poly', rings: c.map(r => r.map(([x, y]) => P(x, y))), fill: '#d6e8f3', stroke: '#5a9fd4', w: .15 }); }));
    if (o.roads) DATA.roads.polygons.forEach(p => { const c = SiteData.clipPoly(p, sqG); if (c) items.push({ k: 'poly', rings: c.map(r => r.map(([x, y]) => P(x, y))), fill: '#f7f6f3', stroke: '#9a9a9a', w: .12 }); });
    const segs = MyModel.planSegments(G, o.interval), every = o.interval * 5;
    segs.forEach(({ L, segs: s }) => {
      const idx = Math.abs(L / every - Math.round(L / every)) < 1e-6;
      for (let i = 0; i < s.length; i += 4) items.push({ k: 'line', pts: [P(s[i], s[i + 1]), P(s[i + 2], s[i + 3])], stroke: idx ? '#7a5a3a' : '#bda083', w: idx ? .3 : .15 });
    });
    const list = SiteData.numbered(DATA, sqG), labels = [];
    if (o.buildings) {
      SiteData.footprintsIn(DATA, sqG).forEach(({ polys }) => polys.forEach(p => items.push({ k: 'poly', rings: p.map(r => r.map(([x, y]) => P(x, y))), fill: '#e2dcd1', stroke: '#2f3438', w: .18 })));
      if (o.numbers) {
        const th = Math.max(1.3, Math.min(2.2, 1.8 * Math.sqrt(1000 / scale) * .7));    // number height, mm
        list.forEach(b => { const [x, y] = P(b.at[0], b.at[1]); labels.push({ x, y, s: String(b.n), h: th }); });
      }
    }
    // spot heights: a regular grid of levels on open ground, plus the highest and lowest points
    const spots = [];
    if (o.spots) {
      const sp = nice(sq.g / 6), fp = o.buildings ? SiteData.footprintsIn(DATA, sqG) : [];
      const onBld = (x, y) => fp.some(({ polys }) => polys.some(p => SiteData.inPoly([x, y], p)));
      for (let x = Math.ceil((DATA.X0 + G.x0) / sp) * sp - DATA.X0; x < G.x0 + G.size; x += sp)
        for (let y = Math.ceil((DATA.Y0 + G.y0) / sp) * sp - DATA.Y0; y < G.y0 + G.size; y += sp) {
          const z = DATA.D.sample(x, y); if (z !== z || onBld(x, y)) continue;
          const [px, py] = P(x, y); if (px < mx + 4 || py < my + 4 || px > mx + fr - 10 || py > my + fr - 4) continue;
          spots.push({ x: px, y: py, s: z.toFixed(2) });
        }
    }
    // ITM grid ticks
    const gstep = nice(sq.g / 4), E0 = DATA.X0 + G.x0, N0 = DATA.Y0 + G.y0, ticks = [];
    for (let E = Math.ceil(E0 / gstep) * gstep; E <= E0 + G.size; E += gstep) ticks.push(['E', E, mx + (E - E0) * K]);
    for (let N = Math.ceil(N0 / gstep) * gstep; N <= N0 + G.size; N += gstep) ticks.push(['N', N, my + fr - (N - N0) * K]);
    const sb = nice(70 / K), sbmm = sb * K;
    const nEst = list.filter(b => b.est).length, tPages = o.buildings && o.numbers && list.length ? Math.ceil(list.length / 52) : 0;
    const title = o.name || 'Sligo site';
    const txt = [
      [panel, my + 10, 7, title, 'serif'], [panel, my + 16.5, 3.4, 'Sligo Site Models · ATU Sligo Architecture'],
      [panel, my + 28, 4.2, `Scale 1:${fmtN(scale)}${kit ? '' : ' on ' + pname}`],
      [panel, my + 34, 3.2, `Contours every ${o.interval} m, thicker every ${fmtN(every, every % 1 ? 1 : 0)} m`], [panel, my + 39, 3.2, 'Levels in metres OD (Malin Head)'],
      [panel, my + 46, 3.2, `${fmtN(G.size, 1)} m square`], [panel, my + 51, 3.2, `South-west corner ITM E ${fmtN(E0)}, N ${fmtN(N0)}`]];
    if (o.buildings && o.numbers && list.length) {
      txt.push([panel, my + 104, 3.2, `${list.length} buildings, numbered from the north edge,`], [panel, my + 109, 3.2, 'west to east. Their heights are in the table'],
        [panel, my + 114, 3.2, kit ? '(building_heights.pdf / .csv).' : `on page${tPages > 1 ? 's' : ''} 2${tPages > 1 ? '–' + (tPages + 1) : ''}.`]);
    }
    txt.push([panel, PH - MG - 14, 2.5, 'Ground: 2006 Sligo survey, OPW 2011 lidar (CC BY 4.0).'], [panel, PH - MG - 10, 2.5, 'Buildings: Tailte Éireann. Roads, water: © OpenStreetMap contributors.'],
      [panel, PH - MG - 6, 2.5, `Made ${new Date().toLocaleDateString('en-IE')} with Sligo Site Models.`]);

    // ---- SVG
    const f2 = v => v.toFixed(2);
    const poly = it => `<path d="${it.rings.map(r => 'M' + r.map(([x, y]) => f2(x) + ',' + f2(y)).join('L') + 'Z').join('')}" fill="${it.fill}" stroke="${it.stroke}" stroke-width="${it.w}" fill-rule="evenodd"/>`;
    const line = it => `<path d="M${f2(it.pts[0][0])},${f2(it.pts[0][1])}L${f2(it.pts[1][0])},${f2(it.pts[1][1])}" stroke="${it.stroke}" stroke-width="${it.w}" fill="none"/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PW}mm" height="${PH}mm" viewBox="0 0 ${PW} ${PH}"><rect width="${PW}" height="${PH}" fill="#fff"/>
<defs><clipPath id="c"><rect x="${mx}" y="${my}" width="${f2(fr)}" height="${f2(fr)}"/></clipPath></defs><g clip-path="url(#c)">${items.map(it => it.k === 'poly' ? poly(it) : line(it)).join('')}
${spots.map(s => `<path d="M${f2(s.x - .6)},${f2(s.y)}h1.2M${f2(s.x)},${f2(s.y - .6)}v1.2" stroke="#000" stroke-width=".15"/><text x="${f2(s.x + .9)}" y="${f2(s.y - .5)}" font-size="1.6" font-family="sans-serif" fill="#333">${s.s}</text>`).join('')}
${labels.map(l => `<text x="${f2(l.x)}" y="${f2(l.y + l.h * .36)}" font-size="${f2(l.h)}" font-weight="600" text-anchor="middle" font-family="sans-serif" fill="#000" stroke="#fff" stroke-width="${f2(l.h * .18)}" paint-order="stroke">${l.s}</text>`).join('')}</g>
<rect x="${mx}" y="${my}" width="${f2(fr)}" height="${f2(fr)}" fill="none" stroke="#000" stroke-width=".4"/>
${ticks.map(([a, v, p]) => a === 'E' ? `<path d="M${f2(p)},${my}v-3M${f2(p)},${f2(my + fr)}v3" stroke="#000" stroke-width=".2"/><text x="${f2(p)}" y="${f2(my + fr + 6)}" font-size="2.4" text-anchor="middle" font-family="sans-serif">${v}</text>` : `<path d="M${mx},${f2(p)}h-3M${f2(mx + fr)},${f2(p)}h3" stroke="#000" stroke-width=".2"/><text x="${f2(mx + fr + 4)}" y="${f2(p + .8)}" font-size="2.4" font-family="sans-serif">${v}</text>`).join('')}
${txt.map(([x, y, s, t, fam]) => `<text x="${x + 6}" y="${y}" font-size="${s}" font-family="${fam || 'sans-serif'}">${esc(t)}</text>`).join('')}
<g transform="translate(${panel + 6},${my + 62})"><rect width="${f2(sbmm / 2)}" height="2" fill="#000"/><rect x="${f2(sbmm / 2)}" width="${f2(sbmm / 2)}" height="2" fill="#fff" stroke="#000" stroke-width=".2"/><text y="6" font-size="2.6" font-family="sans-serif">0</text><text x="${f2(sbmm)}" y="6" font-size="2.6" text-anchor="end" font-family="sans-serif">${sb} m</text></g>
<g transform="translate(${panel + 12},${my + 84})"><path d="M0,-8L4,6L0,3L-4,6Z" fill="#000"/><text y="-10" font-size="4" text-anchor="middle" font-family="sans-serif">N</text></g></svg>`;

    // ---- PDF: the plan, then the table of building heights on A4
    const { jsPDF } = window.jspdf, doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [PW, PH] });
    const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    doc.saveGraphicsState(); doc.rect(mx, my, fr, fr, null); doc.clip(); doc.discardPath();
    items.forEach(it => {
      doc.setLineWidth(it.w); doc.setDrawColor(...hex(it.stroke));
      if (it.k === 'line') { doc.line(it.pts[0][0], it.pts[0][1], it.pts[1][0], it.pts[1][1]); return; }
      it.rings.forEach((r, ri) => { if (r.length < 3) return; doc.setFillColor(...hex(ri ? '#ffffff' : it.fill)); const d = r.slice(1).map((p, i) => [p[0] - r[i][0], p[1] - r[i][1]]); doc.lines(d, r[0][0], r[0][1], [1, 1], 'FD', true); });
    });
    doc.setDrawColor(0); doc.setLineWidth(.15); doc.setTextColor(50);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(1.6 * 2.83);
    spots.forEach(s => { doc.line(s.x - .6, s.y, s.x + .6, s.y); doc.line(s.x, s.y - .6, s.x, s.y + .6); doc.text(s.s, s.x + .9, s.y - .5); });
    doc.setTextColor(0); doc.setFont('helvetica', 'bold');
    labels.forEach(l => {
      doc.setFontSize(l.h * 2.83); const w = doc.getTextWidth(l.s);
      doc.setFillColor(255, 255, 255); doc.setGState && doc.setGState(new doc.GState({ opacity: .75 }));
      doc.rect(l.x - w / 2 - .25, l.y - l.h * .45, w + .5, l.h * .9, 'F');
      doc.setGState && doc.setGState(new doc.GState({ opacity: 1 }));
      doc.text(l.s, l.x, l.y + l.h * .36, { align: 'center' });
    });
    doc.restoreGraphicsState();
    doc.setDrawColor(0); doc.setLineWidth(.4); doc.rect(mx, my, fr, fr);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
    ticks.forEach(([a, v, p]) => { doc.setLineWidth(.2); if (a === 'E') { doc.line(p, my, p, my - 3); doc.line(p, my + fr, p, my + fr + 3); doc.text(String(v), p, my + fr + 6, { align: 'center' }); } else { doc.line(mx, p, mx - 3, p); doc.line(mx + fr, p, mx + fr + 3, p); doc.text(String(v), mx + fr + 4, p + .8); } });
    txt.forEach(([x, y, s, t, fam]) => { doc.setFont(fam ? 'times' : 'helvetica', fam ? 'bold' : 'normal'); doc.setFontSize(s * 2.83); doc.text(t, x + 6, y); });
    doc.setFont('helvetica', 'normal');
    doc.setFillColor(0); doc.rect(panel + 6, my + 62, sbmm / 2, 2, 'F'); doc.rect(panel + 6 + sbmm / 2, my + 62, sbmm / 2, 2); doc.setFontSize(7); doc.text('0', panel + 6, my + 68); doc.text(sb + ' m', panel + 6 + sbmm, my + 68, { align: 'right' });
    doc.triangle(panel + 12, my + 76, panel + 16, my + 90, panel + 8, my + 90, 'F'); doc.setFontSize(11); doc.text('N', panel + 12, my + 74, { align: 'center' });
    // legend
    const ly = my + 128; doc.setFontSize(8);
    const key = [['#e2dcd1', '#2f3438', 'Building footprint (number = table row)'], ['#f7f6f3', '#9a9a9a', 'Road'], ['#d6e8f3', '#5a9fd4', 'Water']];
    key.forEach(([f, s, t], i) => { if ((i === 0 && !o.buildings) || (i === 1 && !o.roads) || (i === 2 && !o.water)) return; doc.setFillColor(...hex(f)); doc.setDrawColor(...hex(s)); doc.setLineWidth(.2); doc.rect(panel + 6, ly + i * 6 - 3, 6, 4, 'FD'); doc.text(t, panel + 15, ly + i * 6); });
    doc.setDrawColor(...hex('#7a5a3a')); doc.setLineWidth(.3); doc.line(panel + 6, ly + 17, panel + 12, ly + 17); doc.text('Contour, index / intermediate', panel + 15, ly + 18);
    if (o.buildings && o.numbers && list.length && !kit) tablePages(doc, list, o, E0, N0, G.size);
    const csv = tableCSV(list, DATA, o.platOf);
    return { svg, pdf: doc.output('blob'), list, csv, G, paper: pname, nEst, tablePDF: () => { const d = new jsPDF({ unit: 'mm', format: 'a4' }); tablePages(d, list, o, E0, N0, G.size, true); return d.output('blob'); } };
  }

  // table of building heights, A4 portrait, 52 rows a page
  function tablePages(doc, list, o, E0, N0, size, first) {
    const cols = o.platOf ? [['No.', 12, 'n'], ['Use', 38, 'use'], ['Ground', 19, 'ground'], ['Eaves', 19, 'eave'], ['Roof', 19, 'roof'], ['Top', 19, 'top'], ['Height', 18, 'h'], ['Platform', 18, 'plat'], ['Source', 18, 'src']]
      : [['No.', 12, 'n'], ['Use', 52, 'use'], ['Ground', 19, 'ground'], ['Eaves', 19, 'eave'], ['Roof', 19, 'roof'], ['Top', 19, 'top'], ['Height', 18, 'h'], ['Source', 22, 'src']];
    const num = i => i >= 2 && i < cols.length - 1;
    const rowsPer = 52, pages = Math.ceil(list.length / rowsPer);
    for (let p = 0; p < pages; p++) {
      if (!(first && p === 0)) doc.addPage('a4', 'portrait');
      const x0 = 15; let y = 18;
      doc.setFont('times', 'bold'); doc.setFontSize(15); doc.text(`${o.name || 'Sligo site'}: building heights`, x0, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); y += 6;
      doc.text(`1:${fmtN(o.scale)} plan · ${fmtN(size, 1)} m square, SW corner ITM E ${fmtN(E0)}, N ${fmtN(N0)} · page ${p + 1} of ${pages}`, x0, y); y += 4.5;
      doc.text('Levels in m OD (Malin Head). Height = roof level minus ground level. Eaves, roof and top are blank where there is no survey.', x0, y); y += 4.5;
      if (o.platOf) { doc.text('Platform = the level the model is cut to inside the footprint (the contour at or below its lowest ground).', x0, y); y += 4.5; }
      y += 2.5;
      doc.setFont('helvetica', 'bold'); let x = x0;
      cols.forEach(([t, w], i) => { doc.text(t, num(i) ? x + w - 2 : x, y, { align: num(i) ? 'right' : 'left' }); x += w; });
      doc.setLineWidth(.3); doc.line(x0, y + 1.5, x, y + 1.5); y += 5.6;
      doc.setFont('helvetica', 'normal');
      list.slice(p * rowsPer, (p + 1) * rowsPer).forEach((b, k) => {
        if (k % 2) { doc.setFillColor(243, 241, 236); doc.rect(x0, y - 3.4, x - x0, 4.6, 'F'); }
        let cx = x0;
        const ul = o.platOf ? 22 : 30;
        const v = { plat: o.platOf ? lv(o.platOf(b)) : '', n: String(b.n), use: b.use.length > ul ? b.use.slice(0, ul - 2) + '...' : b.use, ground: lv(b.ground), eave: lv(b.eave), roof: lv(b.roof), top: lv(b.top), h: b.h.toFixed(1), src: b.est ? 'estimated*' : 'survey' };
        cols.forEach(([, w, f], i) => { doc.text(v[f], num(i) ? cx + w - 2 : cx, y, { align: num(i) ? 'right' : 'left' }); cx += w; });
        y += 4.6;
      });
      doc.setFontSize(7.5); doc.setTextColor(80);
      doc.text('survey: Tailte Éireann building heights. *estimated: from the OPW 2011 lidar surface (capped for small buildings) or a default for sheds; check on site.', x0, 287, { maxWidth: 180 });
      doc.setTextColor(0);
    }
  }
  function tableCSV(list, DATA, platOf) {
    const q = s => /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    return 'no,use,ground_m_OD,eaves_m_OD,roof_m_OD,top_m_OD,height_m,' + (platOf ? 'platform_m_OD,' : '') + 'source,footprint_m2,ITM_E,ITM_N\n' +
      list.map(b => [b.n, q(b.use), lv(b.ground), lv(b.eave), lv(b.roof), lv(b.top), b.h.toFixed(2)].concat(platOf ? [lv(platOf(b))] : [], [b.est ? 'estimated' : 'survey', b.fp, (DATA.X0 + b.at[0]).toFixed(1), (DATA.Y0 + b.at[1]).toFixed(1)]).join(',')).join('\n') + '\n';
  }

  // DXF of the plan for CAD: contours (index and intermediate) and footprints at their levels, numbers, the square; ITM metres
  function planDXF(o, plan) {
    const { DATA } = o, G = plan.G, X = DATA.X0, Y = DATA.Y0, ents = [], every = o.interval * 5;
    MyModel.planSegments(G, o.interval).forEach(({ L, segs }) => {
      const layer = Math.abs(L / every - Math.round(L / every)) < 1e-6 ? 'CONTOUR_INDEX' : 'CONTOUR';
      SiteData.chain(segs).forEach(l => ents.push({ t: 'pl', layer, z: L, closed: l.closed, pts: l.pts.map(([x, y]) => [X + x, Y + y]) }));
    });
    const sqG = { x0: G.x0, y0: G.y0, g: G.size };
    if (o.buildings) {
      SiteData.footprintsIn(DATA, sqG).forEach(({ b, polys }) => polys.forEach(p => p.forEach(r => ents.push({ t: 'pl', layer: 'FOOTPRINT', z: b.ground, closed: true, pts: r.map(([x, y]) => [X + x, Y + y]) }))));
      if (o.numbers) plan.list.forEach(b => ents.push({ t: 'tx', layer: 'BUILDING_NO', x: X + b.at[0], y: Y + b.at[1], z: b.ground, h: Math.max(0.8, o.scale / 1000 * 1.8), s: String(b.n) }));
    }
    if (o.water) DATA.water.items.forEach(([level, polys]) => polys.forEach(p => { const c = SiteData.clipPoly(p, sqG); if (c) c.forEach(r => ents.push({ t: 'pl', layer: 'WATER', z: level, closed: true, pts: r.map(([x, y]) => [X + x, Y + y]) })); }));
    if (o.roads) DATA.roads.polygons.forEach(p => { const c = SiteData.clipPoly(p, sqG); if (c) c.forEach(r => ents.push({ t: 'pl', layer: 'ROAD', z: 0, closed: true, pts: r.map(([x, y]) => [X + x, Y + y]) })); });
    ents.push({ t: 'pl', layer: 'SITE_SQUARE', z: 0, closed: true, pts: [[0, 0], [G.size, 0], [G.size, G.size], [0, G.size]].map(([x, y]) => [X + G.x0 + x, Y + G.y0 + y]) });
    return SiteData.dxf([['CONTOUR', 33], ['CONTOUR_INDEX', 32], ['FOOTPRINT', 7], ['BUILDING_NO', 1], ['WATER', 5], ['ROAD', 8], ['SITE_SQUARE', 30]], ents);
  }

  // ---------------------------------------------------------------- laser kits: hollow layers, solid layers, waffle sections
  async function laserKit(o, prog) {
    if (o.kind === 'waffle') return waffleKit(o, prog);
    const { DATA, sq, scale, board } = o, [sw, sh] = o.sheet, K = 1000 / scale, hollow = o.kind !== 'solid';
    prog('Slicing the contours…', .1); await tick();
    MyModel.setScale(scale);
    const M = MyModel.buildModel(DATA.D, { x0: sq.x0, y0: sq.y0, size: sq.g }, board, { scale, hollow, rim: 15 });
    if (!M.layers.length) throw new Error('This square is flat at this board thickness: try a thinner board or a larger scale.');
    const G = M.G, sqG = { x0: G.x0, y0: G.y0, g: G.size }, layerOf = gr => { let i = M.layers.length - 1; while (i > 0 && M.layers[i].L > gr) i--; return M.layers[i].L > gr ? -1 : i; };
    // the layer a building stands on: with platforms, the layer under its lowest ground; otherwise the one under its median ground
    const standOn = b => layerOf(o.platforms ? SiteData.minGround(DATA, b) : b.ground);
    let nB = 0, nP = 0;
    if (o.platforms) {                                                       // cut each footprint out of every layer above its platform layer
      prog('Cutting the building platforms…', .25); await tick();
      const MF = await Print3D.manifold(), toMM = r => r.map(([x, y]) => [(x - G.x0) * K, (y - G.y0) * K]);
      const fps = SiteData.footprintsIn(DATA, sqG).map(({ b, polys }) => ({ j: standOn(b), cs: new MF.CrossSection(polys.flatMap(p => p.map(toMM)), 'EvenOdd') })).filter(f => f.cs.area() > .5);
      nP = fps.length;
      M.layers.forEach((ly, i) => {
        const cut = fps.filter(f => f.j < i); if (!cut.length) return;
        const piece = new MF.CrossSection(ly.loops, 'EvenOdd'), hole = MF.CrossSection.union(cut.map(f => f.cs)), rest = piece.subtract(hole);
        ly.loops = rest.toPolygons().filter(r => Math.abs(SiteData.area(r)) > .5);
        piece.delete(); hole.delete(); rest.delete();
      });
      fps.forEach(f => f.cs.delete());
    }
    if (o.engrave) {                                                         // footprints (and numbers) engraved on the layer each building stands on
      SiteData.footprintsIn(DATA, sqG).forEach(({ b, polys }) => {
        const i = standOn(b); if (i < 0) return;
        polys.forEach(p => p.forEach(r => { const pts = r.map(([x, y]) => [(x - G.x0) * K, (y - G.y0) * K]); pts.push(pts[0]); M.layers[i].engrave.push(pts); }));
        nB++;
      });
      if (o.numbers) SiteData.numbered(DATA, sqG).forEach(b => {
        const i = standOn(b); if (i < 0) return;
        const t = MyModel.strokeText(String(b.n), 1.6), cx = (b.at[0] - G.x0) * K, cy = (b.at[1] - G.y0) * K;
        t.lines.forEach(l => M.layers[i].engrave.push(l.map(([x, y]) => [cx + x, cy + y])));
      });
    }
    prog(`Nesting ${M.layers.length} layers on ${sw} × ${sh} mm sheets…`, .4); await tick();
    const pk = MyModel.nest(M.layers, sw, sh, 8, 3);
    if (pk.error) throw new Error(pk.error);
    prog('Writing the sheets and the plan…', .8); await tick();
    const zip = new JSZip(), title = `${o.name || 'Sligo'} 1:${scale} ${board} mm ${hollow ? 'hollow' : 'solid'}`;
    for (let i = 0; i < pk.count; i++) { const nn = String(i + 1).padStart(2, '0'); zip.file(`sheet_${nn}.svg`, MyModel.toSVG(pk, i, `${title} sheet ${nn}`)); zip.file(`sheet_${nn}.dxf`, MyModel.toDXF(pk, i)); }
    const layerM = board / K;
    if (o.platforms) o = Object.assign({}, o, { platOf: b => { const j = standOn(b); return j < 0 ? M.base : M.layers[j].L; } });
    const plan = addPlan(zip, o, +layerM.toFixed(3));
    zip.file('README.txt', `${title} contour kit\r\nSquare: ${fmtN(G.size, 1)} m, SW corner ITM E ${Math.round(DATA.X0 + G.x0)}, N ${Math.round(DATA.Y0 + G.y0)}\r\n` +
      `Board ${board} mm = ${fmtN(layerM, 2)} m of ground per layer at 1:${scale}; ${M.layers.length} layers on ${pk.count} sheets of ${sw} × ${sh} mm.\r\n` +
      (o.platforms ? `Building platforms: each footprint is cut out of every layer above the layer under its lowest ground, so each building stands on a level platform (${nP} footprints). Platform levels are in building_heights.pdf / .csv.\r\n` : '') +
      (hollow ? `Hollow layers: each layer keeps a 15 mm strip under the layer above, so it uses less board. Keep the cut-out middles as offcuts.\r\n` : `Solid layers: every layer is a full piece, so the model is solid all through.\r\n`) +
      `Cut: red. Engrave: blue (the next layer's outline, layer numbers${o.engrave ? ', building footprints' + (o.numbers ? ' and building numbers' : '') : ''}). Engrave first as a light score, then cut.\r\n` +
      `Cut a base board ${fmtN(G.size * K)} × ${fmtN(G.size * K)} mm. Stack the layers in number order: each one sits on the blue line engraved on the layer below.\r\n` +
      README_TAIL);
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    return { blob, pk, M, layerM, nB, nP, svg0: MyModel.toSVG(pk, 0, 'sheet 1'), plan };
  }
  const README_TAIL = `Buildings are not part of the kit: make them yourself. Where the kit has building numbers they match contour_plan.pdf and building_heights.pdf / .csv.\r\n` +
    `Ground: 2006 Sligo survey and OPW 2011 lidar (CC BY 4.0). Buildings: Tailte Éireann. Roads and water: OpenStreetMap contributors.\r\nMade with Sligo Site Models, ATU Sligo Department of Architecture.\r\n`;
  function addPlan(zip, o, interval) {
    const tab = o.table !== false;                                           // numbers and heights table (admin setting)
    const plan = contourPlan(Object.assign({}, o, { interval, buildings: true, numbers: tab, roads: true, water: true, spots: false, paper: 'kit' }));
    zip.file('contour_plan.pdf', plan.pdf); zip.file('contour_plan.svg', plan.svg);
    if (tab && plan.list.length) { zip.file('building_heights.pdf', plan.tablePDF()); zip.file('building_heights.csv', plan.csv); }
    return plan;
  }

  // Waffle: true sections slotted together (MyModel.buildWaffle). Where a section crosses a building, a line is engraved
  // 1.5 mm under the ground line along the crossing, with the building's number under it when there is room.
  async function waffleKit(o, prog) {
    const { DATA, sq, scale, board } = o, [sw, sh] = o.sheet, K = 1000 / scale;
    prog('Cutting the sections…', .15); await tick();
    MyModel.setScale(scale);
    const { lo } = SiteData.groundRange(DATA, sq);
    let D = DATA.D;
    if (o.platforms) { const levelOf = b => SiteData.platformLevel(DATA, b, o.platStep); D = SiteData.platformSampler(DATA, sq, levelOf); o = Object.assign({}, o, { platOf: levelOf }); }
    const W = MyModel.buildWaffle(D, { x0: sq.x0, y0: sq.y0, size: sq.g }, { scale, board, spacing: o.spacing, base: 10, datum: Math.floor(lo) - 1 });
    if (W.error) throw new Error('There is no ground in this square.');
    const G = W.G, S = W.size, sqG = { x0: G.x0, y0: G.y0, g: G.size };
    let nB = 0;
    if (o.engrave) {
      const fps = SiteData.footprintsIn(DATA, sqG), nums = new Map(SiteData.numbered(DATA, sqG).map(b => [b.i, b.n]));
      const topAt = (pc, s) => { const pl = pc.outline; let best = 0; for (let k = 1; k < pl.length; k++) { const [a, b] = [pl[k - 1], pl[k]]; if ((a[0] - s) * (b[0] - s) <= 0 && a[0] !== b[0]) best = Math.max(best, a[1] + (b[1] - a[1]) * (s - a[0]) / (b[0] - a[0])); } return best; };
      W.pieces.forEach(pc => {
        const along = pc.dir === 'A' ? s => [G.x0 + s / K, G.y0 + pc.at / K] : s => [G.x0 + pc.at / K, G.y0 + s / K];
        fps.forEach(({ b, polys }) => {
          // runs of the section line inside this footprint, sampled every 0.25 mm on the model
          let run = null; const runs = [];
          for (let s = 0; s <= S + 1e-9; s += .25) {
            const inB = polys.some(p => SiteData.inPoly(along(Math.min(s, S)), p));
            if (inB && !run) run = [s, s]; else if (inB) run[1] = s; else if (run) { runs.push(run); run = null; }
          }
          if (run) runs.push(run);
          runs.filter(([a, c]) => c - a >= .75).forEach(([a, c]) => {
            const pts = []; for (let s = a; s <= c + 1e-9; s += Math.max(.5, (c - a) / 20)) pts.push([s, topAt(pc, Math.min(s, c)) - 1.5]);
            pc.engrave.push(pts, [[a, pts[0][1] + .8], [a, pts[0][1] - .8]], [[c, pts[pts.length - 1][1] + .8], [c, pts[pts.length - 1][1] - .8]]);
            const n = o.numbers && nums.get(b.i);
            if (n) { const t = MyModel.strokeText(String(n), 1.4); if (t.w + .6 < c - a) { const cx = (a + c) / 2, cy = topAt(pc, cx) - 3.6; if (cy > 12.5) t.lines.forEach(l => pc.engrave.push(l.map(([x, y]) => [cx + x, cy + y]))); } }
            nB++;
          });
        });
      });
    }
    prog(`Packing ${W.pieces.length} sections on ${sw} × ${sh} mm sheets…`, .6); await tick();
    const pk = MyModel.packShelves(W.pieces, sw, sh);
    if (pk.error) throw new Error(pk.error);
    prog('Writing the sheets and the plan…', .8); await tick();
    const zip = new JSZip(), title = `${o.name || 'Sligo'} 1:${scale} ${board} mm waffle`;
    let svg0 = '';
    for (let i = 0; i < pk.count; i++) {
      const nn = String(i + 1).padStart(2, '0'), { cut, eng } = MyModel.shelfPaths(pk, i), svg = MyModel.pathsSVG(sw, sh, cut, eng, `${title} sheet ${nn}`);
      zip.file(`sheet_${nn}.svg`, svg); zip.file(`sheet_${nn}.dxf`, MyModel.pathsDXF(cut, eng)); if (!i) svg0 = svg;
    }
    const plan = addPlan(zip, o, scale <= 500 ? 1 : 2);
    zip.file('section_key.svg', waffleKey(W, plan, K));
    const nA = W.pieces.length / 2;
    zip.file('README.txt', `${title} kit\r\nSquare: ${fmtN(G.size, 1)} m (${fmtN(S)} mm), SW corner ITM E ${Math.round(DATA.X0 + G.x0)}, N ${Math.round(DATA.Y0 + G.y0)}\r\n` +
      `${nA} A sections run west to east (A1 at the south edge) and are slotted from below; ${nA} B sections run south to north (B1 at the west edge) and are slotted from above.\r\n` +
      `Sections ${fmtN(W.spacing, 1)} mm apart = ${fmtN(W.spacing / K, 1)} m on the ground. A ${W.base} mm solid strip runs under ${Math.floor(lo) - 1} m OD. Heights true scale; tallest piece ${fmtN(W.height, 1)} mm.\r\n` +
      `Every piece is engraved with its name and an arrow pointing east (A) or north (B).${o.engrave ? ' Where a section crosses a building, a line is engraved 1.5 mm under the ground line between ticks at the walls, with the building number under it where it fits.' : ''}\r\n` +
      (o.platforms ? `Building platforms: inside each footprint the sections are cut level at the ${o.platStep} m contour at or below its lowest ground. Platform levels are in building_heights.pdf / .csv.\r\n` : '') +
      `Slot each B piece down over the A pieces, matching the names to section_key.svg. ${pk.count} sheets of ${sw} × ${sh} mm. Cut: red. Engrave: blue.\r\n` + README_TAIL);
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    return { blob, pk, W, nB, svg0, plan };
  }
  // the plan with every section line named, to put the waffle together
  function waffleKey(W, plan, K) {
    const S = W.size, m = 12, f = v => v.toFixed(2);
    const lines = W.pieces.map(pc => pc.dir === 'A'
      ? `<path d="M${m},${f(m + S - pc.at)}H${f(m + S)}" stroke="#c0392b" stroke-width=".35"/><text x="${f(m + S + 2)}" y="${f(m + S - pc.at + 1)}" font-size="3" font-family="sans-serif" fill="#c0392b">${pc.id}</text>`
      : `<path d="M${f(m + pc.at)},${m}V${f(m + S)}" stroke="#2d4a5e" stroke-width=".35"/><text x="${f(m + pc.at)}" y="${f(m + S + 5)}" font-size="3" text-anchor="middle" font-family="sans-serif" fill="#2d4a5e">${pc.id}</text>`).join('');
    const fp = plan.list.map(b => `<text x="${f(m + (b.at[0] - W.G.x0) * K)}" y="${f(m + S - (b.at[1] - W.G.y0) * K + .6)}" font-size="1.8" text-anchor="middle" font-family="sans-serif" fill="#555">${b.n}</text>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${f(S + 2 * m + 10)}mm" height="${f(S + 2 * m + 6)}mm" viewBox="0 0 ${f(S + 2 * m + 10)} ${f(S + 2 * m + 6)}"><rect width="100%" height="100%" fill="#fff"/>` +
      `<rect x="${m}" y="${m}" width="${f(S)}" height="${f(S)}" fill="none" stroke="#000" stroke-width=".4"/>${fp}${lines}` +
      `<text x="${m}" y="${m - 4}" font-size="4" font-family="sans-serif">Waffle key: A west–east, B south–north. North is up. Numbers = buildings.</text></svg>`;
  }

  // ---------------------------------------------------------------- 3D print, terrain only, split into equal tiles
  const TILE = 230;
  function tilesFor(sq, scale) { const mm = sq.g * 1000 / scale; const n = Math.max(1, Math.ceil(mm / TILE - 1e-9)); return { n, mm, tile: mm / n }; }
  const colName = c => String.fromCharCode(65 + c);
  async function print(o, prog) {
    const { DATA, sq, scale } = o, t = tilesFor(sq, scale), tm = sq.g / t.n;
    const { lo, hi } = SiteData.groundRange(DATA, sq), datum = Math.floor(lo) - 1;
    const meshes = [], zip = new JSZip(), base = o.base, tagBase = o.tag;
    let platforms = null;
    if (o.platforms) {
      const levelOf = b => SiteData.platformLevel(DATA, b, o.platStep);
      platforms = SiteData.footprintsIn(DATA, sq).map(({ b }) => ({ polys: b.polys, level: levelOf(b) }));
      o = Object.assign({}, o, { platOf: levelOf });
    }
    for (let r = 0; r < t.n; r++) for (let c = 0; c < t.n; c++) {
      const id = t.n > 1 ? `${colName(c)}${r + 1}` : '', k = r * t.n + c, of = t.n * t.n;
      const x0 = sq.x0 + c * tm, y0 = sq.y0 + (t.n - 1 - r) * tm;                // rows 1, 2… from the north
      const m = await Print3D.build({ x0, y0, size: tm, scale, stepMM: Math.max(0.4, Math.min(1, 250 / scale)), vex: o.vex, roads: o.roads, water: o.water, base, datum, marks: o.marks, platforms,
        sample: DATA.D.sample, data: { buildings: DATA.B, roads: DATA.roads, water: DATA.water } },
        (txt, f) => prog(of > 1 ? `Tile ${id} (${k + 1} of ${of}): ${txt.toLowerCase()}` : txt, (k + f) / of * .92));
      const name = tagBase + (id ? '_' + id : '');
      const meta = { Title: `${o.name || 'Sligo'} 1:${scale}${id ? ' tile ' + id : ''}`, Designer: 'Sligo Site Models · ATU Sligo Architecture',
        Description: `ITM SW corner ${Math.round(DATA.X0 + x0)}, ${Math.round(DATA.Y0 + y0)}; datum ${datum} m OD at the base top; ground ×${o.vex}; footprints: ${o.marks}${o.platforms ? '; building platforms every ' + o.platStep + ' m' : ''}` };
      const z3 = new JSZip(); Object.entries(MyModel.print3MFParts(m, meta)).forEach(([kk, v]) => z3.file(kk, v));
      const b3 = await z3.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      zip.file(name + '.3mf', b3); zip.file(name + '.stl', MyModel.printSTL(m, name));
      meshes.push({ m, c, r, id, b3, name });
      await tick();
    }
    prog('Adding the plan and the table of heights…', .95); await tick();
    const tab = o.table !== false;
    const plan = contourPlan(Object.assign({}, o, { interval: scale <= 500 ? 1 : 2, buildings: true, numbers: tab, roads: o.roads, water: o.water, spots: false, paper: 'kit' }));
    zip.file(tagBase + '_plan.pdf', plan.pdf);
    if (tab && plan.list.length) { zip.file('building_heights.pdf', plan.tablePDF()); zip.file('building_heights.csv', plan.csv); }
    const tH = Math.max(...meshes.map(x => x.m.info.height));
    zip.file('README.txt', `${o.name || 'Sligo site'} · terrain model at 1:${scale}\r\n` +
      `Square ${fmtN(sq.g, 1)} m (${fmtN(t.mm)} mm), SW corner ITM E ${Math.round(DATA.X0 + sq.x0)}, N ${Math.round(DATA.Y0 + sq.y0)}.\r\n` +
      (t.n > 1 ? `${t.n * t.n} tiles of ${fmtN(t.tile, 1)} mm: columns A, B, C… west to east, rows 1, 2, 3… north to south. All tiles share one datum, so their edges meet flush.\r\n` : '') +
      `Base ${base} mm under ${datum} m OD; ground heights ${o.vex === 1 ? 'true scale' : '×' + o.vex}; tallest point ${fmtN(tH, 1)} mm.\r\n` +
      `Buildings are not printed. Footprints: ${{ incise: 'incised outline 0.6 mm wide, 0.4 mm deep', raise: 'raised outline 0.6 mm wide, 0.4 mm high', pad: 'raised pad 0.4 mm high', off: 'not marked' }[o.marks]}.\r\n` +
      (o.platforms ? `Building platforms: inside each footprint the ground is cut level at the ${o.platStep} m contour at or below its lowest ground (levels in building_heights.pdf / .csv).\r\n` : '') +
      `The plan PDF numbers the buildings; their heights are in building_heights.pdf / .csv.\r\n` +
      `Bambu P1S: matte white PLA, 0.2 mm layers (0.12 mm for fine footprint lines), 10–15% infill, no supports.\r\n` +
      `Ground: 2006 Sligo survey and OPW 2011 lidar (CC BY 4.0). Buildings: Tailte Éireann. Roads and water: OpenStreetMap contributors.\r\nMade with Sligo Site Models, ATU Sligo Department of Architecture.\r\n`);
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    return { blob, meshes, t, datum, lo, hi, plan, height: tH };
  }

  root.Outputs = { contourPlan, planDXF, laserKit, print, tilesFor, paperFor, TILE };
})(window);
