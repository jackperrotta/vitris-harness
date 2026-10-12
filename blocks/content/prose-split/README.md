# prose-split

Short label left, prose right; optional facts row (client, date, scope).

- **Category:** content
- **Media:** none
- **Registers:** all
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `label` | `<h2>` short label ("Our story", "Project overview") |
| `(default)` | 2–4 `<p>` paragraphs |
| `meta` | Optional 2–4 `<div><span>Label</span><strong>Value</strong></div>` facts |

## Example

```html
<prose-split>
  <h2 slot="label">Project overview</h2>
  <p>We worked with Nextdock from their earliest sketches, creating a logo that reflects speed and innovation. The new identity helped them attract early adopters and secure their first round of investment.</p>
  <p>The system covers the wordmark, an app icon, packaging for the developer kit, and a set of motion rules for the product UI.</p>
  <div slot="meta"><span>Client</span><strong>Nextdock</strong></div>
  <div slot="meta"><span>Date</span><strong>March 2026</strong></div>
  <div slot="meta"><span>Industry</span><strong>Technology</strong></div>
  <div slot="meta"><span>Services</span><strong>Logo design</strong></div>
</prose-split>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
