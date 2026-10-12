# hero-service

Service page header: photo band with an overlapping title card and a dark quote card.

- **Category:** hero
- **Media:** wide service photo
- **Registers:** trade, beauty, professional
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `media` | `<img>` wide photo (LCP, `fetchpriority="high"`) |
| `breadcrumb` | Optional `<a>` trail ending in `<span aria-current="page">` |
| `(default)` | `<h1>` + `<p class="lede">` |
| `aside` | `<h3>` + `<p>` + `.btn` / `.btn-outline` + optional rating line |

## Example

```html
<hero-service>
  <img src="/media/harvest/roof-aerial.jpg" alt="Aerial view of a finished architectural shingle roof" width="2000" height="900" slot="media" fetchpriority="high">
  <a slot="breadcrumb" href="/">Home</a>
  <a slot="breadcrumb" href="/services">Services</a>
  <span slot="breadcrumb" aria-current="page">Roofing</span>
  <h1>Roofing. Done in days.</h1>
  <p class="lede">Roof replacement, repair, storm help, and free inspections across Greater Portland — one licensed crew, backed by a 25-year written warranty.</p>
  <h3 slot="aside">Get a free estimate</h3>
  <p slot="aside">An honest look and a fixed written quote within 24 hours — whether or not you hire us.</p>
  <a slot="aside" class="btn" href="/contact">Get my free estimate</a>
  <a slot="aside" class="btn-outline" href="tel:+15550102000"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h4l2 5-3 2a12 12 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z"/></svg>(555) 010-2000</a>
  <small slot="aside"><span class="rating" aria-label="5 out of 5 stars"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg></span> 4.9 from 1,200+ homeowners</small>
</hero-service>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
