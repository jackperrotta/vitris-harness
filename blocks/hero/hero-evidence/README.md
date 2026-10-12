# hero-evidence

Type-led, no-photo opening with a quieter column for verified reasons to trust the business. The two columns carry different levels of emphasis; the proof is not a substitute for an invented testimonial or metric. This example is for the fictional Northline Counsel practice.

- **Category:** hero
- **Media:** none
- **Registers:** professional, b2b, trade
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional context label |
| `(default)` | One `<h1>` and a concise introductory paragraph |
| `actions` | Optional primary and secondary links |
| `proof` | List of specific, verified credentials or service facts; no fabricated claims |

## Example

```html
<hero-evidence>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Northline Counsel · fictional example</p>
  <h1>Clear counsel for decisions that cannot wait.</h1>
  <p class="lede lede--lg">A small legal practice helping families and business owners understand their options before they choose a path.</p>
  <a slot="actions" class="btn" href="/contact">Request a conversation</a>
  <a slot="actions" class="btn-outline" href="/services">Explore services</a>
  <ul slot="proof"><li>Direct conversation with the person handling your matter</li><li>Written scope before work begins</li><li>Practical next steps after the first meeting</li></ul>
</hero-evidence>
```

Replace every example claim with a verified business fact. If no credible proof exists, use a simpler type-led opening. The proof column stacks after the main message on mobile.
