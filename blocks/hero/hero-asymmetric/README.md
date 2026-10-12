# hero-asymmetric

Diagonal balance: heavy type corner vs dense photo.

- **Category:** hero
- **Media:** strong subject photo
- **Registers:** beauty, professional, trade
- **Variants:** reverse

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Short line above headline |
| `(default)` | `<h1>` (short, 3–6 words) + `<p class="lede lede--lg">` |
| `actions` | 1–2 buttons |
| `media` | Portrait 3:4 `<img>` with a clear subject |

## Example

```html
<hero-asymmetric>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Hair · Color · Portland</p>
  <h1>Color you'll stop touching up.</h1>
  <p class="lede lede--lg">Balayage, lived-in blondes, and corrective color by stylists who've been at it for a decade. Consultations are free and honest.</p>
  <a slot="actions" class="btn btn-lg" href="/book">Book online</a>
  <a slot="actions" class="btn-outline btn-lg" href="/services">Services &amp; pricing</a>
  <img src="/media/harvest/stylist-portrait.jpg" alt="Stylist finishing a blowout" width="1200" height="1600" slot="media" fetchpriority="high">
</hero-asymmetric>
```

Variants: `<hero-asymmetric variant="reverse">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
