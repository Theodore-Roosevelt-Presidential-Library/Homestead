"""Download today's surface land status for the 12 townships.

Source: BLM National Surface Management Agency (SMA) map service,
  https://gis.blm.gov/arcgis/rest/services/lands/BLM_Natl_SMA_Cached_without_PriUnk/MapServer/1
The service stores each agency as one dissolved multipolygon per BLM state office (North Dakota is
under the Montana office), so each agency polygon is downloaded whole and clipped to the townships.

Only agency-level status is kept (NPS, USFS, BLM, State...). Land not covered by the layer is shown
on the site as "private or other"; no private owner is ever named.

Output: data/raw/land_status_sma.geojson   (rerun, then python3 src/build_site_data.py)
"""
import json, os, glob, urllib.request, urllib.parse
from shapely.geometry import Polygon, LinearRing, shape, mapping
from shapely.ops import unary_union

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SVC = "https://gis.blm.gov/arcgis/rest/services/lands/BLM_Natl_SMA_Cached_without_PriUnk/MapServer/1/query"
SKIP = {"PVT", "UND"}          # private and undetermined: never downloaded


def get(params):
    url = SVC + "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=300) as r:
        return json.load(r)


def esri_rings(rings):
    outers, holes = [], []
    for r in rings:
        (holes if LinearRing(r).is_ccw else outers).append(Polygon(r).buffer(0))
    g = unary_union(outers)
    return g.difference(unary_union(holes)) if holes else g


def main():
    twps = []
    for path in glob.glob(os.path.join(ROOT, "data", "grid", "ND05*.geojson")):
        twps.append(unary_union([shape(f["geometry"]) for f in json.load(open(path))["features"]]))
    area = unary_union(twps).buffer(0)
    minx, miny, maxx, maxy = area.bounds
    ids = get({"where": "1=1", "geometry": f"{minx},{miny},{maxx},{maxy}", "geometryType": "esriGeometryEnvelope",
               "inSR": 4326, "spatialRel": "esriSpatialRelIntersects", "outFields": "OBJECTID,ADMIN_AGENCY_CODE",
               "returnGeometry": "false", "f": "json"})["features"]
    out = []
    for f in ids:
        code, oid = f["attributes"]["ADMIN_AGENCY_CODE"], f["attributes"]["OBJECTID"]
        if code in SKIP:
            continue
        d = get({"objectIds": oid, "outFields": "ADMIN_AGENCY_CODE", "returnGeometry": "true", "outSR": 4326,
                 "maxAllowableOffset": 0.0001, "geometryPrecision": 5, "f": "json"})
        g = esri_rings(d["features"][0]["geometry"]["rings"]).intersection(area)
        if g.is_empty:
            continue
        g = g.simplify(0.00005)
        print(f"{code:5s} {g.area / area.area:6.1%} of the townships")
        out.append({"type": "Feature", "properties": {"agency": code}, "geometry": mapping(g)})
    path = os.path.join(ROOT, "data", "raw", "land_status_sma.geojson")
    json.dump({"type": "FeatureCollection", "source": SVC, "features": out}, open(path, "w"), separators=(",", ":"))
    print("wrote", path)


if __name__ == "__main__":
    main()
