# services-priority

An unequal service index for a business with one primary offer and several supporting services. The featured service gets depth; the remaining rows stay easy to scan. Fictional Northline Counsel copy is used only for teaching.

- **Category:** services
- **Media:** none
- **Registers:** professional, trade, b2b
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional section label |
| `heading` | `<h2>` explaining the service group |
| `intro` | Optional brief context paragraph |
| `featured` | One primary service article with action |
| `items` | Two to four secondary service articles |

## Example

```html
<services-priority>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">How we help</p>
  <h2 slot="heading">Start with the decision in front of you.</h2>
  <p slot="intro" class="lede">The first conversation is about the choice you need to make, the documents you have, and the time available.</p>
  <article slot="featured"><p class="eyebrow">Primary practice</p><h3>Planning for the people who depend on you.</h3><p>Make your wishes clear and give the people you trust a workable plan.</p><a class="btn" href="/services/planning">Explore planning</a></article>
  <article slot="items"><h3>Probate guidance</h3><p>Understand the court process and what the estate needs next.</p><a class="btn-arrow" href="/services/probate">View service</a></article>
  <article slot="items"><h3>Business transitions</h3><p>Prepare ownership, documents, and decisions before a handover.</p><a class="btn-arrow" href="/services/business">View service</a></article>
</services-priority>
```

Only use the unequal hierarchy when the business has a genuinely primary offer. Reorder or redesign the section if the services are peers.
