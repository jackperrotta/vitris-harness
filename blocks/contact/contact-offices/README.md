# contact-offices

One card per location: map still, address, phone, email.

- **Category:** contact
- **Media:** map or storefront still per office
- **Registers:** professional, b2b, trade
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` (one sentence) |
| `offices` | 2–4 `<article class="card"><div class="card__media ratio-4x3"><img></div><div class="card__body"><h3>City</h3><p>Address</p><p><a href="tel:">…</a><br><a href="mailto:">…</a></p></div></article>` |

## Example

```html
<contact-offices>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Our offices</p>
  <h2 slot="heading">Senior counsel on the ground in each jurisdiction.</h2>
  <p slot="lede" class="lede">Walk in, write in, or call — the response is the same.</p>
  <article slot="offices" class="card"><div class="card__media ratio-4x3"><img src="/media/harvest/map-ny.jpg" alt="Map of lower Manhattan" width="1200" height="900" loading="lazy"></div><div class="card__body"><h3>New York</h3><p>One Liberty Plaza<br>New York, NY 10006</p><p><a href="tel:+12125550142">+1 (212) 555-0142</a><br><a href="mailto:newyork@verdict.example">newyork@verdict.example</a></p></div></article>
  <article slot="offices" class="card"><div class="card__media ratio-4x3"><img src="/media/harvest/map-dc.jpg" alt="Map of downtown Washington" width="1200" height="900" loading="lazy"></div><div class="card__body"><h3>Washington, D.C.</h3><p>900 17th Street NW<br>Washington, D.C. 20006</p><p><a href="tel:+12025550188">+1 (202) 555-0188</a><br><a href="mailto:dc@verdict.example">dc@verdict.example</a></p></div></article>
  <article slot="offices" class="card"><div class="card__media ratio-4x3"><img src="/media/harvest/map-london.jpg" alt="Map of the City of London" width="1200" height="900" loading="lazy"></div><div class="card__body"><h3>London</h3><p>30 St Mary Axe<br>London EC3A 8BF</p><p><a href="tel:+442079460500">+44 20 7946 0500</a><br><a href="mailto:london@verdict.example">london@verdict.example</a></p></div></article>
</contact-offices>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
