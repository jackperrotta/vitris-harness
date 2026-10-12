# feature-spotlight

One large feature with side bullets.

- **Category:** feature
- **Media:** hero media
- **Registers:** beauty, food, b2b
- **Variants:** reverse

## Slots

| Slot | Content |
|------|---------|
| `media` | `<img>` 4:3 |
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` (one sentence) |
| `bullets` | 3–4 `<li>` with check icon |
| `actions` | 1–2 buttons |

## Example

```html
<feature-spotlight>
  <img src="/media/harvest/color-bar.jpg" alt="Stylist mixing color at the bar" width="1600" height="1200" slot="media" loading="lazy">
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Our color bar</p>
  <h2 slot="heading">Formulas written down, so your color is repeatable.</h2>
  <p slot="lede" class="lede">Every session ends with your exact mix in your file — any stylist here can match it next time.</p>
  <li slot="bullets"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Ammonia-free lines for sensitive scalps</li>
  <li slot="bullets"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Bond-builder included in every lightening service</li>
  <li slot="bullets"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Free 15-minute consult before your first appointment</li>
  <a slot="actions" class="btn" href="/book">Book a color consult</a>
  <a slot="actions" class="btn-arrow" href="/services#color">Color pricing</a>
</feature-spotlight>
```

Variants: `<feature-spotlight variant="reverse">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
