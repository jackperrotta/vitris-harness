# nav-split

Sticky blurred header: logo left, links center-right, filled CTA.

- **Category:** navbar
- **Media:** logo optional
- **Registers:** trade, beauty, b2b, food, professional
- **Variants:** static

## Slots

| Slot | Content |
|------|---------|
| `brand` | Business name text or `<img>` logo (≤2rem tall) |
| `links` | 3–5 `<a>` primary links (repeated in the drawer) |
| `actions` | 1–2 buttons; first is the primary CTA and stays visible on mobile |

## Example

```html
<nav-split>
  <span slot="brand">Harbor Roofing</span>
  <a slot="links" href="/services">Services</a>
  <a slot="links" href="/work">Our work</a>
  <a slot="links" href="/about">About</a>
  <a slot="links" href="/contact">Contact</a>
  <a slot="actions" class="btn" href="/contact">Free estimate</a>
  <a slot="actions" class="btn-ghost" href="tel:+15550102000">(555) 010-2000</a>
</nav-split>
```

Variants: `<nav-split variant="static">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
