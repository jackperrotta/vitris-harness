# project-grid

Portfolio grid: image, title, category.

- **Category:** work
- **Media:** one photo per project
- **Registers:** b2b, beauty, trade, professional
- **Variants:** two

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` (one sentence) |
| `actions` | Optional 1–2 buttons / `.btn-arrow` links |
| `projects` | 3–9 `<a href><div class="frame ratio-4x3"><img></div><h3>Title</h3><p>Category · Year</p></a>` |

## Example

```html
<project-grid>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Featured work</p>
  <h2 slot="heading">Marks that stuck.</h2>
  <a slot="actions" class="btn-arrow" href="/work">All projects <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
  <a slot="projects" href="/work/neobase"><div class="frame ratio-4x3"><img src="/media/harvest/work-2.jpg" alt="Neobase identity" width="1200" height="900" loading="lazy"></div><h3>Neobase</h3><p>Rebrand · 2026</p></a>
  <a slot="projects" href="/work/nextdock"><div class="frame ratio-4x3"><img src="/media/harvest/work-1.jpg" alt="Nextdock identity" width="1200" height="900" loading="lazy"></div><h3>Nextdock</h3><p>Logo &amp; identity · 2026</p></a>
  <a slot="projects" href="/work/scalar"><div class="frame ratio-4x3"><img src="/media/harvest/work-3.jpg" alt="Scalar identity" width="1200" height="900" loading="lazy"></div><h3>Scalar</h3><p>Icon system · 2025</p></a>
  <a slot="projects" href="/work/charter"><div class="frame ratio-4x3"><img src="/media/harvest/work-4.jpg" alt="Charter identity" width="1200" height="900" loading="lazy"></div><h3>Charter</h3><p>Brand identity · 2025</p></a>
  <a slot="projects" href="/work/echo"><div class="frame ratio-4x3"><img src="/media/harvest/work-5.jpg" alt="Echo identity" width="1200" height="900" loading="lazy"></div><h3>Echo</h3><p>Rebrand · 2025</p></a>
  <a slot="projects" href="/work/harbor"><div class="frame ratio-4x3"><img src="/media/harvest/work-6.jpg" alt="Harbor identity" width="1200" height="900" loading="lazy"></div><h3>Harbor Roofing</h3><p>Logo &amp; fleet · 2024</p></a>
</project-grid>
```

Variants: `<project-grid variant="two">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
