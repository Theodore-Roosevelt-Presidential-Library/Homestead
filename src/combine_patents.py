"""Combine per-township GLO patent transcriptions into analysis-ready tables.

Inputs:  data/raw/patents_T###N_R###W.csv  (manual transcriptions of GLO search results)
Outputs: data/processed/patents_all.csv        one row per (township search, patent)
         data/processed/patents_unique.csv     one row per accession number
         data/processed/summary.json           counts used in docs
         data/processed/tr_name_matches.csv    POSSIBLE surname matches to TR's Badlands circle

Every TR match is a lead, not a finding. Nothing here establishes that a patentee
knew Roosevelt; a second source is required before any public use.
"""
import csv, glob, json, os, re
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
OUT = os.path.join(ROOT, "data", "processed")

def classify(name):
    n = name.upper()
    if n.startswith("(NO NAME"): return "unnamed"
    if n == "USA": return "usa"
    if "PACIFIC" in n: return "railroad"
    if "IMPROVEMENT CO" in n: return "railroad_affiliate"
    if "NORTH DAKOTA" in n: return "state"
    if " INC" in n or " CO" in n.split(";")[0][-4:]: return "company"
    return "individual"

# Well-documented members of TR's Badlands circle (Hagedorn 1921; Roosevelt, Autobiography 1913;
# Di Silvestro 2011). Surnames only. 'common' surnames are flagged weak.
TR_CIRCLE = {
    "FERRIS": "Joe & Sylvane Ferris (guide; Maltese Cross partner)",
    "MERRIFIELD": "A.W. 'Bill' Merrifield (Maltese Cross partner)",
    "SEWALL": "Bill Sewall (Elkhorn)",
    "DOW": "Wilmot Dow (Elkhorn)",
    "LANG": "Gregor & Lincoln Lang (rancher; memoirist)",
    "PACKARD": "A.T. Packard (Bad Lands Cow Boy editor)",
    "VON HOFFMAN": "Louis von Hoffman (de Morès's father-in-law; Medora's namesake family)",
    "VONHOFFMAN": "Louis von Hoffman (de Morès's father-in-law), as spelled in GLO index",
    "PADDOCK": "E.G. 'Jerry' Paddock (Medora figure; de Morès associate)",
    "EATON": "Howard Eaton (Custer Trail Ranch)",
    "HUIDEKOPER": "A.C. Huidekoper (HT Ranch)",
    "WIBAUX": "Pierre Wibaux (W Bar)",
    "GOODALL": "John Goodall (1884 roundup foreman)",
    "STICKNEY": "Dr. Victor Stickney (Dickinson)",
    "MAUNDERS": "Jake Maunders",
    "FINNEGAN": "'Redhead' Finnegan (boat thief)",
    "PFAFFENBACH": "Pfaffenbach (boat thief)",
    "BURNSTED": "Burnsted (boat thief)",
    "LUFFSEY": "Riley Luffsey",
    "VINE": "Vine brothers (Pyramid Park Hotel)",
    "HERRIG": "Fred Herrig",
    "LEBO": "Norman Lebo (1884 Bighorn trip)",
    "MADDOX": "Mrs. Maddox (made TR's buckskin suit)",
    "JONES": "'Hell-Roaring' Bill Jones (sheriff) [common surname]",
    "WILLIAMS": "Bill Williams (Medora saloon) [common surname]",
    "MOORE": "Frank Moore (hotel) [common surname]",
}
COMMON = {"JONES", "WILLIAMS", "MOORE"}

def main():
    rows = []
    for path in sorted(glob.glob(os.path.join(RAW, "patents_T*.csv"))):
        m = re.search(r"T(\d+)N_R(\d+)W", path)
        twp, rng = f"T{m.group(1)}N", f"R{m.group(2)}W"
        with open(path, newline="") as f:
            for r in csv.DictReader(f):
                r["search_township"], r["search_range"] = twp, rng
                r["patentee_type"] = classify(r["names"])
                r["year"] = r["date"][:4]
                r["decade"] = r["year"][:3] + "0s"
                rows.append(r)
    fields = ["search_township","search_range","row","names","patentee_type","date","year","decade",
              "document_no","document_type","accession","county_listed","land_desc_count",
              "land_desc_shown","shown_complete"]
    with open(os.path.join(OUT, "patents_all.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields); w.writeheader(); w.writerows(rows)

    by_acc = defaultdict(list)
    for r in rows: by_acc[r["accession"]].append(r)
    uniq = []
    for acc, rs in by_acc.items():
        u = dict(rs[0])
        u["appears_in"] = "; ".join(sorted({f"{x['search_township']} {x['search_range']}" for x in rs}))
        u["appearances"] = len(rs)
        uniq.append(u)
    uniq.sort(key=lambda r: (r["date"], r["accession"]))
    with open(os.path.join(OUT, "patents_unique.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields + ["appears_in","appearances"], extrasaction="ignore")
        w.writeheader(); w.writerows(uniq)

    # Re-acquisition pairs: a USA/unnamed patent in the same township whose land text equals an earlier individual's
    reacq = []
    ind = [r for r in rows if r["patentee_type"] == "individual"]
    gov = [r for r in rows if r["patentee_type"] in ("usa", "unnamed")]
    for g in gov:
        for i in ind:
            if (g["search_township"], g["search_range"]) == (i["search_township"], i["search_range"]) \
               and g["land_desc_shown"].split(" (")[0] == i["land_desc_shown"].split(" (")[0] and i["date"] < g["date"]:
                reacq.append({"township": f"{g['search_township']} {g['search_range']}", "land": i["land_desc_shown"],
                              "homesteader": i["names"], "patented": i["date"], "usa_date": g["date"],
                              "usa_accession": g["accession"]})

    # TR circle surname matches
    matches = []
    for u in uniq:
        if u["patentee_type"] != "individual": continue
        for person in u["names"].split(";"):
            toks = person.strip().upper()
            for sur, who in TR_CIRCLE.items():
                if re.search(rf"\b{re.escape(sur)}$", toks) or (" " in sur and sur in toks):
                    matches.append({"patentee": person.strip(), "date": u["date"], "accession": u["accession"],
                                    "township": u["appears_in"], "land": u["land_desc_shown"],
                                    "circle_surname": sur, "circle_person": who,
                                    "strength": ("weak (common surname)" if sur in COMMON else
                                                 "weak (compound surname: VAN " + sur + ")" if re.search(rf"\bVAN {sur}$", toks) else "possible"),
                                    "status": "UNVERIFIED - needs second source"})
    seen=set(); reacq=[r for r in reacq if not (tuple(r.values()) in seen or seen.add(tuple(r.values())))]
    with open(os.path.join(OUT, "tr_name_matches.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(matches[0].keys()) if matches else ["patentee"])
        w.writeheader(); w.writerows(matches)
    with open(os.path.join(OUT, "reacquisitions.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(reacq[0].keys()) if reacq else ["township"])
        w.writeheader(); w.writerows(reacq)

    summary = {
        "townships": sorted({f"{r['search_township']} {r['search_range']}" for r in rows}),
        "rows_all": len(rows), "unique_patents": len(uniq),
        "by_type_unique": Counter(u["patentee_type"] for u in uniq),
        "by_decade_unique": dict(sorted(Counter(u["decade"] for u in uniq).items())),
        "individual_by_decade": dict(sorted(Counter(u["decade"] for u in uniq if u["patentee_type"]=="individual").items())),
        "usa_by_year": dict(sorted(Counter(u["year"] for u in uniq if u["patentee_type"]=="usa").items())),
        "earliest_individual": min((u["date"], u["names"]) for u in uniq if u["patentee_type"]=="individual"),
        "multi_name_patents": sum(1 for u in uniq if ";" in u["names"] and u["patentee_type"]=="individual"),
        "reacquisition_pairs": len(reacq),
        "tr_matches": len(matches),
    }
    with open(os.path.join(OUT, "summary.json"), "w") as f: json.dump(summary, f, indent=2, default=dict)
    print(json.dumps(summary, indent=2, default=dict))

if __name__ == "__main__":
    main()
