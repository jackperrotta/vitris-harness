# stats-row

Inline four metrics.

- **Category:** stats
- **Media:** none
- **Registers:** trade, b2b, professional
- **Variants:** dark

## Slots

| Slot | Content |
|------|---------|
| `stats` | 3–4 `.stat` blocks (`data-count-to` optional) |

## Example

```html
<stats-row>
  <div slot="stats" class="stat"><p class="stat__value" data-count-to="1200" data-count-suffix="+">1200+</p><p class="stat__label">Roofs replaced</p></div>
  <div slot="stats" class="stat"><p class="stat__value" data-count-to="15">15</p><p class="stat__label">Years in Portland</p></div>
  <div slot="stats" class="stat"><p class="stat__value">4.9</p><p class="stat__label">Average rating</p></div>
  <div slot="stats" class="stat"><p class="stat__value" data-count-to="48" data-count-suffix="h">48h</p><p class="stat__label">Estimate turnaround</p></div>
</stats-row>
```

Variants: `<stats-row variant="dark">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
