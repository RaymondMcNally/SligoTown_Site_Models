/* Sligo Site Models: the page. Map with the site square, 3D view of the site (ground and buildings, for viewing only),
   and the three downloads. */
(async function () {
  'use strict';
  const { $, fmtN, toITM, fromITM, getJSON } = AW;
  const st = (t, err) => { $('#status').textContent = t; $('#status').classList.toggle('err', !!err); };
  st('Loading the ground, buildings, roads and water…');
  const DATA = await SiteData.load();
  const { MJ, X0, Y0, SZ } = DATA;

  // ---------------------------------------------------------------- state
  const GROUNDS = [40, 50, 60, 80, 100, 120, 150, 200, 250, 300, 400, 500];
  const SCALES = { print: [200, 250, 500, 1000, 1250, 2500], laser: [200, 250, 500, 1000, 1250], map: [200, 250, 500, 1000, 1250, 2500] };
  const S = { name: '', g: 100, cx: MJ.centre[0] - X0, cy: MJ.centre[1] - Y0, p: 'print', scale: { print: 500, laser: 500, map: 500 } };
  try { const s = JSON.parse(localStorage.getItem('ssm-state') || '{}'); Object.assign(S, s, { scale: Object.assign(S.scale, s.scale || {}) }); } catch (e) { }
  if (!GROUNDS.includes(+S.g)) S.g = 100;
  const save = () => { try { localStorage.setItem('ssm-state', JSON.stringify(S)); } catch (e) { } };
  const sq = () => ({ x0: S.cx - S.g / 2, y0: S.cy - S.g / 2, g: S.g });
  const scale = () => S.scale[S.p];
  const tag = () => { const n = (S.name || 'Sligo').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'Sligo'; const q = sq(); return `${n}_${Math.round(X0 + q.x0)}_${Math.round(Y0 + q.y0)}_1-${scale()}`; };

  // ---------------------------------------------------------------- map
  const [cLon, cLat] = fromITM(...MJ.centre);
  const corners = [[X0, Y0 + SZ], [X0 + SZ, Y0 + SZ], [X0 + SZ, Y0], [X0, Y0]].map(([e, n]) => fromITM(e, n));
  const map = new maplibregl.Map({ container: 'map', attributionControl: false, center: [cLon, cLat], zoom: 14, maxPitch: 0, dragRotate: false,
    style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#17212b' } }] } });
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
  await new Promise(r => map.on('load', r));
  map.addSource('osm', { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© OpenStreetMap contributors' });
  map.addLayer({ id: 'osm', type: 'raster', source: 'osm', layout: { visibility: 'none' } });
  map.addSource('hs', { type: 'image', url: 'data/hillshade.png', coordinates: corners });
  map.addLayer({ id: 'hs', type: 'raster', source: 'hs', paint: { 'raster-opacity': .9 } });
  map.addSource('r', { type: 'geojson', data: 'data/roads.json' }); map.addLayer({ id: 'r', type: 'line', source: 'r', paint: { 'line-color': '#ffffff', 'line-opacity': .5, 'line-width': 1 } });
  // footprints, converted to longitude/latitude here (the data are in local ITM metres)
  const ll = ([x, y]) => fromITM(X0 + x, Y0 + y).map(v => +v.toFixed(7));
  const fpGeo = { type: 'FeatureCollection', features: DATA.bld.map(b => ({ type: 'Feature', properties: { e: b.est ? 1 : 0 }, geometry: { type: 'MultiPolygon', coordinates: b.polys.map(p => p.map(r => r.map(ll))) } })) };
  map.addSource('b', { type: 'geojson', data: fpGeo });
  map.addLayer({ id: 'b', type: 'fill', source: 'b', paint: { 'fill-color': '#17212b', 'fill-opacity': .72 } });
  map.addSource('ring', { type: 'geojson', data: { type: 'Feature', geometry: MJ.circle } });
  map.addLayer({ id: 'ring', type: 'line', source: 'ring', paint: { 'line-color': '#e08a5c', 'line-width': 1.5, 'line-dasharray': [3, 2] } });
  map.addSource('sq', { type: 'geojson', data: sqGeo() });
  map.addLayer({ id: 'sq', type: 'fill', source: 'sq', paint: { 'fill-color': '#e08a5c', 'fill-opacity': .2 } });
  map.addLayer({ id: 'sq-l', type: 'line', source: 'sq', paint: { 'line-color': '#e08a5c', 'line-width': 2.5 } });
  document.querySelectorAll('[data-base]').forEach(b => b.onclick = () => {
    const osm = b.dataset.base === 'osm';
    document.querySelectorAll('[data-base]').forEach(x => x.setAttribute('aria-pressed', x === b));
    map.setLayoutProperty('osm', 'visibility', osm ? 'visible' : 'none'); map.setLayoutProperty('hs', 'visibility', osm ? 'none' : 'visible');
    map.setPaintProperty('b', 'fill-opacity', osm ? 0 : .72); map.setPaintProperty('r', 'line-opacity', osm ? 0 : .5);
  });
  function sqGeo() {
    const q = sq(), a = [[q.x0, q.y0], [q.x0 + q.g, q.y0], [q.x0 + q.g, q.y0 + q.g], [q.x0, q.y0 + q.g], [q.x0, q.y0]].map(([x, y]) => fromITM(X0 + x, Y0 + y));
    return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [a] } };
  }
  const clamp = () => { const h = S.g / 2; S.cx = Math.max(h, Math.min(SZ - h, S.cx)); S.cy = Math.max(h, Math.min(SZ - h, S.cy)); };
  let siteTimer = 0;
  function showSq(fit) {
    clamp(); map.getSource('sq').setData(sqGeo());
    const q = sq();
    $('#where').textContent = `${S.g} m square · SW corner ITM E ${fmtN(X0 + q.x0)} N ${fmtN(Y0 + q.y0)}`;
    if (fit) { const c = sqGeo().geometry.coordinates[0]; map.fitBounds([c[0], c[2]], { padding: 80, duration: 500, maxZoom: 18 }); }
    summary(); clearTimeout(siteTimer); siteTimer = setTimeout(() => siteView(), 250);
    $('#dl').innerHTML = '';
  }
  let drag = null;
  const down = e => { if (busy) return; const f = map.queryRenderedFeatures(e.point, { layers: ['sq'] }); if (!f.length) return; e.preventDefault(); const [E, N] = toITM(e.lngLat.lng, e.lngLat.lat); drag = { E, N, cx: S.cx, cy: S.cy }; map.dragPan.disable(); map.getCanvas().style.cursor = 'grabbing'; };
  const move = e => {
    if (!drag) { map.getCanvas().style.cursor = map.queryRenderedFeatures(e.point, { layers: ['sq'] }).length ? 'grab' : ''; return; }
    const [E, N] = toITM(e.lngLat.lng, e.lngLat.lat); S.cx = drag.cx + E - drag.E; S.cy = drag.cy + N - drag.N; clamp(); map.getSource('sq').setData(sqGeo());
    const q = sq(); $('#where').textContent = `${S.g} m square · SW corner ITM E ${fmtN(X0 + q.x0)} N ${fmtN(Y0 + q.y0)}`;
  };
  const up = () => { if (!drag) return; drag = null; map.dragPan.enable(); map.getCanvas().style.cursor = ''; save(); showSq(); };
  map.on('mousedown', down); map.on('touchstart', e => { if (e.points.length === 1) down(e); }); map.on('mousemove', move); map.on('touchmove', move); map.on('mouseup', up); map.on('touchend', up);
  map.on('dblclick', e => { e.preventDefault(); if (busy) return; const [E, N] = toITM(e.lngLat.lng, e.lngLat.lat); S.cx = E - X0; S.cy = N - Y0; save(); showSq(); });

  // ---------------------------------------------------------------- controls
  $('#ground').innerHTML = GROUNDS.map(g => `<option value="${g}">${g} × ${g} m</option>`).join('');
  $('#ground').value = S.g; $('#name').value = S.name;
  $('#ground').onchange = e => { S.g = +e.target.value; save(); showSq(true); };
  $('#name').oninput = e => { S.name = e.target.value.trim(); save(); };
  function product(p) {
    S.p = p;
    document.querySelectorAll('[data-p]').forEach(b => b.setAttribute('aria-pressed', b.dataset.p === p));
    document.querySelectorAll('[data-for]').forEach(g => { g.hidden = g.dataset.for !== p; });
    $('#scale').innerHTML = SCALES[p].map(s => `<option value="${s}">1:${fmtN(s)}</option>`).join('');
    if (!SCALES[p].includes(+S.scale[p])) S.scale[p] = 500;
    $('#scale').value = S.scale[p]; save(); summary(); $('#dl').innerHTML = ''; st('');
  }
  document.querySelectorAll('[data-p]').forEach(b => b.onclick = () => product(b.dataset.p));
  $('#scale').onchange = e => { S.scale[S.p] = +e.target.value; save(); summary(); $('#dl').innerHTML = ''; };
  $('#mB').onchange = () => { $('#mN').disabled = !$('#mB').checked; };
  const KINDS = {
    hollow: 'One layer per board thickness, hollowed under the layer above (a 15 mm glue strip) to save board. The cut-out middles are offcuts.',
    solid: 'One full layer per board thickness: heavier and uses more board, but every layer is a solid piece, good for carving into or painting.',
    waffle: 'An egg-crate of true sections, west–east (A) and south–north (B), slotted together. Quick to cut and light; shows the ground as sections.'
  };
  function kind(k) {
    S.kind = KINDS[k] ? k : 'hollow';
    document.querySelectorAll('[data-k]').forEach(b => b.setAttribute('aria-pressed', b.dataset.k === S.kind));
    document.querySelectorAll('[data-kind]').forEach(el => { el.hidden = el.dataset.kind !== S.kind; });
    $('#kNote').textContent = KINDS[S.kind];
    $('#engBL').textContent = S.kind === 'waffle' ? 'Engrave where each section crosses a building' : 'Engrave the building footprints';
    save(); summary(); $('#dl').innerHTML = '';
  }
  document.querySelectorAll('[data-k]').forEach(b => b.onclick = () => kind(b.dataset.k));
  $('#engB').onchange = () => { $('#engN').disabled = !$('#engB').checked; };
  document.querySelectorAll('#board, #sheet, #interval, #vex, #base, #spacing').forEach(x => x.addEventListener('change', summary));

  // what the chosen square makes at the chosen scale; returns false when it can't be made
  function summary() {
    const q = sq(), sc = scale(), mm = q.g * 1000 / sc, el = $('#sum'); let t = '', ok = true;
    if (S.p === 'print') {
      const tl = Outputs.tilesFor(q, sc);
      if (tl.n > 4) { ok = false; t = `${fmtN(mm)} mm square at 1:${fmtN(sc)}: that would be ${tl.n * tl.n} tiles. Choose a smaller scale or a smaller square (up to 4 × 4 tiles).`; }
      else t = `${fmtN(mm)} mm square at 1:${fmtN(sc)}` + (tl.n > 1 ? ` → ${tl.n} × ${tl.n} tiles of ${fmtN(tl.tile, 1)} mm` : ', one tile') + `. Print grid ${fmtN(Math.max(0.4, Math.min(1, 250 / sc)), 1)} mm (ground data every 2 m).`;
    } else if (S.p === 'laser') {
      const b = +$('#board').value, lm = b * sc / 1000;
      t = S.kind === 'waffle' ? `${fmtN(mm)} mm square at 1:${fmtN(sc)}. Sections about every ${$('#spacing').value} mm = ${fmtN(+$('#spacing').value * sc / 1000, 1)} m on the ground, in ${b} mm board.`
        : `${fmtN(mm)} mm square at 1:${fmtN(sc)}. Each ${b} mm layer is ${fmtN(lm, 2)} m of ground.`;
      const [sw, sh] = $('#sheet').value.split('x').map(Number);
      if (mm > Math.max(sw, sh) - 16) { ok = false; t += ` The square is bigger than the sheet: choose a smaller scale, a smaller square or a bigger sheet.`; }
    } else {
      const p = Outputs.paperFor(mm);
      if (!p) { ok = false; t = `${fmtN(mm)} mm at 1:${fmtN(sc)} is too big for A0. Choose a smaller scale or square.`; }
      else t = `${fmtN(mm)} mm square at 1:${fmtN(sc)}, on ${p[0]} landscape, with a table of building heights on A4.`;
    }
    const n = SiteData.numbered(DATA, q).length; t += ` ${n} building${n === 1 ? '' : 's'} in the square.`;
    el.textContent = t; el.classList.toggle('warn', !ok); $('#make').disabled = !ok;
    return ok;
  }
  product(S.p); kind(S.kind);

  // ---------------------------------------------------------------- 3D view
  const cv = $('#v3d'), R = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
  R.setClearColor(0x17212b);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(35, 16 / 9, 0.5, 20000);
  cam.up.set(0, 0, 1);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, .7)); const sun = new THREE.DirectionalLight(0xffffff, .75); sun.position.set(-0.6, -1, 1.4); scene.add(sun);
  const ctl = new THREE.OrbitControls(cam, cv); ctl.enableDamping = true;
  let siteGroup = null, outGroup = null, view = 'site', bMeshes = [], labelGroup = null, picked = null;
  const matT = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const matB = new THREE.MeshLambertMaterial({ color: 0xc9c2b6 }), matBE = new THREE.MeshLambertMaterial({ color: 0xe8e2d8, transparent: true, opacity: .85 });
  const matBP = new THREE.MeshLambertMaterial({ color: 0xe08a5c });
  const matW = new THREE.MeshLambertMaterial({ color: 0x5a9fd4, transparent: true, opacity: .75, side: THREE.DoubleSide });
  const dispose = g => g && g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.map) { o.material.map.dispose(); o.material.dispose(); } });
  (function loop() {
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * devicePixelRatio) || cv.height !== Math.round(h * devicePixelRatio)) { R.setPixelRatio(devicePixelRatio); R.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
    ctl.update(); R.render(scene, cam); requestAnimationFrame(loop);
  })();
  let framedFor = '';
  function frame(sx, sy, sz, key) {
    if (key && key === framedFor) return; framedFor = key || '';
    const s = Math.max(sx, sy);
    cam.position.set(sx * .5 - s * .55, sy * .5 - s * 1.05, sz + s * .85); ctl.target.set(sx / 2, sy / 2, sz * .3); cam.near = s / 500; cam.far = s * 20; cam.updateProjectionMatrix(); ctl.update();
  }
  function siteView() {
    const q = sq(), vex = +$('#vVex').value, n = Math.min(241, Math.round(q.g / 1) + 1), d = q.g / (n - 1);
    const { lo, hi, missing } = SiteData.groundRange(DATA, q), Zs = v => (v - lo) * vex;
    if (siteGroup) { scene.remove(siteGroup); dispose(siteGroup); }
    siteGroup = new THREE.Group(); bMeshes = []; picked = null; $('#vPick').hidden = true;
    // ground
    const pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3), idx = [];
    const c0 = new THREE.Color(0x8a9a6a), c1 = new THREE.Color(0xd8cfb6), tmp = new THREE.Color();
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      let z = DATA.D.sample(q.x0 + c * d, q.y0 + r * d); if (z !== z) z = lo;
      const k = r * n + c; pos.set([c * d, r * d, Zs(z)], k * 3);
      tmp.copy(c0).lerp(c1, hi > lo ? (z - lo) / (hi - lo) : .5); col.set([tmp.r, tmp.g, tmp.b], k * 3);
    }
    for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) { const a = r * n + c; idx.push(a, a + 1, a + n + 1, a, a + n + 1, a + n); }
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); gg.setAttribute('color', new THREE.BufferAttribute(col, 3)); gg.setIndex(idx); gg.computeVertexNormals();
    siteGroup.add(new THREE.Mesh(gg, matT));
    // skirt so the square reads as a block
    const sk = [], edge = (x, y) => { let z = DATA.D.sample(q.x0 + x, q.y0 + y); if (z !== z) z = lo; return Zs(z); }, bz = -Math.max(2, (hi - lo) * vex * .15);
    const sides = [[0, 0, 1, 0], [q.g, 0, 0, 1], [q.g, q.g, -1, 0], [0, q.g, 0, -1]];
    sides.forEach(([x, y, dx, dy]) => { for (let i = 0; i < n - 1; i++) { const ax = x + dx * i * d, ay = y + dy * i * d, bx = ax + dx * d, by = ay + dy * d; sk.push(ax, ay, bz, bx, by, bz, bx, by, edge(bx, by), ax, ay, bz, bx, by, edge(bx, by), ax, ay, edge(ax, ay)); } });
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sk, 3)); sg.computeVertexNormals();
    siteGroup.add(new THREE.Mesh(sg, new THREE.MeshLambertMaterial({ color: 0x6b6153, side: THREE.DoubleSide })));
    // water
    DATA.water.items.forEach(([lev, polys]) => polys.forEach(p => {
      const c = SiteData.clipPoly(p, q); if (!c) return;
      const sh = new THREE.Shape(c[0].map(([x, y]) => new THREE.Vector2(x - q.x0, y - q.y0)));
      c.slice(1).forEach(h => sh.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x - q.x0, y - q.y0)))));
      const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), matW); m.position.z = Zs(lev) + .05; siteGroup.add(m);
    }));
    // buildings, true height, standing on the (possibly exaggerated) ground
    const list = SiteData.numbered(DATA, q), byI = new Map(list.map(b => [b.i, b]));
    if ($('#vBld').checked) SiteData.footprintsIn(DATA, q).forEach(({ b, polys }) => {
      const nb = byI.get(b.i);
      polys.forEach(p => {
        if (Math.abs(SiteData.area(p[0])) < .5) return;
        const sh = new THREE.Shape(p[0].map(([x, y]) => new THREE.Vector2(x - q.x0, y - q.y0)));
        p.slice(1).forEach(h => sh.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x - q.x0, y - q.y0)))));
        const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(.5, b.h), bevelEnabled: false });
        const m = new THREE.Mesh(g, b.est ? matBE : matB); m.position.z = Zs(b.ground) - .3; m.userData = { b, nb };
        siteGroup.add(m); bMeshes.push(m);
      });
    });
    // number labels
    labelGroup = null;
    if ($('#vNum').checked && $('#vBld').checked) {
      labelGroup = new THREE.Group();
      list.slice(0, 600).forEach(b => {
        const s = String(b.n), c = document.createElement('canvas'); c.width = 64; c.height = 32; const x = c.getContext('2d');
        x.fillStyle = 'rgba(23,33,43,.85)'; x.fillRect(0, 0, 64, 32); x.fillStyle = '#fff'; x.font = '600 20px IBM Plex Sans, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(s, 32, 17);
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
        const k = q.g / 28; sp.scale.set(k * (s.length > 2 ? 1.4 : 1.1), k * .55, 1); sp.position.set(b.at[0] - q.x0, b.at[1] - q.y0, Zs(b.ground) + b.h + k * .6);
        labelGroup.add(sp);
      });
      siteGroup.add(labelGroup);
    }
    scene.add(siteGroup);
    if (view === 'site') { siteGroup.visible = true; if (outGroup) outGroup.visible = false; }
    else siteGroup.visible = false;
    frame(q.g, q.g, (hi - lo) * vex, [q.x0, q.y0, q.g].map(Math.round).join());
    const est = list.filter(b => b.est).length;
    $('#vTag').className = 'tag' + (missing > .02 ? ' warn' : '');
    $('#vTag').textContent = missing > .02 ? `${Math.round(missing * 100)}% of this square has no ground data (outside the survey). Move the square in.` :
      `Ground ${lo.toFixed(1)}–${hi.toFixed(1)} m OD${vex > 1 ? `, heights ×${vex}` : ''} · ${list.length} buildings (massing for viewing only, not in the downloads)${est ? ` · ${est} with estimated heights, paler` : ''}`;
  }
  ['#vVex', '#vBld', '#vNum'].forEach(s => $(s).onchange = () => { framedFor = ''; if (view !== 'site') setView('site'); siteView(); });
  // click a building for its number and heights
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(); let downAt = null;
  cv.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
  cv.addEventListener('pointerup', e => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4 || view !== 'site') return;
    const r = cv.getBoundingClientRect(); mouse.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(mouse, cam); const hit = ray.intersectObjects(bMeshes)[0];
    bMeshes.forEach(m => { m.material = m.userData.b.est ? matBE : matB; });
    if (!hit) { $('#vPick').hidden = true; return; }
    const { b, nb } = hit.object.userData; bMeshes.filter(m => m.userData.b === b).forEach(m => { m.material = matBP; });
    const row = (k, v) => v == null ? '' : `<tr><td>${k}</td><td>${typeof v === 'number' ? v.toFixed(2) : v}</td></tr>`;
    $('#vPick').innerHTML = `<b>${nb ? 'Building ' + nb.n : 'Building (numbered in the next square)'}</b><div class="dim" style="font-size:12.5px">${AW.esc(b.use)}</div><table>${row('Ground', b.ground)}${row('Eaves', b.eave)}${row('Roof', b.roof)}${row('Top', b.top)}${row('Height', b.h)}</table><div class="dim" style="font-size:11.5px;margin-top:4px">m OD · height above ground in m${b.est ? '<br>Estimated height: check on site' : ''}</div>`;
    $('#vPick').hidden = false;
  });

  // output view
  function setView(v) {
    view = v; document.querySelectorAll('[data-v]').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === v));
    const svg = v === 'out' && outGroup === 'svg';
    $('#vSvg').hidden = !svg; $('#vCtl').hidden = v !== 'site'; $('#vPick').hidden = true; $('#vTag').hidden = svg;
    if (siteGroup) siteGroup.visible = v === 'site';
    if (outGroup && outGroup !== 'svg') outGroup.visible = v === 'out';
    $('#vHint').textContent = v === 'site' ? 'Drag to turn, scroll to zoom. Click a building for its height.' : svg ? 'The first sheet or page of your download.' : 'What will be printed: drag to turn, scroll to zoom.';
    if (v === 'site') { framedFor = ''; const q = sq(), { lo, hi } = SiteData.groundRange(DATA, q); frame(q.g, q.g, (hi - lo) * +$('#vVex').value); }
    else if (outGroup && outGroup !== 'svg') { const b = new THREE.Box3().setFromObject(outGroup), s = b.getSize(new THREE.Vector3()); frame(s.x, s.y, s.z); }
  }
  document.querySelectorAll('[data-v]').forEach(b => b.onclick = () => setView(b.dataset.v));
  function showMeshes(meshes, t) {
    if (outGroup && outGroup !== 'svg') { scene.remove(outGroup); dispose(outGroup); }
    outGroup = new THREE.Group(); const gap = t.n > 1 ? 4 : 0;
    meshes.forEach(({ m, c, r }) => {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3)); g.setIndex(new THREE.BufferAttribute(m.indices, 1)); g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0xf2efe7 })); mesh.position.set(c * (t.tile + gap), (t.n - 1 - r) * (t.tile + gap), 0); outGroup.add(mesh);
    });
    scene.add(outGroup); $('[data-v="out"]').disabled = false; setView('out');
    $('#vTag').className = 'tag'; $('#vTag').textContent = `Print preview: ${t.n > 1 ? t.n * t.n + ' tiles, ' : ''}${fmtN(t.mm)} mm square, ground only`;
  }
  function showSVG(svg) {
    if (outGroup && outGroup !== 'svg') { scene.remove(outGroup); dispose(outGroup); }
    outGroup = 'svg'; $('#vSvg').innerHTML = svg.replace(/<\?xml[^>]*>/, ''); $('[data-v="out"]').disabled = false; setView('out');
  }

  // ---------------------------------------------------------------- make
  const prog = (t, f) => { st(t); $('#prog').hidden = f == null; $('#prog i').style.width = Math.round((f || 0) * 100) + '%'; };
  const link = (name, blob, label) => { const a = document.createElement('a'); a.className = 'btn sm'; a.href = URL.createObjectURL(blob); a.download = name; a.textContent = label; $('#dl').append(a); };
  const base = () => ({ DATA, sq: sq(), scale: scale(), name: S.name, tag: tag() });

  async function makePrint() {
    const o = Object.assign(base(), { vex: +$('#vex').value, roads: $('#roads').checked, water: $('#water').checked, base: +$('#base').value, marks: document.querySelector('[name=marks]:checked').value });
    const r = await Outputs.print(o, prog);
    $('#dl').innerHTML = '';
    if (r.meshes.length === 1) { link(o.tag + '.3mf', r.meshes[0].b3, 'Download 3MF'); }
    link(o.tag + (r.meshes.length > 1 ? `_${r.t.n}x${r.t.n}_tiles` : '') + '.zip', r.blob, r.meshes.length > 1 ? `Download all ${r.meshes.length} tiles (ZIP)` : 'ZIP: 3MF, STL, plan and heights');
    const fp = r.meshes.reduce((s, x) => s + x.m.info.footprints, 0);
    st(`${r.meshes.length > 1 ? r.meshes.length + ' tiles of ' + fmtN(r.t.tile, 1) + ' mm' : fmtN(r.t.mm) + ' mm square'}, up to ${fmtN(r.height, 1)} mm high, datum ${r.datum} m OD. ${o.marks === 'off' ? 'No footprints marked.' : fmtN(fp) + ' footprints marked.'} Watertight. The ZIP also has the numbered plan and the table of heights.`);
    showMeshes(r.meshes, r.t);
  }
  async function makeLaser() {
    const o = Object.assign(base(), { kind: S.kind, board: +$('#board').value, sheet: $('#sheet').value.split('x').map(Number), spacing: +$('#spacing').value, engrave: $('#engB').checked, numbers: $('#engN').checked });
    const r = await Outputs.laserKit(o, prog);
    $('#dl').innerHTML = ''; link(o.tag + `_${o.kind}_${o.board}mm.zip`, r.blob, 'Download the kit (ZIP)');
    const sh = `${r.pk.count} sheet${r.pk.count > 1 ? 's' : ''} of ${o.sheet.join(' × ')} mm`;
    st(o.kind === 'waffle' ? `${r.W.pieces.length} sections (${r.W.pieces.length / 2} A + ${r.W.pieces.length / 2} B) of ${o.board} mm, ${fmtN(r.W.spacing, 1)} mm apart, on ${sh}.${o.engrave ? ` ${r.nB} building crossings engraved.` : ''}`
      : `${r.M.layers.length} ${o.kind} layers of ${o.board} mm on ${sh}. Each layer is ${fmtN(r.layerM, 2)} m of ground.${o.engrave ? ` ${r.nB} footprints engraved.` : ''}`);
    showSVG(r.svg0);
  }
  async function makeMap() {
    prog('Drawing the contours…', .3); await new Promise(r => setTimeout(r, 30));
    const o = Object.assign(base(), { interval: +$('#interval').value, buildings: $('#mB').checked, numbers: $('#mB').checked && $('#mN').checked, roads: $('#mR').checked, water: $('#mW').checked, spots: $('#mS').checked });
    const m = Outputs.contourPlan(o);
    prog('Writing the DXF and the site pack…', .7); await new Promise(r => setTimeout(r, 30));
    const dxf = Outputs.planDXF(o, m), pack = SiteData.sitePack(DATA, o.sq, o.name || 'Sligo site', m.list);
    $('#dl').innerHTML = '';
    link(o.tag + '_contours.pdf', m.pdf, 'PDF');
    link(o.tag + '_contours.svg', new Blob([m.svg], { type: 'image/svg+xml' }), 'SVG');
    link(o.tag + '_contours.dxf', new Blob([dxf], { type: 'application/dxf' }), 'DXF (CAD)');
    if (o.numbers && m.list.length) link(o.tag + '_building_heights.csv', new Blob([m.csv], { type: 'text/csv' }), 'Heights CSV');
    link(o.tag + '_sitepack.json', new Blob([JSON.stringify(pack)], { type: 'application/json' }), 'Site pack (Site Model Hub)');
    st(`Contour plan at 1:${fmtN(o.scale)} on ${m.paper}, ${fmtN(m.G.size, 1)} m square${o.numbers ? `, ${m.list.length} numbered buildings${m.nEst ? ` (${m.nEst} with estimated heights)` : ''}` : ''}.`);
    showSVG(m.svg);
  }
  let busy = false;
  $('#make').onclick = async () => {
    if (busy || !summary()) return;
    busy = true; document.querySelector('.panel').inert = true; $('#make').disabled = true; $('#dl').innerHTML = '';
    try { await (S.p === 'print' ? makePrint() : S.p === 'laser' ? makeLaser() : makeMap()); }
    catch (e) { console.error(e); st('Could not make it: ' + e.message, true); }
    finally { busy = false; document.querySelector('.panel').inert = false; $('#make').disabled = false; $('#prog').hidden = true; summary(); }
  };

  showSq(true);
  st('Drag the square onto your site, choose what to make and the scale, then Make it.');
  window.SSM = { S, DATA, sq, showSq, summary, setView };            // for testing
})().catch(e => { console.error(e); const s = document.getElementById('status'); if (s) { s.textContent = 'The page could not start: ' + e.message; s.classList.add('err'); } });
