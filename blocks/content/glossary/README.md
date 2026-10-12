# glossary

Term / definition grid — jargon a customer sees on an estimate.

- **Category:** content
- **Media:** none
- **Registers:** trade, professional, b2b
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` (one sentence) |
| `terms` | 6–12 `<div><dt>Term</dt><dd>One-sentence definition.</dd></div>` |

## Example

```html
<glossary>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Plain language</p>
  <h2 slot="heading">Commonly used roofing terms</h2>
  <p slot="lede" class="lede">The words you'll see on your estimate, each explained in one sentence.</p>
  <div slot="terms"><dt>Decking</dt><dd>The wood sheets under your shingles — the surface everything else is fastened to.</dd></div>
  <div slot="terms"><dt>Underlayment</dt><dd>The water barrier between shingles and decking. It catches what the shingles miss.</dd></div>
  <div slot="terms"><dt>Flashing</dt><dd>Bent metal that seals the joints where your roof meets chimneys, walls, and skylights.</dd></div>
  <div slot="terms"><dt>Drip edge</dt><dd>Metal along the roof's edges that steers runoff into the gutters instead of behind them.</dd></div>
  <div slot="terms"><dt>Valley</dt><dd>The crease where two slopes meet — where the most water runs on your roof.</dd></div>
  <div slot="terms"><dt>Ridge vent</dt><dd>A low-profile vent along the peak that lets hot attic air out.</dd></div>
</glossary>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
