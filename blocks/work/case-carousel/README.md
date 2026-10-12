# case-carousel

One case per slide: copy left, image right, arrow nav.

- **Category:** work
- **Media:** one photo per case
- **Registers:** b2b, professional, beauty
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `slides` | 3–5 `<article><div class="stack"><p class="eyebrow">…</p><h2>…</h2><p>…</p><a class="btn-arrow">…</a></div><div class="frame ratio-4x3"><img></div></article>` |

## Example

```html
<case-carousel>
  <article slot="slides"><div class="stack"><p class="eyebrow eyebrow--accent">Nextdock · Identity</p><h2>From idea to launch: how we gave Nextdock a bold identity.</h2><p>We worked with Nextdock from their earliest sketches, creating a logo that reflects speed and innovation. The new identity helped them secure their first round of investment.</p><a class="btn-arrow" href="/work/nextdock">See the project <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a></div><div class="frame ratio-4x3"><img src="/media/harvest/work-1.jpg" alt="Nextdock wordmark on a dark billboard" width="1200" height="900" loading="lazy"></div></article>
  <article slot="slides"><div class="stack"><p class="eyebrow eyebrow--accent">Neobase · Rebrand</p><h2>Rebranding success: a legacy brand for modern markets.</h2><p>A complete visual overhaul that kept the brand's heritage while appealing to a new generation of buyers.</p><a class="btn-arrow" href="/work/neobase">See the project <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a></div><div class="frame ratio-4x3"><img src="/media/harvest/work-2.jpg" alt="Neobase mark applied to a car wrap" width="1200" height="900" loading="lazy"></div></article>
  <article slot="slides"><div class="stack"><p class="eyebrow eyebrow--accent">Charter · Identity</p><h2>From concept to market: a timeless brand identity.</h2><p>Working with a mission-driven company from their earliest stages, we created a mark that reflects their values of sustainability and craft.</p><a class="btn-arrow" href="/work/charter">See the project <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a></div><div class="frame ratio-4x3"><img src="/media/harvest/work-3.jpg" alt="Charter logo embossed on packaging" width="1200" height="900" loading="lazy"></div></article>
</case-carousel>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
