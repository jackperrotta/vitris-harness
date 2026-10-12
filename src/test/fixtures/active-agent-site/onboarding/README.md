# Onboarding harvest

This folder is the crawl output for **Harbor Ledger Advisors**.

| File | Purpose |
|------|---------|
| `outline.md` | Human-readable sitemap, facts, image catalog, gaps |
| `copy/*.md` | Full visible copy per crawled URL |
| `brief.json` | Machine index (facts, pages, images) |
| `audit.json` | Crawl-time SEO/a11y inventory; `webVitals` filled by research node |
| `research.json` | Reviews, social, goals — complete via the research graph node |
| `media.md` | Harvest catalog + shortlist hints; the media node owns full asset disposition |
| `harvest-inventory.json` | Kept pages, original-media files, failed downloads, classified exclusions |
| `harvest-scope.json` | Optional operator bound (exclude classes / maxPages / notes) |

## Next

1. Build the evidence-backed business interpretation and review it.
2. Inspect and account for all media, including acquisition failures.
3. Follow the graph through direction, storyboard, copy, implementation, browser checks and independent reviews.

All successful images live under `media/harvest/`. Theme tokens are established by the **direction** node (harvest only stores hints in brief.visual).

See `harvest-inventory.json` for kept pages, original-media files, failed downloads, and an explicit class/reason for every exclusion (`source-missing`, `crawler-invalid`, `off-site`, `error-page`, `transient`). Operator bounds belong in `harvest-scope.json`.

Source: (blank starter)
Engine note: see `warnings` in brief.json.
