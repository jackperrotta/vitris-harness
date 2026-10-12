# incentive-cards

Offer cards (financing, warranty, gift).

- **Category:** incentives
- **Media:** optional icons
- **Registers:** trade, beauty, professional
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` |
| `cards` | 3 `.card` offers: `.icon-tile`, `<h3>`, `<p>`, optional `<a class="btn-arrow">` |

## Example

```html
<incentive-cards>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Offers</p>
  <h2 slot="heading">Ways to make it easier</h2>
  <div slot="cards" class="card"><div class="card__body"><span class="icon-tile"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/></svg></span><h3>0% for 12 months</h3><p>Financing through our lending partner. Five-minute application, no hard credit pull to see your rate.</p><a class="btn-arrow" href="/financing">Financing details</a></div></div>
  <div slot="cards" class="card"><div class="card__body"><span class="icon-tile"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6l-8-3z"/><path d="m9 12 2 2 4-4"/></svg></span><h3>10-year workmanship warranty</h3><p>Any leak caused by installation, we fix free. Transferable if you sell the house.</p><a class="btn-arrow" href="/warranty">Read the warranty</a></div></div>
  <div slot="cards" class="card"><div class="card__body"><span class="icon-tile"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-4.6-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.4-9 9-9 9z"/></svg></span><h3>$250 referral credit</h3><p>When a neighbor you refer books a replacement, you both get $250 off your next service.</p><a class="btn-arrow" href="/referrals">How referrals work</a></div></div>
</incentive-cards>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
