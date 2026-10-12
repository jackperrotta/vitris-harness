# testimonial-rating

Star rating band with review count.

- **Category:** testimonial
- **Media:** none
- **Registers:** trade, beauty, food, professional
- **Variants:** muted

## Slots

| Slot | Content |
|------|---------|
| `(default)` | One line: `<strong>4.9 / 5</strong>` + text |
| `actions` | Optional `.btn-arrow` link to the review source |

## Example

```html
<testimonial-rating>
  <strong>4.9 out of 5</strong> from 212 Google reviews
  <a slot="actions" class="btn-arrow" href="https://g.page/example/review" rel="noopener">Read them on Google</a>
</testimonial-rating>
```

Variants: `<testimonial-rating variant="muted">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
