# cta-floating-bar

Compact bottom/inline urgency bar (static).

- **Category:** cta
- **Media:** none
- **Registers:** trade, food
- **Variants:** sticky, accent

## Slots

| Slot | Content |
|------|---------|
| `(default)` | One line of text (`<strong>` the offer) |
| `actions` | One `.btn.btn-sm` |

## Example

```html
<cta-floating-bar>
  <strong>Spring special:</strong> free gutter guards with any full roof replacement booked before May 31.
  <a slot="actions" class="btn btn-sm" href="/contact">Claim the offer</a>
</cta-floating-bar>
```

Variants: `<cta-floating-bar variant="sticky">` (also: `accent`).

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
