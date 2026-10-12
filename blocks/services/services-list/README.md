# services-list

Editorial service list with CTA per row.

- **Category:** services
- **Media:** optional thumbs
- **Registers:** professional, trade, b2b
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` (one sentence) |
| `rows` | 4–8 rows: `<div>` with `<span class="c-services-list__num">`, a copy `<div>` (`<h3>`, `<p>`), and a `.btn-outline.btn-sm` or `.btn-arrow` |

## Example

```html
<services-list>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Practice areas</p>
  <h2 slot="heading">Focused on four things, and good at all of them.</h2>
  <div slot="rows"><span class="c-services-list__num">01</span><div><h3>Wills &amp; trusts</h3><p>Flat-fee estate plans, from a simple will to a revocable trust with pour-over provisions.</p></div><a class="btn-outline btn-sm" href="/practice/estate">Learn more</a></div>
  <div slot="rows"><span class="c-services-list__num">02</span><div><h3>Probate administration</h3><p>We handle the court filings, creditor notices, and distributions so the family doesn't have to.</p></div><a class="btn-outline btn-sm" href="/practice/probate">Learn more</a></div>
  <div slot="rows"><span class="c-services-list__num">03</span><div><h3>Elder law &amp; MaineCare planning</h3><p>Protect the house and qualify for care without spending down everything first.</p></div><a class="btn-outline btn-sm" href="/practice/elder">Learn more</a></div>
  <div slot="rows"><span class="c-services-list__num">04</span><div><h3>Small-business succession</h3><p>Buy-sell agreements and transition plans for owner-operated companies.</p></div><a class="btn-outline btn-sm" href="/practice/business">Learn more</a></div>
</services-list>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
