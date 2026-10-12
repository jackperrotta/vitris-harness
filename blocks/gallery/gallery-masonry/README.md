# gallery-masonry

Mixed aspect gallery.

- **Category:** gallery
- **Media:** photos
- **Registers:** beauty, food, trade
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` |
| `items` | 5–8 `<figure class="frame">` tiles with `bento__wide` / `bento__tall` / `bento__narrow` spans and an `<img>` each; optional `<figcaption>` |

## Example

```html
<gallery-masonry>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">The space</p>
  <h2 slot="heading">Come see the salon</h2>
  <figure slot="items" class="frame bento__wide bento__tall"><img src="/media/harvest/salon-1.jpg" alt="Main floor with six chairs" width="1600" height="1600" loading="lazy"><figcaption>Main floor</figcaption></figure>
  <figure slot="items" class="frame bento__narrow"><img src="/media/harvest/salon-2.jpg" alt="Color bar" width="900" height="900" loading="lazy"><figcaption>Color bar</figcaption></figure>
  <figure slot="items" class="frame bento__narrow"><img src="/media/harvest/salon-3.jpg" alt="Wash stations" width="900" height="900" loading="lazy"><figcaption>Wash</figcaption></figure>
  <figure slot="items" class="frame"><img src="/media/harvest/salon-4.jpg" alt="Product wall" width="1200" height="900" loading="lazy"><figcaption>Retail</figcaption></figure>
  <figure slot="items" class="frame"><img src="/media/harvest/salon-5.jpg" alt="Waiting area" width="1200" height="900" loading="lazy"><figcaption>Lounge</figcaption></figure>
</gallery-masonry>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
