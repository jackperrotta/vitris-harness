# process-carousel

Process cards in buttoned carousel.

- **Category:** process
- **Media:** optional
- **Registers:** trade, beauty
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` (one sentence) |
| `cards` | 4–6 `.card` slides: `<p class="eyebrow">` step label, `<h3>`, `<p>` |

## Example

```html
<process-carousel>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Day of</p>
  <h2 slot="heading">What happens on install day</h2>
  <div slot="cards" class="card"><div class="card__body"><p class="eyebrow">7:00 am</p><h3>Crew arrives, protection goes down</h3><p>Tarps over beds, plywood over the AC, driveway cones out.</p></div></div>
  <div slot="cards" class="card"><div class="card__body"><p class="eyebrow">7:30 am</p><h3>Tear-off</h3><p>Old shingles into the dumpster by lunchtime on most houses.</p></div></div>
  <div slot="cards" class="card"><div class="card__body"><p class="eyebrow">Midday</p><h3>Deck inspection</h3><p>Soft or rotted sheathing replaced and photographed before underlayment.</p></div></div>
  <div slot="cards" class="card"><div class="card__body"><p class="eyebrow">Afternoon</p><h3>Underlayment and shingles</h3><p>Ice-and-water, synthetic underlayment, then shingles from the eaves up.</p></div></div>
  <div slot="cards" class="card"><div class="card__body"><p class="eyebrow">End of day</p><h3>Sweep and walkthrough</h3><p>Magnet sweep twice, gutters cleared, and a walk with the foreman.</p></div></div>
</process-carousel>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
