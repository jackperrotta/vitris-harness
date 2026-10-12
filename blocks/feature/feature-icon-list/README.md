# feature-icon-list

Dense checklist of capabilities.

- **Category:** feature
- **Media:** icons
- **Registers:** trade, b2b, professional
- **Variants:** two-col

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` (one sentence) |
| `actions` | Optional 1–2 buttons under the copy |
| `items` | 6–10 `<li>` with a check icon then text (`<strong>` for the lead phrase) |

## Example

```html
<feature-icon-list>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Everything included</p>
  <h2 slot="heading">What's in every roofing estimate</h2>
  <p slot="lede" class="lede">No add-on fees for the things that make a roof last.</p>
  <a slot="actions" class="btn" href="/contact">Get a free estimate</a>
  <li slot="items"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg><span><strong>Full tear-off and disposal</strong><span>We never layer new shingles over old.</span></span></li>
  <li slot="items"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg><span><strong>Ice-and-water shield to code</strong><span>Six feet at eaves and every valley.</span></span></li>
  <li slot="items"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg><span><strong>Ridge and soffit ventilation check</strong><span>Corrected if it isn't balanced.</span></span></li>
  <li slot="items"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg><span><strong>Drip edge and step flashing</strong><span>New aluminum, not reused.</span></span></li>
  <li slot="items"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg><span><strong>Magnetic nail sweep</strong><span>Lawn, driveway, and beds — twice.</span></span></li>
  <li slot="items"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg><span><strong>Photos of the finished deck and underlayment</strong><span>Sent before shingles go on.</span></span></li>
</feature-icon-list>
```

Variants: `<feature-icon-list variant="two-col">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
