# team-grid

Portrait grid of people.

- **Category:** team
- **Media:** portraits
- **Registers:** professional, beauty, b2b, trade
- **Variants:** three

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` |
| `people` | 4 or 8 `.card` items: `.card__media.ratio-3x4` portrait, `<h3>` name, `<p class="c-team-role">`, optional one-line `<p>` |

## Example

```html
<team-grid>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">The crew</p>
  <h2 slot="heading">Eight people. Zero subcontractors.</h2>
  <p slot="lede" class="lede">Everyone on your roof is on our payroll, trained by us, and insured by us.</p>
  <div slot="people" class="card"><div class="card__media ratio-3x4"><img src="/media/harvest/team-mike.jpg" alt="Mike Harbor" width="900" height="1200" loading="lazy"></div><div class="card__body"><h3>Mike Harbor</h3><p class="c-team-role">Founder &amp; lead estimator</p><p>Started roofing in 1998; still climbs every roof he quotes.</p></div></div>
  <div slot="people" class="card"><div class="card__media ratio-3x4"><img src="/media/harvest/team-ana.jpg" alt="Ana Reyes" width="900" height="1200" loading="lazy"></div><div class="card__body"><h3>Ana Reyes</h3><p class="c-team-role">Foreman</p><p>Runs the install crew. Twelve years, four hundred roofs.</p></div></div>
  <div slot="people" class="card"><div class="card__media ratio-3x4"><img src="/media/harvest/team-devon.jpg" alt="Devon Blake" width="900" height="1200" loading="lazy"></div><div class="card__body"><h3>Devon Blake</h3><p class="c-team-role">Foreman</p><p>Metal and cedar specialist. Ex-shipwright.</p></div></div>
  <div slot="people" class="card"><div class="card__media ratio-3x4"><img src="/media/harvest/team-sarah.jpg" alt="Sarah Lin" width="900" height="1200" loading="lazy"></div><div class="card__body"><h3>Sarah Lin</h3><p class="c-team-role">Office &amp; scheduling</p><p>The voice on the phone. Returns every call the same day.</p></div></div>
</team-grid>
```

Variants: `<team-grid variant="three">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
