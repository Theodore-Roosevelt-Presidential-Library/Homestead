# Homestead

## Website and embeds

The `site/` folder is a static site for **homestead.labs.trlibrary.com**: "Who Owned the Badlands? Homesteads around Medora, 1889–1957." It has four views built from the GLO land-patent data in 12 townships (T139N–T141N and T143N, R101W–R103W).

| View | What it shows |
|---|---|
| `map` | Leaflet map on USGS topo tiles. A 1883–1960 year slider with Play adds each parcel once its patent date is reached. It starts in 1883, the year Theodore Roosevelt first came to the badlands, with a short note until the first patents in 1889. Orange = patents to individuals, navy = patents to the United States, sand = no name in the index, dashed outline = only part of the land mapped so far. Tapping a spot, or the **What land am I on?** button (phone location, never sent anywhere), opens a card with every patent for that spot, today's land status and the Native history of the area; patents link to BLM GLO Records. |
| `chart` | Patents per year as stacked bars (inline SVG) with hover/tap/keyboard tooltips, the 1883 annotation, the 1936–1940 band and a data table. |
| `search` | "Did your family homestead near Medora?" Matches any part of a patentee name, ignoring case and punctuation. |
| `stories` | "Patented twice" cards from `reacquisitions.csv`, longest gap first, 6 at a time. |
| `all` | All four, in order. |

The full page (`site/index.html`) shows all four plus an About/method section and downloads. `?acc=<accession>` on the full page zooms to that parcel and opens its card, e.g. `https://homestead.labs.trlibrary.com/?acc=SER-NDMTAA%20077716`.

### Embed code

Drop a div where each view should appear, and include the script once per page:

```html
<div data-homestead="map"></div>
<script src="https://homestead.labs.trlibrary.com/embed.js" async></script>
```

Other views and options:

```html
<div data-homestead="map" data-year="1915" data-height="600"></div>  <!-- start year (default 1883), map height in px -->
<div data-homestead="chart"></div>
<div data-homestead="search" data-name="olsen"></div>               <!-- preset search -->
<div data-homestead="stories"></div>
<div data-homestead="all"></div>
```

- The script renders straight into the host page (no iframe) and handles any number of divs.
- It works out its own base URL from its `src`, so it also runs from a local server.
- Styles come from `homestead.css`; every rule is scoped under `.hs`, and all classes start with `hs-`.
- Leaflet 1.9.4 loads from cdnjs only when a map is on the page. If the host page already has Leaflet 1.x loaded, the script uses that copy.
- When the page has a map, "See it on the map" links in the search and stories views jump to it. When there's no map on the page, those links open the full page with `?acc=`.
- `site/embed-test.html` is a test host page with all four embeds and deliberately hostile host CSS.

### Rebuild the data

When `data/processed/` is regenerated (for example, after `src/geocode_parcels.py` is rerun), run:

```bash
python3 src/build_site_data.py
```

This rewrites `site/data/`:

- the compact map, township, yearly, stories, search and meta JSON files
- fresh download copies of `parcels.geojson`, `patents_unique.csv` and `reacquisitions.csv`

It prints a check that the 1936–1940 band still holds most patents to the United States (currently 278 of 306, 91%). If that check fails, update the band years in the script. The script needs `shapely`.

To preview locally:

```bash
cd site && python3 -m http.server 8000
# open http://localhost:8000/ and http://localhost:8000/embed-test.html
```

### Hosting (GitHub Pages)

Serve the `site/` folder as the site root. It already contains `CNAME` (`homestead.labs.trlibrary.com`). GitHub Pages can only publish from `/` or `/docs` on a branch, so pick one of these:

1. **GitHub Actions (recommended):** Settings → Pages → Source: GitHub Actions, then use the standard "Static HTML" workflow with `path: site`.
2. **`gh-pages` branch:** run `git subtree push --prefix site origin gh-pages`, then set Pages to deploy from `gh-pages` / root.

DNS: point a CNAME record for `homestead.labs` at `<org>.github.io`.

Keep `data/processed/tr_name_matches.csv` out of `site/`. It is a working file and is not published.

## What land am I on?

The map card answers "what land is this?" for any tapped spot or the phone's location. The lookup runs entirely in the browser against the site's own data; the location is never sent or stored.

- `site/data/grid.json` (loaded only when the card opens): the PLSS 40-acre squares and lots per township, so the card can name the section and square.
- `site/data/landnow.json`: land status today (NPS, USFS, State, BLM) from the BLM Surface Management Agency map service, clipped to the townships by `src/fetch_land_status.py` (writes `data/raw/land_status_sma.geojson`; then rerun `src/build_site_data.py`). Private land is shown only as private; no owners are named.
- `site/data/context.json`: hand-written card text (agency names, school and railroad sections, the "Before the homesteads" Native history and its sources, the privacy line). Every statement is tied to a listed source; keep them in step.
- Parcels whose GLO land description reserves coal or minerals carry `m: 1` in `parcels.json`.
