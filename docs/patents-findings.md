# GLO patents around Medora and the Elkhorn: first pass

> **Note:** numbers below come from the full 837-row pull. Part of the raw data was lost before commit; see `docs/RECOVERY.md`.

> Owner: TRPL · Last verified: 2026-10-10 · Status: active (draft, internal)

**What this is.** These are federal land patents (BLM General Land Office index) for 12 townships, transcribed by hand from glorecords.blm.gov search results. Every story lead below is **unverified**. Use it to decide what to research, not as copy.

## Coverage

| Area | Townships | Patents (search rows) |
|---|---|---|
| Medora and south | T139N–T141N × R101W–R103W (9 townships) | 637 |
| Elkhorn area (approximate) | T143N × R101W–R103W (3 townships) | 200 |
| **Total** | 12 townships | **837 rows, 805 unique accession numbers** |

- Each township count matches the portal's own total for that search.
- The 32 duplicate rows are big grants that appear in several townships: the statewide school grant, the Northern Pacific grants, and Northwestern Improvement Co.
- Data: `data/raw/*.csv` (transcription), `data/processed/*` (built by `src/combine_patents.py`).

## What the numbers show

Patentee mix (unique patents):

| Patentee | Patents |
|---|---|
| Individuals | 439 |
| United States as patentee | 306 |
| No name in the index | 38 |
| State of North Dakota | 9 |
| Northern Pacific | 9 |
| Northwestern Improvement Co | 3 |
| Company | 1 |

Individual patents by decade:

| 1880s | 1900s | 1910s | 1920s | 1930s | 1940s+ |
|---|---|---|---|---|---|
| 2 | 13 | **252** | **157** | 9 | 6 |

The homestead wave is 1910–1929, a full generation after Roosevelt's ranching years (1883–1887).

"USA" patents by year:

| 1935 | 1936 | 1937 | 1938 | 1939 | 1940 | Later |
|---|---|---|---|---|---|---|
| 1 | 85 | **125** | 34 | 19 | 15 | 27 |

## Five story leads (all need verification)

1. **The open range left no paper trail, and that supports the existing caution.** In the Elkhorn-area townships (T143N R101W–R103W), the earliest individual patent is 1906 (state-volume entries), and the first one in T143N R102W is 1912. None of Roosevelt's partners appears as a patentee anywhere in the 12 townships (Ferris, Merrifield, Sewall, Dow, Lang). This is consistent with the Maltese Cross and Elkhorn running on unpatented open range.
   - Caveats: this index covers federal patents in these townships only, and the Elkhorn township location is approximate.
   - It is still **not** proof that TR never held title anywhere. The phrase "TR's land patent" stays off-limits.

2. **Medora's oldest patents: 1889, de Morès's circle (possible).**
   - On 1889-10-03, two adjacent parcels in T140N R102W S26 were patented the same day, to **Louis A. Vonhoffman** (as indexed; NWNW) and **Frank B. Allen** (SWNW).
   - The Marquise de Morès was Medora von Hoffman, daughter of Louis von Hoffman.
   - Next steps: verify that this is the same Louis von Hoffman, pull the patent image, and identify Allen.

3. **From homestead to federal land: land first patented to homesteaders was later patented to the United States.** Matching the land description text exactly gives 122 pairs (123 in the first pass). Matching on the map instead, now that every patent's full land list is read, gives 190 homestead patents (mostly 1912–1925) where at least a quarter of the land was later patented to the USA (mostly 1936–1940), across 167 of the 299 mapped USA patents.
   - Examples: Stanley Paddock (1915 → USA 1937), Susie Crandall (1917 → USA 1938), Thora Jensen/Swanson (1923 → USA 1937).
   - Working hypothesis: Depression-era federal buyouts of failed homesteads, which may later have become part of the Little Missouri National Grassland. **Verify the program and the grassland link with USFS or NPS historians before saying this publicly.**
   - This arc runs from homestead to dust to public land. It may be the strongest single story for a conservation-themed page.

4. **Women homesteaders: name changes visible in the record.** Twenty-one patents list one woman under two surnames, which suggests she married between filing and final proof.
   - Examples: Gunda Rue/Zarns, Thora Jensen/Swanson, Mabel Locken/Rockstad, Anna Gallus/Lardy, Sadie Davis/Schwager.
   - Many more patents are in women's names alone (Susie Crandall, Lydia Kay, Beatta Sorlie, Julia Mosser, Nora Houck…). The count is not tallied yet, because doing so means inferring gender from first names. That would be a manual review step.

5. **Settler clusters.**
   - In T143N R101W, 1920–1925 patents go to Palahniuk, Cymboluk, Dutchak, Doroszczuk, Paladijchuk, Kordon and Soltys. This possibly reflects Ukrainian settlement (verify against the State Historical Society of North Dakota).
   - Family groups recur: the Youngs (5 patents near the Elkhorn), Kelsos (6), Gallus/Lardy (9 combined), Cooks (5) and Lees (8).

## Matching names to people TR knew (possible matches only)

Surnames were matched against a short list of well-documented members of TR's Badlands circle (Hagedorn 1921; *Autobiography*; Di Silvestro 2011). Full list: `data/processed/tr_name_matches.csv`.

| Patentee | Year | Matched to | Strength |
|---|---|---|---|
| Louis A. Vonhoffman | 1889 | Louis von Hoffman (de Morès's father-in-law) | possible, worth checking first |
| Stanley Paddock | 1915 | E.G. "Jerry" Paddock | possible (relationship unknown) |
| Matt Jones; Charley A. & Alvis M. Moore; Lotta M. Williams | 1914–19 | Bill Jones, Frank Moore, Bill Williams | weak, common surnames |
| Cassius Van Eaton | 1922 | Howard Eaton | weak, different surname |

Do not publish any of these without a second source.

## Source caution

The project doc **`tr_badlands.md` must not be used as a source.**
- Its Appendix A ("People of the Badlands") contains hundreds of invented entries (e.g., "Plumpoverfunny, James"; "Minwax, James").
- Its Appendix C misstates basic facts about the Maltese Cross.
- This match list deliberately avoided it. Recommend archiving or correcting that doc (Matt's call).

## Next steps

- [ ] Pull patent images for the 1889 Von Hoffman and Allen patents and the Paddock patent.
- [ ] Verify the 1930s "USA" buyback program and the grassland link.
- [ ] Get exact Elkhorn site PLSS from NPS (the current township is an approximate map click).
- [ ] Map layer: geocode aliquot parts to PLSS (BLM CadNSDI) for a homestead-then-buyback map.
- [ ] Bulk data: send the drafted BLM request (`docs/blm-request-draft.md`) once Matt approves.
