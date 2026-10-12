# case-header

Case study / project header: breadcrumb, title, meta, hero image, side CTA card.

- **Category:** work
- **Media:** one hero photo
- **Registers:** professional, b2b, trade
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `breadcrumb` | Optional `<a>` trail ending in `<span aria-current="page">` |
| `(default)` | `<h1>` |
| `meta` | 2–4 `<span>` facts (date, category, client) |
| `media` | `<img>` 16:9 (LCP) |
| `aside` | Optional `<h3>` + `<p>` + `.btn` for the side card |

## Example

```html
<case-header>
  <a slot="breadcrumb" href="/">Home</a>
  <a slot="breadcrumb" href="/case-studies">Case studies</a>
  <span slot="breadcrumb" aria-current="page">Energy antitrust</span>
  <h1>An energy company beats a price-fixing lawsuit.</h1>
  <span slot="meta">Nov 18, 2025</span>
  <span slot="meta">Class action defense</span>
  <span slot="meta">Lead partner: Dana Kowalski</span>
  <img src="/media/harvest/case-1.jpg" alt="Two lawyers reviewing a tablet beside wind turbines" width="1600" height="900" slot="media" fetchpriority="high">
  <h3 slot="aside">Need counsel on a matter like this?</h3>
  <p slot="aside">A senior partner takes the first call. Conflicts cleared within the hour, a strategy memo on your desk inside seventy-two.</p>
  <a slot="aside" class="btn" href="/contact">Get in touch <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
</case-header>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
