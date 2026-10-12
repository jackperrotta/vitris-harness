# process-steps

Numbered horizontal/stacked steps.

- **Category:** process
- **Media:** optional icons
- **Registers:** trade, b2b, professional
- **Variants:** three

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` (one sentence) |
| `steps` | 3–4 `<li>` with `<h3>` + `<p>`; numbers render automatically |

## Example

```html
<process-steps>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">How it works</p>
  <h2 slot="heading">From first call to final walkthrough</h2>
  <p slot="lede" class="lede">Most projects take two weeks from estimate to finished roof.</p>
  <li slot="steps"><h3>Call or book online</h3><p>Tell us what you're seeing. We'll schedule an inspection within three business days.</p></li>
  <li slot="steps"><h3>Inspection &amp; estimate</h3><p>Drone photos, an attic check, and a written line-item estimate inside 48 hours.</p></li>
  <li slot="steps"><h3>Install</h3><p>One crew, one to three days, tarps on the beds and a magnet sweep every evening.</p></li>
  <li slot="steps"><h3>Walkthrough &amp; warranty</h3><p>We walk the roof with you, hand over photos, and register your warranty.</p></li>
</process-steps>
```

Variants: `<process-steps variant="three">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
