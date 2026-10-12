# process-sticky

Sticky intro column beside numbered steps with thumbnails.

- **Category:** process
- **Media:** one thumbnail per step
- **Registers:** trade, beauty, b2b
- **Variants:** dark

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` (one sentence) |
| `actions` | Optional 1–2 buttons / `.btn-arrow` links |
| `steps` | 4–6 `<li><img><div><h3>Title</h3><p>…</p></div></li>` (numbers are added automatically) |

## Example

```html
<process-sticky>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Our process</p>
  <h2 slot="heading">Five steps. Start to finish.</h2>
  <p slot="lede" class="lede">We handle everything from the first visit to the final cleanup. You always know what happens next and what it costs.</p>
  <a slot="actions" class="btn" href="/contact">Get a free estimate</a>
  <li slot="steps"><img src="/media/harvest/step-a.jpg" alt="" width="240" height="240" loading="lazy"><div><h3>Free inspection</h3><p>We get on your roof, take photos, and tell you what shape it's in — then leave the decision to you.</p></div></li>
  <li slot="steps"><img src="/media/harvest/step-b.jpg" alt="" width="240" height="240" loading="lazy"><div><h3>Clear written estimate</h3><p>Every cost and material choice on one page. The price we quote is the price you pay.</p></div></li>
  <li slot="steps"><img src="/media/harvest/step-c.jpg" alt="" width="240" height="240" loading="lazy"><div><h3>Pick your date</h3><p>We set a date that works for you and drop off materials the day before, so the crew starts on time.</p></div></li>
  <li slot="steps"><img src="/media/harvest/step-d.jpg" alt="" width="240" height="240" loading="lazy"><div><h3>Installation</h3><p>Our licensed crew tears off the old roof and installs the new one. Most homes are done in one or two days.</p></div></li>
  <li slot="steps"><img src="/media/harvest/step-e.jpg" alt="" width="240" height="240" loading="lazy"><div><h3>Final walkthrough</h3><p>We sweep your yard for nails with magnets and walk the finished roof with you before we call it done.</p></div></li>
</process-sticky>
```

Variants: `<process-sticky variant="dark">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
