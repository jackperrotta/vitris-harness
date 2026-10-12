# specification-ledger

A dense, readable fact ledger for product or service specifications. The heading introduces why the distinctions matter; rows keep units and limits visible. The example describes a fictional material offer.

- **Category:** content
- **Media:** none
- **Registers:** b2b, trade, professional
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional section label |
| `heading` | `<h2>` explaining the facts |
| `intro` | Optional concise interpretation |
| `items` | Three or more `<div>` rows containing `<dt>` and `<dd>` |

## Example

```html
<specification-ledger>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Material guide · fictional example</p>
  <h2 slot="heading">What changes with the material.</h2>
  <p slot="intro" class="lede">Use this space to explain which specification affects the visitor's decision, then give the exact details below.</p>
  <div slot="items"><dt>Finish</dt><dd>Natural split face; color variation is expected.</dd></div>
  <div slot="items"><dt>Available sizes</dt><dd>Confirm current sizes from the supplier inventory before publishing.</dd></div>
  <div slot="items"><dt>Installation</dt><dd>Selection depends on roof pitch, substrate, and local conditions.</dd></div>
</specification-ledger>
```

Verify every dimension, standard, and availability claim. The row layout stacks labels above values at narrow widths.
