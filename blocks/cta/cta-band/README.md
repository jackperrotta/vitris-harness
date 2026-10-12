# cta-band

Full-width conversion band.

- **Category:** cta
- **Media:** none
- **Registers:** all
- **Variants:** dark, accent

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional eyebrow |
| `heading` | `<h2>` — one line, the ask |
| `lede` | Optional one-sentence `<p class="lede">` |
| `actions` | 1–2 buttons; primary first |

## Example

```html
<cta-band>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Free estimates</p>
  <h2 slot="heading">Ready when you are.</h2>
  <p slot="lede" class="lede">Book an inspection this week and have a written estimate in your inbox by Friday.</p>
  <a slot="actions" class="btn btn-lg" href="/contact">Get a free estimate</a>
  <a slot="actions" class="btn-outline btn-lg" href="tel:+15550102000"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h4l2 5-3 2a12 12 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z"/></svg>(555) 010-2000</a>
</cta-band>
```

Variants: `<cta-band variant="dark">` (also: `accent`).

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
