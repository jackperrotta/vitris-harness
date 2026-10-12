# hero-statement

One huge centered statement with a three-image filmstrip beneath — studio / agency opener.

- **Category:** hero
- **Media:** 3 landscape stills
- **Registers:** b2b, beauty, professional
- **Variants:** dark

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `(default)` | `<h1>` (2–4 words) + optional `<p class="lede">` |
| `strip` | 3 `<div class="frame ratio-4x3">` tiles with an `<img>` each |

## Example

```html
<hero-statement>
  <p slot="eyebrow" class="eyebrow">Brand &amp; identity studio · Portland</p>
  <h1>We are Hive.</h1>
  <p class="lede">A four-person studio designing the marks small businesses are known for.</p>
  <div slot="strip" class="frame ratio-4x3"><img src="/media/harvest/work-1.jpg" alt="Logo lockup on a storefront awning" width="1200" height="900" fetchpriority="high"></div>
  <div slot="strip" class="frame ratio-4x3"><img src="/media/harvest/work-2.jpg" alt="Business cards and letterhead on a desk" width="1200" height="900"></div>
  <div slot="strip" class="frame ratio-4x3"><img src="/media/harvest/work-3.jpg" alt="Vehicle wrap on a delivery van" width="1200" height="900"></div>
</hero-statement>
```

Variants: `<hero-statement variant="dark">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
