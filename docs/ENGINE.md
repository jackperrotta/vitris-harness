# Engine API and local refinement

The harness includes the full Vitris icon catalog, motion recipes/runtime, and optional analytics. Agent guidance lives in `agent/refs/icons.md`, `motion.md`, `analytics.md`, and `performance.md`, loaded by the relevant workflow stages. Icons compile to only the selected inline SVGs; no icon catalog or font reaches the browser. Motion uses the measured engine recorded in `docs/scroll-motion-engine.json`, bundled and minified into a self-hosted asset requested only by active motion routes. The current engine is vanilla JavaScript; third-party animation engines are not required by sites.

Static builds compile source pages once, deduplicate identical content-addressed CSS/islands, and select assets per route. The generated cookie preference page gets base styles and its first-party beacon without site widgets or motion. Compatibility `site.css`/`islands.js` files remain available, while authored routes reference their selected bundles. `buildSite()` returns the files actually written, including route assets and excluding the beacon when no backend is configured.

`launch.json.backendOrigin` connects first-party analytics (visits, attribution, engagement, contact clicks, accepted form conversions and presence); collection requires a configured backend and registered site. Optional `webAnalyticsToken` adds Cloudflare field-performance tracking on production pages. Tracking configuration does not provision services or imply measured results. See the analytics reference for selectors, preferences and test practices. The package smoke check renders every supported icon variant from an installed tarball and compares its coverage with source.

Install an exact `@tryvitris/website-harness` dependency in each website. `@tryvitris/website-harness/contracts` is browser-safe validation; `@tryvitris/website-harness/engine` executes Node filesystem operations. Legacy `@tryvitris/website-harness/cli/api` exports remain available.

```js
import { inspectSite, prepareChange, applyOperations, buildSiteDraft, verifyChange } from "@tryvitris/website-harness/engine";
const site = inspectSite(process.cwd());
const request = { schemaVersion: 1, id: "headline-1", instruction: "Update the headline", origin: "operator",
  baseRevision: site.revision.digest, requestedScopes: ["copy"], explicitPreferences: [], evidence: [] };
const plan = { schemaVersion: 1, requestId: request.id, baseRevision: site.revision.digest,
  targets: ["/#headline"], files: ["pages/index.html"], facets: ["copy"], preserve: [],
  acceptanceCriteria: [{ id: "headline", kind: "exact_text", target: "/#headline", expected: "New headline" }],
  requiredChecks: ["render-375", "render-1080"], assumptions: [], evidence: [], proposedBy: "active_agent" };
prepareChange(process.cwd(), request, plan);
applyOperations(process.cwd(), request.id, [{ kind: "set_text", file: "pages/index.html", elementId: "headline", text: "New headline" }]);
await buildSiteDraft(process.cwd());
const result = await verifyChange(process.cwd(), request.id);
```

Plans are validated at runtime and must name files, targets, all requested facets, acceptance assertions, and checks. The source revision hashes current authored bytes, including uncommitted edits. Preparation and source operations use the existing mutation lock. A stale plan or editor save conflicts; the caller must inspect again. Replaying the same request and operation payload is idempotent. Source operations currently support a single text, local image, declared theme-token, or adjacent declared section move per save. Image replacement requires one usable inventory identity with source evidence and a SHA-256 matching the local file. Mark editable HTML with `data-vitris-field`, and movable sections with `data-vitris-movable` and a stable `id`. Optional component `edit.schema.json` files declare shared fields. Custom markup remains editable by the agent.

Structured preservation preferences are authoritative when supplied. A preservation target must name a unique authored `route#field` and is compared against its preparation snapshot; every plan preservation statement must match an explicit preserve preference. Exact copy plans allow only text changes at named fields within their planned files. Required checks are currently `build`, `render-375`, and `render-1080`; an unknown mandatory check is rejected during preparation. Verification records each required check, and accepts memory only after a final locked source and built-artifact comparison. A concurrent edit leaves the candidate unaccepted.

`vitris refine prepare --request "..." --plan plan.json --site .` uses the structured path; `vitris refine verify --request-id ID --site .` returns separate technical, fulfillment, and design results. Legacy unplanned requests remain supported through a compatibility path, but its keyword fulfillment is not a reliable visual or semantic judgment. Visual and semantic plan criteria require revision-bound outcome findings. A passing technical build is not human approval. Failed verification leaves the draft and diagnostics in place and does not accept planned memory.

For a failed or abandoned candidate, `discardChange(siteRoot, requestId, candidateRevision)` restores the planned source files captured at preparation. It requires the exact current candidate revision and rejects unplanned edits or a verified accepted result. A later edit must be inspected and replanned rather than overwritten.

The local editor example is at `examples/local-editor/`. It presents a preview, selected field, save, rebuild, and verification status. It does not publish.
