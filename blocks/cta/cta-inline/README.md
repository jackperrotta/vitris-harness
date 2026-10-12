# cta-inline

Quiet one-line CTA: heading beside a button with the team's faces.

- **Category:** cta
- **Media:** 2–3 tiny portraits
- **Registers:** b2b, professional, beauty
- **Variants:** center

## Slots

| Slot | Content |
|------|---------|
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` |
| `action` | One `<a class="btn-outline">` containing `<span class="avatar-group">` + label |

## Example

```html
<cta-inline>
  <h2 slot="heading">Ready to bring your brand to life?</h2>
  <p slot="lede" class="lede">Book a 30-minute call. We'll tell you honestly whether we're the right studio for it.</p>
  <a slot="action" class="btn-outline" href="/contact"><span class="avatar-group"><img src="/media/harvest/avatar-1.jpg" alt="" width="96" height="96" class="avatar"><img src="/media/harvest/avatar-2.jpg" alt="" width="96" height="96" class="avatar"><img src="/media/harvest/avatar-3.jpg" alt="" width="96" height="96" class="avatar"></span>Talk with the team</a>
</cta-inline>
```

Variants: `<cta-inline variant="center">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
