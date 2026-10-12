# services-menu

Menu-style priced items.

- **Category:** services
- **Media:** food photos optional
- **Registers:** food, beauty
- **Variants:** two-col

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` (one sentence) |
| `items` | 6–12 `.c-services-menu__item` rows: copy `<div>` (`<h3>`, optional `<p>`) then a price `<span>` |

## Example

```html
<services-menu>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Price list</p>
  <h2 slot="heading">Hair services</h2>
  <p slot="lede" class="lede">Prices are starting points; long or dense hair may add time.</p>
  <div slot="items" class="c-services-menu__item"><h3>Women's cut</h3><p>Consult, wash, cut, blow-dry</p><span>$65</span></div>
  <div slot="items" class="c-services-menu__item"><h3>Men's cut</h3><p>Includes neck trim and style</p><span>$40</span></div>
  <div slot="items" class="c-services-menu__item"><h3>Single-process color</h3><p>Roots or all-over</p><span>$95</span></div>
  <div slot="items" class="c-services-menu__item"><h3>Partial balayage</h3><p>Face-frame and crown</p><span>$160</span></div>
  <div slot="items" class="c-services-menu__item"><h3>Full balayage</h3><p>Includes toner and treatment</p><span>$220</span></div>
  <div slot="items" class="c-services-menu__item"><h3>Gloss / toner</h3><span>$55</span></div>
  <div slot="items" class="c-services-menu__item"><h3>Blowout</h3><span>$45</span></div>
  <div slot="items" class="c-services-menu__item"><h3>Bond-repair treatment</h3><span>$45</span></div>
</services-menu>
```

Variants: `<services-menu variant="two-col">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
