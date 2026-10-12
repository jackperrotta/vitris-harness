# hero-page

Interior page header: eyebrow + h1 left, intro right, optional photo band.

- **Category:** hero
- **Media:** optional wide photo
- **Registers:** all
- **Variants:** center

## Slots

| Slot | Content |
|------|---------|
| `breadcrumb` | Optional `<a>` trail ending in `<span aria-current="page">` |
| `eyebrow` | Optional `<p class="eyebrow">` |
| `(default)` | `<h1>` (2–6 words) |
| `intro` | `<p class="lede">` one or two sentences; optional `.btn-group` after it |
| `media` | Optional `<div class="frame ratio-21x9">` with an `<img>` |

## Example

```html
<hero-page>
  <a slot="breadcrumb" href="/">Home</a>
  <span slot="breadcrumb" aria-current="page">About</span>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">About the firm</p>
  <h1>Leading with integrity and purpose.</h1>
  <p slot="intro" class="lede">Years of experience and a steady commitment to honest, careful work — for clients who need legal help they can trust.</p>
  <div slot="media" class="frame ratio-21x9"><img src="/media/harvest/office-wide.jpg" alt="The Verdict team in the main conference room" width="2100" height="900" fetchpriority="high"></div>
</hero-page>
```

Variants: `<hero-page variant="center">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
