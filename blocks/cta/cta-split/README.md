# cta-split

CTA copy + form or phone block.

- **Category:** cta
- **Media:** optional
- **Registers:** trade, professional
- **Variants:** dark

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional eyebrow |
| `heading` | `<h2>` |
| `lede` | `<p class="lede">` |
| `bullets` | Optional 2–3 `<li>` with check icon |
| `panel` | Contents of the right-hand card: `<h3>`, phone button, hours — or a short `<form data-lead-form>` |

## Example

```html
<cta-split>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Emergency repairs</p>
  <h2 slot="heading">Leaking right now? Call.</h2>
  <p slot="lede" class="lede">We keep one crew on call for active leaks. Tarping the same day, a permanent fix scheduled inside the week.</p>
  <li slot="bullets"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Same-day emergency tarping</li>
  <li slot="bullets"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>No after-hours surcharge for existing customers</li>
  <li slot="bullets"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Insurance photos and documentation included</li>
  <h3 slot="panel">Talk to a roofer now</h3>
  <a slot="panel" class="btn btn-lg" href="tel:+15550102000"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h4l2 5-3 2a12 12 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z"/></svg>(555) 010-2000</a>
  <small slot="panel">7 am – 9 pm, seven days. After hours, leave a message — we call back within the hour.</small>
</cta-split>
```

Variants: `<cta-split variant="dark">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
