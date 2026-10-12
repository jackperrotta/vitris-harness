# Block conventions

Original vanilla blocks for Vitris agents. Inspired by modern small-business templates (Apex / Munch / Verdict visual language) — not a port of any paid library.

## How agents use blocks

These conventions govern library maintenance and optional block reuse. In `composition-v1`, a site author may consult an eligible block after describing the content relationship; the gallery and shortlist are not mandatory authoring steps. The procedure below applies to block selection and `blocks-v0` authoring.

1. Open [`INDEX.md`](INDEX.md) and pick by **role** (hero, feature, faq, …) and **register** (trade / beauty / b2b / food / professional).
2. Open the block's `README.md`. The **Slots** table lists every slot and whether it is optional; the **Example** is a complete, working authoring snippet — copy it, then swap copy and media.
3. Copy `blocks/<category>/<name>/` into the site as `components/<your-kebab-name>/`. Rename the root class if you rename the folder (`c-<folder>`).
4. Compose pages with authoring tags + optional `variant="…"`.

Sites own their components. Blocks are copy sources in the kernel package (`node_modules/@vitris/kernel/blocks/`).

`blocks/` is the source of truth. `scripts/generate-blocks.ts` only produced the first draft and refuses to overwrite the library without `--force`. After editing a README, regenerate the index with `node --experimental-strip-types scripts/write-blocks-index.ts`.

## Previewing blocks

From the kernel repo: `npm run blocks:serve` renders every block's README example (once per variant) into `dist/blocks/` and serves it at `http://127.0.0.1:4173/` (default theme, placeholder media, islands live). `npm run blocks:preview` only writes the files.

From an installed package, run `vitris-blocks --out <output-directory>` (or `vitris-blocks --serve --out <output-directory>`). This is a compiled JavaScript bin; Node does not strip TypeScript under `node_modules`. The gallery marks image evidence current, stale, or unavailable, and supports job/role/media/geometry filters plus two-block comparison.

Because the preview renders the README example, the example _is_ the visual spec. Keep it realistic: 3–4 cards, real-length copy, one CTA pair.

## Anatomy of a block

```
blocks/<category>/<name>/
  template.html   root `.c-<name>`; bare <slot> elements; layout classes only
  styles.css      `.c-<name>…` rules on top of kernel primitives; tokens only
  README.md       look line, metadata, Slots table, Example, variants
  island.js       optional; kernel islands (`data-island="…"`) are preferred
```

### Slots carry the content classes

Templates expose bare slots. Typography classes live on the slotted content so authors control emphasis without touching the template:

```html
<feature-grid-3>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Why homeowners call us first</p>
  <h2 slot="heading">Built for Maine weather.</h2>
  <p slot="lede" class="lede">Three things every crew member signs up for.</p>
  <article slot="items" class="card">…</article>
</feature-grid-3>
```

Heroes use the default slot for `<h1>` + `<p class="lede lede--lg">` + a `.btn-group`; named slots for `eyebrow`, `media`, and optional `proof`.

### README contract (enforced by `src/blocks.test.ts`)

- `## Slots` table: `| \`slot\` | description |`. Descriptions starting with "Optional" mark non-required slots. Every `<slot name>` in the template must appear here and vice-versa; the default slot is documented as `(default)`.
- `## Example` fenced `html` block whose outer tag is `<name …>` and which fills every required slot.
- The flattened example must not leave a stray `<slot>` or nest block elements inside `<p>`.

## Section rhythm

Four useful head patterns. Choose or adapt them to the section's job and surrounding rhythm:

```html
<!-- left-aligned (default for feature / services / process / about / team / blog) -->
<div class="section__head"><slot name="eyebrow"></slot><slot name="heading"></slot><slot name="lede"></slot></div>

<!-- centered (pricing / testimonial / FAQ / CTA cards / contact cards / menu / values / trust) -->
<div class="section__head section__head--center">…</div>

<!-- head + actions on one row (carousels, "All projects" links) -->
<div class="section__head section__head--row"><div>…</div><div class="btn-group">…</div></div>

<!-- editorial split: short label column left, heading + lede right (about / work / interior pages) -->
<div class="section__head section__head--split"><slot name="eyebrow"></slot><slot name="heading"></slot><slot name="lede"></slot></div>
```

`.section__head` supplies a readable default measure and gap. Page-specific CSS may change those values where the composition needs it.

Interior pages need a clear page purpose, one `h1`, and a useful opening. `hero/hero-page`, `hero/hero-service`, and `work/case-header` are starting points; a site-owned opening may fit better. Use `content/prose-split`, `content/list-split`, and `content/glossary` when their structure helps the reader. Plain semantic prose is also valid.

## Spacing, borders, radii

- Prefer semantic spacing tokens. `.grid`, `.split`, and `.card__body` are useful defaults; a site-owned layout may replace them. Control trailing margins so content does not create accidental gaps.
- Border, surface, radius, and elevation follow the selected direction. `.card` variants provide available treatments, not required styling.
- Give media explicit dimensions and a deliberate crop. `.frame` and `.ratio-*` are optional presentation helpers. A hero image that is the LCP candidate should use `fetchpriority="high"`.
- Photo tiles with text over a scrim use `.photo-card` (`<a class="photo-card"><img><div class="photo-card__body"><h3>…</h3><p>…</p></div></a>`). The scrim and light text live in the primitive, so block CSS stays token-only.
- Mosaics (`testimonial-mosaic`, `gallery-mosaic-split`) span tiles with `is-wide` / `is-tall` on the slotted tile. Fill every cell in the example — an empty cell reads as a bug.
- Pill choices in forms use `<fieldset class="chips"><legend>…</legend><label><input type="radio"><span>…</span></label>…</fieldset>`; town lists and jump-navs reuse the same pill look.
- Stats: `.stat` / `.stat__value` (`--step-4`), `.stat--sm` in bands. Prices: `.price` / `.price__amount` / `.price__period`.
- Let long button labels reflow or change the layout so controls remain readable and reachable. On small screens, preserve essential navigation and actions; secondary actions may move into an accessible drawer.

## Mobile

Check blocks at mobile and desktop widths, and at intermediate widths where their content changes. These are examples, not universal geometry rules:

- Photo grids may stack or remain two-up when crop, captions, and tap targets support that choice.
- Stats can stack or pair according to label length and reading order.
- Navbars retain the brand, primary route access, and important actions at narrow widths; drawer transformation is one option.
- Tables must remain understandable and operable on narrow screens. A labeled responsive layout can be preferable to horizontal scrolling.

## Dark bands

Use `variant="dark"` where the block documents it (CTA / footer / quote / stats bands). That remaps tokens locally on the block root — not a global dark theme.

For a dark *panel inside* a light block (founder quote, stat tiles, a CTA tile in a photo grid, the service-hero quote card) put `data-scheme="dark"` on that element — in the template or on the slotted tile. It remaps the same tokens, so `.card`, `.stat`, `.btn-outline` and friends adapt without any hex in block CSS.

## Motion & islands

- Scroll reveal stays on authoring tags (`motion="editorial"`).
- Interactive widgets use `data-island="header|carousel|tabs|before-after|counter|lightbox"`.
- `data-count-to` counts integers only — leave decimals (4.9) as static text.
- No autoplay carousels, no scroll-jacking, no background video autoplay.
- Tabs (`process-stepper`, `testimonial-switcher`, `feature-tabs`) hide panels with the `hidden` attribute. If a panel has its own `display` (e.g. `.photo-card` is flex), add `.c-x__panels > [hidden]{display:none}` or the hidden panel will still render.
- No marquees — not for logos, not for CTA copy (`design-system/MASTER.md`). Use `trust-logos` / `trust-reviews` and a static `cta-band` instead, even when a reference site scrolls them.
- Hover-expanding panels (`services-panels`) must also expand on `:focus-within`, and the first panel is open by default when nothing is hovered.

## Icons

Inline SVG with class `.icon` (see [`icons.md`](icons.md)). Stroke icons, currentColor, 24 viewBox. Filled glyphs (stars, play) set `fill: currentColor; stroke: none` locally.

## Tokens only

Block CSS must use `var(--color-*)`, `var(--space-*)`, `var(--step-*)`, `var(--radius*)`, `var(--shadow-*)`. No raw hex except inside documented dark variants / overlays / scrims that intentionally set a local palette. Use `color-mix(in srgb, var(--color-text) 85%, transparent)` for translucent overlays instead of `#000`.
