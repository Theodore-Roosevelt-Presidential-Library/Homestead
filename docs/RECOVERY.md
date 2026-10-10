# Recovery note (2026-10-10)

The working copy that held this morning's work (`~/Documents/GitHub/Homestead`) was replaced by a fresh clone before anything was committed. These files were rebuilt from the session's command log.

## Recovered

**Patents, 446 of 837 rows:**

| Township | Rows recovered |
|---|---|
| T141N R101W | 66 (complete) |
| T141N R102W | 54 (complete) |
| T141N R103W | 80 (complete) |
| T143N R101W | 85 (complete) |
| T143N R102W | 58 (complete) |
| T143N R103W | 57 (complete) |
| T140N R103W | 46 of 96 (rows 51–96 only; rows 1–50 missing) |

**Code and docs:**
- `src/combine_patents.py`
- `docs/patents-findings.md`, written against the full 837-row set, so its counts are not reproducible from what's here.
- The "manual pull" section of `docs/data-access.md`.

## Not recovered

Unless the old folder turns up (check the Trash or Time Machine for `Documents/GitHub/Homestead`), these are missing:

**Patents:**

| Township | Rows missing |
|---|---|
| T139N R101W | 83 |
| T139N R102W | 70 |
| T139N R103W | 72 |
| T140N R101W | 48 |
| T140N R102W | 68 (includes the 1889 Vonhoffman and Allen patents) |
| T140N R103W | rows 1–50 |

**Docs:**
- `README.md` rewrite (views table, hosting plan, ground rules)
- `docs/blm-request-draft.md`
- `docs/t140n-r102w-notes.md`
- The earlier sections of `docs/data-access.md` (bulk-data findings, Wayback check, routes to data)

Re-pulling the missing townships takes about 40 minutes of browser work using the method in `docs/data-access.md`.

## Re-pull completed (2026-10-10, later the same day)

The six missing township sets were pulled again from the GLO portal (same manual method, same columns):

| Township | Rows |
|---|---|
| T139N R101W | 83 |
| T139N R102W | 70 |
| T139N R103W | 72 (Golden Valley County) |
| T140N R101W | 48 |
| T140N R102W | 68 (includes the 1889-10-03 Vonhoffman and Allen patents in S26) |
| T140N R103W | rows 1–50 (merged with the recovered rows 51–96) |

All 12 townships are complete again: **837 rows, 805 unique accessions**, the same totals as before the loss. `combine_patents.py` has been rerun, so `data/processed/` is current.

Two notes on what changed:
- **Reacquisitions are 122 here vs. 123 in `patents-findings.md`.** Matching uses the land description exactly as the portal shows it. This pass wrote lot descriptions as `LOT 1 (NENE)` and the lost pass may have formatted one differently, so one pair may have dropped out of the match. Treat 122–123 as the figure until the matcher normalizes lot text.
- **TR-circle name matches: 8.** These are surname matches only, and all of them still need a second source.

Still lost: the README rewrite, `docs/blm-request-draft.md`, `docs/t140n-r102w-notes.md`, and the earlier sections of `docs/data-access.md`.

`docs/_scratch_T140N_R103W_head.csv` is a temporary merge file. It can be deleted once deletion is allowed in this folder.
