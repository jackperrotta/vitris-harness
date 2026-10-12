# trust-certs

Proof sentence over a row of certification tiles.

- **Category:** trust-strip
- **Media:** badge icons
- **Registers:** trade, professional, beauty
- **Variants:** muted

## Slots

| Slot | Content |
|------|---------|
| `proof` | Optional `<p>` one-line proof with `<strong>` numbers |
| `certs` | 3–5 `<div><span class="icon-tile icon-tile--round">icon</span><strong>Name</strong><small>Sub-line</small></div>` |

## Example

```html
<trust-certs>
  <p slot="proof"><strong>17+ years</strong> · <strong>1,200+</strong> five-star reviews · <strong>3,500+</strong> roofs · every job backed <strong>in writing</strong></p>
  <div slot="certs"><span class="icon-tile icon-tile--round"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="6"/><path d="m8.5 14-1.5 7 5-3 5 3-1.5-7"/></svg></span><strong>GAF Master Elite</strong><small>Top 2% certified roofers</small></div>
  <div slot="certs"><span class="icon-tile icon-tile--round"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6l-8-3z"/><path d="m9 12 2 2 4-4"/></svg></span><strong>Licensed &amp; insured</strong><small>Maine license #RC-20419</small></div>
  <div slot="certs"><span class="icon-tile icon-tile--round"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></span><strong>BBB A+</strong><small>Accredited since 2011</small></div>
  <div slot="certs"><span class="icon-tile icon-tile--round"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 12 3l9 8v10H3z"/><path d="M9 21v-6h6v6"/></svg></span><strong>Owens Corning Preferred</strong><small>Factory-trained installers</small></div>
</trust-certs>
```

Variants: `<trust-certs variant="muted">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
