"""Build the compact data files the Homestead site and embeds read.

Inputs (all regenerated upstream; this script only reads them):
  data/processed/parcels.geojson       one feature per mapped patent
  data/processed/patents_unique.csv    one row per patent, including unmapped grants
  data/processed/reacquisitions.csv    homesteader parcels later patented to the United States
  data/grid/ND05*.geojson              BLM PLSS quarter-quarter cells, one file per township

Outputs (site/data/):
  parcels.json     compact GeoJSON for the map (5-decimal coordinates, short keys)
  townships.json   township outlines + label points, plus the Elkhorn Ranch area label point
  yearly.json      patents per year 1880-1960, individuals vs United States, with the shaded band
  stories.json     reacquisition cards joined to parcel geometry (SVG thumbnail paths)
  search.json      name search index (individual patentees only)
  meta.json        counts used in on-page text
  downloads: parcels.geojson, patents_unique.csv, reacquisitions.csv (straight copies)

Rerun any time the processed data changes:  python3 src/build_site_data.py
"""
import csv, glob, json, math, os, re, shutil
from collections import Counter, defaultdict
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROC = os.path.join(ROOT, "data", "processed")
GRID = os.path.join(ROOT, "data", "grid")
OUT = os.path.join(ROOT, "site", "data")

Y0, Y1 = 1880, 1960          # chart and slider range
BAND = (1936, 1940)          # shaded band on the chart; checked against the data below
PREC = 5


def rnd(obj):
    """Round every coordinate in a GeoJSON geometry to PREC decimals."""
    if isinstance(obj, (list, tuple)):
        if obj and isinstance(obj[0], (int, float)):
            return [round(obj[0], PREC), round(obj[1], PREC)]
        return [rnd(o) for o in obj]
    return obj


def geom_out(g):
    m = mapping(g)
    return {"type": m["type"], "coordinates": rnd(m["coordinates"])}


def dump(name, obj):
    path = os.path.join(OUT, name)
    with open(path, "w") as fh:
        json.dump(obj, fh, separators=(",", ":"), ensure_ascii=False)
    print(f"  {name:20s} {os.path.getsize(path)/1024:7.1f} KB")


def main():
    os.makedirs(OUT, exist_ok=True)
    parcels = json.load(open(os.path.join(PROC, "parcels.geojson")))["features"]
    unique = list(csv.DictReader(open(os.path.join(PROC, "patents_unique.csv"))))
    reacq = list(csv.DictReader(open(os.path.join(PROC, "reacquisitions.csv"))))
    print(f"read {len(parcels)} parcels, {len(unique)} patents, {len(reacq)} reacquisitions")

    # ---------- parcels ----------
    feats, by_acc, shapes = [], {}, {}
    for f in parcels:
        p = f["properties"]
        g = shape(f["geometry"])
        shapes[p["acc"]] = g
        by_acc[p["acc"]] = p
        feats.append({
            "type": "Feature",
            "geometry": geom_out(g),
            "properties": {
                "a": p["acc"], "n": p["name"], "t": p["type"], "d": p["date"], "y": int(p["year"]),
                "l": p["land"], "w": p.get("twp") or [],
                "p": 0 if p.get("complete", True) else 1,      # 1 = only part mapped
                "x": 1 if p.get("approx") else 0,              # 1 = drawn on containing 40-acre square
            },
        })
    # draw order: unnamed, individual, usa (United States on top)
    order = {"unnamed": 0, "individual": 1, "usa": 2}
    feats.sort(key=lambda f: (order.get(f["properties"]["t"], 0), f["properties"]["d"]))
    dump("parcels.json", {"type": "FeatureCollection", "features": feats})

    # ---------- townships ----------
    twps, sections = [], {}
    for path in sorted(glob.glob(os.path.join(GRID, "ND05*.geojson"))):
        m = re.search(r"ND05(\d{3})0N(\d{3})0W0", path)
        name = f"T{int(m.group(1))}N R{int(m.group(2))}W"
        gfeats = json.load(open(path))["features"]
        cells = [shape(f["geometry"]) for f in gfeats]
        by_sec = defaultdict(list)
        for f, g in zip(gfeats, cells):
            mm = re.match(r"SN(\d{2})", f["properties"]["SECDIVID"][15:])
            if mm:
                by_sec[int(mm.group(1))].append(g)
        sections[name] = [unary_union(v).buffer(0.00002).buffer(-0.00002).simplify(0.0001) for v in by_sec.values()]
        u = unary_union(cells).buffer(0.00002).buffer(-0.00002)   # close slivers between cells
        if u.geom_type == "MultiPolygon":
            u = max(u.geoms, key=lambda g: g.area)
        u = u.simplify(0.00005)
        c = u.representative_point() if not u.centroid.within(u) else u.centroid
        twps.append({"name": name, "label": [round(c.y, 5), round(c.x, 5)], "geom": geom_out(u), "_g": u})
    t143 = unary_union([t["_g"] for t in twps if t["name"].startswith("T143N")])
    elk = t143.centroid
    bounds = unary_union([t["_g"] for t in twps]).bounds
    for t in twps:
        del t["_g"]
    dump("townships.json", {
        "townships": twps,
        "elkhorn": [round(elk.y, 5), round(elk.x, 5)],
        "bounds": [[round(bounds[1], 5), round(bounds[0], 5)], [round(bounds[3], 5), round(bounds[2], 5)]],
    })

    # ---------- yearly counts (all federal patents to individuals / United States, mapped or not) ----------
    ind, usa = Counter(), Counter()
    later = Counter()
    for r in unique:
        if not r["year"]:
            continue
        y = int(r["year"])
        if r["patentee_type"] == "individual":
            (ind if Y0 <= y <= Y1 else later)[y if Y0 <= y <= Y1 else "ind"] += 1
        elif r["patentee_type"] == "usa":
            (usa if Y0 <= y <= Y1 else later)[y if Y0 <= y <= Y1 else "usa"] += 1
    years = list(range(Y0, Y1 + 1))
    usa_total = sum(usa.values()) + later["usa"]
    band_usa = sum(usa[y] for y in range(BAND[0], BAND[1] + 1))
    band_share = band_usa / usa_total if usa_total else 0
    peak_year = max(years, key=lambda y: usa[y])
    band_ok = band_share > 0.5 and BAND[0] <= peak_year <= BAND[1]
    print(f"  band check: {band_usa}/{usa_total} patents to the United States fall in "
          f"{BAND[0]}-{BAND[1]} ({band_share:.0%}); peak year {peak_year} -> {'OK' if band_ok else 'FAILS'}")
    dump("yearly.json", {
        "years": years,
        "individual": [ind[y] for y in years],
        "usa": [usa[y] for y in years],
        "outside": {"individual": later["ind"], "usa": later["usa"]},
        "band": {"from": BAND[0], "to": BAND[1], "label": "Most land patented back to the United States",
                 "share": round(band_share, 3), "ok": band_ok},
        "annotation": {"year": 1883, "label": "1883 · Roosevelt comes to the Badlands"},
    })

    # ---------- stories ----------
    def norm(s):
        return re.sub(r"[^a-z0-9]", "", s.lower())

    individuals = [f["properties"] for f in parcels if f["properties"]["type"] == "individual"]
    stories = []
    for r in reacq:
        up = by_acc.get(r["usa_accession"])
        if not up:
            continue
        home = None
        for p in individuals:
            if p["date"] == r["patented"] and r["township"] in (p.get("twp") or []) and \
                    norm(r["homesteader"]) in norm(p["name"]):
                home = p
                break
        gu = shapes[r["usa_accession"]]
        gh = shapes[home["acc"]] if home else None
        stories.append({
            "h": r["homesteader"], "hy": int(r["patented"][:4]), "hd": r["patented"],
            "uy": int(r["usa_date"][:4]), "ud": r["usa_date"],
            "gap": int(r["usa_date"][:4]) - int(r["patented"][:4]),
            "land": r["land"], "twp": r["township"],
            "ua": r["usa_accession"], "ha": home["acc"] if home else None,
            "thumb": thumb(gh, gu, sections.get(r["township"], [])),
        })
    stories.sort(key=lambda s: (-s["gap"], s["h"]))
    print(f"  stories: {len(stories)} joined, {sum(1 for s in stories if s['ha'])} with homesteader parcel")
    grids = split_sections(stories)
    dump("stories.json", {"grids": grids, "items": stories})

    # ---------- search index (individual patentees) ----------
    idx = []
    for p in individuals:
        idx.append({"a": p["acc"], "n": p["name"], "d": p["date"], "l": p["land"],
                    "w": p.get("twp") or [], "k": re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", "", p["name"].lower())).strip()})
    idx.sort(key=lambda r: (r["n"], r["d"]))
    dump("search.json", idx)

    # ---------- meta (numbers for on-page text) ----------
    types = Counter(f["properties"]["type"] for f in parcels)
    utypes = Counter(r["patentee_type"] for r in unique)
    mapped_years = [int(f["properties"]["year"]) for f in parcels]
    ind_years = [int(f["properties"]["year"]) for f in parcels if f["properties"]["type"] == "individual"]
    dump("meta.json", {
        "mapped": len(parcels), "individual": types["individual"], "usa": types["usa"],
        "unnamed": types["unnamed"], "partial": sum(1 for f in parcels if not f["properties"].get("complete", True)),
        "patents": len(unique),
        "grants": utypes["railroad"] + utypes["railroad_affiliate"] + utypes["state"] + utypes["company"],
        "first_year": min(mapped_years), "last_year": max(mapped_years),
        "after_range": sum(1 for y in mapped_years if y > Y1),
        "ind_first": min(ind_years), "ind_last": max(ind_years),
        "stories": len(stories), "townships": len(twps),
    })

    # ---------- downloads ----------
    for name in ("parcels.geojson", "patents_unique.csv", "reacquisitions.csv"):
        shutil.copyfile(os.path.join(PROC, name), os.path.join(OUT, name))
    print("  copied downloads: parcels.geojson, patents_unique.csv, reacquisitions.csv")


def thumb(home, usa, secs, size=100):
    """SVG path strings for a small thumbnail: the township's sections for context,
    the homesteader parcel and the United States parcel (clipped to that township)."""
    twp = unary_union(secs) if secs else None
    if twp is not None:
        clip = twp.buffer(0.001)
        home = home.intersection(clip) if home is not None else None
        usa = usa.intersection(clip)
        home = home if home is not None and not home.is_empty else None
    geoms = [twp] if twp is not None else [g for g in (home, usa) if g is not None]
    minx = min(g.bounds[0] for g in geoms); miny = min(g.bounds[1] for g in geoms)
    maxx = max(g.bounds[2] for g in geoms); maxy = max(g.bounds[3] for g in geoms)
    k = math.cos(math.radians((miny + maxy) / 2))
    w, h = (maxx - minx) * k, (maxy - miny)
    span = max(w, h) * 1.04 or 1e-6
    ox = minx * k - (span - w) / 2
    oy = maxy + (span - h) / 2

    def path(g):
        if g is None or g.is_empty:
            return None
        polys = [q for q in getattr(g, "geoms", [g]) if q.geom_type == "Polygon"]
        out = []
        for poly in polys:
            for ring in [poly.exterior, *poly.interiors]:
                pts = [f"{(x*k-ox)/span*size:.1f} {(oy-y)/span*size:.1f}" for x, y in ring.coords]
                out.append("M" + "L".join(pts) + "Z")
        return "".join(out)

    return {"s": "".join(path(q) or "" for q in secs), "h": path(home), "u": path(usa)}


def split_sections(stories):
    """Section-grid paths are the same for every story in a township: store them once."""
    grids = {}
    for st in stories:
        grids[st["twp"]] = st["thumb"].pop("s")
    return grids


if __name__ == "__main__":
    main()
