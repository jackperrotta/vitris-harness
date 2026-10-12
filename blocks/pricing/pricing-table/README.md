# pricing-table

Simple feature compare table.

- **Category:** pricing
- **Media:** none
- **Registers:** b2b, professional
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` |
| `table` | A `<table class="table">` with `<thead>` (feature, then one column per plan) and `<tbody>`; use the check icon or `—` in cells |

## Example

```html
<pricing-table>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Compare plans</p>
  <h2 slot="heading">What's included at each level</h2>
  <table slot="table" class="table">
    <thead><tr><th>Feature</th><th>Starter</th><th>Growth</th><th>Scale</th></tr></thead>
    <tbody>
      <tr><td>Monthly transactions</td><td>100</td><td>400</td><td>Unlimited</td></tr>
      <tr><td>Monthly close by the 5th</td><td><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></td><td><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></td><td><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></td></tr>
      <tr><td>Job-cost reporting</td><td>—</td><td><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></td><td><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></td></tr>
      <tr><td>Payroll reconciliation</td><td>—</td><td><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></td><td><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></td></tr>
      <tr><td>Multi-entity consolidation</td><td>—</td><td>—</td><td><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></td></tr>
      <tr><td>Response time</td><td>2 days</td><td>1 day</td><td>Same day</td></tr>
    </tbody>
    <tfoot><tr><td></td><td><a class="btn-outline btn-sm" href="/contact">Choose</a></td><td><a class="btn btn-sm" href="/contact">Choose</a></td><td><a class="btn-outline btn-sm" href="/contact">Choose</a></td></tr></tfoot>
  </table>
</pricing-table>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
