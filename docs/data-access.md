
## Manual pull — completed 2026-10-10

All 12 target townships transcribed (837 rows; counts match the portal). Practical notes for anyone repeating this:
- Results live in a cross-origin iframe; read from screenshots at iframe zoom 0.45, scrolling ~690 px per screen (3 records).
- Changing the URL hash does not refresh results. To switch townships in the same tab, navigate to `https://glorecords.blm.gov/s/` first, then to the new search URL, and wait ~30 s.
- Use the pager's next arrow for pages 2+.
- "Show More" land descriptions were not expanded; `shown_complete=N` marks rows where only the first two descriptions were captured.
- Build: `python3 src/combine_patents.py` → `data/processed/`.
