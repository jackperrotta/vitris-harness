# feature-stats-band

Four stats with optional count-up.

- **Category:** feature
- **Media:** none
- **Registers:** trade, b2b, professional
- **Variants:** dark

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` (one sentence) |
| `stats` | 3–4 `.stat` blocks; add `data-count-to` on `.stat__value` for count-up |

## Example

```html
<feature-stats-band>
  <h2 slot="heading">Fifteen years, one zip code at a time.</h2>
  <div slot="stats" class="stat"><p class="stat__value" data-count-to="1200" data-count-suffix="+">1200+</p><p class="stat__label">Roofs replaced</p></div>
  <div slot="stats" class="stat"><p class="stat__value" data-count-to="15">15</p><p class="stat__label">Years in Portland</p></div>
  <div slot="stats" class="stat"><p class="stat__value" data-count-to="98" data-count-suffix="%">98%</p><p class="stat__label">Would hire again</p></div>
  <div slot="stats" class="stat"><p class="stat__value" data-count-to="0">0</p><p class="stat__label">Subcontractors</p></div>
</feature-stats-band>
```

Variants: `<feature-stats-band variant="dark">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
