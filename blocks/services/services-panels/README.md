# services-panels

Horizontal photo panels — the hovered or focused one expands.

- **Category:** services
- **Media:** one photo per service
- **Registers:** professional, beauty, trade
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` (one sentence) |
| `actions` | Optional 1–2 buttons / `.btn-arrow` links |
| `panels` | 4–6 `<a class="photo-card" href><img><div class="photo-card__body"><h3>…</h3><p>…</p></div></a>` |

## Example

```html
<services-panels>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Our services</p>
  <h2 slot="heading">Trusted legal help across five practice areas.</h2>
  <p slot="lede" class="lede">Every business hits moments where good legal advice really matters. Each area is led by a senior partner.</p>
  <a slot="actions" class="btn-arrow" href="/services">All services <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
  <a slot="panels" class="photo-card" href="/services/business-law"><img src="/media/harvest/svc-1.jpg" alt="" width="1200" height="1500" loading="lazy"><div class="photo-card__body"><h3>Business law</h3><p>Contracts, deals, and partnerships that survive the tough conversations.</p></div></a>
  <a slot="panels" class="photo-card" href="/services/disputes"><img src="/media/harvest/svc-2.jpg" alt="" width="1200" height="1500" loading="lazy"><div class="photo-card__body"><h3>Lawsuits &amp; disputes</h3><p>From first filing to final ruling.</p></div></a>
  <a slot="panels" class="photo-card" href="/services/compliance"><img src="/media/harvest/svc-3.jpg" alt="" width="1200" height="1500" loading="lazy"><div class="photo-card__body"><h3>Compliance</h3><p>Steady guidance with regulators.</p></div></a>
  <a slot="panels" class="photo-card" href="/services/ip"><img src="/media/harvest/svc-4.jpg" alt="" width="1200" height="1500" loading="lazy"><div class="photo-card__body"><h3>Intellectual property</h3><p>Patents, secrets, and brands.</p></div></a>
  <a slot="panels" class="photo-card" href="/services/restructuring"><img src="/media/harvest/svc-5.jpg" alt="" width="1200" height="1500" loading="lazy"><div class="photo-card__body"><h3>Restructuring</h3><p>Workouts and creditor protection.</p></div></a>
</services-panels>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
