# nav-utility

Dual-tier: slim utility row (phone/hours) + primary bar. B2B default.

- **Category:** navbar
- **Media:** logo optional
- **Registers:** b2b, professional, trade
- **Variants:** static

## Slots

| Slot | Content |
|------|---------|
| `utility` | Short inline facts: hours, phone, service area (1–3 `<span>`/`<a>`; only `<a>` items show on mobile) |
| `brand` | Business name or logo |
| `links` | 3–5 `<a>` primary links |
| `actions` | Primary CTA button |

## Example

```html
<nav-utility>
  <span slot="utility"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>Mon–Fri 7:30–5:00</span>
  <a slot="utility" href="tel:+15550102000"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h4l2 5-3 2a12 12 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z"/></svg>(555) 010-2000</a>
  <span slot="utility"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>Serving Greater Portland</span>
  <span slot="brand">Northline Mechanical</span>
  <a slot="links" href="/services">Services</a>
  <a slot="links" href="/work">Our work</a>
  <a slot="links" href="/about">About</a>
  <a slot="links" href="/contact">Contact</a>
  <a slot="actions" class="btn" href="/contact">Request a quote</a>
</nav-utility>
```

Variants: `<nav-utility variant="static">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
