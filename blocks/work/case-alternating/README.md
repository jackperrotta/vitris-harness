# case-alternating

Numbered case studies alternating photo and copy.

- **Category:** work
- **Media:** one photo per case
- **Registers:** professional, b2b, trade
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` (one sentence) |
| `actions` | Optional 1–2 buttons / `.btn-arrow` links |
| `cases` | 2–4 `<article><div class="frame ratio-4x3"><img></div><div class="stack"><p class="eyebrow">…</p><h3>…</h3><p>…</p><a class="btn-outline">…</a></div></article>` |

## Example

```html
<case-alternating>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Featured case studies</p>
  <h2 slot="heading">Real cases. Real results for our clients.</h2>
  <p slot="lede" class="lede">A look at recent work across our service areas. Some names are kept private to respect client confidentiality.</p>
  <a slot="actions" class="btn-arrow" href="/case-studies">All case studies <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
  <article slot="cases"><div class="frame ratio-4x3"><img src="/media/harvest/case-1.jpg" alt="Wind turbines beside an office park" width="1200" height="900" loading="lazy"></div><div class="stack"><p class="eyebrow">Case 01 · 2026 · Energy</p><h3>Helped a large energy company defeat a price-fixing lawsuit.</h3><p>The court refused to group the customers into a class, and threw the case out for good.</p><a class="btn-outline" href="/case-studies/energy">Read the full case study <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a></div></article>
  <article slot="cases"><div class="frame ratio-4x3"><img src="/media/harvest/case-2.jpg" alt="Two lawyers reviewing documents on marble steps" width="1200" height="900" loading="lazy"></div><div class="stack"><p class="eyebrow">Case 02 · 2025 · Technology</p><h3>Defended a US tech company against a patent troll.</h3><p>No products were blocked, and we settled on terms that worked for our client.</p><a class="btn-outline" href="/case-studies/technology">Read the full case study <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a></div></article>
  <article slot="cases"><div class="frame ratio-4x3"><img src="/media/harvest/case-3.jpg" alt="Newsroom desks at night" width="1200" height="900" loading="lazy"></div><div class="stack"><p class="eyebrow">Case 03 · 2025 · Media</p><h3>Won a copyright trial for an independent publisher.</h3><p>A jury verdict in nine days, and a permanent injunction that protected the catalogue.</p><a class="btn-outline" href="/case-studies/media">Read the full case study <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a></div></article>
</case-alternating>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
