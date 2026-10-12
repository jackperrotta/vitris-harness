# about-credentials

Credentials / licenses grid.

- **Category:** about
- **Media:** badge marks
- **Registers:** trade, professional
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` (one sentence) |
| `items` | 4 or 8 `.card` items with `.icon-tile`, `<h3>` (short), `<p>` (number / issuer) |

## Example

```html
<about-credentials>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Credentials</p>
  <h2 slot="heading">Licensed, certified, and insured — in writing</h2>
  <p slot="lede" class="lede">Ask for the certificates. We bring them to every estimate.</p>
  <div slot="items" class="card"><div class="card__body"><span class="icon-tile icon-tile--round"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6l-8-3z"/><path d="m9 12 2 2 4-4"/></svg></span><h3>Maine contractor license</h3><p>#RC-20419 · active since 2009</p></div></div>
  <div slot="items" class="card"><div class="card__body"><span class="icon-tile icon-tile--round"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="6"/><path d="m8.5 14-1.5 7 5-3 5 3-1.5-7"/></svg></span><h3>GAF Master Elite</h3><p>Top 2% of roofers nationally</p></div></div>
  <div slot="items" class="card"><div class="card__body"><span class="icon-tile icon-tile--round"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></span><h3>Fully insured</h3><p>$2M liability · workers' comp</p></div></div>
  <div slot="items" class="card"><div class="card__body"><span class="icon-tile icon-tile--round"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M17.5 14a6.5 6.5 0 0 1 4 6"/></svg></span><h3>BBB A+ rated</h3><p>Accredited since 2012</p></div></div>
</about-credentials>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
