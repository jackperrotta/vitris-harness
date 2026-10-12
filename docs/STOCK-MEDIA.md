# Stock and customer media

The v2 catalog is `src/stock/catalog.json`. It contains immutable hashes, provider/source URLs, dimensions, credits, initial visual observations, and design facets. Existing IDs are preserved; legacy URLs remain recorded. New binary work lives under `artifacts/stock/`, and the local content-addressed cache is `artifacts/stock-library/`. Scratch history is unchanged and is not required by tests.

The September 23 expansion targets trades/home services and professional services. It adds 23 accepted photographs and 3 accepted videos. The library has 69 accepted photos and 8 accepted videos. Two additional candidates are excluded: a named third-party company's group portrait and a desk clip focused on eating. Catalog acceptance is Codex curation, not a human preference label. Video observations are three timestamped samples, not claims about audio or seamless looping.

## Find and use media

```text
npm run stock -- search --query "electrical repair" --industry trades --role detail
npm run stock -- search --industry professional-services --kind video
npm run stock -- import --site SITE --id ASSET_ID --reason "Illustrates the service; not the actual customer team" --route /
```

Import during the site's media stage. The importer validates original/poster hashes, writes local `media/stock/` files and adds inventory source mappings. For a recovered customer original already saved under `media/recovered/`, run `npm.cmd run media:register -- media/recovered/FILE --source CAPTURED_SOURCE --disposition use|retain` from the site on Windows (`npm run` elsewhere). The installed media tool computes its SHA-256 and rejects conflicting re-registration. A recovered video also needs `--poster media/recovered/POSTER`. Registration leaves visual inspection and identity evidence to the author. If the stock cache is absent, imports try the managed server (`--origin`, VITRIS_STOCK_ORIGIN, or the site launch backendOrigin), including the recorded legacy original URL, then provider URLs. Every response must match its pinned hash. Older provider URLs can return changed bytes; restore the managed cache instead of silently accepting a new image. This preserves local previews without relying on an available Worker. No third-party assets are silently published by import.

The media agent first accounts for logos, founders, team, actual products/premises/projects and brand artwork. Identity roles need captured source-page evidence. A third-party stock photograph must not be relabeled as the customer founder, staff or portfolio. Omitted identity assets need a reason. Original media stays immutable; crops are separate derivatives.

`onboarding/media-requests.json` contains a `slots` array:

```json
{"slots":[{"id":"home-service","route":"/","purpose":"Explain repair work","kind":"image","minWidth":1000},{"id":"about-founder","route":"/about","purpose":"Meet our founder","identity":"founder"}]}
```

During storyboard, write `onboarding/media-selection.json` with `version:1` and `placements` containing each slot, `assetId`, `reason` and optional `crop`. A row may instead have `noMatch:true` and a reason. The selection command validates a draft:

```text
npm run stock -- select --site SITE --file SELECTION_JSON
```

Final reviews check selected asset hashes, posters, identity dispositions and presence on the rendered route. Browser checks verify loaded images, video posters, missing/error sources, muted autoplay, and stopped playback under reduced motion. The agent still inspects responsive crops, logo treatment, video playback and reduced-motion fallback.

## Jev assistance

The explicit `--design-assist` preset now enables all four media capabilities unless individually set off. They remain off in the ordinary baseline. Enable independently in site `agent/jev.json`:

```json
{"mode":"assist","capabilities":{"mediaClassification":"assist","mediaSelection":"assist","mediaSetReview":"assist","mediaProvenance":"assist"},"pilotBudget":{"maxTransportAttempts":30,"maxInputTokens":100000}}
```

This example explicitly opts into live calls when credentials are configured. A live monetary budget has not been set for this upgrade; its verification uses mock transports. Request/token limits do not guarantee a dollar cap.

- Media classification normalizes inspected text into role/industry suggestions during media.
- Section ranking runs in direction/storyboard using explicit media requests and eligible site assets, with separate subject, composition and style scores.
- Set review runs at representative/visual review.
- Provenance review runs at representative/content review.

All are advisory, uncalibrated, and based on supplied text observations. They do not identify people or inspect pixels. Deterministic identity/availability/size checks run before ranking. Requests are bounded to 8 slots and 8 candidates per slot; classification handles at most 12 inspected candidates. Partial scores preserve the deterministic shortlist; no-match is distinct from unavailable inference. Reports in `agent/runs/PREPARATION.media-assist.json` bind the result to preparation/subject hashes and link provider receipts. Cache identity includes observations, context, rubric/policy and model. Global off and shadow preserve their existing semantics.

## Expand and publish

```text
npm run stock -- stage --out artifacts/stock/NEW_SESSION
python scripts/inspect-stock.py --catalog artifacts/stock/NEW_SESSION/catalog.json --root artifacts/stock/NEW_SESSION --out artifacts/stock/NEW_INSPECTION
```

Staging uses the coverage queries in `src/stock/coverage.json` and requires PEXELS_API_KEY. It downloads multiple candidates and never publishes. Inspection tooling requires Pillow and imageio-ffmpeg; the runtime, package and test suite do not require Python. It measures files, samples video frames, and flags perceptual near-duplicates without deleting anything. Write inspection annotations with evidence and exclusions, then use `scripts/migrate-stock.ts --spec SPEC --cache CACHE --out NEW_CATALOG` to generate an accepted catalog. Validate before replacing the source catalog, and run `npm run catalog` to refresh the embedded picker/catalog.

```text
npm run stock -- verify
npm run stock -- publish --out artifacts/stock/NEW_PUBLICATION
```

Publication is a separate explicit command using configured Cloudflare credentials. It uploads verified accepted objects before replacing the remote catalog pointer, preserves old keys, and records success/failure. The September 23 upgrade has not run this publication command. The Worker picker prefers the published catalog and uses its embedded version offline.

Before a live comparison, freeze a new harness baseline and pin the same catalog/captures in both arms. Compare deterministic selection with Jev assistance, measuring identity retention, fit, overrides, no-match behavior, repetition, operator time and cost coverage. Human preference labels remain absent until supplied by humans.
