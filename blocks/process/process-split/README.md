# process-split

Copy + large how-it-works media.

- **Category:** process
- **Media:** illustration or photo
- **Registers:** b2b, trade, beauty
- **Variants:** reverse

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` (one sentence) |
| `steps` | 3–4 `<li>` with `<strong>` lead and text |
| `media` | `<img>` 4:3 |

## Example

```html
<process-split>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Your first visit</p>
  <h2 slot="heading">Here's how a color consult goes</h2>
  <li slot="steps"><span><strong>Talk first, 15 minutes</strong>Photos you like, your routine, and what you want to spend on upkeep.</span></li>
  <li slot="steps"><span><strong>Strand test</strong>We test a hidden section so there are no surprises on the day.</span></li>
  <li slot="steps"><span><strong>Written plan and price</strong>What we'll do, how long it takes, and the exact cost before you book.</span></li>
  <img src="/media/harvest/consult.jpg" alt="Stylist consulting with a client" width="1200" height="900" slot="media" loading="lazy">
</process-split>
```

Variants: `<process-split variant="reverse">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
