# about-mission

Centered mission statement.

- **Category:** about
- **Media:** optional background still
- **Registers:** professional, beauty, food
- **Variants:** dark

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional eyebrow |
| `(default)` | `<h2>` (a single strong sentence) + one `<p class="lede">` |
| `actions` | Optional 1 button |

## Example

```html
<about-mission>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">What we believe</p>
  <h2>Good work is the marketing.</h2>
  <p class="lede">We don't run ads. Every job we book comes from a neighbor who saw the last one — so we treat every roof like the whole street is watching. Because it is.</p>
  <a slot="actions" class="btn-outline" href="/reviews">Read the reviews</a>
</about-mission>
```

Variants: `<about-mission variant="dark">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
