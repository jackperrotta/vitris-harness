# gallery-mosaic-split

Copy beside a photo mosaic with one quote tile mixed in.

- **Category:** gallery
- **Media:** 5–6 photos
- **Registers:** trade, beauty, food
- **Variants:** reverse

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` (one sentence) |
| `actions` | Optional 1–2 buttons / `.btn-arrow` links |
| `tiles` | 5–7 `<div class="frame"><img></div>` tiles (add `is-tall` to one or two) and optionally one `<figure class="card">` quote tile |

## Example

```html
<gallery-mosaic-split>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Recent work</p>
  <h2 slot="heading">Across Greater Portland.</h2>
  <p slot="lede" class="lede">Every roof gets the same care: a clean tear-off, solid decking, and photos of the finished job for your records.</p>
  <a slot="actions" class="btn" href="/contact">Get a free estimate</a>
  <a slot="actions" class="btn-arrow" href="/work">View our work <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
  <div slot="tiles" class="frame is-tall"><img src="/media/harvest/rw-1.jpg" alt="Finished slate-grey roof from above" width="900" height="1200" loading="lazy"></div>
  <div slot="tiles" class="frame"><img src="/media/harvest/rw-2.jpg" alt="Crew member fastening drip edge" width="1200" height="900" loading="lazy"></div>
  <figure slot="tiles" class="card"><blockquote class="card__body"><p class="quote quote--card">“They tarped the roof the same night the hail hit, and new shingles were on ten days later.”</p></blockquote><figcaption class="card__footer byline"><div><strong>Dana W.</strong><span>Yarmouth</span></div></figcaption></figure>
  <div slot="tiles" class="frame"><img src="/media/harvest/rw-3.jpg" alt="Farmhouse with new standing-seam roof" width="1200" height="900" loading="lazy"></div>
  <div slot="tiles" class="frame"><img src="/media/harvest/rw-4.jpg" alt="Cedar shake detail" width="1200" height="900" loading="lazy"></div>
  <div slot="tiles" class="frame"><img src="/media/harvest/rw-5.jpg" alt="Crew on a ridge line at sunset" width="1200" height="900" loading="lazy"></div>
</gallery-mosaic-split>
```

Variants: `<gallery-mosaic-split variant="reverse">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
