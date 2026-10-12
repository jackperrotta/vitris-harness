# feature-grid-3

Three icon+title+blurb pillars.

- **Category:** feature
- **Media:** icons or small media
- **Registers:** all
- **Variants:** center, cards

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` (one sentence) |
| `items` | 3 or 6 items: each `<div>` with `.icon-tile`, `<h3>`, `<p>` |

## Example

```html
<feature-grid-3>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Why homeowners call us first</p>
  <h2 slot="heading">Built for Maine weather, priced for Maine budgets.</h2>
  <p slot="lede" class="lede">Three things every crew member signs up for on day one.</p>
  <div slot="items"><span class="icon-tile"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6l-8-3z"/><path d="m9 12 2 2 4-4"/></svg></span><h3>Licensed &amp; insured</h3><p>State-licensed, fully insured, and OSHA-trained. Certificates are in the estimate packet, not on request.</p></div>
  <div slot="items"><span class="icon-tile"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></span><h3>Written estimate in 48 hours</h3><p>Line-item pricing with the materials named. If it changes, you sign off before we proceed.</p></div>
  <div slot="items"><span class="icon-tile"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="6"/><path d="m8.5 14-1.5 7 5-3 5 3-1.5-7"/></svg></span><h3>Ten-year workmanship warranty</h3><p>On top of the manufacturer's. If a seam we made leaks, we come back — no argument.</p></div>
</feature-grid-3>
```

Variants: `<feature-grid-3 variant="center">` (also: `cards`).

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
