# services-packages

Tiered packages / retainers.

- **Category:** services
- **Media:** none
- **Registers:** b2b, professional, trade
- **Variants:** highlight-mid

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` (one sentence) |
| `cards` | 3 `.card` tiers: `<h3>`, `.price`, `<p>`, `<ul class="list-check">`, button. Add `card--accent` to the recommended tier (or use the `highlight-mid` variant). |

## Example

```html
<services-packages>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Maintenance plans</p>
  <h2 slot="heading">Pick a plan. We'll keep the building running.</h2>
  <p slot="lede" class="lede">All plans include priority scheduling and no overtime rates.</p>
  <div slot="cards" class="card"><div class="card__body"><h3>Essential</h3><p class="price"><span class="price__amount">$89</span><span class="price__period">/unit · yr</span></p><p>Two visits a year for buildings with newer equipment.</p><ul class="list-check"><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Spring &amp; fall tune-ups</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Filter changes included</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>10% off repairs</li></ul><a class="btn-outline" href="/contact">Choose Essential</a></div></div>
  <div slot="cards" class="card card--accent"><div class="card__body"><h3>Standard</h3><p class="price"><span class="price__amount">$149</span><span class="price__period">/unit · yr</span></p><p>Quarterly visits and faster response for mixed-age systems.</p><ul class="list-check"><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Four visits a year</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>4-hour emergency response</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>15% off repairs</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Photo report after every visit</li></ul><a class="btn" href="/contact">Choose Standard</a></div></div>
  <div slot="cards" class="card"><div class="card__body"><h3>Complete</h3><p class="price"><span class="price__amount">$229</span><span class="price__period">/unit · yr</span></p><p>Everything covered, including parts on scheduled visits.</p><ul class="list-check"><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Monthly visits</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>2-hour emergency response</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Parts on maintenance visits</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Annual lifecycle plan</li></ul><a class="btn-outline" href="/contact">Choose Complete</a></div></div>
</services-packages>
```

Variants: `<services-packages variant="highlight-mid">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
