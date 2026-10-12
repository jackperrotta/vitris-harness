# trust-logos

Grayscale logo row under hero.

- **Category:** trust-strip
- **Media:** partner marks
- **Registers:** trade, b2b, professional, food
- **Variants:** muted

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Short label above the row (e.g. "Trusted by") |
| `logos` | 4–7 `<img>` marks, ~160×48, grayscale applied automatically |

## Example

```html
<trust-logos>
  <p slot="eyebrow" class="eyebrow">Preferred contractor for</p>
  <img src="/media/harvest/logo-1.svg" alt="Maine Housing" width="160" height="48" slot="logos">
  <img src="/media/harvest/logo-2.svg" alt="Portland Public Schools" width="160" height="48" slot="logos">
  <img src="/media/harvest/logo-3.svg" alt="Bayside Property Group" width="160" height="48" slot="logos">
  <img src="/media/harvest/logo-4.svg" alt="Casco Bay Realty" width="160" height="48" slot="logos">
  <img src="/media/harvest/logo-5.svg" alt="Hancock Lumber" width="160" height="48" slot="logos">
</trust-logos>
```

Variants: `<trust-logos variant="muted">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
