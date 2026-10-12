# faq-accordion

Default details/summary FAQ.

- **Category:** faq
- **Media:** none
- **Registers:** all
- **Variants:** two-col

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` |
| `items` | 5–8 `<details>` with `<summary>` question and `<p>` answer |

## Example

```html
<faq-accordion>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">FAQ</p>
  <h2 slot="heading">Questions we get on every estimate</h2>
  <p slot="lede" class="lede">Anything else? Call us — a person answers.</p>
  <details slot="items"><summary>How soon can you start?</summary><p>Repairs usually within the week. Full replacements book two to three weeks out in spring and fall, faster in summer.</p></details>
  <details slot="items"><summary>Do you offer financing?</summary><p>Yes — 12-month 0% and longer terms through our lending partner. Apply in five minutes; approval doesn't affect your credit score.</p></details>
  <details slot="items"><summary>Are you licensed and insured?</summary><p>Maine license #RC-20419, $2M general liability, and workers' comp on every employee. Certificates come with the estimate.</p></details>
  <details slot="items"><summary>What does the warranty cover?</summary><p>Ten years on our workmanship — any leak caused by installation, we fix free. Manufacturer warranties on materials run 30 years to lifetime.</p></details>
  <details slot="items"><summary>Will you clean up?</summary><p>Magnet sweep of the lawn and driveway twice a day, gutters cleared, and shingles hauled to a recycler, not a landfill.</p></details>
</faq-accordion>
```

Variants: `<faq-accordion variant="two-col">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
