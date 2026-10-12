# gallery-carousel

Full-bleed project carousel.

- **Category:** gallery
- **Media:** photos
- **Registers:** trade, beauty, food
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` |
| `items` | 4–8 `<figure>` slides: `.frame.ratio-16x9` with `<img>`, then `<figcaption>` |

## Example

```html
<gallery-carousel>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Projects</p>
  <h2 slot="heading">A few from the last twelve months</h2>
  <figure slot="items"><div class="frame ratio-16x9"><img src="/media/harvest/p1.jpg" alt="Standing-seam roof on a farmhouse" width="1600" height="900" loading="lazy"></div><figcaption><strong>Falmouth farmhouse</strong>Standing-seam metal, 3 days</figcaption></figure>
  <figure slot="items"><div class="frame ratio-16x9"><img src="/media/harvest/p2.jpg" alt="Shingle roof on a colonial" width="1600" height="900" loading="lazy"></div><figcaption><strong>Deering colonial</strong>Architectural shingles, 2 days</figcaption></figure>
  <figure slot="items"><div class="frame ratio-16x9"><img src="/media/harvest/p3.jpg" alt="Cedar shake roof near the ocean" width="1600" height="900" loading="lazy"></div><figcaption><strong>Cape Elizabeth</strong>Cedar shake, 5 days</figcaption></figure>
  <figure slot="items"><div class="frame ratio-16x9"><img src="/media/harvest/p4.jpg" alt="Flat roof on a commercial building" width="1600" height="900" loading="lazy"></div><figcaption><strong>Bayside warehouse</strong>EPDM flat roof, 4 days</figcaption></figure>
</gallery-carousel>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
