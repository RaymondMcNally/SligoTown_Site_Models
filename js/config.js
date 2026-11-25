/* Sligo Site Models: what students can use. The settings live in config.json in the repository, written by admin.html.
   Anything missing from config.json takes the default below, so older config files keep working. */
(function (root) {
  'use strict';
  const ALL = {
    squares: [40, 50, 60, 80, 100, 120, 150, 200, 250, 300, 400, 500],
    printScales: [200, 250, 500, 1000, 1250, 2500],
    laserScales: [200, 250, 500, 1000, 1250],
    planScales: [200, 250, 500, 1000, 1250, 2500],
    marks: ['incise', 'raise', 'pad', 'off'],
    kinds: ['hollow', 'solid', 'waffle'],
    boards: ['1', '1.5', '2', '3', '5'],
    sheets: ['600x400', '841x594', '1000x600'],
    intervals: ['0.5', '1', '2', '5'],
    formats: ['pdf', 'svg', 'dxf', 'csv', 'sitepack']
  };
  const DEFAULTS = {
    version: 1,
    site: { open: true, closedMessage: 'The site model maker is closed at the moment. Ask your tutor when it will be open again.', notice: '' },
    map: { streetMap: true },
    view: { buildings: true, numbers: true, buildingInfo: true },
    heightsTable: true,
    squares: ALL.squares.slice(), squareDefault: 100,
    print: { enabled: true, scales: ALL.printScales.slice(), marks: ALL.marks.slice(), platforms: true, exaggeration: true, roadsWater: true, maxTiles: 4 },
    laser: { enabled: true, scales: ALL.laserScales.slice(), kinds: ALL.kinds.slice(), platforms: true, engrave: true, boards: ALL.boards.slice(), sheets: ALL.sheets.slice() },
    plan: { enabled: true, scales: ALL.planScales.slice(), intervals: ALL.intervals.slice(), formats: ALL.formats.slice(), spots: true }
  };
  const clone = o => JSON.parse(JSON.stringify(o));
  // defaults, overwritten key by key by what is in the file (objects merged, arrays and values replaced)
  function merge(base, over) {
    const out = clone(base);
    if (!over || typeof over !== 'object') return out;
    Object.keys(over).forEach(k => {
      if (out[k] && typeof out[k] === 'object' && !Array.isArray(out[k]) && over[k] && typeof over[k] === 'object' && !Array.isArray(over[k])) out[k] = merge(out[k], over[k]);
      else if (over[k] !== undefined) out[k] = clone(over[k]);
    });
    return out;
  }
  // the live settings; with ?preview the admin page's unsaved settings from this browser instead
  async function load() {
    const params = new URLSearchParams(location.search);
    if (params.has('preview')) {
      try { const p = JSON.parse(localStorage.getItem('ssm-admin-preview') || 'null'); if (p) return Object.assign(merge(DEFAULTS, p), { _preview: true }); } catch (e) { }
    }
    try {
      const r = await fetch('config.json?v=' + Date.now(), { cache: 'no-store' });
      if (r.ok) return merge(DEFAULTS, await r.json());
    } catch (e) { }
    return clone(DEFAULTS);
  }
  root.SSMConfig = { ALL, DEFAULTS, merge, load, clone };
})(window);
