# about-awards

Numbered awards / rankings list beside a photo.

- **Category:** about
- **Media:** optional photo
- **Registers:** professional, b2b, beauty
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` (one sentence) |
| `media` | Optional `<img>` (4:3) under the head |
| `awards` | 4–7 `<li><span>Award — Category</span><time>2026</time></li>` (first is highlighted) |

## Example

```html
<about-awards>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Our awards</p>
  <h2 slot="heading">Awards that reflect our work.</h2>
  <p slot="lede" class="lede">Top rankings from the guides that lawyers actually trust — earned year after year.</p>
  <img src="/media/harvest/award.jpg" alt="A glass award being handed over" width="1200" height="900" slot="media" loading="lazy">
  <li slot="awards"><span>Chambers USA — Top Rated for Lawsuits</span><time>2026</time></li>
  <li slot="awards"><span>The Legal 500 — Top Tier in Finance Law</span><time>2026</time></li>
  <li slot="awards"><span>Benchmark Litigation — Top Tier Firm</span><time>2025</time></li>
  <li slot="awards"><span>The American Lawyer — Litigation Team of the Year</span><time>2025</time></li>
  <li slot="awards"><span>Law360 — Practice Group of the Year</span><time>2024</time></li>
</about-awards>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
