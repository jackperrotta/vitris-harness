# Knowledge layers

Vitris keeps the compiler, the stage-local agent refs, and Cloudflare hosting. Guidance is three layers:

1. **Standards and project policy** in `design-system/knowledge/v2/`. Each requirement names its source, authority class, and coverage status. WCAG 2.2 A/AA is the accessibility target. Automated checks are not a conformance claim. Screen-reader review stays manual.
2. **Conditional lessons** in `design-system/knowledge/v1` plus v2 extensions. A lesson is teaching material. A synthetic demonstration is not a customer proof and not a human preference.
3. **Business direction** in `onboarding/direction.json`. The central idea has to come from the visitor and the evidence. Layout and type stay open.

## What is checked

Production launch blocks confirmed serious accessibility, essential functionality, and technical indexing failures. Subjective design findings warn. A missing verifier or a stale receipt blocks production and leaves preview available. Field Core Web Vitals are unknown until measured. The transfer budgets are Vitris policy, not a web standard.

The same decision runs from `vitris deploy`, the site `npm run deploy` script, the template GitHub workflow, and Worker Pages upload. The Worker saves a kernel preview and refuses the Pages upload when trusted browser evidence for that build is missing.

## What stays open

Art direction, section structure, and how a service is explained stay with the active agent, within the accepted direction and the facts. A form is optional. Repetition is acceptable when it does one job. A restrained page is valid.

## Maintenance

`vitris knowledge explain --stage direction` prints the applicable requirements and lessons without calling a model. New sites pin `knowledgeRelease` in `site.json`. Refreshing the agent kit keeps `launch.json`, `agent/STATE.json`, and `onboarding/direction.json`. A knowledge change does not mark old stages passed. Production still needs a new preflight.

Review dates in `sources.json` are real only when `reviewStatus` is `live-checked`. `cited-not-rechecked` means the summary was not fetched again on 2026-09-22.

Installed commands are bundled JavaScript. The package supports Node `>=22`. Do not run the `.ts` sources from inside an installed `node_modules` tree.
# Current implementation notes (2026-09-22)

Stage preparation loads the versioned v2 pack through `loadKnowledgeV2`, selects applicable requirements by stage and site signals, and writes their IDs, source IDs, applicability, and instructions into the design context in `agent/CURRENT.md`. The preparation sidecar records selected IDs and release content identity. `vitris knowledge explain --stage <node>` reports the active preparation selections when one exists; otherwise it shows a prospective selection. A pack with validation errors is quarantined and the agent sees the errors. Lessons continue to provide advisory design guidance, with a separate provenance statement; they are not customer facts.

For local production checking, set `launch.json.publicOrigin` to the actual public origin, build with `VITRIS_SITE_ENVIRONMENT=production`, then run `npm run preflight`. The preflight reruns the browser verifier, checks its generated screenshot and report bytes, hashes the publishable `dist` files, and applies the launch policy. `agent/reviews/launch-preflight.json` has blocker IDs and the artifact hash. Repair the named page or component, rebuild, and rerun. Preview remains available when production is blocked. Automated results make no WCAG conformance claim; manual and screen-reader coverage remains separate.

The browser verifier uses axe for rendered accessibility checks plus navigation, consent, keyboard progression, focus overlap, link, image, and runtime checks. Static HTML analysis catches clear missing alternatives and labels; unmeasured script, fixed positioning, and inline color suspicions remain warnings. The initial request transfer figure comes from the rendered homepage; published JS/CSS/font budgets are project policy, not field Core Web Vitals.

The active coding agent chooses typography, color, layout, narrative order, imagery, and interaction character from verified business facts, visitor tasks, usable media, and the accepted direction. Requirement records constrain technical outcomes, not a page template.

Worker publication with a Pages project remains blocked until an authenticated CI attestation for the exact Worker compiled bytes is implemented. Its existing caller-supplied `trusted` flag is rejected, and a blocked attempt does not change the currently stored kernel preview. Direct site CLI/npm/CI publication uses the local trusted verifier path described above.
