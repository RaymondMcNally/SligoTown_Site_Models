"""Building footprints and heights for the Sligo Site Models website.
In: the buildings table (guid, form, function, use, ground/eave/roof/top, height, source, footprint, ITM polygons)
    extracted from the Sligo master GeoPackage with tools/extract_buildings.py (no address or occupancy fields),
    and As-Water-Arrives data/buildings.json for the corrected model height of buildings without surveyed heights.
Out: data/buildings.json — local metres from the data square's SW corner (same frame as data/model/dtm2m.bin)."""
import json, sys, statistics
from array import array
raw, awa, out = sys.argv[1], sys.argv[2], sys.argv[3]   # argv[4]: data/model/dtm2m.bin
X0, Y0, SZ = 567100.1, 833788.2, 4100.0
B = json.load(open(raw))
dtm = array('h'); dtm.frombytes(open(sys.argv[4], 'rb').read()); NN, ST = 2051, 2.0
def zat(x, y):                                     # DTM level, m OD (bilinear)
    c, r = x / ST, y / ST
    if c < 0 or r < 0 or c > NN - 1 or r > NN - 1: return None
    c0, r0 = min(NN - 2, int(c)), min(NN - 2, int(r)); tx, ty = c - c0, r - r0; k = r0 * NN + c0
    return ((dtm[k] * (1 - tx) + dtm[k + 1] * tx) * (1 - ty) + (dtm[k + NN] * (1 - tx) + dtm[k + NN + 1] * tx) * ty) / 100
def ground(loc):                                   # median ground at the footprint's corners and centre, as for the model
    pts = [p for poly in loc for p in poly[0]]
    cx = sum(x for x, y in pts) / len(pts); cy = sum(y for x, y in pts) / len(pts)
    z = [v for v in (zat(x, y) for x, y in pts + [[cx, cy]]) if v is not None]
    return statistics.median(z) if z else None
est = {f['properties']['g']: f['properties'] for f in json.load(open(awa))['features']}
r1 = lambda v: None if v is None else round(float(v), 2)
items, skipped = [], 0
for guid, form, fn, use, gr, ea, ro, to, h, src, fp, polys in B:
    loc = [[[[round(x - X0, 2), round(y - Y0, 2)] for x, y in ring] for ring in p] for p in polys]
    xs = [x for p in loc for x, y in p[0]]; ys = [y for p in loc for x, y in p[0]]
    if max(xs) < 0 or max(ys) < 0 or min(xs) > SZ or min(ys) > SZ: skipped += 1; continue
    e = est.get(guid)
    if src == 'attributes' and h is not None:
        row = [r1(gr), r1(ea), r1(ro), r1(to), r1(h), 0]
    else:
        g = gr if gr is not None else ground(loc)
        if not e or e.get('h') is None or g is None: skipped += 1; continue
        row = [r1(g), None, r1(g + e['h']), None, r1(e['h']), 1]
    items.append([fn or form or 'Building'] + row + [round(fp or 0, 1), loc])
uses = sorted({i[0] for i in items})
for i in items: i[0] = uses.index(i[0])
json.dump({'fields': ['use', 'ground_m_OD', 'eave_m_OD', 'roof_m_OD', 'top_m_OD', 'height_m', 'estimated', 'footprint_m2', 'polygons'],
           'uses': uses, 'origin': [X0, Y0], 'size': SZ,
           'note': 'Heights: Tailte Éireann building attributes; estimated = OPW 2011 lidar DSM (capped for small buildings) or a default for sheds.',
           'items': items}, open(out, 'w'), separators=(',', ':'))
print(len(items), 'buildings,', skipped, 'outside or without heights,', sum(i[6] for i in items), 'estimated;', len(uses), 'uses')
