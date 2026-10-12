# services-carousel

Buttoned carousel for 4+ services.

- **Category:** services
- **Media:** card media
- **Registers:** trade, beauty, food
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` (one sentence) |
| `cards` | 4–8 `.card` slides with `.card__media.ratio-4x3`, `<h3>`, `<p>` |

## Example

```html
<services-carousel>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Services</p>
  <h2 slot="heading">Cut, color, and everything in between.</h2>
  <p slot="lede" class="lede">Swipe or use the arrows.</p>
  <article slot="cards" class="card card--interactive"><div class="card__media ratio-4x3"><img src="/media/harvest/cut.jpg" alt="Precision haircut" width="1200" height="900" loading="lazy"></div><div class="card__body"><h3>Cuts</h3><p>Consultation, wash, cut, and a blow-dry finish. From $65.</p></div></article>
  <article slot="cards" class="card card--interactive"><div class="card__media ratio-4x3"><img src="/media/harvest/balayage.jpg" alt="Balayage highlights" width="1200" height="900" loading="lazy"></div><div class="card__body"><h3>Balayage</h3><p>Hand-painted, low-maintenance dimension. From $220.</p></div></article>
  <article slot="cards" class="card card--interactive"><div class="card__media ratio-4x3"><img src="/media/harvest/gloss.jpg" alt="Gloss treatment" width="1200" height="900" loading="lazy"></div><div class="card__body"><h3>Gloss &amp; toner</h3><p>Refresh tone between color appointments. From $55.</p></div></article>
  <article slot="cards" class="card card--interactive"><div class="card__media ratio-4x3"><img src="/media/harvest/treatment.jpg" alt="Deep conditioning treatment" width="1200" height="900" loading="lazy"></div><div class="card__body"><h3>Treatments</h3><p>Bond repair and scalp care, 30 minutes. From $45.</p></div></article>
  <article slot="cards" class="card card--interactive"><div class="card__media ratio-4x3"><img src="/media/harvest/updo.jpg" alt="Bridal updo" width="1200" height="900" loading="lazy"></div><div class="card__body"><h3>Event styling</h3><p>Bridal and occasion hair, on-site available. From $120.</p></div></article>
</services-carousel>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
