/* 3D print of a square of the borough, terrain only: adapted from the As Water Arrives tile maker (manifold-3d in the browser).
   Ground is a height field; roads and water are cut with their exact outlines. Buildings are NOT printed: their footprints
   can be marked on the ground as an incised outline, a raised outline or a raised pad, or left off.
   All geometry in model millimetres, origin at the square's south-west corner. */
(function (root) {
  'use strict';
  let M = null;
  async function manifold() {
    if (M) return M;
    const mod = await import(new URL('vendor/manifold/manifold.js', location.href).href);
    M = await mod.default({ locateFile: () => new URL('vendor/manifold/manifold.wasm', location.href).href });
    M.setup(); return M;
  }
  function heightfield(Zmm, step) {                                    // closed solid: top = Zmm grid, bottom at z = 0
    const ny = Zmm.length, nx = Zmm[0].length, n = nx * ny;
    const V = new Float32Array(n * 2 * 3), F = [];
    for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) { const i = r * nx + c; V.set([c * step, r * step, Zmm[r][c]], i * 3); V.set([c * step, r * step, 0], (n + i) * 3); }
    const id = (r, c) => r * nx + c;
    for (let r = 0; r < ny - 1; r++) for (let c = 0; c < nx - 1; c++) {
      const a = id(r, c), b = id(r, c + 1), d = id(r + 1, c + 1), e = id(r + 1, c);
      F.push(a, b, d, a, d, e, a + n, d + n, b + n, a + n, e + n, d + n);
    }
    const ring = [];
    for (let c = 0; c < nx; c++) ring.push(id(0, c));
    for (let r = 1; r < ny; r++) ring.push(id(r, nx - 1));
    for (let c = nx - 2; c >= 0; c--) ring.push(id(ny - 1, c));
    for (let r = ny - 2; r > 0; r--) ring.push(id(r, 0));
    for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; F.push(a, a + n, b, b, a + n, b + n); }
    return new M.Manifold(new M.Mesh({ numProp: 3, vertProperties: V, triVerts: Uint32Array.from(F) }));
  }
  const free = (...xs) => xs.forEach(x => { try { x && x.delete && x.delete(); } catch (e) { } });

  // polys: array of polygons, each [outer, hole…] of [x, y] in local metres → CrossSection in model mm
  function section(polys, o, box) {
    const contours = [];
    polys.forEach(p => p.forEach(r => contours.push(r.map(([x, y]) => [(x - o.x0) * o.MM, (y - o.y0) * o.MM]))));
    if (!contours.length) return null;
    const cs = new M.CrossSection(contours, 'EvenOdd'), out = cs.intersect(box); free(cs);
    return out.isEmpty() ? (free(out), null) : out;
  }
  const overlaps = (polys, o) => polys.some(p => p[0].some(([x, y]) => x > o.x0 - 50 && y > o.y0 - 50 && x < o.x0 + o.size + 50 && y < o.y0 + o.size + 50));

  /* opts: { x0, y0, size (m), scale, vex, roads, water, base (mm), datum (m OD, optional: shared by the tiles of one model),
     marks: 'incise' | 'raise' | 'pad' | 'off', sample(x, y) → m OD, data: { buildings, roads, water } }
     buildings.items: [use, ground, eave, roof, top, height, estimated, footprint, polygons] */
  async function build(opts, progress = () => { }) {
    await manifold();
    const MM = 1000 / opts.scale, S = opts.size * MM, o = { x0: opts.x0, y0: opts.y0, size: opts.size, MM };
    const n = Math.round(S / (opts.stepMM || 0.4)) + 1, step = S / (n - 1), dm = opts.size / (n - 1);   // grid fits the square exactly
    progress('Sampling the ground…', .05);
    const H = []; let lo = Infinity, hi = -Infinity;
    for (let r = 0; r < n; r++) { const row = new Float32Array(n); for (let c = 0; c < n; c++) { const v = opts.sample(o.x0 + c * dm, o.y0 + r * dm); row[c] = v; if (v < lo) lo = v; if (v > hi) hi = v; } H.push(row); }
    const datum = opts.datum ?? (Math.floor(lo) - 1), base = opts.base ?? 5, vex = opts.vex || 1;
    const zG = v => base + (v - datum) * MM * vex;
    const Z = H.map(row => Float32Array.from(row, zG));
    const ZTOP = zG(hi) + 200;
    progress('Building the ground…', .15);
    let solid = heightfield(Z, step);
    const box = M.CrossSection.square([S, S]);
    // roads
    if (opts.roads) {
      progress('Cutting the roads…', .3);
      const polys = overlaps(opts.data.roads.polygons, o) ? opts.data.roads.polygons.slice() : [];
            const cs = polys.length ? section(polys, o, box) : null;
      if (cs) {
        const cut = Math.max(.3, Math.min(.8, .75 * MM));                 // ~0.75 m, between 0.3 and 0.8 mm on the model
        const low = heightfield(Z.map(row => Float32Array.from(row, z => Math.max(z - cut, base * .6))), step);
        const rp = cs.extrude(ZTOP).translate([0, 0, -1]);
        const a = solid.subtract(rp), b = low.intersect(rp), s2 = a.add(b); free(solid, low, a, b, rp, cs); solid = s2;
      }
    }
    // water: a flat surface 0.6 mm below each body's level
    progress('Setting the water…', .45);
    const deck = null;
    const items = opts.water === false ? [] : opts.data.water.items.filter(([, polys]) => overlaps(polys, o));
    let wp = null, slabs = null;
    items.forEach(([lv, polys]) => {
      let cs = section(polys, o, box); if (!cs) return;
      if (deck) { const c2 = cs.subtract(deck); free(cs); cs = c2; if (cs.isEmpty()) { free(cs); return; } }
      const zt = Math.max(zG(lv) - .6, base * .6);
      const p = cs.extrude(ZTOP).translate([0, 0, -1]), s = cs.extrude(zt);
      const w2 = wp ? wp.add(p) : p, s3 = slabs ? slabs.add(s) : s; if (wp && wp !== w2) free(wp, p); if (slabs && slabs !== s3) free(slabs, s); wp = w2; slabs = s3; free(cs);
    });
    if (wp) { const a = solid.subtract(wp), b = slabs.intersect(wp), s2 = a.add(b); free(solid, a, b, wp, slabs); solid = s2; }
    free(deck);
    // building footprints, marked on the ground (no buildings are printed)
    let count = 0;
    const mode = opts.marks || 'off';
    if (mode !== 'off') {
      progress('Marking the building footprints…', .6);
      const LW = opts.lineMM || .6, D = opts.depthMM || .4;               // line width and depth / height, model mm
      const marks = [];
      for (const b of opts.data.buildings.items) {
        const polys = b[8]; if (!overlaps(polys, o)) continue;
        const cs = section(polys, o, box); if (!cs) continue;
        if (cs.area() < LW * LW * 2) { free(cs); continue; }                 // smaller than the line itself
        if (mode === 'pad') { marks.push(cs); count++; continue; }
        const outer = cs.offset(LW / 2, 'Miter', 2), inner = cs.offset(-LW / 2, 'Miter', 2), ring = outer.subtract(inner); free(cs, outer, inner);
        const r2 = ring.intersect(box); free(ring);
        if (r2.isEmpty()) { free(r2); continue; }
        marks.push(r2); count++;
      }
      if (marks.length) {
        progress(`Marking ${count} footprints…`, .75);
        const all = M.CrossSection.union(marks); free(...marks);
        const prism = all.extrude(ZTOP + 2).translate([0, 0, -1]); free(all);
        if (mode === 'incise') {
          const low = heightfield(Z.map(row => Float32Array.from(row, z => Math.max(z - D, base * .6))), step);
          const a = solid.subtract(prism), b = low.intersect(prism), s2 = a.add(b); free(solid, low, a, b); solid = s2;
        } else {
          const high = heightfield(Z.map(row => Float32Array.from(row, z => z + D)), step);
          const b = high.intersect(prism), s2 = solid.add(b); free(solid, high, b); solid = s2;
        }
        free(prism);
      }
    }
    const clip = box.extrude(ZTOP + 400).translate([0, 0, -10]), s3 = solid.intersect(clip); free(solid, clip, box); solid = s3;
    progress('Writing the file…', .92);
    const mesh = solid.getMesh(), np = mesh.numProp, vp = mesh.vertProperties, nv = vp.length / np;
    const positions = new Float32Array(nv * 3); for (let i = 0; i < nv; i++) { positions[i * 3] = vp[i * np]; positions[i * 3 + 1] = vp[i * np + 1]; positions[i * 3 + 2] = vp[i * np + 2]; }
    const info = { size: S, height: zG(hi), footprints: count, marks: mode, datum, lo, hi, volume: solid.volume() / 1000, genus: solid.genus(), tris: mesh.triVerts.length / 3 };
    free(solid);
    return { positions, indices: mesh.triVerts, info };
  }
  root.Print3D = { build, manifold };
})(window);
