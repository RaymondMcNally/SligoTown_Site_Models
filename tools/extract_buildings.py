"""Step 1 of 2: read the buildings table from the Sligo master GeoPackage (God's Eye / sligo-server) with the Python
standard library only, keeping geometry and height fields. No address, occupancy, vacancy or sales fields are read.

    python3 tools/extract_buildings.py ~/Sligo/sligo-server/data/Sligo_master.gpkg _build/bld_raw.json

Then step 2: tools/make_buildings.py (adds estimated heights and writes data/buildings.json)."""
import sqlite3, struct, json, sys

src, out = sys.argv[1], sys.argv[2]
c = sqlite3.connect(src)
assert c.execute("select srs_id from gpkg_geometry_columns where table_name='buildings'").fetchone()[0] == 2157, 'expected ITM (EPSG:2157)'


def wkb(b, o=0):
    bo = '<' if b[o] == 1 else '>'
    t = struct.unpack_from(bo + 'I', b, o + 1)[0] % 1000
    o += 5
    if t == 3:                                     # polygon
        nr = struct.unpack_from(bo + 'I', b, o)[0]; o += 4; rings = []
        for _ in range(nr):
            n = struct.unpack_from(bo + 'I', b, o)[0]; o += 4
            pts = struct.unpack_from(bo + '%dd' % (2 * n), b, o); o += 16 * n
            rings.append([[round(pts[i], 2), round(pts[i + 1], 2)] for i in range(0, 2 * n, 2)])
        return [rings], o
    if t == 6:                                     # multipolygon
        n = struct.unpack_from(bo + 'I', b, o)[0]; o += 4; polys = []
        for _ in range(n):
            p, o = wkb(b, o); polys += p
        return polys, o
    raise ValueError(f'geometry type {t}')


def gp(b):                                         # GeoPackage binary header, then WKB
    env = (b[3] >> 1) & 7
    return wkb(b, 8 + [0, 32, 48, 48, 64][env])[0]


rows = [list(r[:11]) + [gp(r[11])] for r in c.execute(
    "select guid, form, function, use, ground_m, eave_m, roof_m, top_m, height_m, height_source, footprint_m2, geom from buildings")]
json.dump(rows, open(out, 'w'))
print(len(rows), 'buildings')
