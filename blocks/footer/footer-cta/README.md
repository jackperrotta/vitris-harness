# footer-cta

Mini CTA above compact footer.

- **Category:** footer
- **Media:** none
- **Registers:** trade, beauty, food
- **Variants:** dark

## Slots

| Slot | Content |
|------|---------|
| `heading` | `<h2>` the ask |
| `lede` | Optional `<p class="lede">` |
| `actions` | 1–2 buttons |
| `brand` | Business name or logo |
| `legal` | `<a>` links + trailing `<span>` copyright |

## Example

```html
<footer-cta>
  <h2 slot="heading">Let's look at your roof.</h2>
  <p slot="lede" class="lede">Free inspection, written estimate in 48 hours, no pressure.</p>
  <a slot="actions" class="btn btn-lg" href="/contact">Book an inspection</a>
  <a slot="actions" class="btn-outline btn-lg" href="tel:+15550102000">(555) 010-2000</a>
  <span slot="brand">Harbor Roofing</span>
  <a slot="legal" href="/privacy">Privacy</a>
  <a slot="legal" href="/cookie-compliance">Cookie compliance</a>
  <span slot="legal">© 2026 Harbor Roofing LLC · Maine license #RC-20419</span>
</footer-cta>
```

Variants: `<footer-cta variant="dark">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
