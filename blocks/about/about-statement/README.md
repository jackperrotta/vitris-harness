# about-statement

One big centered sentence with small inline photos — an editorial counterpoint.

- **Category:** about
- **Media:** 3–4 tiny inline photos
- **Registers:** professional, beauty, b2b
- **Variants:** left

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `statement` | `<p>` one long sentence; inline `<img>` (square, ~96px) and `<strong>` for emphasis |

## Example

```html
<about-statement>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Our story</p>
  <p slot="statement">From a small office downtown, <img src="/media/harvest/avatar-office.jpg" alt="" width="96" height="96"> to courts <img src="/media/harvest/avatar-court.jpg" alt="" width="96" height="96"> across the country — our work is built on trust, honest advice, and results we <img src="/media/harvest/avatar-team.jpg" alt="" width="96" height="96"> <strong>stand by</strong>.</p>
</about-statement>
```

Variants: `<about-statement variant="left">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
