# hero-split

50/50 copy + media; default trade/home-service hero.

- **Category:** hero
- **Media:** photo or illustration LCP
- **Registers:** trade, beauty, food, professional
- **Variants:** reverse, dark

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | `<p class="eyebrow">` short category or location line |
| `(default)` | `<h1>` + `<p class="lede lede--lg">` (one sentence) |
| `actions` | 1–2 buttons (`btn btn-lg` primary, `btn-outline btn-lg` secondary) |
| `proof` | Optional `.byline` with avatars + rating text |
| `media` | LCP `<img>` with `fetchpriority="high"`, width/height set |

## Example

```html
<hero-split>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Roofing · Portland, ME</p>
  <h1>Roofs that outlast the weather they were built for.</h1>
  <p class="lede lede--lg">Licensed, insured, and local since 2009. Written estimates in 48 hours, workmanship guaranteed for ten years.</p>
  <a slot="actions" class="btn btn-lg" href="/contact">Get a free estimate</a>
  <a slot="actions" class="btn-outline btn-lg" href="/work">See our work</a>
  <div slot="proof" class="byline"><div class="avatar-group"><img src="/media/harvest/review-1.jpg" alt="" width="96" height="96" class="avatar avatar--sm"><img src="/media/harvest/review-2.jpg" alt="" width="96" height="96" class="avatar avatar--sm"><img src="/media/harvest/review-3.jpg" alt="" width="96" height="96" class="avatar avatar--sm"></div><div><span class="rating" aria-label="5 out of 5 stars"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg></span><span> 4.9 from 212 local reviews</span></div></div>
  <img src="/media/harvest/hero-roof.jpg" alt="Crew finishing a standing-seam metal roof" width="1600" height="1200" slot="media" fetchpriority="high">
</hero-split>
```

Variants: `<hero-split variant="reverse">` (also: `dark`).

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
