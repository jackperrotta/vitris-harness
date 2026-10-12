# hero-before-after

Trade showcase with draggable before/after beside copy.

- **Category:** hero
- **Media:** paired before/after photos
- **Registers:** trade
- **Variants:** reverse

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Short line above headline |
| `(default)` | `<h1>` + `<p class="lede lede--lg">` |
| `actions` | 1–2 buttons |
| `before` | `<img class="before-after__before">` (same crop as after) |
| `after` | `<img class="before-after__after">` |
| `caption` | Optional one-line caption under the slider |

## Example

```html
<hero-before-after>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Exterior painting · Cape Elizabeth</p>
  <h1>Drag to see what a weekend with us looks like.</h1>
  <p class="lede lede--lg">Prep is 70% of the job. We scrape, prime, and caulk before a drop of color goes on — that's why our finishes last.</p>
  <a slot="actions" class="btn btn-lg" href="/contact">Get a free estimate</a>
  <a slot="actions" class="btn-outline btn-lg" href="/work">See our work</a>
  <img src="/media/harvest/house-before.jpg" alt="Weathered gray siding before painting" width="1600" height="1000" slot="before" class="before-after__before" fetchpriority="high">
  <img src="/media/harvest/house-after.jpg" alt="Same house freshly painted in warm white" width="1600" height="1000" slot="after" class="before-after__after">
  <span slot="caption">Ocean House Rd · completed in 3 days</span>
</hero-before-after>
```

Variants: `<hero-before-after variant="reverse">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
