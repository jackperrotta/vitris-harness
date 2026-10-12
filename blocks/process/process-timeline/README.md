# process-timeline

Vertical timeline.

- **Category:** process
- **Media:** optional
- **Registers:** professional, b2b, trade
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` (one sentence) |
| `actions` | Optional button under the copy |
| `steps` | 3–6 `<li>` with optional `<p class="eyebrow">` (when/duration), `<h3>`, `<p>` |

## Example

```html
<process-timeline>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">What to expect</p>
  <h2 slot="heading">Your first 90 days with us</h2>
  <p slot="lede" class="lede">We front-load the work so the rest of the year is quiet.</p>
  <a slot="actions" class="btn" href="/contact">Start a conversation</a>
  <li slot="steps"><p class="eyebrow eyebrow--accent">Week 1</p><h3>Discovery call and document intake</h3><p>We collect last year's books, bank feeds, and payroll access. One hour of your time, total.</p></li>
  <li slot="steps"><p class="eyebrow eyebrow--accent">Weeks 2–3</p><h3>Clean-up and chart of accounts</h3><p>We fix categorization, reconcile every account, and set up a chart that matches how you bid jobs.</p></li>
  <li slot="steps"><p class="eyebrow eyebrow--accent">Week 4</p><h3>First monthly close</h3><p>P&amp;L, balance sheet, and a job-cost summary — reviewed together on a 20-minute call.</p></li>
  <li slot="steps"><p class="eyebrow eyebrow--accent">Ongoing</p><h3>Books closed by the 5th</h3><p>Same report, same day every month. Questions answered inside one business day.</p></li>
</process-timeline>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
