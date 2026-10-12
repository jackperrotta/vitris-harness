# gallery-before-after

Before/after project cases.

- **Category:** gallery
- **Media:** paired photos
- **Registers:** trade
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` |
| `cases` | 2 or 4 `<figure class="c-gallery-before-after__case">`: a `.before-after[data-island]` with two same-crop `<img>` + handle, then `<figcaption>` with `<h3>` + `<p>` |

## Example

```html
<gallery-before-after>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Before &amp; after</p>
  <h2 slot="heading">Drag the handle.</h2>
  <p slot="lede" class="lede">Same angle, same lens, a weekend apart.</p>
  <figure slot="cases" class="c-gallery-before-after__case"><div class="before-after" data-island="before-after"><img src="/media/harvest/ba1-before.jpg" alt="Before" width="1600" height="1000" class="before-after__before" loading="lazy"><img src="/media/harvest/ba1-after.jpg" alt="After" width="1600" height="1000" class="before-after__after" loading="lazy"><span class="before-after__label before-after__label--before" aria-hidden="true">Before</span><span class="before-after__label before-after__label--after" aria-hidden="true">After</span><div class="before-after__handle" aria-hidden="true"></div></div><figcaption><h3>Kitchen refresh · Deering</h3><p>Cabinets repainted, new hardware and lighting · 3 days</p></figcaption></figure>
  <figure slot="cases" class="c-gallery-before-after__case"><div class="before-after" data-island="before-after"><img src="/media/harvest/ba2-before.jpg" alt="Before" width="1600" height="1000" class="before-after__before" loading="lazy"><img src="/media/harvest/ba2-after.jpg" alt="After" width="1600" height="1000" class="before-after__after" loading="lazy"><span class="before-after__label before-after__label--before" aria-hidden="true">Before</span><span class="before-after__label before-after__label--after" aria-hidden="true">After</span><div class="before-after__handle" aria-hidden="true"></div></div><figcaption><h3>Exterior · Falmouth</h3><p>Full prep, two coats, trim in contrasting white · 4 days</p></figcaption></figure>
</gallery-before-after>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
