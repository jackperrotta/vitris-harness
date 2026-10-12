# nav-minimal

Logo + CTA only — landing / lead-capture pages.

- **Category:** navbar
- **Media:** logo optional
- **Registers:** trade, b2b, beauty
- **Variants:** static

## Slots

| Slot | Content |
|------|---------|
| `brand` | Business name or logo |
| `actions` | 1–2 buttons; the first stays visible on mobile |

## Example

```html
<nav-minimal>
  <span slot="brand">Harbor Roofing</span>
  <a slot="actions" class="btn" href="#estimate">Get an estimate</a>
  <a slot="actions" class="btn-ghost" href="tel:+15550102000"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h4l2 5-3 2a12 12 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z"/></svg>(555) 010-2000</a>
</nav-minimal>
```

Variants: `<nav-minimal variant="static">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
