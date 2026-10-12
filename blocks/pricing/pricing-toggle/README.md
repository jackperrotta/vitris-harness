# pricing-toggle

Monthly/annual toggle via tabs island.

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
| `tabs` | A `.tabs__list.tabs__list--pill[role=tablist]` with two `button.tabs__tab[role=tab]`, then two `.tabs__panel[role=tabpanel]` each containing a `.grid.grid--3` of tier cards |

## Example

```html
<pricing-toggle>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Pricing</p>
  <h2 slot="heading">Pay monthly, or save 15% annually</h2>
  <div slot="tabs" class="tabs__list tabs__list--pill" role="tablist">
    <button type="button" class="tabs__tab" role="tab" id="pt-m" aria-controls="pt-pm" aria-selected="true">Monthly</button>
    <button type="button" class="tabs__tab" role="tab" id="pt-a" aria-controls="pt-pa" aria-selected="false">Annual <span class="badge badge--accent c-pricing-toggle__save">−15%</span></button>
  </div>
  <div slot="tabs" class="tabs__panel" role="tabpanel" id="pt-pm" aria-labelledby="pt-m"><div class="grid grid--3"><div class="card"><div class="card__body"><h3>Starter</h3><p class="price"><span class="price__amount">$349</span><span class="price__period">/mo</span></p><ul class="list-check"><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>100 transactions / mo</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Monthly P&amp;L</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Email support</li></ul><a class="btn-outline" href="/contact">Choose Starter</a></div></div><div class="card c-pricing-toggle__featured"><div class="card__body"><h3>Growth</h3><p class="price"><span class="price__amount">$649</span><span class="price__period">/mo</span></p><ul class="list-check"><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>400 transactions / mo</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Job-cost reporting</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Payroll reconciliation</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Quarterly review</li></ul><a class="btn" href="/contact">Choose Growth</a></div></div><div class="card"><div class="card__body"><h3>Scale</h3><p class="price"><span class="price__amount">$1,200</span><span class="price__period">/mo</span></p><ul class="list-check"><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Unlimited transactions</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Multi-entity</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Cash-flow forecasting</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Dedicated channel</li></ul><a class="btn-outline" href="/contact">Choose Scale</a></div></div></div></div>
  <div slot="tabs" class="tabs__panel" role="tabpanel" id="pt-pa" aria-labelledby="pt-a" hidden><div class="grid grid--3"><div class="card"><div class="card__body"><h3>Starter</h3><p class="price"><span class="price__amount">$297</span><span class="price__period">/mo · billed yearly</span></p><ul class="list-check"><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>100 transactions / mo</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Monthly P&amp;L</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Email support</li></ul><a class="btn-outline" href="/contact">Choose Starter</a></div></div><div class="card c-pricing-toggle__featured"><div class="card__body"><h3>Growth</h3><p class="price"><span class="price__amount">$552</span><span class="price__period">/mo · billed yearly</span></p><ul class="list-check"><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>400 transactions / mo</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Job-cost reporting</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Payroll reconciliation</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Quarterly review</li></ul><a class="btn" href="/contact">Choose Growth</a></div></div><div class="card"><div class="card__body"><h3>Scale</h3><p class="price"><span class="price__amount">$1,020</span><span class="price__period">/mo · billed yearly</span></p><ul class="list-check"><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Unlimited transactions</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Multi-entity</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Cash-flow forecasting</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Dedicated channel</li></ul><a class="btn-outline" href="/contact">Choose Scale</a></div></div></div></div>
</pricing-toggle>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
