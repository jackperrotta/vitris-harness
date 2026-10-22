# Vitris Icons v5

For new builds, use the original harness SVG library for interface and feature icons. Do not use emoji, Unicode pictograms, icon fonts, third-party icon kits, or browser-fetched icon catalogs. Ordinary punctuation, mathematical symbols and editorial text remain text. Existing customer sources and hosted templates are not migrated by this feature.

## Discover by meaning

- `vitris-icons search plumber` (or `node node_modules/@vitris/harness/bin/vitris-icons.js search plumber`)
- `vitris-icons industries --json` lists industry groups, template aliases and their curated icon names. Exact industry searches such as `vitris-icons search "OB-GYN"` or `vitris-icons search "Data recovery"` return those groups.
- `vitris-icons inspect NAME --json` returns exact family availability and core industry review notes plus separate studio review notes, family-specific recommended minimum sizes, geometry hashes and a simpler related symbol for compact contexts. `inspectIcon(name)` exposes the same build-time information from `@vitris/harness/icons`.
- `vitris-icons list --json` gives canonical names, categories, keywords and per-icon available variants for agent selection. Never assume every icon supports every family.
- `vitris-icons gallery --out artifacts/icons/gallery.html` creates an offline HTML contact sheet from the exact compiler renderer. Add `--serve` for a loopback preview on port 4391.
- In the harness repo: `npm run icons -- search appointment`, `npm run icons:gallery`, or `npm run icons:artifact`.

The collection has 381 canonical icons in 40 categories, with curated coverage for 30 industry groups. Every industry named by the current hosted Vitris template catalog maps to a group. Every icon has light, regular, solid and duotone variants. Five additional original studio families—Soft, Block, Cutout, Imprint and Sketch—have individually authored masters for a curated 24-icon selection: 16 core symbols and 8 industry symbols (120 studio drawings). There are 1,640 actual variants, not 380 multiplied by every family. Prefer semantic matches over decorative filler. Aliases resolve to canonical names, but author canonical names when possible. A missing icon is a build error: search before authoring, or extend the original catalog deliberately.

## Author

```html
<a class="btn" href="tel:+15551234567">
  <vitris-icon name="phone"></vitris-icon> Call us
</a>
<button type="button" aria-label="Open menu">
  <vitris-icon name="menu" variant="solid"></vitris-icon>
</button>
<vitris-icon name="shield-check" variant="light" aria-label="Verified"></vitris-icon>
```

Use paired empty tags; custom HTML elements are not self-closing. This works in pages, component templates, named/default slots and inert HTML templates. Icons compile after component expansion. No runtime registration, hydration, font, remote asset, sprite catalog or client JavaScript is involved. Each route contains only the SVGs it uses, including icons from shared components. The library remains a build dependency; never import `@vitris/harness/icons` into a client island.

Default variant is `regular`; `light` uses 1.2-unit strokes and `regular` 1.8 on a 24-unit grid. `solid` uses its own silhouette master, with strokes retained for fine exposed details where needed. `duotone` has separate semantic primary and secondary shape layers, drawn without masks, IDs, fonts or external resources. Secondary defaults to the inherited color at 35% opacity; primary defaults to the inherited color at full opacity. Use one coherent family within a site unless a deliberate state distinction needs another. Scale through CSS without modifying the masters. Color follows `currentColor`. Dimensions default to 1em; reserve space explicitly for large feature icons. The class is `vitris-icon`, deliberately independent of legacy `.icon` styles.

Supported attributes: `name`, `variant`, `class`, `id`, `width`, `height`, `aria-label`, `aria-labelledby`, `aria-describedby`, `aria-hidden="true"`, and non-reserved `data-*`. Labels may use HTML entities. Width/height accept nonnegative numeric SVG lengths (px/em/rem/% or unitless); CSS can size icons with site-owned classes. Events, inline style and external references on the authoring tag are rejected. Put interaction on a link/button, never on the SVG.

Decorative is the default (`aria-hidden="true"`, `focusable="false"`). Label icon-only controls on the control. For a standalone meaningful image supply `aria-label` or `aria-labelledby`; output gets `role="img"`. Do not hide and label the same icon. Labels describe the actual meaning, not the icon's file name. Accessible naming, visual legibility and touch-target dimensions still need browser review.

## Studio families and the quality pass

- `soft`: open squircle curves, rounded terminals and generous counters.
- `block`: heavy frames with transparent counters and a deliberate lower-right extrusion.
- `cutout`: separated solid pieces and geometric negative space; recognizable silhouettes take precedence over fragmentation.
- `imprint`: organic color forms with a few intentional ink lines; supports the same palette properties as duotone.
- `sketch`: individually drawn pencil-like curves, restrained asymmetry and deliberate pen lifts.

These are original Vitris families, informed by the visual approaches in the supplied Jelly, Slab, Mosaic, Thumbprint and Graphite references. They are not copies of those packs, and no source SVG paths, fonts or illustrations were imported. Core studio masters live in `src/icons/studio.ts`; curated industry masters live in `src/icons/studio-industry.ts`. No stroke-width substitution, random distortion, generic badge or automatic recoloring stands in for an authored family master.

Use `availableIconVariants(name)` from `@vitris/harness/icons` or CLI JSON before selecting a studio family. Unsupported combinations are build errors; there is no silent fallback. Author `<vitris-icon name="house" variant="soft"></vitris-icon>`. The gallery filters to supported icons, provides separate core/studio comparisons and can filter to reviewed industry drawings, v4 redraws, all v3/v4 core refinements, or the industry studio v5 selection. Studio families are accents: Imprint, Cutout, Block and Sketch are best evaluated at 24px and larger; keep compact controls on a clearly legible core or Soft master.

The v5 industry studio selection is deliberately limited to **solar-panel, faucet, house-key, croissant, paw, hair-dryer, tractor and hands-care**. All eight have individually authored Soft, Block, Cutout, Imprint and Sketch masters (40 additions). They cover electrical/solar, plumbing, property, bakery, pet, salon, agriculture and care sites; they do not imply complete studio coverage of every industry. The original 380 canonical names and the four core masters remain unchanged. The original v4 core review still applies only to the core masters.

```html
<vitris-icon name="solar-panel" variant="soft"></vitris-icon>
<vitris-icon name="tractor" variant="cutout" class="farm-feature"></vitris-icon>
```

Inspect with `vitris-icons inspect tractor --json`. `studioReview` is separate from `review`: it records v5 family hashes, the curation rationale, contextual notes and a minimum for each family. These industry studio drawings are feature illustrations at **24–32px and larger**; none is recommended for 16px controls. For example, tractor Soft recommends 24px; tractor Cutout, Block, Imprint and Sketch recommend 32px. At smaller sizes use a legible core master with the service text, or omit the icon. Preserve a coherent family across related features; if the same family lacks another required symbol, choose a supported core family for the group.

In the gallery choose **Compare new families** and **Industry studio v5** to see the eight rows, then inspect individual families and their size guidance. Imprint uses the existing primary/secondary color and opacity controls. Light/dark and 16/24/32/48/64px review sheets are generated by `node --experimental-strip-types scripts/review-industry-studio.ts` in the harness repo, under `artifacts/icons/industry-studio-v5/`. Review records in `src/icons/studio-industry-review-v5.json` are bound to all 40 masters with hashes; geometry edits require new rendered review, not an automatic hash refresh. Agent review is not human approval. Do not inflate coverage by applying effects to unreviewed icons.

Sixteen industry icons were redrawn in v3 for proportion, silhouette, spacing and restrained detail: excavator, bulldozer, dump-truck, cement-mixer, lawnmower, chainsaw, heat-pump, air-conditioner, faucet, shower, solar-panel, hair-dryer, hard-drive, ultrasound, wheelbarrow and gavel. Revised core masters live in `src/icons/refinements.ts`. Existing names and the 24-unit canvas stay stable.

The v4 pass reviewed all 224 industry-specific icons across 28 categories. It redrew 41 weak masters and retained 183 after comparison, including the 16 earlier v3 industry redraws. No new symbols or family combinations were added. The new originals live in `src/icons/industry-refinements-v4.ts`; per-icon decisions, size guidance and geometry hashes live in `industry-review-v4.json`. Before/after category sheets and manifests are in `artifacts/icons/industry-review/` in the harness repo.

`refinedVersion` identifies an actual geometry revision. `reviewedVersion: 4` identifies the rendered industry review and includes retained drawings. These are agent review records, not human approval, human preferences or a guarantee of suitability in every design. Hash checks reject geometry changes whose review records have become stale. Do not automatically re-stamp those hashes to pass a test: inspect updated renders and record a deliberate review.

## Choose and place industry icons

1. Search by the actual service or visitor action, inspect the candidate with `vitris-icons inspect NAME --json`, then compare its supported masters in the gallery. Prefer a precise semantic match over a generic decoration. Do not invent a missing family or substitute a vaguely related industry symbol without changing the visible label appropriately.
2. Use industry glyphs beside readable service names. Their recommended minima are 16, 24 or 32 CSS pixels; these are selection guidance, not compiler-enforced rules or a substitute for page review. Plans and technical sections need more space. Below the recommended size, use a simpler related symbol with the original service text, or omit the icon. A suggested compact alternative is broader, not a semantic equivalent. A 16px glyph does not define the control's touch-target size.
3. Keep one coherent family and optical size across a service list. Use `regular` as the general default; thin `light` masters need particular care on small/low-contrast surfaces. Studio styles support only the 16 core symbols and 8 curated industry symbols listed below. Check exact availability; never synthesize unsupported combinations. Use `studioReview.minSizes[variant]` from inspection for a supported industry studio master; core review sizing does not automatically apply to a studio drawing.
4. Treat glyphs as illustrations, not evidence. A shield/check/certificate is not proof of accreditation, verification or a guarantee. Distinguish service illustrations from actual warning/status controls. Keep local conventions accurate, including electrical sockets and accessibility signage; generic artwork does not replace required official signage.
5. Keep essential identifying details visible. In duotone, inspect each layer against the real background at the chosen opacity; the default 35% secondary opacity may need adjustment. Color alone cannot carry a state. Prefer a single-color master when two layers lose their relationship.
6. Inspect the finished desktop/mobile page at its actual size, including hover/focus and light/dark backgrounds where present. Check silhouette, counters, collisions, alignment with text and accessible naming. Record problems by route, viewport and icon; repair the page choice/size/color or the original master as appropriate. Library review alone does not pass the page's visual gate.

At storyboard, decide whether an icon clarifies the service and reserve a useful display size; use no icon where text or real imagery serves better. During representative/page implementation, verify names and supported variants before authoring. Browser and visual-critic stages inspect actual rendered icons using this same guidance. Per-icon review/selection data stays at build time; published routes still receive only the used SVG geometry.

Evaluate actual renderings at 16/24/32/48/64px on light/dark canvases. Check recognizable silhouette, optical alignment, smooth curves, balanced counters, minimum useful gaps, overlapping/colliding paths, layer separation, and clipping including strokes. Simplify rather than squeeze in details that disappear. Automated bounds and passive-SVG tests are necessary technical checks; a passing check alone is not visual quality approval. Sources, screenshots and the agent QA record belong in `artifacts/icons/`; historical frozen baselines remain unchanged.

## Duotone colors

```html
<vitris-icon name="solar-panel" variant="duotone" class="energy-icon"></vitris-icon>
```
```css
.energy-icon {
  --icon-primary-color: var(--color-text);
  --icon-secondary-color: var(--color-accent);
  --icon-primary-opacity: 1;
  --icon-secondary-opacity: .65;
}
```

Imprint uses these same properties. Set properties in site-owned CSS; no inline style is needed on the authoring tag. The gallery supports tonal rendering, palette presets, custom primary/secondary colors and opacity, and can copy the matching CSS. Named gallery presets adapt their colors to light/dark canvases; custom choices stay fixed. Copied/downloaded SVGs and CSS preserve the active colors. Both layers belong to one accessible image; color must not be the only way to communicate a state. This is an original Vitris duotone family; Font Awesome was a styling reference, not a geometry source, dependency, or claim of matching its Sharp family exactly.

## Extend and review

Editable masters and semantic metadata live in `src/icons/catalog.ts` , `src/icons/industry.ts`, `src/icons/studio.ts`, `src/icons/studio-industry.ts`, `src/icons/studio-industry-review-v5.json`, `src/icons/refinements.ts`, `src/icons/industry-refinements-v4.ts` and `src/icons/industry-review-v4.json`; industry coverage in `src/icons/coverage.ts`; render/API in `src/icons/index.ts`; source-span compilation in `src/compile/icons.ts`. All geometry in this collection was authored directly for Vitris on 2026-10-22. No third-party path data, traced library shapes, fonts or logos were used. Distribution follows the repository's MIT license; no third-party icon notice is required. Do not add brand marks to this generic collection.

Add an original outline master, an intentional solid master with meaningful negative space, and distinct primary/secondary duotone geometry plus a canonical kebab-case name, category and meaningful keywords. Light and regular share the outline master. Preserve the 24-unit viewBox and currentColor, keep drawings inside the canvas, avoid IDs, scripts, text, filters, embedded raster images and external resources. Use minimal paths and simple SVG primitives. A primitive or conventional symbol may naturally resemble another drawing; provenance records the actual source of our geometry.

Regenerate the gallery. Inspect light/regular/solid/duotone at 16, 24, 32 and 48px on light/dark canvases and on mobile. Run `npm run test:icons`, `npm run verify:icons` (requires Playwright Chromium) and `npm run typecheck`. Browser reports and contact sheets go to `artifacts/icons/`. A consistent optical inset reserves room for strokes within the viewBox. Verify compiler isolation with pages using different icons and a page using none. Do not claim browser rendering is pixel-identical: the geometry is fixed, but antialiasing can still differ.

The collection is an initial broad set, not a claim of Font Awesome's thousands-of-icons coverage. Expand categories and families from real site needs and review additions in the gallery. Existing names/masters are versioned source; visually consequential revisions need review.
