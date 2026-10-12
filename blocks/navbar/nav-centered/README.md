# nav-centered

Centered mark with flanking link clusters — beauty / premium.

- **Category:** navbar
- **Media:** logo preferred
- **Registers:** beauty, food, professional
- **Variants:** static

## Slots

| Slot | Content |
|------|---------|
| `links-left` | 2–3 `<a>` links shown left of the brand |
| `brand` | Wordmark or logo (centered) |
| `links-right` | 1–2 `<a>` links shown right of the brand |
| `actions` | Primary CTA button (right edge) |

## Example

```html
<nav-centered>
  <a slot="links-left" href="/services">Services</a>
  <a slot="links-left" href="/gallery">Gallery</a>
  <a slot="links-left" href="/team">Team</a>
  <span slot="brand">Maison Lune</span>
  <a slot="links-right" href="/about">About</a>
  <a slot="links-right" href="/contact">Visit</a>
  <a slot="actions" class="btn" href="/book">Book now</a>
</nav-centered>
```

Variants: `<nav-centered variant="static">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
