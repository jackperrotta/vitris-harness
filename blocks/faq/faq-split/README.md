# faq-split

FAQ beside contact CTA.

- **Category:** faq
- **Media:** none
- **Registers:** trade, professional, b2b
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` |
| `actions` | 1–2 buttons (call / contact) |
| `items` | 4–6 `<details>` with `<summary>` + `<p>` |

## Example

```html
<faq-split>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Good to know</p>
  <h2 slot="heading">Before you book</h2>
  <p slot="lede" class="lede">Short answers to the things people ask on the first call.</p>
  <a slot="actions" class="btn" href="tel:+15550102000"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h4l2 5-3 2a12 12 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z"/></svg>(555) 010-2000</a>
  <a slot="actions" class="btn-outline" href="/contact">Send a message</a>
  <details slot="items"><summary>How soon can you start?</summary><p>Repairs usually within the week. Full replacements book two to three weeks out in spring and fall, faster in summer.</p></details>
  <details slot="items"><summary>Do you offer financing?</summary><p>Yes — 12-month 0% and longer terms through our lending partner. Apply in five minutes; approval doesn't affect your credit score.</p></details>
  <details slot="items"><summary>Are you licensed and insured?</summary><p>Maine license #RC-20419, $2M general liability, and workers' comp on every employee. Certificates come with the estimate.</p></details>
  <details slot="items"><summary>What does the warranty cover?</summary><p>Ten years on our workmanship — any leak caused by installation, we fix free. Manufacturer warranties on materials run 30 years to lifetime.</p></details>
  <details slot="items"><summary>Will you clean up?</summary><p>Magnet sweep of the lawn and driveway twice a day, gutters cleared, and shingles hauled to a recycler, not a landfill.</p></details>
</faq-split>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
