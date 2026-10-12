# testimonial-spotlight

Large quote with avatar attribution.

- **Category:** testimonial
- **Media:** portrait optional
- **Registers:** all
- **Variants:** dark

## Slots

| Slot | Content |
|------|---------|
| `(default)` | One `<p>` — the quote, 1–3 sentences (quote marks added automatically) |
| `avatar` | Optional `<img class="avatar avatar--lg">` |
| `attribution` | `<strong>` name + `<span>` context |

## Example

```html
<testimonial-spotlight>
  <p>We interviewed four roofers. Harbor was the only one who went into the attic, and the only one whose estimate was still accurate on the last day of the job.</p>
  <img src="/media/harvest/review-2.jpg" alt="" width="128" height="128" slot="avatar" class="avatar avatar--lg">
  <strong slot="attribution">Dana Kowalski</strong>
  <span slot="attribution">Homeowner, South Portland</span>
</testimonial-spotlight>
```

Variants: `<testimonial-spotlight variant="dark">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
