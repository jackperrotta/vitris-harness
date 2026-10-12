# about-values

Values as three cards.

- **Category:** about
- **Media:** optional icons
- **Registers:** professional, beauty, b2b
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` (one sentence) |
| `cards` | 3 `.card.card--flat` with `.icon-tile`, `<h3>`, `<p>` |

## Example

```html
<about-values>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Values</p>
  <h2 slot="heading">Three things we won't negotiate on</h2>
  <div slot="cards" class="card"><div class="card__body"><span class="icon-tile"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-4.6-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.4-9 9-9 9z"/></svg></span><h3>Honesty over upsell</h3><p>If a repair will hold for five years, we'll say so — even when a replacement would pay better.</p></div></div>
  <div slot="cards" class="card"><div class="card__body"><span class="icon-tile"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M17.5 14a6.5 6.5 0 0 1 4 6"/></svg></span><h3>Our people, on our payroll</h3><p>Health insurance, paid training, and no subcontractors. Crews that stay do better work.</p></div></div>
  <div slot="cards" class="card"><div class="card__body"><span class="icon-tile"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 4c-8 0-14 4-14 11a5 5 0 0 0 5 5c7 0 9-8 9-16z"/><path d="M6 20c3-5 6-8 10-11"/></svg></span><h3>Leave it cleaner</h3><p>Shingles recycled, lawns swept, and a foreman who checks the neighbor's driveway too.</p></div></div>
</about-values>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
