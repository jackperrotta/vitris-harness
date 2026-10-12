# hero-overlay

Full-bleed photo with scrim and dual CTAs — immersive home default.

- **Category:** hero
- **Media:** darker LCP photo
- **Registers:** trade, beauty, food
- **Variants:** tall, center

## Slots

| Slot | Content |
|------|---------|
| `media` | Full-bleed LCP `<img>` (dark or mid-tone subject) |
| `eyebrow` | Short line above the headline |
| `(default)` | `<h1>` + `<p class="lede lede--lg">` |
| `actions` | 1–2 buttons |
| `proof` | Optional `.byline` proof row |

## Example

```html
<hero-overlay>
  <img src="/media/harvest/hero-storefront.jpg" alt="Evening view of the shop front" width="2000" height="1250" slot="media" fetchpriority="high">
  <p slot="eyebrow" class="eyebrow">Portland's East End · Est. 2011</p>
  <h1>Good bread, honest coffee, no fuss.</h1>
  <p class="lede lede--lg">Sourdough out of the oven at 7, sandwiches at 11, closed when we sell out.</p>
  <a slot="actions" class="btn btn-lg" href="/menu">See today's menu</a>
  <a slot="actions" class="btn-outline btn-lg" href="/order">Order ahead</a>
</hero-overlay>
```

Variants: `<hero-overlay variant="tall">` (also: `center`).

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
