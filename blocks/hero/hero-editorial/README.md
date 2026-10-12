# hero-editorial

Type-led hero with generous air — premium / professional.

- **Category:** hero
- **Media:** optional small media
- **Registers:** professional, b2b, beauty
- **Variants:** center

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Short line above headline |
| `(default)` | `<h1>` (≤ 10 words) + `<p class="lede lede--lg">` |
| `actions` | 1–2 buttons |
| `media` | Optional wide `<img>` shown under the copy (21:9 crop) |

## Example

```html
<hero-editorial>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Estate planning · Family law</p>
  <h1>Counsel that speaks plainly and plans for decades.</h1>
  <p class="lede lede--lg">A two-partner practice in the Old Port. Flat fees for wills and trusts, and one attorney who answers your calls from start to finish.</p>
  <a slot="actions" class="btn btn-lg" href="/consult">Book a consultation</a>
  <a slot="actions" class="btn-arrow" href="/practice">Practice areas</a>
  <img src="/media/harvest/office-wide.jpg" alt="The practice's brick-walled meeting room" width="2100" height="900" slot="media" fetchpriority="high">
</hero-editorial>
```

Variants: `<hero-editorial variant="center">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
