# services-cards

Service cards with optional price.

- **Category:** services
- **Media:** card images optional
- **Registers:** trade, beauty, professional, food
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` (one sentence) |
| `actions` | Optional "View all" link/button on the head row |
| `cards` | 3 or 6 `.card.card--interactive` with `.card__media.ratio-4x3`, `<h3>`, `<p>`, optional price line, and a `.btn-arrow` |

## Example

```html
<services-cards>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Services</p>
  <h2 slot="heading">Everything above the gutters.</h2>
  <p slot="lede" class="lede">Repairs, replacements, and the maintenance that keeps you from needing either.</p>
  <a slot="actions" class="btn-outline" href="/services">All services</a>
  <article slot="cards" class="card card--interactive"><div class="card__media ratio-4x3"><img src="/media/harvest/svc-replace.jpg" alt="New architectural shingle roof" width="1200" height="900" loading="lazy"></div><div class="card__body"><h3>Roof replacement</h3><p>Asphalt, metal, and cedar. Full tear-off with deck repair included.</p><p class="c-services-cards__price">From $9,800</p><a class="btn-arrow" href="/services">Learn more</a></div></article>
  <article slot="cards" class="card card--interactive"><div class="card__media ratio-4x3"><img src="/media/harvest/svc-repair.jpg" alt="Repairing flashing around a chimney" width="1200" height="900" loading="lazy"></div><div class="card__body"><h3>Leak repair</h3><p>Same-week diagnosis, most repairs finished in a single visit.</p><p class="c-services-cards__price">From $450</p><a class="btn-arrow" href="/services">Learn more</a></div></article>
  <article slot="cards" class="card card--interactive"><div class="card__media ratio-4x3"><img src="/media/harvest/svc-gutters.jpg" alt="Seamless aluminum gutters" width="1200" height="900" loading="lazy"></div><div class="card__body"><h3>Gutters &amp; guards</h3><p>Seamless aluminum sized to your roof, with guards that actually shed pine needles.</p><p class="c-services-cards__price">From $1,900</p><a class="btn-arrow" href="/services">Learn more</a></div></article>
</services-cards>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
