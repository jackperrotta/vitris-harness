# about-story

Heritage story split.

- **Category:** about
- **Media:** owner/place photo
- **Registers:** all
- **Variants:** reverse

## Slots

| Slot | Content |
|------|---------|
| `media` | `<img>` 4:3 — owner, crew, or storefront |
| `eyebrow` | Optional eyebrow |
| `heading` | `<h2>` |
| `(default)` | 2–3 `<p>` of story copy |
| `actions` | Optional 1–2 buttons |

## Example

```html
<about-story>
  <img src="/media/harvest/owner.jpg" alt="Founder Mike Harbor on a job site" width="1200" height="900" slot="media" loading="lazy">
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Our story</p>
  <h2 slot="heading">Started with one truck and a promise to call people back.</h2>
  <p>Mike Harbor started the company in 2009 after a decade running crews for a regional outfit that treated every customer like a line item.</p>
  <p>Fifteen years later we're eight people, three trucks, and still the same rule: every call gets returned the same day, and every roof gets a foreman who has done a hundred like it.</p>
  <a slot="actions" class="btn-outline" href="/team">Meet the crew</a>
</about-story>
```

Variants: `<about-story variant="reverse">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
