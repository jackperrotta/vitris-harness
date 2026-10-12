# Build a library template from a website reference

This workflow reviews a public website, records a buildable specification and handoff, and executes it as a reusable demonstration in the existing Cloudflare library. Read `agent/refs/template-library.md` for the authoritative bundle and storage contract and `design-system/MASTER.md` for applicable design requirements. Follow repository instructions and preserve unrelated working changes.

## Start and establish scope

- Require one clear reference URL. Accept optional page scope, fidelity, template name, and publishing mode without repeatedly asking for already specified choices.
- Default to close layout and interaction fidelity, fictional demo identity, every distinct public page layout, and publication after verification. Use representative examples for repeated content. Record discovered URLs, inspected URLs, grouped layouts, planned demo routes, and excluded or inaccessible routes; do not claim an exhaustive review from a sample. If a user requests every URL, honor that scope and discuss a concrete access or scale constraint before reducing it.
- Inspect the supplied URL, the home page, navigation/footer destinations, and an available sitemap. Follow relevant same-site public links. Avoid unbounded calendar, search, filter, tracking, locale, and pagination variants unless they expose a distinct layout or behavior. Record consequential variants.
- Check the live catalog using the existing gallery/catalog tooling. Choose a new unique theme ID unless the user requested a revision. An ID collision does not authorize replacing an existing template. Choose a release newer than the live catalog using the publisher's release convention, not a hardcoded date.
- Create a dedicated transient directory, for example `artifacts/template-staging/<id>-<timestamp>/`. Resolve and record its absolute path. Never use a repository root, existing historical artifact, junction, or `src/agent/industry` as the bundle root.
- Store the inspection evidence, review, plan, handoff, original authored source, recipe files, and assets inside that bundle. The publisher privately archives all bundle files before verified cleanup. After success retain only compact publication metadata locally; complete plans, evidence, media, and recoverable source belong in Cloudflare.

## Inspect rendered pages and behavior

Use an available browser tool and follow its applicable usage instructions. Fetching HTML, a screenshot of the hero, or search summaries alone cannot establish hover, motion, or mobile behavior. Repository browser tooling may support measurements and captures; inspect its interface before using it. Do not report a state or passing check that was not actually observed.

Inspect the full length of each distinct layout at matching desktop and mobile viewports, with tablet and narrow-width checks where layout changes. Useful initial widths are 1440, 768, and 390 CSS pixels; check 320px and determine actual breakpoint behavior by resizing around transitions. Let the reference determine breakpoints rather than treating these sample widths as its CSS breakpoints.

For each page and shared component, record:

| Area | Required observations |
| --- | --- |
| Identity and structure | Source URL, page purpose, section order, header/footer variants, links, content hierarchy and relationships |
| Visual design | Fonts and weights, type scale and line height, content widths, grids, spacing, colors, borders, radii, shadows, image crop/aspect ratio, icons and decoration |
| Navigation | Hover and focus, dropdown/mega-menu states, sticky/shrinking behavior, active states, mobile drawer open/close, nested navigation, escape and focus behavior |
| Interactive components | Buttons/cards, accordions, tabs, carousels, filters, galleries/lightboxes, form validation and local demo feedback where applicable |
| Motion | Fresh-navigation opening, repeat visit, scroll triggers, sticky/pinned sequences, route transitions, hover/pointer effects, timing, easing, distance, overlap, loops and quiet intervals |
| Responsive behavior | Columns, order, wrapping, visibility, spacing/type changes, crop changes, overflow, touch alternatives, mobile navigation and sticky elements |
| Accessibility | Semantic controls, keyboard paths, visible focus, names/labels, readable contrast, reduced-motion behavior and access to final content |

Capture full-page and useful detail screenshots with source URL, viewport, state, and timestamp in an evidence index. For defining animations record clips or before/during/after frames with reproducible triggers. Observe the opening from navigation start before readiness waits consume it. Exercise actual interactions; do not invent them from appearance. Inspect normal and reduced-motion modes. Read `agent/refs/template-motion.md` when motion defines the reference, applying its comparison principles without treating customer-site checkpoint files as required template-bundle files.

Separate observed facts, measured/estimated values, inferred implementation choices, and unavailable evidence. Record access failures and the URLs affected. If a critical layout or defining interaction cannot be inspected, complete the independent work and request the needed input; do not publish a supposedly verified replacement based on guesses. Missing noncritical details may use explicitly documented fallbacks.

## Write the review, plan, and handoff

Create `review.md`, `plan.md`, `handoff.md`, and an evidence index inside the bundle. These are substantial artifacts, not just a chat summary.

The review contains:

- A source-to-demo route map covering discovery, layout groups, included variants, and exclusions.
- A shared design system specification, with evidence references and uncertainty attached to relevant values.
- Each page's ordered sections and component variants, including text hierarchy, visual relationships, asset requirements, desktop/mobile differences, and destinations/actions.
- An interaction matrix: page/target, trigger, starting state, resulting state, timing where relevant, keyboard/touch alternative, responsive variation, and evidence reference.
- A media/font inventory with source, reuse status, licensing/provenance, intended use, and required replacements. Keep observations about reference assets distinct from assets actually cleared for the published demo.

The plan maps those observations to authored pages, shared components, design tokens, assets, and working interactions. Include a route coverage checklist and testable acceptance criteria for each distinctive layout and defining behavior. Document deliberate departures and why they are needed. Sequence implementation by shared shell and representative page, then remaining layouts, interactions, responsive refinement, browser comparison, and publication. Avoid reducing the site to a generic five-page suite or adding unrelated effects.

The handoff must be self-contained enough for another agent to continue from the archived bundle. Include the source URL, agreed scope and defaults, bundle path, review/evidence references, route map, visual and behavior requirements, asset decisions, implementation sequence, acceptance criteria, current status, and the exact existing publish/verify commands. Tell the executing agent to continue through the authorized completion state. Update its status if execution reveals material changes. Writing a handoff does not authorize sending it to another chat.

## Build the complete template

Execute the plan immediately unless the user requested a review or plan only. Use the harness template format, not an unrelated website hosting workflow.

- Author every agreed demo route with complete content and shared design relationships. Use a coherent fictional business; preserve the reference's visual density and content roles while replacing identity, claims, testimonials, contact details, and transactional destinations as appropriate.
- Use original or appropriately licensed replacement assets with recorded provenance. Do not assume a publicly accessible image or font grants reuse rights. Package demo assets and font notices according to the library contract; avoid hotlinks and dependencies on the reference site's runtime.
- Implement working local interactions. Forms show clearly fictional/local feedback without contacting the reference business. A demo purchase, booking, or login interaction stays local unless separately requested. Preserve accessible links, keyboard support, touch alternatives, and reduced-motion readability.
- Provide editable source plus `template.json` and complete `{original, brand}` page recipes. The `original` variant means the authored demo palette, not a copy of the reference's proprietary source. Both variants must function across all routes.
- Supply valid theme tokens and design metadata, browse/search metadata, route/page roles and priorities, asset digests/byte sizes/provenance, and required font license records. Validate route manifests with the existing harness validator.
- Use `__VITRIS_PAGE_PAGEID__` for internal links, `__VITRIS_RETURN__` for the gallery return, and the library's brand placeholders in branded recipes. Use content-addressed Cloudflare URLs for media in final recipes. Build a transient preview that resolves these tokens/assets for local checks; never rewrite final recipes into local-only addresses.
- Inspect a materially different customer brand palette/name/logo in the branded variant to verify that branding is reusable and keeps contrast, typography, spacing, and links working.

## Verify and refine before publication

Write a browser QA report in the bundle. Compare the reference and authored demo at matching viewport sizes and states. Review the complete pages and their defining motion, not only initial screenshots.

Check every demo route and both recipe variants for navigation, keyboard operation, interactive states, mobile/touch usability, narrow-width overflow, missing media/fonts, layout shifts, console/runtime failures, and reduced-motion content access. Verify distinctive interactions against the review's matrix and record tested routes, viewports, states, failures, fixes, and intentional departures.

Fix material visual, behavioral, responsive, and accessibility problems and recheck the affected pages. The existing publisher checks route completeness and loading of selected featured pages at desktop/mobile widths in reduced-motion mode; it does not replace full interaction and visual QA. Do not label untested routes as passed. Preserve failed evidence until it is archived with the successful bundle.

If preview-only or approval-before-publishing was requested, finish the reviewable preview and report its URL, plan/handoff paths, completed checks, and concrete remaining publication step. Otherwise continue without an extra approval question.

## Publish and confirm completion

From the repository root run:

```text
npm run templates -- publish --bundle ABSOLUTE_STAGING_DIRECTORY
npm run templates -- verify --id TEMPLATE_ID
```

Use the exact bundle path and ID for this run. The publisher uploads immutable assets/routes and private recoverable source, verifies hosted routes/loading, conditionally merges the live catalog, updates local metadata, and removes only verified matching staging files. Let it perform cleanup; never manually remove unpublished source or recursively delete artifact junctions.

If a catalog concurrency conflict occurs, read the latest catalog, check whether this run already published, preserve the unique ID and scope, adjust the release if required, and retry the existing publisher once. For other failures diagnose and fix the concrete issue; do not repeatedly mutate the catalog or create duplicate templates to conceal a failed run. If blocked, retain the bundle and report the exact failure and resumable state.

After successful publication, open the default gallery (`npm run templates:gallery`, `http://127.0.0.1:4390/`) and confirm the entry and its hosted routes. Check hosted defining interactions and mobile behavior as well as the command verification. New entries appear through the gallery's live refresh without rebuilding it.

Record compact metadata under `artifacts/templates/`: reference URL, template ID/name, release/revision, hosted demo links, sourceArchive key, route count, and check status. Do not retain a second permanent local template or evidence library. If post-publication checks reveal a defect, restore source into a new transient directory and publish a corrected immutable revision through the existing workflow.

Finish with the template name, gallery/demo links, scope covered, verification outcome, deliberate departures or unresolved limitations, and source archive/restore information for retrieving the detailed review, plan, handoff, and source. Distinguish built, published, and verified states if a step could not finish.
