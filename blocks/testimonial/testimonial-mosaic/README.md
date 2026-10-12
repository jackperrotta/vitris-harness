# testimonial-mosaic

Bento of quote cards, stat tiles, and portraits.

- **Category:** testimonial
- **Media:** 2–3 portraits
- **Registers:** professional, b2b, beauty
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` (one sentence) |
| `tiles` | 6–9 tiles: `<figure class="card">` quotes (add `data-scheme="dark"` to one), `<div class="card card--flat"><div class="card__body stat">…</div></div>` stats, `<div class="frame"><img></div>` portraits; add `is-wide` / `is-tall` to span |

## Example

```html
<testimonial-mosaic>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Testimonials</p>
  <h2 slot="heading">What our clients say.</h2>
  <p slot="lede" class="lede">Most of our work stays private. With permission, these are some of the clients we've helped — in their own words.</p>
  <figure slot="tiles" class="card is-wide"><blockquote class="card__body"><p class="quote quote--card">“Three other firms told us this would be a multi-year discovery slog. Verdict took it apart at the threshold. That is the difference.”</p></blockquote><figcaption class="card__footer byline"><img src="/media/harvest/avatar-5.jpg" alt="" width="96" height="96" class="avatar"><div><strong>Catherine Anderson</strong><span>General Counsel, Fortune 100 producer</span></div></figcaption></figure>
  <div slot="tiles" class="frame"><img src="/media/harvest/portrait-1.jpg" alt="Client portrait" width="900" height="900" loading="lazy"></div>
  <div slot="tiles" class="card card--flat"><div class="card__body stat"><p class="stat__value">$1.2B</p><p class="stat__label">Client money protected and recovered</p></div></div>
  <div slot="tiles" class="card card--flat"><div class="card__body stat"><p class="stat__value">47</p><p class="stat__label">Trials won at verdict</p></div></div>
  <figure slot="tiles" class="card is-wide" data-scheme="dark"><blockquote class="card__body"><p class="quote quote--card">“They were ready in two weeks. The other side needed two months, and it showed in court.”</p></blockquote><figcaption class="card__footer byline"><div><strong>Luis Escobar</strong><span>Founder, Meridian</span></div></figcaption></figure>
  <div slot="tiles" class="frame"><img src="/media/harvest/portrait-2.jpg" alt="Client portrait" width="900" height="900" loading="lazy"></div>
  <figure slot="tiles" class="card is-wide"><blockquote class="card__body"><p class="quote quote--card">“Honest from day one. They told us which fights were worth having and which weren't — and they were right every time.”</p></blockquote><figcaption class="card__footer byline"><img src="/media/harvest/avatar-6.jpg" alt="" width="96" height="96" class="avatar"><div><strong>Marco Delgado</strong><span>CEO, Delgado Foods</span></div></figcaption></figure>
  <div slot="tiles" class="card card--flat"><div class="card__body stat"><p class="stat__value">100%</p><p class="stat__label">Partner-led from first call</p></div></div>
  <figure slot="tiles" class="card"><blockquote class="card__body"><p class="quote quote--card">“The estimate was the invoice.”</p></blockquote><figcaption class="card__footer byline"><div><strong>Priya Raman</strong><span>Owner, Raman Dental</span></div></figcaption></figure>
</testimonial-mosaic>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
