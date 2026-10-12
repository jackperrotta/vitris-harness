# Optional content and imagery art direction

Set `launch.json.artDirection` to `{ "mode": "media-v1", "release": "2026-10-05.1" }` before kickoff. The policy is independent of reference and authoring modes. Without it the legacy graph and packet limits remain. The default endpoint is local preview.

```sh
npx vitris-go --site SITE --no-preview-server
npx vitris-go --site SITE --complete --preparation PREPARATION_ID --no-preview-server
npx vitris-go --site SITE --status
```

Read the prepared `agent/CURRENT.md`. Early media is an evidence audit. After direction review the asset-production owner writes `onboarding/visual-asset-brief.json` and `onboarding/asset-production.json`. The stage-loaded `agent/refs/art-direction.md` describes their exact contracts. Commissions bind supported facts, source assets, visitor purpose, visual role, medium, reference relationships, composition, mobile behavior, observable acceptance and fallback. Planned artwork is never approved evidence.

Search the accepted catalog first. The JSON query supports subject, context, detail, metaphor, composition, palette, negative space, lighting, setting, unwanted subjects, orientation, crop tolerance, role and recent exposure. Missing observations stay uncertain; set selection is advisory until pixels are inspected.

```sh
npx vitris-stock search --query-file artwork/stock-query.json
npx vitris-art acquire --site SITE --record artwork/acquire-request.json
```

Acquisition request: `{ "operationId":"roots-search-v1", "query":{"subject":"seedling roots","orientation":"landscape"}, "fallback":"Editable conceptual vector", "maxCandidates":2, "maxBytes":4000000 }`. Existing configured Pexels credentials are read locally. Catalog matches cause no external calls. Otherwise the bounded search saves response, original bytes and a staged site-local catalog under `artwork/acquisition-OPERATION_ID/`. Inspect full assets and intended crops; add actual inspection records and accepted status only after viewing pixels. Use that catalog/cache with the existing import command:

```sh
npx vitris-stock import --site SITE --catalog SITE/artwork/acquisition-OPERATION_ID/catalog.json --cache SITE/artwork/acquisition-OPERATION_ID --id ID --reason "Observed fit" --route /
```

This does not publish shared stock. License, API attribution, editing rights and redistribution rights are separate. Keep photographer/Pexels attribution and original terms URLs. No-match/unavailable receipts retain the declared fallback. Interrupted dispatch is never automatically replayed.

The host-assisted route saves actual raster output and a recipe under `artwork/`. The portable `produceRaster` boundary accepts an explicitly injected adapter; no host-specific image tool or paid provider is assumed. Authored SVG and semantic HTML/CSS are preferred for exact geometry and diagrams. Keep essential text editable and equivalent relationship descriptions accessible. Authored visuals cannot claim real customer people, work or results.

```sh
npx vitris-art register --site SITE --record artwork/register-v1.json
npx vitris-art inspect --site SITE --record artwork/inspect-v1.json
npx vitris-art verify --site SITE
```

Registration record fields: `preparationId`, durable `operationId`, declared `requestId`, site-relative `input`, `sourcePath` under artwork, `method` (`generated-raster`, `authored-vector`, `derived`), actual `tool`, optional exposed `model`/`prompt`, actual `rights`, `forbiddenImplications`, and parent inventory IDs for derivatives. The output is immutable and addressed by its real byte hash under `media/generated` or `media/derived`. Registration starts uninspected. Inspection record fields: `preparationId`, `assetId`, actual `width`/`height`, `placements`, `reason`, and the full `MediaInspection` contract with byte `assetHash`, observer/time, evidence paths, description, subjects/activities/settings/industries/roles/palette/lighting/density/focal point/negative space/crop notes/visible text/uncertainty. Model, seed, price and receipt remain unknown when not exposed.

Derived imagery retains parent origin, identity evidence, sources and rights. Mixed-origin/identity collages keep separate layers rather than flatten provenance. Unsafe SVG external references, embeds, scripts and event handlers are rejected. Original input and recipes must remain. Repeating an identical durable operation is safe; changed inputs require a new operation ID.

After reopening production, `vitris-art retire --site SITE --record artwork/retire-v1.json` accepts `{ "preparationId":"CURRENT_ID", "operationId":"retire-old-v1", "assetId":"art-old-v1", "reason":"Superseded by inspected version v2" }`. It changes only a production-owned version's selection disposition, placements and reason, with a durable preparation-bound receipt. Its accepted bytes, source, identity, inspection and rights remain immutable. Upstream audited assets cannot be retired through this command.

```sh
npx vitris-art revise --site SITE --record artwork/revision-v2.json
npx vitris-go --site SITE --no-preview-server
```

Revision record: `{ "operationId":"process-labels-v2", "kind":"illustration", "request":"Enlarge the labels while preserving arrow meaning", "routes":["/services"], "preserve":["supported facts","original bytes"] }`. Placement reopens storyboard and render dependents; illustration/derivative reopens production; customer evidence/factual changes reopen business plus media; unknown impact reopens media. Active preparations are cancelled before source mutation. Creative revision never receives inventory write permission. Accepted outputs require new versions. Source and render changes invalidate current selection/review bindings. Resume with the same operation and freshly prepared stage, never by editing state to keep stale approval.

For matched frozen-input trials, pin policy at creation. Both arms must use identical captures, reference hashes, authoring/reviewer configuration and budgets. Only treatment adds artDirection. Do not pass policy on resume:

```sh
node --experimental-strip-types scripts/trial.ts --capture FROZEN_CAPTURE --out NEW_SESSION --runs 1 --site-policy POLICY.json --prepare-only --max-cumulative 60 --max-cumulative-duration-ms 1800000
node --experimental-strip-types scripts/trial.ts --out SESSION --resume
```

Use actual configured budget ceilings. Cumulative iteration, token and duration limits must be positive integers; they are runner limits, not dollar budgets. Trial added-media checkpoints require a consumed successful media/production preparation and immutable source lineage. Human comparison labels remain blank until supplied. Ordinary, creative/efficiency, assigned candidates and synthesis carry policy and media evidence through their existing context/import routes; neither agent scoring nor browser checks establish human preference.

Install/upgrade verification on disposable sites:

```sh
npx vitris upgrade --site SITE --plan
npx vitris upgrade --site SITE --apply
npm run test:freeze -- --out artifacts/art-direction-20261005/NEW_FREEZE
```

Inspect full asset, crop, section and whole page at phone/desktop widths. Record located observations for content fit, visual concept, asset craft, sequence coherence, responsive treatment and diagram clarity, using not-applicable when appropriate. There are no universal image or diagram quotas.
