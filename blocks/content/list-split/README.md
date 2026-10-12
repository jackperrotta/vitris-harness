# list-split

Label left, hairline rows right (values, process, challenge → result).

- **Category:** content
- **Media:** none
- **Registers:** all
- **Variants:** numbered

## Slots

| Slot | Content |
|------|---------|
| `label` | `<h2>` short label |
| `lede` | Optional `<p class="lede">` |
| `rows` | 3–6 `<div><h3>Title</h3><p>One or two sentences.</p></div>` |

## Example

```html
<list-split>
  <h2 slot="label">How the work runs</h2>
  <p slot="lede" class="lede">Four stages, one point of contact, no surprises at the end.</p>
  <div slot="rows"><h3>Discovery</h3><p>We get to know your business, your customers, and what the mark needs to carry.</p></div>
  <div slot="rows"><h3>Concept design</h3><p>Three directions, each exploring a distinct idea. You pick the one that feels like you.</p></div>
  <div slot="rows"><h3>Refinement</h3><p>Colour, typography, and spacing tuned until it holds up on a truck door and a favicon.</p></div>
  <div slot="rows"><h3>Delivery</h3><p>Final files in every format, a short guideline, and a call to walk your printer through it.</p></div>
</list-split>
```

Variants: `<list-split variant="numbered">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
