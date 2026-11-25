/* Sligo Site Models: admin page. Edits config.json (what students can use), previews it, and publishes it to the
   repository through the GitHub contents API with the staff member's own token. */
(async function () {
  'use strict';
  const $ = s => document.querySelector(s), { ALL, DEFAULTS, merge, clone } = SSMConfig;
  const REPO = 'RaymondMcNally/SligoTown_Site_Models', BRANCH = 'main', PATH = 'config.json';
  const st = (t, err) => { $('#status').textContent = t; $('#status').classList.toggle('err', !!err); };
  const LABEL = {
    scale: v => '1:' + Number(v).toLocaleString('en-IE'), m: v => v + ' m',
    marks: v => ({ incise: 'Incised outline', raise: 'Raised outline', pad: 'Raised pad', off: 'None' })[v],
    kinds: v => ({ hollow: 'Hollow layers', solid: 'Solid layers', waffle: 'Waffle' })[v],
    boards: v => ({ '1': '1 mm card', '1.5': '1.5 mm greyboard', '2': '2 mm board', '3': '3 mm MDF', '5': '5 mm foamboard' })[v],
    sheets: v => ({ '600x400': '600 × 400', '841x594': 'A1 841 × 594', '1000x600': '1000 × 600' })[v] + ' mm',
    formats: v => ({ pdf: 'PDF', svg: 'SVG', dxf: 'DXF', csv: 'Heights CSV', sitepack: 'Site pack' })[v]
  };
  const get = (o, k) => k.split('.').reduce((a, p) => a && a[p], o);
  const set = (o, k, v) => { const ps = k.split('.'), last = ps.pop(); ps.reduce((a, p) => a[p], o)[last] = v; };

  // chips for the lists
  document.querySelectorAll('[data-list]').forEach(box => {
    box.innerHTML = ALL[box.dataset.all].map(v => `<label><input type="checkbox" value="${v}"> ${LABEL[box.dataset.fmt](v)}</label>`).join('');
  });
  $('#sqDef').innerHTML = ALL.squares.map(v => `<option value="${v}">${v} × ${v} m</option>`).join('');

  // the form ↔ a config object
  function fill(c) {
    document.querySelectorAll('[data-k]').forEach(el => {
      const v = get(c, el.dataset.k);
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v == null ? '' : v;
    });
    document.querySelectorAll('[data-list]').forEach(box => { const v = get(c, box.dataset.list).map(String); box.querySelectorAll('input').forEach(i => { i.checked = v.includes(i.value); }); });
    sync();
  }
  function read() {
    const c = clone(DEFAULTS);
    document.querySelectorAll('[data-k]').forEach(el => set(c, el.dataset.k, el.type === 'checkbox' ? el.checked : 'num' in el.dataset || el.dataset.k === 'squareDefault' ? +el.value : el.value.trim()));
    document.querySelectorAll('[data-list]').forEach(box => {
      const nums = typeof get(DEFAULTS, box.dataset.list)[0] === 'number';
      set(c, box.dataset.list, [...box.querySelectorAll('input:checked')].map(i => nums ? +i.value : i.value));
    });
    if (!c.site.closedMessage) c.site.closedMessage = DEFAULTS.site.closedMessage;
    return c;
  }
  // things that would leave students stuck
  function problems(c) {
    const p = [];
    if (c.site.open && !c.print.enabled && !c.laser.enabled && !c.plan.enabled) p.push('No tools are available: the site will show the closed message.');
    if (!c.squares.length) p.push('Choose at least one square size.');
    if (c.print.enabled && !c.print.scales.length) p.push('3D print: choose at least one scale.');
    if (c.laser.enabled) { if (!c.laser.scales.length) p.push('Laser: choose at least one scale.'); if (!c.laser.kinds.length) p.push('Laser: choose at least one kind of kit.'); if (!c.laser.boards.length) p.push('Laser: choose at least one board.'); if (!c.laser.sheets.length) p.push('Laser: choose at least one sheet size.'); }
    if (c.plan.enabled) { if (!c.plan.scales.length) p.push('Contour plan: choose at least one scale.'); if (!c.plan.intervals.length) p.push('Contour plan: choose at least one contour interval.'); if (!c.plan.formats.length) p.push('Contour plan: choose at least one file type.'); }
    if (c.squares.length && !c.squares.includes(c.squareDefault)) p.push('The starting square is not one of the sizes students can choose; the middle size will be used.');
    return p;
  }
  // differences from the live settings, in plain words
  function diff(a, b, pre = '') {
    const out = [];
    Object.keys(Object.assign({}, a, b)).forEach(k => {
      if (k === 'updated' || k === 'version') return;
      const x = a ? a[k] : undefined, y = b ? b[k] : undefined, key = pre + k;
      if (x && y && typeof x === 'object' && !Array.isArray(x)) out.push(...diff(x, y, key + '.'));
      else if (JSON.stringify(x) !== JSON.stringify(y)) out.push(`<b>${key}</b>: ${Array.isArray(y) ? (y.join(', ') || 'none') : typeof y === 'boolean' ? (y ? 'on' : 'off') : AW.esc(String(y)) || '(empty)'}`);
    });
    return out;
  }
  let LIVE = null, SHA = null;
  function sync() {
    document.querySelectorAll('[data-sec]').forEach(sec => { const sw = sec.querySelector('h2 input'); sec.classList.toggle('off', !sw.checked); });
    const c = read(), d = LIVE ? diff(LIVE, c) : [], p = problems(c);
    $('#changes').innerHTML = d.length ? 'Not yet published:<br>' + d.join('<br>') : LIVE ? 'No changes from the live site.' : '';
    $('#problems').hidden = !p.length; $('#problems').innerHTML = p.map(AW.esc).join('<br>');
    $('#publish').disabled = !d.length;
  }
  document.querySelector('#form').addEventListener('input', sync);
  document.querySelector('#form').addEventListener('change', sync);

  // the live settings, straight from the repository (the published site can lag a minute behind)
  async function loadLive() {
    try {
      const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${PATH}?ref=${BRANCH}`, { cache: 'no-store', headers: Object.assign({ Accept: 'application/vnd.github+json' }, token() ? { Authorization: 'Bearer ' + token() } : {}) });
      if (r.ok) { const j = await r.json(); SHA = j.sha; return merge(DEFAULTS, JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(j.content.replace(/\s/g, '')), ch => ch.charCodeAt(0))))); }
      if (r.status === 404) { SHA = null; return clone(DEFAULTS); }
    } catch (e) { }
    return SSMConfig.load();                                                   // fall back to the site's own copy
  }
  const token = () => $('#token').value.trim();
  try { const t = localStorage.getItem('ssm-admin-token'); if (t) { $('#token').value = t; $('#remember').checked = true; } } catch (e) { }
  $('#remember').onchange = $('#token').onchange = () => { try { if ($('#remember').checked && token()) localStorage.setItem('ssm-admin-token', token()); else localStorage.removeItem('ssm-admin-token'); } catch (e) { } };

  LIVE = await loadLive();
  fill(LIVE);
  $('#liveInfo').textContent = LIVE.updated ? `Live settings last published ${new Date(LIVE.updated).toLocaleString('en-IE', { dateStyle: 'medium', timeStyle: 'short' })}.` : 'Live settings: everything on (defaults).';

  $('#preview').onclick = () => {
    try { localStorage.setItem('ssm-admin-preview', JSON.stringify(read())); } catch (e) { st('This browser would not store the preview.', true); return; }
    window.open('index.html?preview=1', 'ssm-preview');
  };
  $('#download').onclick = () => {
    const c = Object.assign(read(), { updated: new Date().toISOString() });
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(c, null, 2) + '\n'], { type: 'application/json' })); a.download = 'config.json'; a.click();
    st('Downloaded. Upload it to the top of the repository on GitHub (Add file › Upload files) to publish it.');
  };
  $('#revert').onclick = () => { fill(LIVE); st('Back to the live settings.'); };
  $('#defaults').onclick = () => { fill(DEFAULTS); st('Everything switched on. Publish to apply it.'); };
  $('#publish').onclick = async () => {
    const c = read(), p = problems(c);
    if (!token()) { st('Paste a GitHub token first, or use Download config.json.', true); $('#token').focus(); return; }
    if (p.some(x => !x.startsWith('The starting')) && !confirm('Publish anyway?\n\n' + p.join('\n'))) return;
    c.updated = new Date().toISOString();
    $('#publish').disabled = true; st('Publishing…');
    try {
      const fresh = await fetch(`https://api.github.com/repos/${REPO}/contents/${PATH}?ref=${BRANCH}`, { cache: 'no-store', headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token() } });
      const sha = fresh.ok ? (await fresh.json()).sha : null;
      const bytes = new TextEncoder().encode(JSON.stringify(c, null, 2) + '\n'); let bin = ''; bytes.forEach(b => { bin += String.fromCharCode(b); });
      const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${PATH}`, {
        method: 'PUT', headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ message: 'Admin: update what students can use', content: btoa(bin), branch: BRANCH }, sha ? { sha } : {}))
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(r.status === 401 ? 'GitHub did not accept the token.' : r.status === 403 || r.status === 404 ? 'The token cannot write to this repository (it needs Contents: read and write on SligoTown_Site_Models).' : (j.message || 'GitHub said ' + r.status)); }
      SHA = (await r.json()).content.sha; LIVE = merge(DEFAULTS, c);
      $('#liveInfo').textContent = `Published ${new Date(c.updated).toLocaleString('en-IE', { dateStyle: 'medium', timeStyle: 'short' })}.`;
      st('Published. GitHub Pages updates the live site in a minute or two; students may need to reload the page.');
      try { localStorage.removeItem('ssm-admin-preview'); } catch (e) { }
    } catch (e) { st('Not published: ' + e.message, true); }
    sync();
  };
})().catch(e => { console.error(e); const s = document.getElementById('status'); if (s) { s.textContent = 'The admin page could not start: ' + e.message; s.classList.add('err'); } });
