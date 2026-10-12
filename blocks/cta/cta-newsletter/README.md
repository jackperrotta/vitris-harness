# cta-newsletter

Email capture strip.

- **Category:** cta
- **Media:** none
- **Registers:** food, beauty, b2b
- **Variants:** dark

## Slots

| Slot | Content |
|------|---------|
| `heading` | `<h2>` (short) |
| `lede` | `<p class="lede">` — what they get and how often |
| `form` | `<form data-lead-form>` with an `.input-row` (email `.input` + `.btn`) and optional `<small>` |

## Example

```html
<cta-newsletter>
  <h2 slot="heading">What's baking this week</h2>
  <p slot="lede" class="lede">One email every Thursday: the weekend menu, specials, and when the croissants come out. No fluff.</p>
  <form slot="form" data-lead-form>
    <label class="visually-hidden" for="nl-email">Email</label>
    <div class="input-row"><input class="input" id="nl-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required><button class="btn" type="submit">Subscribe</button></div>
    <small>Unsubscribe any time. We never share your address.</small>
  </form>
</cta-newsletter>
```

Variants: `<cta-newsletter variant="dark">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
