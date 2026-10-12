# hero-video-still

Poster still with play affordance linking to content clip — never autoplay bg.

- **Category:** hero
- **Media:** poster still
- **Registers:** beauty, food, b2b
- **Variants:** center

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Short line above headline |
| `(default)` | `<h1>` + `<p class="lede lede--lg">` |
| `actions` | 1–2 buttons |
| `media` | Poster `<img>` (21:9 crop) |
| `play-label` | Short label next to the play icon; set the play link `href` in the template when you copy the block |

## Example

```html
<hero-video-still>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Farm-to-table · Freeport</p>
  <h1>Dinner starts in the field at 6 a.m.</h1>
  <p class="lede lede--lg">A 40-seat dining room, a five-acre garden, and a menu that changes when the weather does.</p>
  <a slot="actions" class="btn btn-lg" href="/reserve">Reserve a table</a>
  <a slot="actions" class="btn-outline btn-lg" href="/menu">Tonight's menu</a>
  <img src="/media/harvest/kitchen-still.jpg" alt="Cooks plating at the pass" width="2100" height="900" slot="media" fetchpriority="high">
  <span slot="play-label">Watch the 60-second tour</span>
</hero-video-still>
```

Variants: `<hero-video-still variant="center">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
