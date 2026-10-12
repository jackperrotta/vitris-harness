# trust-quote

Single spotlight quote as trust band.

- **Category:** trust-strip
- **Media:** optional portrait
- **Registers:** all
- **Variants:** dark

## Slots

| Slot | Content |
|------|---------|
| `(default)` | `<p>` quote text (1–2 sentences) followed by `<cite>` name · context |
| `avatar` | Optional `<img class="avatar avatar--lg">` |

## Example

```html
<trust-quote>
  <img src="/media/harvest/review-1.jpg" alt="" width="128" height="128" slot="avatar" class="avatar avatar--lg">
  <p>They showed up when they said they would, finished a day early, and the yard was cleaner than when they started. I've already sent two neighbors their way.</p>
  <cite>Jordan P. · Deering Center, homeowner since 2015</cite>
</trust-quote>
```

Variants: `<trust-quote variant="dark">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
