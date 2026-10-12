# cta-card

Centered elevated CTA card.

- **Category:** cta
- **Media:** optional media
- **Registers:** beauty, food, b2b
- **Variants:** muted

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional eyebrow |
| `heading` | `<h2>` |
| `lede` | `<p class="lede">` |
| `actions` | 1–2 buttons |
| `note` | Optional `<small>` under the buttons (hours, guarantee) |

## Example

```html
<cta-card>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">New clients</p>
  <h2 slot="heading">First visit, 20% off any color service.</h2>
  <p slot="lede" class="lede">Book online in under a minute. Free 15-minute consult included, no commitment.</p>
  <a slot="actions" class="btn btn-lg" href="/book">Book online</a>
  <a slot="actions" class="btn-outline btn-lg" href="tel:+15550102000">Call the salon</a>
  <small slot="note">Open Tue–Sat · walk-ins welcome after 3 pm</small>
</cta-card>
```

Variants: `<cta-card variant="muted">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
