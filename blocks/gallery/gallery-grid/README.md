# gallery-grid

Responsive photo grid.

- **Category:** gallery
- **Media:** photos
- **Registers:** trade, beauty, food
- **Variants:** four

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` |
| `actions` | Optional link (e.g. "All projects") |
| `items` | 6 or 9 `<button class="c-gallery-grid__tile ratio-1x1" data-lightbox-src data-lightbox-alt>` each wrapping an `<img>` |

## Example

```html
<gallery-grid>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Recent work</p>
  <h2 slot="heading">Roofs we finished this season</h2>
  <p slot="lede" class="lede">Tap any photo to enlarge.</p>
  <a slot="actions" class="btn-outline" href="/work">All projects</a>
  <button slot="items" type="button" class="c-gallery-grid__tile ratio-1x1" data-lightbox-src="/media/harvest/g1.jpg" data-lightbox-alt="Standing-seam metal roof, Falmouth"><img src="/media/harvest/g1.jpg" alt="Standing-seam metal roof, Falmouth" width="1200" height="1200" loading="lazy"></button>
  <button slot="items" type="button" class="c-gallery-grid__tile ratio-1x1" data-lightbox-src="/media/harvest/g2.jpg" data-lightbox-alt="Architectural shingles, Deering"><img src="/media/harvest/g2.jpg" alt="Architectural shingles, Deering" width="1200" height="1200" loading="lazy"></button>
  <button slot="items" type="button" class="c-gallery-grid__tile ratio-1x1" data-lightbox-src="/media/harvest/g3.jpg" data-lightbox-alt="Cedar shake, Cape Elizabeth"><img src="/media/harvest/g3.jpg" alt="Cedar shake, Cape Elizabeth" width="1200" height="1200" loading="lazy"></button>
  <button slot="items" type="button" class="c-gallery-grid__tile ratio-1x1" data-lightbox-src="/media/harvest/g4.jpg" data-lightbox-alt="Copper bay window roof, West End"><img src="/media/harvest/g4.jpg" alt="Copper bay window roof, West End" width="1200" height="1200" loading="lazy"></button>
  <button slot="items" type="button" class="c-gallery-grid__tile ratio-1x1" data-lightbox-src="/media/harvest/g5.jpg" data-lightbox-alt="Flat EPDM roof, Bayside"><img src="/media/harvest/g5.jpg" alt="Flat EPDM roof, Bayside" width="1200" height="1200" loading="lazy"></button>
  <button slot="items" type="button" class="c-gallery-grid__tile ratio-1x1" data-lightbox-src="/media/harvest/g6.jpg" data-lightbox-alt="Slate repair, Munjoy Hill"><img src="/media/harvest/g6.jpg" alt="Slate repair, Munjoy Hill" width="1200" height="1200" loading="lazy"></button>
</gallery-grid>
```

Variants: `<gallery-grid variant="four">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
