# feature-thumb-list

Copy + large photo beside a stack of thumbnail cards.

- **Category:** feature
- **Media:** one hero photo + 3–4 thumbnails
- **Registers:** trade, b2b, beauty
- **Variants:** dark, reverse

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` (one sentence) |
| `actions` | Optional 1–2 buttons / `.btn-arrow` links |
| `media` | Optional `<img>` (4:3) shown under the copy |
| `items` | 3–4 `<article class="card"><img> <div class="card__body"><h3>…</h3><p>…</p></div></article>` |

## Example

```html
<feature-thumb-list>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">What you're buying</p>
  <h2 slot="heading">More than shingles. It's a system.</h2>
  <p slot="lede" class="lede">Every roof we build is engineered as a whole — decking, underlayment, flashing, and ventilation — so it holds up for decades, not a few years.</p>
  <a slot="actions" class="btn-arrow" href="/process">How we build it <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
  <img src="/media/harvest/roof-layers.jpg" alt="Cross-section of roof layers on a job site" width="1200" height="900" slot="media" loading="lazy">
  <article slot="items" class="card"><img src="/media/harvest/thumb-shingle.jpg" alt="" width="240" height="240" loading="lazy"><div class="card__body"><h3>Built to last</h3><p>Thick, impact-rated shingles built to take hail and high wind.</p></div></article>
  <article slot="items" class="card"><img src="/media/harvest/thumb-flashing.jpg" alt="" width="240" height="240" loading="lazy"><div class="card__body"><h3>Locked down tight</h3><p>Metal flashing seals every roof-to-wall seam against wind and rain.</p></div></article>
  <article slot="items" class="card"><img src="/media/harvest/thumb-ridge.jpg" alt="" width="240" height="240" loading="lazy"><div class="card__body"><h3>Holds its line</h3><p>A crisp, dead-straight ridge line — true from the road and true up close.</p></div></article>
</feature-thumb-list>
```

Variants: `<feature-thumb-list variant="dark">` (also: `reverse`).

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
