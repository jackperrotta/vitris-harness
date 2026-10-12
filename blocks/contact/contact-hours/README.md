# contact-hours

Hours table + CTA.

- **Category:** contact
- **Media:** none
- **Registers:** trade, food, beauty
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` |
| `actions` | 1–2 buttons |
| `hours` | 7 `<tr>` rows: `<th scope="row">Day</th><td>Hours</td>`; add `class="is-today"` to highlight |
| `note` | Optional `<small>` under the table (holidays, last seating) |

## Example

```html
<contact-hours>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Hours</p>
  <h2 slot="heading">Open six days. Closed Sundays and most holidays.</h2>
  <p slot="lede" class="lede">Kitchen closes 30 minutes before we do.</p>
  <a slot="actions" class="btn" href="/reserve">Reserve a table</a>
  <a slot="actions" class="btn-outline" href="tel:+15550102000">Call</a>
  <tr slot="hours"><th scope="row">Monday</th><td>Closed</td></tr>
  <tr slot="hours"><th scope="row">Tuesday</th><td>5:00 – 10:00 pm</td></tr>
  <tr slot="hours"><th scope="row">Wednesday</th><td>5:00 – 10:00 pm</td></tr>
  <tr slot="hours" class="is-today"><th scope="row">Thursday</th><td>5:00 – 10:00 pm</td></tr>
  <tr slot="hours"><th scope="row">Friday</th><td>5:00 – 11:00 pm</td></tr>
  <tr slot="hours"><th scope="row">Saturday</th><td>4:30 – 11:00 pm</td></tr>
  <tr slot="hours"><th scope="row">Sunday</th><td>Closed</td></tr>
  <small slot="note">Closed Thanksgiving, Dec 24–26, and Jan 1.</small>
</contact-hours>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
