# Understand and account for media

Run `npm.cmd run media:prepare` on Windows (or `npm run media:prepare` elsewhere). It creates an inventory and HTML contact sheet without discarding prior decisions.

Run `npm run media:serve` from the site and open its loopback contact-sheet URL in a browser. Inspect in batches and open candidates at full size. If the browser cannot reach the loopback URL, view local media files directly with an image viewer; a browser refusal of `file:` URLs does not waive visual inspection. Identify actual subjects, projects, people, illustrations, text baked into images, transparency, duplicate crops, and usable dimensions. Do not trust alt text as visual classification.

Account for each image as use, retain, duplicate, or exclude with a specific reason. Keep important project collections available for interior pages; the shortlist can expand. Selected assets need actual visual inspection and intended route placements. If a signature asset appears in the source but is absent locally, recover it before passing; record unresolved acquisition separately.

Keep onboarding/brief.json, onboarding/raw, and media/harvest immutable after acquisition. Save recovered originals under media/recovered and derived/cropped variants separately. Register each local recovered file with the installed harness tool, for example `npm.cmd run media:register -- media/recovered/mark.png --source onboarding/brief.json --disposition use --role logo --description "Customer wordmark"`. The command computes SHA-256 from actual bytes; repeat registration of identical bytes is safe, while changed bytes or conflicting IDs are rejected. Use `--disposition retain` for retained originals too. For videos supply `--poster media/recovered/poster.jpg`; the tool hashes both files. Registration leaves `inspected:false`: inspect the media, set disposition details and proposed placements, and add identityEvidence from captured source paths before completing media. Never hand-enter or silently replace an accepted hash. Inventory placements are proposed routes; the storyboard establishes final route/section placement.

Choose treatments that fit the material: contain device mockups and diagrams; crop photography around its subject; avoid turning full illustrations into tiny icons. Don't force an image-count quota or use all assets for its own sake.


## Preserve identity and supplement deliberately

Record origin as customer, stock, or unknown. For a logo, founder, team, actual product, premises, project, or brand artwork, record identity and identityEvidence as a path array with captured source-page evidence, for example `"identityEvidence":["onboarding/brief.json"]`. A filename or face is not identity evidence. Existing-site images can themselves be stock or third-party logos. Keep uncertainty explicit. Every omitted identity asset needs identityDecision explaining recovery, replacement with another evidenced original, or omission; do not force unusable images into the page.

Stock can illustrate a service or establish atmosphere. It cannot replace an evidenced founder, logo, real team, or completed-project proof. Never add customer assets to the shared stock library automatically. Keep original files unchanged and derived crops separate.

During media, search the shared catalog using the harness script:

```text
node HARNESS/bin/vitris-stock.js search --query "electrical service" --industry trades
node HARNESS/bin/vitris-stock.js import --site . --id ASSET_ID --reason "Illustrate the service; not our actual team" --route /
```

Use the Harness directory from CURRENT.md in place of HARNESS. Search also accepts --role and --kind. Imports validate hashes, copy local originals/posters into media/stock, and merge into the inventory. The default cache is HARNESS/artifacts/stock-library; missing files use pinned provider URLs and must match hashes. Import during the media stage. Later additions require an explicit restart from media so downstream approvals cannot silently survive changed inputs.

Create onboarding/media-requests.json as {"slots":[{"id":"home-service","route":"/","purpose":"Illustrate electrical repairs","kind":"image","minWidth":1000}]} for section-specific shortlists. For slots showing the actual founder/team/logo/project, add the appropriate identity constraint. No suitable candidate is a valid result.

During storyboard, write onboarding/media-selection.json with version:1 and placements containing slot, assetId, reason, and optional crop; or noMatch:true with a reason and no assetId. For storyboard version 3, add slot.placement as section, header, or footer, and add slot.sectionId for section slots. Shared slots need a row for every declared route. Bind the chosen IDs to storyboard sections or globalMedia. Account for every usable identity asset, either in placements or with an explicit identityDecision recorded during media. Repeated stock is allowed when purposeful, not to fill a quota.

Jev mediaClassification, mediaSelection, mediaSetReview, and mediaProvenance are independently configurable off/shadow/assist capabilities. Read preparation-bound media-assist reports. Scores are based on supplied observations, not direct visual inspection. Missing/partial judgments never mean bad imagery. Keep all visual and identity obligations when inference is unavailable. Jev must not infer who a photographed person is.

Use contain for logos and artwork; inspect photo crops at phone and desktop sizes. Videos need a local poster, muted inline playback when decorative, a static fallback under prefers-reduced-motion, and no autoplay with sound. Avoid making a video the only carrier of essential content. Inspect sampled footage and actual playback/crop before accepting a placement. Final reviews check that selection-manifest assets actually appear on their planned routes.
