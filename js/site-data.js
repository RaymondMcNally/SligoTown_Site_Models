/* Sligo Site Models: the borough data and everything that depends only on the chosen square.
   Local metres from the SW corner of the 4.1 km data square (ITM E 567100.1, N 833788.2), north up. */
(function (root) {
  'use strict';
  const { getJSON, terrain, toITM, fromITM } = AW;

  async function load() {
    const [MJ, T, B, RDS, WAT] = await Promise.all([getJSON('data/model.json'), terrain('dtm2m'), getJSON('data/buildings.json'),
      getJSON('data/model/roads.json'), getJSON('data/model/water.json')]);
    // one record per building, with its box and the point its number is written at
    const bld = B.items.map((it, i) => {
      const polys = it[8]; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      polys.forEach(p => p[0].forEach(([x, y]) => { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }));
      let big = polys[0], ba = 0; polys.forEach(p => { const a = Math.abs(area(p[0])); if (a > ba) { ba = a; big = p; } });
      return { i, use: B.uses[it[0]], ground: it[1], eave: it[2], roof: it[3], top: it[4], h: it[5], est: !!it[6], fp: it[7], polys, box: [x0, y0, x1, y1], at: labelPoint(big) };
    });
    const [X0, Y0] = MJ.origin;
    return { MJ, T, X0, Y0, SZ: MJ.size, bld, roads: RDS, water: WAT, B, items: B.items, D: { sample: (x, y) => T.sample(x, y) } };
  }

  // ---------------------------------------------------------------- geometry helpers
  function area(r) { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return -a / 2; }
  function inside([px, py], r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) c = !c; } return c; }
  function inPoly(pt, p) { if (!inside(pt, p[0])) return false; for (let k = 1; k < p.length; k++) if (inside(pt, p[k])) return false; return true; }
  function segDist([px, py], [ax, ay], [bx, by]) { const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0; return Math.hypot(px - ax - t * dx, py - ay - t * dy); }
  function edgeDist(pt, p) { let d = Infinity; p.forEach(r => { for (let i = 0, j = r.length - 1; i < r.length; j = i++) d = Math.min(d, segDist(pt, r[j], r[i])); }); return d; }
  // a point well inside the polygon for its number: the centroid if it is inside and clear of the walls, otherwise the best of a 12 × 12 search
  function labelPoint(p) {
    const r = p[0]; let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const f = r[j][0] * r[i][1] - r[i][0] * r[j][1]; a += f; cx += (r[j][0] + r[i][0]) * f; cy += (r[j][1] + r[i][1]) * f; }
    const c = a ? [cx / (3 * a), cy / (3 * a)] : r[0];
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; r.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
    const cd = inPoly(c, p) ? edgeDist(c, p) : -1;
    if (cd > Math.min(x1 - x0, y1 - y0) * .3) return c;
    let best = cd >= 0 ? c : [(x0 + x1) / 2, (y0 + y1) / 2], bd = cd;
    for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) {
      const q = [x0 + (i + .5) / 12 * (x1 - x0), y0 + (j + .5) / 12 * (y1 - y0)];
      if (!inPoly(q, p)) continue; const d = edgeDist(q, p); if (d > bd) { bd = d; best = q; }
    }
    return best;
  }
  // Sutherland–Hodgman: clip a ring to the square [x0, x0 + g] × [y0, y0 + g]
  function clipRing(ring, sq) {
    const X1 = sq.x0 + sq.g, Y1 = sq.y0 + sq.g;
    const edges = [[p => p[0] >= sq.x0, (a, b) => { const t = (sq.x0 - a[0]) / (b[0] - a[0]); return [sq.x0, a[1] + t * (b[1] - a[1])]; }],
      [p => p[0] <= X1, (a, b) => { const t = (X1 - a[0]) / (b[0] - a[0]); return [X1, a[1] + t * (b[1] - a[1])]; }],
      [p => p[1] >= sq.y0, (a, b) => { const t = (sq.y0 - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), sq.y0]; }],
      [p => p[1] <= Y1, (a, b) => { const t = (Y1 - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), Y1]; }]];
    let out = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring.slice();
    for (const [ins, cut] of edges) {
      const inp = out; out = []; if (!inp.length) break;
      for (let i = 0; i < inp.length; i++) {
        const a = inp[(i + inp.length - 1) % inp.length], b = inp[i];
        if (ins(b)) { if (!ins(a)) out.push(cut(a, b)); out.push(b); } else if (ins(a)) out.push(cut(a, b));
      }
    }
    return out.length >= 3 ? out : null;
  }
  const clipPoly = (p, sq) => { const o = clipRing(p[0], sq); if (!o) return null; return [o].concat(p.slice(1).map(r => clipRing(r, sq)).filter(Boolean)); };
  const boxHits = (b, sq, m = 0) => b[2] >= sq.x0 - m && b[3] >= sq.y0 - m && b[0] <= sq.x0 + sq.g + m && b[1] <= sq.y0 + sq.g + m;

  // ---------------------------------------------------------------- buildings in the square, numbered
  // A building belongs to the square when the point its number goes at is inside it. Numbers run in ten bands from the
  // north edge, west to east within a band, so neighbours get neighbouring numbers.
  function numbered(DATA, sq) {
    const band = sq.g / 10, Y1 = sq.y0 + sq.g, out = [];
    DATA.bld.forEach(b => {
      if (!boxHits(b.box, sq)) return;
      const [x, y] = b.at; if (x < sq.x0 || y < sq.y0 || x > sq.x0 + sq.g || y > Y1) return;
      out.push(b);
    });
    out.sort((a, b) => Math.floor((Y1 - a.at[1]) / band) - Math.floor((Y1 - b.at[1]) / band) || a.at[0] - b.at[0]);
    return out.map((b, k) => Object.assign({ n: k + 1 }, b));
  }
  // every footprint that reaches into the square (also those numbered from a neighbouring square), clipped to it
  function footprintsIn(DATA, sq) {
    const out = [];
    DATA.bld.forEach(b => { if (!boxHits(b.box, sq)) return; const polys = b.polys.map(p => clipPoly(p, sq)).filter(Boolean); if (polys.length) out.push({ b, polys }); });
    return out;
  }

  // lowest and highest ground in the square, read every metre or so
  function groundRange(DATA, sq) {
    const n = Math.min(400, Math.max(20, Math.round(sq.g))); let lo = Infinity, hi = -Infinity, miss = 0;
    for (let r = 0; r <= n; r++) for (let c = 0; c <= n; c++) { const z = DATA.D.sample(sq.x0 + c / n * sq.g, sq.y0 + r / n * sq.g); if (z === z) { if (z < lo) lo = z; if (z > hi) hi = z; } else miss++; }
    return { lo, hi, missing: miss / ((n + 1) * (n + 1)) };
  }

  // ---------------------------------------------------------------- contour segments → polylines (for the DXF)
  function chain(segs) {
    const key = (x, y) => Math.round(x * 1000) + ',' + Math.round(y * 1000), ends = new Map(), used = new Uint8Array(segs.length / 4), lines = [];
    for (let s = 0; s < segs.length / 4; s++) for (const e of [0, 1]) { const k = key(segs[s * 4 + e * 2], segs[s * 4 + e * 2 + 1]); (ends.get(k) || ends.set(k, []).get(k)).push(s); }
    const other = (s, k) => { const a = key(segs[s * 4], segs[s * 4 + 1]); return a === k ? [segs[s * 4 + 2], segs[s * 4 + 3]] : [segs[s * 4], segs[s * 4 + 1]]; };
    for (let s0 = 0; s0 < used.length; s0++) {
      if (used[s0]) continue; used[s0] = 1;
      const pts = [[segs[s0 * 4], segs[s0 * 4 + 1]], [segs[s0 * 4 + 2], segs[s0 * 4 + 3]]];
      for (const dir of [1, 0]) {                                            // grow from the end, then from the start
        for (; ;) {
          const tip = dir ? pts[pts.length - 1] : pts[0], k = key(tip[0], tip[1]);
          const nx = (ends.get(k) || []).find(s => !used[s]); if (nx === undefined) break;
          used[nx] = 1; const p = other(nx, k); dir ? pts.push(p) : pts.unshift(p);
        }
      }
      const a = pts[0], b = pts[pts.length - 1], closed = pts.length > 3 && key(a[0], a[1]) === key(b[0], b[1]);
      if (closed) pts.pop();
      lines.push({ pts, closed });
    }
    return lines;
  }

  // ---------------------------------------------------------------- DXF (R12, ASCII): 3D polylines and text, metres
  function dxf(layers, ents) {
    const o = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', '6', '0', 'ENDSEC',
      '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', String(layers.length)];
    layers.forEach(([name, col]) => o.push('0', 'LAYER', '2', name, '70', '0', '62', String(col), '6', 'CONTINUOUS'));
    o.push('0', 'ENDTAB', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES');
    const f = v => (Math.round(v * 1000) / 1000).toString();
    ents.forEach(e => {
      if (e.t === 'pl') {
        o.push('0', 'POLYLINE', '8', e.layer, '66', '1', '10', '0', '20', '0', '30', '0', '70', String(8 + (e.closed ? 1 : 0)));
        e.pts.forEach(([x, y]) => o.push('0', 'VERTEX', '8', e.layer, '10', f(x), '20', f(y), '30', f(e.z), '70', '32'));
        o.push('0', 'SEQEND', '8', e.layer);
      } else if (e.t === 'tx') {
        o.push('0', 'TEXT', '8', e.layer, '10', f(e.x), '20', f(e.y), '30', f(e.z || 0), '40', f(e.h), '1', e.s, '72', '1', '11', f(e.x), '21', f(e.y), '31', f(e.z || 0), '73', '2');
      }
    });
    o.push('0', 'ENDSEC', '0', 'EOF');
    return o.join('\r\n') + '\r\n';
  }

  // ---------------------------------------------------------------- site pack for the Site Model Hub
  function sitePack(DATA, sq, name, numberedList) {
    const step = Math.max(0.5, Math.ceil(Math.sqrt(sq.g * sq.g / 2.2e6) * 10) / 10), n = Math.round(sq.g / step) + 1, Z = new Float32Array(n * n);
    const { lo } = groundRange(DATA, sq), off = Math.floor(lo) - 1;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) { const z = DATA.D.sample(sq.x0 + c * step, sq.y0 + r * step); Z[r * n + c] = z === z ? z - off : NaN; }
    let hi = 0; for (const v of Z) if (v === v && v > hi) hi = v;
    const scale = Math.max(0.01, Math.ceil(hi / 65000 * 100) / 100), u = new Uint16Array(n * n);
    for (let k = 0; k < u.length; k++) { const v = Z[k]; u[k] = v === v ? Math.min(65535, Math.max(1, Math.round(v / scale) + 1)) : 0; }
    const u8 = new Uint8Array(u.buffer); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    const E0 = DATA.X0 + sq.x0, N0 = DATA.Y0 + sq.y0, [lon, lat] = fromITM(E0 + sq.g / 2, N0 + sq.g / 2);
    const slug = String(name || 'sligo-site').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'sligo-site';
    const features = numberedList.map(b => {
      const ring = b.polys[0][0].map(([x, y]) => [+(Math.min(sq.g, Math.max(0, x - sq.x0))).toFixed(2), +(Math.min(sq.g, Math.max(0, y - sq.y0))).toFixed(2)]);
      return { id: 'b' + b.n, kind: 'building', name: `Building ${b.n}`, pts: ring, note: `${b.use}. Roof ${b.roof.toFixed(1)} m OD, ${b.h.toFixed(1)} m above the ground${b.est ? ' (estimated)' : ''}.` };
    });
    return {
      format: 'sitekit-pack', version: 1, id: 'local-' + slug + '-' + Date.now().toString(36), name: name || 'Sligo site', place: 'Sligo', year: String(new Date().getFullYear()),
      survey: 'Ground: 2006 Sligo survey and OPW 2011 lidar, Contains Irish Public Sector Data (OPW) licensed under CC BY 4.0. Buildings: Tailte Éireann.',
      notes: `Made with Sligo Site Models. ${Math.round(sq.g)} m square, SW corner ITM E ${Math.round(E0)}, N ${Math.round(N0)}.`,
      lat: +lat.toFixed(6), lon: +lon.toFixed(6), tz: 'Europe/Dublin', north: 0, levelOffset: off, contourInterval: 0, embed: '', focus: null, features,
      source: { type: 'geotiff', epsg: 2157, origin: [+E0.toFixed(2), +N0.toFixed(2)], file: 'Sligo Site Models' },
      geo: { epsg: 2157, origin: [+E0.toFixed(2), +N0.toFixed(2)], note: 'Survey south-west corner in ITM.' },
      grid: { w: n, h: n, step, scale, enc: 'u16-b64', data: btoa(s) }, created: new Date().toISOString()
    };
  }

  root.SiteData = { load, numbered, footprintsIn, groundRange, chain, dxf, sitePack, clipPoly, clipRing, labelPoint, inPoly, area, boxHits };
})(window);
