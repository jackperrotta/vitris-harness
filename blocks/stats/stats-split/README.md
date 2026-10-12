# stats-split

Stat cluster beside copy.

- **Category:** stats
- **Media:** optional media
- **Registers:** professional, trade
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` (one sentence) |
| `actions` | Optional button |
| `stats` | 4 `.stat` blocks (rendered as a 2×2 grid) |

## Example

```html
<stats-split>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Track record</p>
  <h2 slot="heading">Numbers our clients check before they call</h2>
  <p slot="lede" class="lede">Every figure here is from the last twelve months and updates quarterly.</p>
  <a slot="actions" class="btn" href="/contact">Talk to us</a>
  <div slot="stats" class="stat"><p class="stat__value" data-count-to="214">214</p><p class="stat__label">Estates administered</p></div>
  <div slot="stats" class="stat"><p class="stat__value" data-count-to="11">11</p><p class="stat__label">Days median to first filing</p></div>
  <div slot="stats" class="stat"><p class="stat__value">$0</p><p class="stat__label">Surprise fees, ever</p></div>
  <div slot="stats" class="stat"><p class="stat__value">4.9</p><p class="stat__label">Client rating</p></div>
</stats-split>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
