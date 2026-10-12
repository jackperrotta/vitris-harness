# feature-comparison

Simple two-column compare cards.

- **Category:** feature
- **Media:** optional
- **Registers:** b2b, trade, professional
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` (one sentence) |
| `us` | `<h3>` + `<ul class="list-check">` for your approach |
| `them` | `<h3>` + `<ul class="list-check">` for the typical alternative (use the x icon) |

## Example

```html
<feature-comparison>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">The difference</p>
  <h2 slot="heading">What you get with us vs. the low bid</h2>
  <p slot="lede" class="lede">Both roofs look the same the day they're finished. Ask again in five winters.</p>
  <h3 slot="us">Harbor Roofing</h3>
  <ul slot="us" class="list-check"><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Full tear-off, deck inspected and repaired</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Ice-and-water shield 6 ft at eaves</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>New flashing, drip edge, and ridge vent</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>10-year workmanship warranty in writing</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Employees, not subcontractors</li></ul>
  <h3 slot="them">Typical low bid</h3>
  <ul slot="them" class="list-check"><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 16 16M20 4 4 20"/></svg>Shingles layered over the old roof</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 16 16M20 4 4 20"/></svg>Minimum-code underlayment</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 16 16M20 4 4 20"/></svg>Flashing reused where "it looks fine"</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 16 16M20 4 4 20"/></svg>1-year warranty, verbal</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 16 16M20 4 4 20"/></svg>Whichever sub is free that week</li></ul>
</feature-comparison>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
