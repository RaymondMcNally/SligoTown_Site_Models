# Sligo Site Models (SligoTown_Site_Models)

A static website for fifth-year architecture students at ATU Sligo. Students put a square on their site anywhere in the old Sligo borough and download a terrain model of it at 1:200 to 1:2500. It uses the ground, buildings, roads and water of the 1:2500 *As Water Arrives* borough model, and the contour, laser and 3MF code from the Site Model Hub.

| Page | What it does |
|---|---|
| `index.html` | **Make a site model.** A map of the borough (relief or OpenStreetMap streets) with a square that students drag onto their site (40–500 m). Under the map is a 3D view of the square, with the ground and the buildings at their heights. Students can click a building for its number and heights. Then they choose an output and a scale. |
| `guide.html` | How to use it, sizes at each scale, what each file is, the heights table and the data sources |

## The rule on buildings

Buildings are **shown on the website only**: in the 3D view, as massing. Footprints come from Tailte Éireann and heights are roof minus ground, so the massing has no roof pitches. No download contains building volumes:

- **3D print:** terrain only. The footprints are marked on the ground in one of four ways: an incised outline (0.6 mm wide, 0.4 mm deep), a raised outline (0.4 mm), a raised pad (0.4 mm), or none.
- **Laser kit:** footprints, and optionally their numbers, are engraved on the layer each building stands on.
- **Contour plan:**
  - **Footprints:** can be switched on or off.
  - **Numbers:** can be switched on or off separately.
  - **Height table:** the PDF's A4 pages after the plan list No., Use, Ground, Eaves, Roof, Top (all m OD), Height (m) and Source (survey or estimated).

The same numbering is used in the plan, the laser kit, the 3D view, the PDF table and the CSV. Buildings are numbered in ten bands from the north edge of the square, west to east within each band. A building belongs to the square when its label point is inside it.

## Outputs

| Output | Files |
|---|---|
| 3D print | 3MF and STL per tile (Bambu P1S, mm, north +Y), the numbered plan PDF, `building_heights.pdf/.csv`, README. A square over 230 mm is split into n × n equal tiles (up to 4 × 4): A, B… west to east, 1, 2… north to south. All tiles share one datum, so their edges are flush. Made in the browser with manifold-3d (`js/print3d.js`). |
| Laser contour kit | Nested sheets (SVG and DXF; cut red, engrave blue), contour plan, heights table, README (`MyModel.buildModel` and `nest` from the Site Model Hub). |
| Contour plan | PDF on A3, A2, A1 or A0 (the smallest that fits) with the table of heights on A4. Also an SVG; a DXF for CAD (R12; contours and footprints as 3D polylines at their levels in ITM metres, layers `CONTOUR`, `CONTOUR_INDEX`, `FOOTPRINT`, `BUILDING_NO`, `WATER`, `ROAD`, `SITE_SQUARE`); the heights as CSV; and a **site pack** that the Site Model Hub imports (ground grid, building features, ITM origin). |

Scales: print 1:200, 1:250, 1:500, 1:1000, 1:1250 and 1:2500. Laser 1:200 to 1:1250. Plan 1:200 to 1:2500.

## Files

- `js/app.js`: the page (map, square, 3D view, controls)
- `js/site-data.js`: data loading, numbering, clipping, contour chaining, DXF writer, site pack
- `js/outputs.js`: contour plan with heights table, plan DXF, laser kit, tiled print
- `js/print3d.js`: terrain-only print with footprint marks (adapted from As Water Arrives)
- `js/model-core.js`: from the Site Model Hub, unchanged
- `js/common.js`: from As Water Arrives (ITM ↔ WGS 84, terrain reader)
- `data/model/dtm2m.bin`, `terrain.json`, `roads.json`, `water.json`, `data/hillshade.png`, `data/model.json`, `data/roads.json`: copied from As Water Arrives
- `data/buildings.json`: 11,125 footprints in local metres from the data square's SW corner (ITM E 567100.1, N 833788.2), with ground, eaves, roof, top, height, estimated flag, footprint area and use. No addresses, occupancy or sales data. Rebuild it with:
  ```
  python3 tools/extract_buildings.py ~/Sligo/sligo-server/data/Sligo_master.gpkg _build/bld_raw.json
  python3 tools/make_buildings.py _build/bld_raw.json ../As-Water-Arrives/data/buildings.json data/buildings.json data/model/dtm2m.bin
  ```
  Buildings without surveyed heights (3,166) take the corrected model height from As Water Arrives: the OPW lidar DSM capped for small footprints, or a default for sheds. They are flagged *estimated*. Their ground level is the median DTM level at the footprint's corners and centre.

## Running it

Static files, no build step. GitHub Pages works: Settings › Pages › Deploy from branch › `main` / root. To test locally, run `python3 -m http.server 8000` in this folder and open http://localhost:8000. It must be served over http(s), not opened from disk. The street map needs internet; everything else is in the repository.

## Credits

Ground: 2006 Sligo survey DTM with gaps filled from the OPW 2011 lidar (Contains Irish Public Sector Data (OPW) licensed under CC BY 4.0). Buildings and heights: Tailte Éireann. Roads and water: © OpenStreetMap contributors (ODbL). Libraries: MapLibre GL, three.js, manifold-3d, JSZip, jsPDF (licences in `vendor/`).

Created by R McNally, ATU Sligo Department of Architecture.
