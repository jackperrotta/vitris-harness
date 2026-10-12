# service-areas

Towns we serve as chips, with a fallback line.

- **Category:** contact
- **Media:** none
- **Registers:** trade, beauty, food
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` (one sentence) |
| `areas` | 6–16 `<li>` town names |
| `note` | Optional `<p>` fallback ("Don't see your town?…") with a link |

## Example

```html
<service-areas>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Service area</p>
  <h2 slot="heading">Towns we cover in Greater Portland.</h2>
  <p slot="lede" class="lede">If we can get a truck there before lunch, we'll roof it.</p>
  <li slot="areas">Portland</li><li slot="areas">South Portland</li><li slot="areas">Falmouth</li><li slot="areas">Cape Elizabeth</li><li slot="areas">Scarborough</li><li slot="areas">Westbrook</li><li slot="areas">Yarmouth</li><li slot="areas">Cumberland</li><li slot="areas">Gorham</li><li slot="areas">Windham</li><li slot="areas">Freeport</li><li slot="areas">Saco</li>
  <p slot="note">Don't see your town? If you're within 30 minutes of one of these, you're covered — <a href="/contact">just ask</a>.</p>
</service-areas>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
