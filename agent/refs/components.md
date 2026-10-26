# Add components

## When `launch.json` selects `composition-v1`

Build site-owned elements from the approved visitor task, business facts, direction, storyboard, edited copy, and inspected media. The primary design choice is how content elements relate: what leads, what supports it, what belongs together, and how the reader reaches the next question or action. Read the stage-selected composition summaries in CURRENT.md and expand relevant lessons when a consequential choice needs detail. Examples teach relationships; they are fictional teaching material, not customer facts or ready-made components.

Record consequential relationships and observable outcomes in the storyboard composition extension. Author semantic HTML and scoped CSS in this site's components. Put stable `data-composition-element` IDs on significant planned elements so the browser report can locate them. Reuse tested behavior, tokens, and layout mechanics. A library block can be an optional engineering reference only after the composition is described and its `designLibraryProfile` eligibility is checked. Gallery browsing, a block shortlist, and `component-selection.json` are not required for this mode. Record consequential authored choices in `agent/decisions/authoring-decisions.json`, including lessons applied, adapted, or declined and examples actually inspected. Empty example-inspection lists are honest.

Inspect production-compiled homepage and interior pages at wide and narrow widths. Keep factual accuracy, reading order, focus, reflow, reduced motion, and usable fallback. Repair visible failures while preserving successful identity choices. A rationale in JSON cannot approve a render.

## When `launch.json` selects `blocks-v0` or omits `designAuthoring`

Invent trade-specific folders under `components/<name>/`:

- `template.html` — semantic HTML, named slots, root `.c-<name>`
- `styles.css` — scoped `.c-<name>`, colors only via `var(--color-*)`
- optional `island.js` — tiny, no Shadow DOM

## Use blocks where they fit

Check `launch.json` for `designLibraryProfile`. The default `legacy-v0` catalog contains the 114 pre-slice block IDs and uses legacy README metadata. `slice-v1` explicitly opts this site into the six draft additions and twelve metadata-backed previews. This profile is recorded with component-selection receipts. The legacy profile is a rollout control, not a byte-for-byte historical harness baseline. Existing site-owned components remain unchanged when the profile changes.

The site profile controls eligible copied blocks. Generate the site-filtered local gallery with `node node_modules/@tryvitris/website-harness/bin/vitris-blocks.js --site . --out dist/blocks`, then browse `dist/blocks/index.html`. Its links and preview pages contain only that profile's blocks. The harness-wide `blocks/INDEX.md` lists every release and is background documentation, not the eligible site catalog. Hunt by job and available media (`sections.md`, `compose.md`); the Registers column is a tone hint.

1. Open the site-filtered `dist/blocks/index.html`; use its category and job filters. Check `launch.json` before selecting a source folder.
2. Pick a **Look** that matches the chapter. Copy that folder — do not concatenate a register “starter stack.”
3. Copy into this site as `components/<your-name>/`. Start from the README **Example** (it fills every slot and is what the block preview renders); the **Slots** table tells you which slots are optional. Templates expose bare slots — typography classes (`eyebrow`, `lede`, `btn`, `card`) go on the slotted content.
4. Harness primitives such as `.section`, `.grid`, `.split`, `.card`, `.tabs` and `.accordion` are available when they fit the planned composition. Write site-owned CSS when they do not. Surface, border, shadow and radius choices follow the selected direction. A dark panel can use `data-scheme="dark"` to resolve semantic color tokens.
5. Authoring tags may pass `variant="overlay dark"` — the compiler adds `c-<name>--overlay c-<name>--dark` on the root.

Before an important composition choice, compare 3–5 viable alternatives when the library has them. Filter only genuine impossibilities, such as essential media that is absent or required behavior the block cannot supply. Treat registers as hints. Inspect the actual mobile and desktop images for metadata-backed blocks under `design-system/block-previews/v1/` when their manifest source hash and image hashes are current; otherwise open the live structural example and mark visual evidence unavailable. Jev recommendations are metadata-only and do not prove that images were inspected. A site-owned custom component is always an option.

Record each important choice in `agent/decisions/component-selection.json`: section and visitor job, eligible IDs, hard-filter reasons, shortlist IDs, preview hashes actually inspected, selected block ID or `custom`, source revision, adaptation notes, and why the chosen composition fits the adjacent sections. Only list an image as inspected after opening it. Keep this trace separate from customer facts.

Build shared chrome and components required by the storyboard. Section counts and geometry follow the business narrative; avoid repetitive equal emphasis.

No `schema.json`. No shared runtime catalog — uniqueness lives in this repo after you copy/adapt.


For scroll motion, use the stage-scoped `motion.md` contract. Choose business-specific scenes and quiet intervals; preserve operator policies. Carry motionPlan v2 for every new/reauthored route (historical v1 remains compatible) from direction/storyboard to unique native/component target IDs, then inspect before/during/after normal and reduced scrolling. Temporal claims require live observations or recordings; agent review is not human preference.

Use paired `<vitris-icon name="phone"></vitris-icon>` tags inside component templates or slots. Compilation resolves them after component expansion; no runtime icon registration is needed. Read `icons.md` and check exact family availability before authoring.
