# Visual direction selection

## Adapting the selected template

The connected picker asks how to handle missing content, AI imagery, and the qualities the customer wants to retain. These answers travel with the selection as `adaptation` (version 1). Chat selection can supply the same object with `--adaptation-file ABSOLUTE_JSON`:

```json
{
  "version": 1,
  "sections": "preserve-ask",
  "aiImages": "ask-each",
  "priorities": "Retain cinematic imagery, movement, personal voice, browsing and full section rhythm."
}
```

`sections` also accepts `agent-decides`; `aiImages` also accepts `no-ai` or `agent-decides`. Existing selections without this object keep their existing workflow. During reference analysis the agent inspects the hosted demonstration and creates `onboarding/template-adaptation.json`: reference captures, defining relationships and implementation plans, every major section mapped to a route and stable target ID, content gaps with next steps, and individual image proposals with treatment and identity requirements.

With `preserve-ask`, section removal requires the user's explicit answer to that exact proposal. With `ask-each`, generated-image registration requires an explicit answer to each current image proposal. Use `vitris-themes decide --site ABSOLUTE_SITE --file ABSOLUTE_DECISION_JSON` to record a decision containing `kind` (`remove-section` or `generate-image`), proposal `id`, current `proposalHash`, `source` (`user-chat` or `user-ui`), and the exact `instruction`. Compute the proposal digest through `templateProposalHash`; do not substitute a selection hash. Changing the treatment or identity invalidates earlier authorization. Agent-written status fields alone do not constitute approval.

Retained draft sections must appear in the compiled route with their `data-content-gap` marker and a visible refinement action. They can remain in a local preview; unresolved gaps block launch. Representative and final visual reviews compare every declared quality against both reference pixels and the current compiled build. Show the representative comparison to the customer for feedback before expansion; automated checks and active-agent reviews remain distinct from human design approval.

If an authorized refinement expands beyond its initial classification, use `vitris refine amend --site ABSOLUTE_SITE --request-id ID --scope direction,business --reason "Concrete reason"` between stage leases. This only expands scope, archives the previous request, and preserves the original instruction and baseline. Cancel an active stage through the supported workflow before changing scope. Do not edit request evidence or state to bypass a regression guard.

All-route browser verification supports `vitris-verify-browser --site ABSOLUTE_SITE --concurrency 4` (1â€“4, default 1). Each task retains its own context and complete continuous normal/reduced/static journeys; concurrency changes scheduling, not coverage.

The active storage policy for gallery templates is **Cloudflare first**. Still & Field, Current & Craft Electrical, Clearline Cleaning, Fieldwell Comfort, Record Counsel, Alongside Medical, Cinematic Panorama and Copper & Chair now have **163 complete hosted routes, 400 pinned media/font assets and 80 original-palette thumbnails** in the existing `vitris-assets` R2 bucket under `templates/`. The dedicated `vitris-templates` Worker serves their pages and assets. Local catalog metadata in `src/agent/theme-cloud.json` preserves accepted design identities and route manifests for the harness. The default gallery reads the live Cloudflare catalog; its previews, full-site links and thumbnails load from Cloudflare. The hosted gallery replaces the historical local artifact.

New and revised template demonstrations follow `agent/refs/template-library.md` and `npm run templates -- publish --bundle ABSOLUTE_TRANSIENT_DIRECTORY`. Publication verifies pinned assets, private source recovery, every hosted route and desktop/mobile loading before atomically merging the public catalog and removing verified staging files. Source archives remain private; the public Worker exposes only demos and public assets. Older frozen baselines and historical release definitions remain immutable. The older portable/offline descriptions below apply to retained local directions and historical releases; these eight hosted directions require network access.

The default lightweight artifact is `artifacts/templates/gallery.html`, served at `http://127.0.0.1:4390/` by `npm run templates:gallery` (or `npm run templates -- gallery`). It loads Cloudflare's public catalog when opened, every minute while visible, and on focus/network return. New templates, revisions, industries, families and collections appear automatically without rebuilding or restarting. Search, filters, comparisons, mobile previews and independently scrolling Cloudflare demos remain available. A failed refresh retains the last loaded catalog and retries automatically; opening the artifact requires network access. The artifact has no embedded demo documents, template assets, thumbnails or catalog snapshot.

Private maintainer archive receipts and recovery tooling are excluded from this repository. Preserve original teaching fixtures and frozen baselines.

Opt in explicitly in a site's `launch.json`:

```json
"themeSelection": { "version": 1, "enabled": true }
```

Absence leaves the legacy workflow and authoring mode unchanged. The existing harvest, media audit and narrative stages run normally. Before reference analysis, preparation returns `awaiting_user` with `onboarding/theme-picker.html`. Waiting does not prepare an author attempt or invoke a model. Serve the artifact with the installed command:

```powershell
vitris-themes serve --site "C:\Projects\example-site" --port 4318
```

The current catalog stamp is **2026-10-09.10**: **75 directions, 41 industry sites, 573 industry pages and 743 connected demonstration pages**, including concurrent Current & Craft Electrical and Still & Field additions. Clearline Cleaning (`cleaning-clearline`, release **2026-10-09.8**) adds 35 complete fictional cleaning routes with home, pricing, deep-cleaning, FAQ and booking featured comparisons. It has an actual Cleaning industry facet; Contemporary family; Direct/Warm/Precise identities; and Industry templates, Homes & Property and Local Service Edit collections. Its local quote fixture uses integer cents, first/subsequent visit rules, compatible extras and explicit limited ZIP coverage. Quote, commercial enquiry, gift and client previews never submit externally. See `src/agent/industry/clearline/` and `artifacts/clearline-20261009/README.md` for routes, provenance and measured validation.

Historical catalog membership remains explicit: **2026-10-09.7** retains its 72 directions / 664 pages, **.8** has 73 / 699, and **.9** has 74 / 710. New directions cannot resolve in earlier catalogs. Existing theme, specimen, asset and rendered identities are regression checked. Local licensed photography, Plus Jakarta Sans and Fraunces are pinned in Clearline's media manifests; original SVG illustration and wordmark accompany them. Fictional fixture facts must be replaced with evidenced customer content when adapting a direction.

Earlier catalog context: **2026-10-09.3** was: 68 directions and 585 connected demonstration pages. It keeps the previous **2026-10-09.2** catalog resolvable (67 directions, 566 pages) and adds Ridgeline, a 19-page roofing direction (17 substantive pages and 2 support pages). The **2026-10-09.2** catalog was 67 directions and 566 connected demonstration pages. It preserves 34 five-page directions on **2026-10-08.4** and twelve 12-page industry templates on **2026-10-09.1**, and adds twenty-one 12-page templates on **2026-10-09.2** (252 new pages). Core Directions contains 24; Local Service Edit contains ten; Industry templates contains 33. The new industries are doctorâ€™s offices, landscape architects, general construction, HVAC, electricians, law firms and barber shops, three directions each. The older specimens use local licensed fonts, original CSS/SVG artwork and cleared, pinned stock photographs. The industry templates use original compositions, copy, SVG drawings and local cleared photography; they do not add publisher components. Seven-industry photo usage, crops, continuity and local font licenses are recorded in `artifacts/seven-industry-templates-20261009/asset-manifest.json`. Provenance for the shared font and photo library remains in `src/agent/theme-assets/manifest.json`. Demonstration people, prices, schedules and operational details are fictional examples, not facts to transfer to a customer website. Specimen controls do not send messages, quotes, bookings or care requests.

The original eight remain under **2026-10-08.1**, and the prior 24 under **2026-10-08.2**. The prior 34 two-page directions remain under **2026-10-08.3** as well. All three preserve their definitions, renderers, assets and accepted hashes. Their 66 archive entries do not count toward the 67 active directions. Archive is separate from curated Collection. Explicit legacy chat/import resolution requires its release (for example `--theme editorial --release 2026-10-08.1`); names are never silently remapped.

Browse by seven families, controlled identity traits, the current industry taxonomy, curated collections, media needs and customer tasks. Search covers names, organizing ideas, fit and synonyms such as plumbing, booking and quiet. Choices within a facet are OR; different facets and search are AND. Grouping by family, industry, primary identity or primary collection shows each result once. Curated order is authored; name and new-first sorting do not imply popularity. Clear filters preserves search; Clear all resets filters/search. Site/release-scoped local storage and URL state restore browsing and discard obsolete IDs.

Your brand is the default display. Original palette keeps the accepted brand identity unchanged. Clearline, Fieldwell, Current & Craft and Still & Field show their authored demonstration wordmarks in that mode; customer-branded previews retain the supplied logo bytes and aspect ratio. Save up to six directions to a shortlist and compare up to three. Comparison shows up to three readable desktop columns, or tabs on narrow screens. Viewport, palette and semantic page-role controls are synchronized; each preview scrolls independently. Shortlist and comparison are browse state, never accepted choices or human preference labels.

Each broad catalog row contains five actual rendered page thumbnails. Industry rows add an Explore all 12 pages tile; preserved rows keep an Open full site tile. An Industry filter sits beside Family, Collection and Identity. Thumbnails are cached by release, theme, page, viewport, brand and rendered-content identity. Customer-branded thumbnails always use that brand; a missing cache never substitutes an original-palette image. Scroll preview expands one readable live page; Explore opens the full viewer, which groups every authored route by business purpose. Multiple service details retain independent page IDs, normalized paths, content/media identities and comparison purposes. A role is never used as a unique route key. Standalone routes support navigation, refresh and browser history. Unknown routes are rejected. No live frame mounts until requested; at most one expanded row plus detail or three comparison frames can exist. A portable HTML export embeds available matching cached thumbnails and falls back honestly to live-page controls. The viewer works offline for embedded pages; standalone site links require the loopback server.

Scroll inside an expanded row, or focus its preview and use PageDown, arrows, Home or End. Return to gallery releases preview scrolling; Tab and Escape provide exits. Coarse-pointer devices deliberately activate Scroll preview first. Explore/Choose sit outside the preview. Closing detail/comparison restores gallery focus and scroll. The mobile detail canvas centers at its authored width, with guidance below. Thumbnails load lazily. Loading is acknowledged only after fonts/images and nonzero content geometry; failed previews expose Retry and the direct link. Wide previews use integral native frame widths; mobile canvases are centered and scaled only when necessary. The retained earlier Codex-browser wheel observation failed at 1260px. The current repair passed automated CDP wheel checks at both 1260px and 1440px, with the frame moving and gallery/focus stationary; keyboard End, edge handoff and restoration also passed. New-template preview media load before decode readiness to avoid a lazy-image/scroll deadlock; standalone pages keep lazy loading. Physical wheel/trackpad, touch and Ctrl-wheel zoom still require the manual checks in `artifacts/seven-industry-templates-20261009/REPORT.md`. Keyboard and automated Chromium checks do not establish physical-input correctness.

`GET /api/library` and the index `X-Theme-Release` header identify the running process. Restart a source server after changes; a process already bound to 4318 is not automatically updated.

Choosing a card and editing notes changes a browser draft. Only **Use this direction** submits. The server saves `agent/theme-selection.json` atomically, preserving prior choices and operation IDs. It does not start generation. The next ordinary `vitris-go --site ABSOLUTE_SITE` invocation loads the choice into actual prepared context. There is no new approval gate after selection.

To record the user's explicit chat instruction, put the exact note in a UTF-8 file and run:

```powershell
vitris-themes select --site "C:\Projects\example-site" --theme literary-essay --notes-file "C:\Projects\theme-notes.txt" --source user-chat
```

Use `--source agent-delegated --delegation "exact user authorization"` only for an explicitly delegated choice. Use `--source test-simulation` for tests; neither is human preference evidence. UI submissions use `user-ui` (demo mode always uses `test-simulation`). No response is never permission to choose.

Portable hosts can use **Copy choice for agent** or **Export choice JSON**, then:

```powershell
vitris-themes import --site "C:\Projects\example-site" --file "C:\Projects\theme-choice.json"
vitris-themes render --site "C:\Projects\example-site" --out "C:\Projects\theme-picker.html"
vitris-themes status --site "C:\Projects\example-site"
vitris-themes --help
```

All site/output/file paths above must be absolute. A directly opened HTML file is portable and cannot write arbitrary workspace files. Import and UI submission share the same versioned selection validator. Site identity, theme release/hash, brand hash, exact note, source, operation and previous selection hash are validated. A stale preview or conflicting concurrent revision requires refresh; notes remain available in the draft/export. An identical operation is idempotent even after a later revision.

Branding is persisted once in `onboarding/theme-brand.json`: display name, original raster logo with content hash and evidenced palette. Explicit `launch.json.brand.colors` values take precedence at creation, followed by captured computed navigation/action colors, then a labeled neutral fallback. Capture adds only a bounded pass over 40 navigation/action elements, not a new crawl or model call. Historical captures are never rewritten. Unsafe/missing logo assets fall back to the business name. The exact primary color remains decorative when it cannot support readable actions; another captured color or a deterministic companion supplies the action role. Logos are never recolored or stretched.

Direction owns writing the effective tokens to `theme/defaults.json`. Optional `typeStep0` through `typeStep5` and `sectionY` retain existing defaults when absent. Current themes share canonical rendered semantic roles with preparation guidance: actual body/display fonts, reading size, surface distribution, spacing intent, control/plane geometry, local exceptions, visible customer-accent roles and mobile interpretation. Themes guide typography, rhythm, geometry, media framing and surface character. The author still decides the business experience, structure, hierarchy and compositions. Ordinary and creative context use the same resolver; variant shared evidence includes the selection. Existing textual `--theme`, assigned direction, blocks-v0 and composition-v1 policies retain authority. No multi-candidate run is required.

For a revision, use the same select/import command with a new operation and current `previousSelectionHash`. Reconciliation invalidates affected design stages and reviews while retaining capture evidence, prior outputs, selection history and attempt counters. It does not restart harvest. A revision during active authoring invalidates preparation freshness; resume to prepare again.

Serving binds to `127.0.0.1`, checks exact Host/Origin and a scoped session capability, caps request bodies, and exposes the picker, release metadata, hash-validated specimens/assets and selection endpoint. Raster logo bytes are checked and embedded as data. Customer strings are escaped or assigned as text; specimens are sandboxed without same-origin authority. Only their exact hash-pinned local interaction and bridge scripts run; it reports identity-matched readiness and scroll state. Font CORS applies only to the cleared public asset allowlist. The server never exposes repository paths or executes submitted instructions.

The kit guidance in `agent/refs/theme-selection.md` and direction guidance participates in normal managed plan/apply. Upgrades do not enable this policy or rewrite launch, STATE or authored content. `vitris-themes --help` and `status` are read-only.

Open the default Cloudflare template artifact from the repository with:

```powershell
npm run templates:gallery
```

Open `http://127.0.0.1:4390/`. Original palettes are the default. The gallery uses only published Cloudflare entries, loads thumbnails lazily and mounts previews when requested. Copy or export a choice for the agent; browsing the demonstration library does not submit a customer-site choice. The historical seven-industry review and its portable gallery are retired archives on D:.

The public checkout defaults to the current hosted catalog. Historical definitions remain available for identity and compatibility checks; their retired fonts and photos are excluded. Rendering an explicitly scoped historical gallery requires separately supplied licensed assets. Synthetic legacy UI fixtures are test-only and do not establish original-media fidelity or design quality.
