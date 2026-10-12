# pricing-tiers

Three pricing tiers.

- **Category:** pricing
- **Media:** none
- **Registers:** b2b, professional, beauty
- **Variants:** highlight-mid

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` |
| `tiers` | 3 `.card` tiers: optional `.badge`, `<h3>`, `.price`, `<p>`, `<ul class="list-check">`, button. Add `c-pricing-tiers__featured` to one card to lift it. |

## Example

```html
<pricing-tiers>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Pricing</p>
  <h2 slot="heading">Flat monthly pricing. No hourly surprises.</h2>
  <p slot="lede" class="lede">Every plan includes a dedicated bookkeeper and a monthly close by the 5th.</p>
  <div slot="tiers" class="card"><div class="card__body"><h3>Starter</h3><p class="price"><span class="price__amount">$349</span><span class="price__period">/mo</span></p><p>Sole proprietors and one-truck operations.</p><ul class="list-check"><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Up to 100 transactions / mo</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Monthly P&amp;L and balance sheet</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Email support</li></ul><a class="btn-outline" href="/contact">Start with Starter</a></div></div>
  <div slot="tiers" class="card c-pricing-tiers__featured"><div class="card__body"><span class="badge badge--accent c-pricing-tiers__badge">Most popular</span><h3>Growth</h3><p class="price"><span class="price__amount">$649</span><span class="price__period">/mo</span></p><p>Crews of 2–10 with payroll and job costing.</p><ul class="list-check"><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Up to 400 transactions / mo</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Job-cost reporting</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Payroll reconciliation</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Quarterly review call</li></ul><a class="btn" href="/contact">Choose Growth</a></div></div>
  <div slot="tiers" class="card"><div class="card__body"><h3>Scale</h3><p class="price"><span class="price__amount">$1,200</span><span class="price__period">/mo</span></p><p>Multi-crew companies and multiple entities.</p><ul class="list-check"><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Unlimited transactions</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Multi-entity consolidation</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Cash-flow forecasting</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Dedicated Slack channel</li></ul><a class="btn-outline" href="/contact">Talk to us</a></div></div>
</pricing-tiers>
```

Variants: `<pricing-tiers variant="highlight-mid">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
