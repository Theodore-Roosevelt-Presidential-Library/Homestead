"""Place GLO patents on the BLM survey grid (PLSS CadNSDI quarter-quarters and lots).

Inputs:
  data/processed/patents_all.csv      one row per (township search, patent)
  data/raw/land_full.csv              full land descriptions for patents whose search card
                                      showed only the first two, read by expanding "Show More"
                                      on the GLO results (accession, township, range of the
                                      search it was read in, land_desc_full)
  data/grid/ND05*.geojson             BLM CadNSDI "PLSS Intersected" polygons per township
                                      (gis.blm.gov .../BLM_Natl_PLSS_CadNSDI/MapServer/3)
Outputs:
  data/processed/parcels.geojson      one feature per patent (all mapped land merged)
  data/processed/geocode_report.json  what could and could not be placed

The grid gives quarter-quarter (40-acre) cells and government lots. Aliquots finer than a
quarter-quarter (e.g. N1/2NENE) are placed on the containing quarter-quarter and flagged.
"""
import csv, glob, json, os, re
from collections import defaultdict
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROC = os.path.join(ROOT, "data", "processed")
GRID = os.path.join(ROOT, "data", "grid")
RAW = os.path.join(ROOT, "data", "raw")

# ---------- grid ----------
def load_grid():
    """cells[(twp, rng)][sec] = {'qq': {'NENE': geom}, 'lot': {1: geom}}"""
    cells = defaultdict(lambda: defaultdict(lambda: {"qq": {}, "lot": {}}))
    for path in glob.glob(os.path.join(GRID, "ND05*.geojson")):
        m = re.search(r"ND05(\d{3})0N(\d{3})0W0", path)
        key = (f"T{int(m.group(1))}N", f"R{int(m.group(2))}W")
        for f in json.load(open(path))["features"]:
            p = f["properties"]; sid = p["SECDIVID"][15:]   # e.g. SN090ANESW / SN030L7
            mm = re.match(r"SN(\d{2})\d([AL])(.+)", sid)
            if not mm: continue
            sec, typ, val = int(mm.group(1)), mm.group(2), mm.group(3)
            g = shape(f["geometry"])
            if typ == "A": cells[key][sec]["qq"][val] = g
            else: cells[key][sec]["lot"][int(val)] = g
    return cells

# ---------- aliquot parsing ----------
HALF = {"N": (0, 0, 1, .5), "S": (0, .5, 1, 1), "E": (.5, 0, 1, 1), "W": (0, 0, .5, 1)}

def qq_name(x, y):
    """x,y = column,row of a 4x4 quarter-quarter grid (0,0 = NW corner)."""
    quarter = ("N" if y < 2 else "S") + ("E" if x >= 2 else "W")
    sub = ("N" if y % 2 == 0 else "S") + ("E" if x % 2 == 1 else "W")
    return sub + quarter

def tokens(aliquot):
    a = aliquot.upper().replace("½", "1/2").replace(" ", "")
    out = []
    while a:
        m = re.match(r"([NSEW])(?:1/2|2)", a)
        if m: out.append(("half", m.group(1))); a = a[m.end():]; continue
        m = re.match(r"(NE|NW|SE|SW)", a)
        if m: out.append(("q", m.group(1))); a = a[m.end():]; continue
        return None
    return out

def aliquot_cells(aliquot):
    """Return (list of QQ names, finer_than_qq flag) or (None, False) if unparseable."""
    toks = tokens(aliquot)
    if toks is None: return None, False
    x0, y0, x1, y1 = 0.0, 0.0, 4.0, 4.0
    finer = False
    for kind, v in reversed(toks):          # largest unit is written last
        parts = [v] if kind == "half" else [v[0], v[1]]
        for d in parts:
            fx0, fy0, fx1, fy1 = HALF[d]
            w, h = x1 - x0, y1 - y0
            nx0, ny0, nx1, ny1 = x0 + fx0 * w, y0 + fy0 * h, x0 + fx1 * w, y0 + fy1 * h
            if (nx1 - nx0) < 1 or (ny1 - ny0) < 1: finer = True
            x0, y0, x1, y1 = nx0, ny0, nx1, ny1
    xs = range(int(x0), max(int(x0) + 1, int(-(-x1 // 1))))
    ys = range(int(y0), max(int(y0) + 1, int(-(-y1 // 1))))
    return [qq_name(x, y) for y in ys for x in xs], finer

CLEAN = re.compile(r"\s*(\(.*?(coal|minerals|same).*?\)|COAL AND OTHER MINERALS RESERVED TO US|"
                   r"SUBJECT TO RIGHTS AND R-O-W)\s*", re.I)

def parse_segment(seg, home):
    """seg like 'S26 E1/2NW' / 'T140N R101W S36 SE' / 'S6 LOT 1 (NENE)'.
    Returns dict(twp, rng, sec, kind, value) or None."""
    s = CLEAN.sub(" ", seg).strip()
    twp, rng = home
    m = re.match(r"T(\d+)N\s+R(\d+)W\s+(.*)", s)
    if m: twp, rng, s = f"T{m.group(1)}N", f"R{m.group(2)}W", m.group(3)
    m = re.match(r"S(\d+)\s*(.*)", s)
    if not m: return None
    sec, rest = int(m.group(1)), m.group(2).strip()
    if rest == "" or re.match(r"\((statewide|no subdivision)", rest, re.I) or rest.startswith("(no"):
        if "statewide" in rest.lower(): return None
        return dict(twp=twp, rng=rng, sec=sec, kind="section", value=None)
    m = re.match(r"LOT\s*(\d+)", rest, re.I)
    if m: return dict(twp=twp, rng=rng, sec=sec, kind="lot", value=int(m.group(1)))
    m = re.match(r"(\d+),LOT\s*(\d+)", rest, re.I)
    if m: return dict(twp=twp, rng=rng, sec=sec, kind="lot", value=int(m.group(2)))
    return dict(twp=twp, rng=rng, sec=sec, kind="aliquot", value=rest.split()[0])

def place(seg, home, cells):
    """Return (list of geoms, note)."""
    p = parse_segment(seg, home)
    if p is None: return [], "unparsed"
    key = (p["twp"], p["rng"])
    if key not in cells: return [], "outside"
    sec = cells[key].get(p["sec"])
    if not sec: return [], "no-section"
    if p["kind"] == "section":
        return list(sec["qq"].values()) + list(sec["lot"].values()), "ok"
    if p["kind"] == "lot":
        g = sec["lot"].get(p["value"])
        return ([g], "ok") if g else ([], "no-lot")
    names, finer = aliquot_cells(p["value"])
    if names is None: return [], "unparsed"
    geoms, missing = [], 0
    for n in names:
        if n in sec["qq"]: geoms.append(sec["qq"][n])
        else: missing += 1
    note = "ok"
    if missing and geoms: note = "partial-lots"       # aliquot falls partly on lots
    elif missing: note = "lots-only"
    if finer: note = "finer-than-qq" if note == "ok" else note
    return geoms, note

# ---------- main ----------
def main():
    cells = load_grid()
    rows = list(csv.DictReader(open(os.path.join(PROC, "patents_all.csv"))))
    full = {}
    fp = os.path.join(RAW, "land_full.csv")
    if os.path.exists(fp):
        for r in csv.DictReader(open(fp)):
            full[r["accession"]] = ((r["township"], r["range"]), r["land_desc_full"])

    by_acc = defaultdict(list)
    for r in rows: by_acc[r["accession"]].append(r)

    feats, report = [], defaultdict(int)
    unplaced = []
    for acc, rs in by_acc.items():
        r0 = rs[0]
        if r0["patentee_type"] in ("railroad", "railroad_affiliate", "state", "company"):
            report["skipped_grant"] += 1; continue          # big grants: shown text is a sample only
        if " 000001 " in acc:                               # multi-township lists (24-82 descriptions,
            report["skipped_list"] += 1; continue           # 1903-05, no patentee name): not expanded
        geoms, notes, texts, complete = [], set(), [], True
        if acc in full:                                   # full description read from the record
            sources = [full[acc]]
        else:
            sources = []
            for r in rs:
                sources.append(((r["search_township"], r["search_range"]), r["land_desc_shown"]))
                if r["shown_complete"] != "Y": complete = False
        for home, text in sources:
            texts.append(text)
            for seg in text.split(";"):
                seg = seg.strip()
                if not seg: continue
                g, note = place(seg, home, cells)
                notes.add(note); geoms += g
        if not geoms:
            report["unplaced"] += 1; unplaced.append({"accession": acc, "names": r0["names"], "land": texts}); continue
        geom = unary_union(geoms).simplify(0.00001)
        name = r0["names"].strip() or "(no name in index)"
        feats.append({"type": "Feature", "geometry": mapping(geom), "properties": {
            "acc": acc, "name": name, "type": r0["patentee_type"], "date": r0["date"], "year": int(r0["year"]),
            "doc": r0["document_no"], "doctype": r0["document_type"],
            "twp": sorted({f'{r["search_township"]} {r["search_range"]}' for r in rs}),
            "land": "; ".join(texts), "complete": complete,
            "approx": bool(notes & {"finer-than-qq", "partial-lots"}),
        }})
        report["placed"] += 1
        report["placed_complete" if complete else "placed_partial"] += 1
    fc = {"type": "FeatureCollection", "features": sorted(feats, key=lambda f: f["properties"]["date"])}
    json.dump(fc, open(os.path.join(PROC, "parcels.geojson"), "w"), separators=(",", ":"))
    json.dump({"counts": report, "unplaced": unplaced}, open(os.path.join(PROC, "geocode_report.json"), "w"), indent=1)
    print(dict(report))

if __name__ == "__main__":
    main()
