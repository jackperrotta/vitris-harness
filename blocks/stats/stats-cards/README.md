# stats-cards

Metric cards with labels.

- **Category:** stats
- **Media:** none
- **Registers:** b2b, trade
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` (one sentence) |
| `cards` | 3 `.card` items with a `.stat` and optional `<p>` detail |

## Example

```html
<stats-cards>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">By the numbers</p>
  <h2 slot="heading">What a year of maintenance looks like</h2>
  <div slot="cards" class="card"><div class="card__body"><div class="stat"><p class="stat__value" data-count-to="312">312</p><p class="stat__label">Units under contract</p></div><p>Across 41 buildings from Kittery to Brunswick.</p></div></div>
  <div slot="cards" class="card"><div class="card__body"><div class="stat"><p class="stat__value" data-count-to="97" data-count-suffix="%">97%</p><p class="stat__label">Issues caught on a scheduled visit</p></div><p>Only 3% of last year's repairs were emergency calls.</p></div></div>
  <div slot="cards" class="card"><div class="card__body"><div class="stat"><p class="stat__value">2.6h</p><p class="stat__label">Median emergency response</p></div><p>Against a 4-hour contractual promise.</p></div></div>
</stats-cards>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
