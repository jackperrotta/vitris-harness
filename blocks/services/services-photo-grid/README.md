# services-photo-grid

Photo tiles with the service name over a scrim; optional dark CTA tile.

- **Category:** services
- **Media:** one photo per service
- **Registers:** trade, professional, beauty
- **Variants:** four

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` (one sentence) |
| `actions` | Optional 1–2 buttons / `.btn-arrow` links |
| `tiles` | 3–8 `<a class="photo-card" href><img><div class="photo-card__body"><h3>…</h3><p>…</p></div></a>`; optionally one `<div class="card" data-scheme="dark">` CTA tile |

## Example

```html
<services-photo-grid>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">What we do</p>
  <h2 slot="heading">When we put our name on a case, we mean it.</h2>
  <p slot="lede" class="lede">Five practice areas, one standard — honest, careful, and ours.</p>
  <a slot="actions" class="btn-arrow" href="/services">All practice areas <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
  <a slot="tiles" class="photo-card" href="/services/business-law"><img src="/media/harvest/svc-1.jpg" alt="" width="1200" height="900" loading="lazy"><div class="photo-card__body"><h3>Business law</h3><p>Contracts, deals, and partnerships.</p></div></a>
  <a slot="tiles" class="photo-card" href="/services/disputes"><img src="/media/harvest/svc-2.jpg" alt="" width="1200" height="900" loading="lazy"><div class="photo-card__body"><h3>Lawsuits &amp; disputes</h3><p>From first filing to final ruling.</p></div></a>
  <a slot="tiles" class="photo-card" href="/services/compliance"><img src="/media/harvest/svc-3.jpg" alt="" width="1200" height="900" loading="lazy"><div class="photo-card__body"><h3>Compliance &amp; rules</h3><p>Steady guidance with regulators.</p></div></a>
  <a slot="tiles" class="photo-card" href="/services/ip"><img src="/media/harvest/svc-4.jpg" alt="" width="1200" height="900" loading="lazy"><div class="photo-card__body"><h3>Intellectual property</h3><p>Patents, secrets, and brands.</p></div></a>
  <a slot="tiles" class="photo-card" href="/services/restructuring"><img src="/media/harvest/svc-5.jpg" alt="" width="1200" height="900" loading="lazy"><div class="photo-card__body"><h3>Restructuring &amp; recovery</h3><p>Workouts and creditor protection.</p></div></a>
  <div slot="tiles" class="card" data-scheme="dark"><div class="card__body"><h3>Meet the team behind the verdicts.</h3><a class="btn-arrow" href="/team">Our people <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a></div></div>
</services-photo-grid>
```

Variants: `<services-photo-grid variant="four">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
