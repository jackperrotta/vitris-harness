# feature-zigzag

Alternating copy/media story rows.

- **Category:** feature
- **Media:** media per row
- **Registers:** trade, beauty, professional
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` (one sentence) |
| `rows` | 2–4 rows: each `<div class="split">` with a `.frame.ratio-4x3` media div and a copy div (`<h3>`, `<p>`, optional `.btn-arrow`). Rows alternate automatically. |

## Example

```html
<feature-zigzag>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">The process</p>
  <h2 slot="heading">Three visits. One clear price. No surprises.</h2>
  <div slot="rows" class="split"><div class="frame ratio-4x3"><img src="/media/harvest/inspection.jpg" alt="Roof inspection with a drone" width="1200" height="900" loading="lazy"></div><div><p class="eyebrow eyebrow--accent">01 · Inspection</p><h3>We look at the whole roof, not the leak.</h3><p>Drone photos of every slope, a moisture reading in the attic, and a straight answer about repair vs. replace.</p><a class="btn-arrow" href="/process#inspection">What we check</a></div></div>
  <div slot="rows" class="split"><div class="frame ratio-4x3"><img src="/media/harvest/estimate.jpg" alt="Reviewing an estimate at a kitchen table" width="1200" height="900" loading="lazy"></div><div><p class="eyebrow eyebrow--accent">02 · Estimate</p><h3>Line items you can compare.</h3><p>Materials by brand, labor by day, and the permit fee shown separately. Valid for 60 days.</p><a class="btn-arrow" href="/process#estimate">Sample estimate</a></div></div>
  <div slot="rows" class="split"><div class="frame ratio-4x3"><img src="/media/harvest/install.jpg" alt="Crew installing shingles" width="1200" height="900" loading="lazy"></div><div><p class="eyebrow eyebrow--accent">03 · Install</p><h3>Most roofs done in two days.</h3><p>Tarps on the landscaping, a magnet sweep at the end of each day, and a walkthrough with the foreman before we invoice.</p><a class="btn-arrow" href="/process#install">Install day checklist</a></div></div>
</feature-zigzag>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
