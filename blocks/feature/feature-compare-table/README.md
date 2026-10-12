# feature-compare-table

"Why us" comparison table with a highlighted column.

- **Category:** feature
- **Media:** none
- **Registers:** trade, b2b, professional
- **Variants:** dark

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` (one sentence) |
| `columns` | `<th>` cells: an empty first `<th>` (criteria), then one `<th class="is-us">` and 2–3 competitor `<th>` |
| `rows` | 4–7 `<tr><th scope="row">Criterion</th><td class="is-us">…</td><td>…</td></tr>` |
| `note` | Optional `<p>` footnote under the table |

## Example

```html
<feature-compare-table>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Why Harbor</p>
  <h2 slot="heading">Compare before you sign.</h2>
  <p slot="lede" class="lede">Every roofer says they're the best. Here is what actually changes for you.</p>
  <th slot="columns"><span class="visually-hidden">Criteria</span></th>
  <th slot="columns" class="is-us">Harbor</th>
  <th slot="columns">DIY</th>
  <th slot="columns">General contractor</th>
  <th slot="columns">Big-box franchise</th>
  <tr slot="rows"><th scope="row">Cost</th><td class="is-us"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>$$</td><td>$</td><td>$$$</td><td>$$$$</td></tr>
  <tr slot="rows"><th scope="row">Turnaround</th><td class="is-us"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>1–2 days</td><td>Weeks</td><td>2–3 weeks</td><td>4–6 weeks</td></tr>
  <tr slot="rows"><th scope="row">Warranty</th><td class="is-us"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>25-year, transferable</td><td><span aria-label="Not included">—</span></td><td>1 year</td><td>Limited</td></tr>
  <tr slot="rows"><th scope="row">Who shows up</th><td class="is-us"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Our own crew</td><td>You</td><td>Subcontractors</td><td>Whoever's free</td></tr>
  <tr slot="rows"><th scope="row">Scheduling</th><td class="is-us"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Around you</td><td>Weekends</td><td>Their backlog</td><td>Fixed slots</td></tr>
  <p slot="note">Based on written quotes our customers shared with us in 2025. Your numbers will vary — ask for ours in writing.</p>
</feature-compare-table>
```

Variants: `<feature-compare-table variant="dark">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
