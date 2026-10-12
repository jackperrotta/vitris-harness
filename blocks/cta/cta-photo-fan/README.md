# cta-photo-fan

Fanned polaroid photos over a centered closing CTA.

- **Category:** cta
- **Media:** 5 square photos
- **Registers:** trade, beauty, food
- **Variants:** muted

## Slots

| Slot | Content |
|------|---------|
| `photos` | 5 square `<img>` (~480px), decorative |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` |
| `actions` | 1–2 buttons |

## Example

```html
<cta-photo-fan>
  <img src="/media/harvest/fan-1.jpg" alt="" width="480" height="480" slot="photos" loading="lazy">
  <img src="/media/harvest/fan-2.jpg" alt="" width="480" height="480" slot="photos" loading="lazy">
  <img src="/media/harvest/fan-3.jpg" alt="" width="480" height="480" slot="photos" loading="lazy">
  <img src="/media/harvest/fan-4.jpg" alt="" width="480" height="480" slot="photos" loading="lazy">
  <img src="/media/harvest/fan-5.jpg" alt="" width="480" height="480" slot="photos" loading="lazy">
  <h2 slot="heading">Done in days. Built for decades.</h2>
  <p slot="lede" class="lede">A licensed local crew, honest answers, and a 25-year warranty in writing — anywhere in Greater Portland.</p>
  <a slot="actions" class="btn btn-lg" href="/contact">Get a free estimate</a>
</cta-photo-fan>
```

Variants: `<cta-photo-fan variant="muted">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
