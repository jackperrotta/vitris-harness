# about-founder

Founder portrait beside a dark letter / quote panel.

- **Category:** about
- **Media:** one portrait
- **Registers:** trade, food, beauty, professional
- **Variants:** reverse

## Slots

| Slot | Content |
|------|---------|
| `media` | `<img>` portrait (4:5) |
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `quote` | 1–3 `<p>` paragraphs in the founder's voice |
| `byline` | `<div><strong>Name</strong><span>Role</span></div>` |

## Example

```html
<about-founder>
  <img src="/media/harvest/founder.jpg" alt="Sam Calloway holding a hard hat on a job site" width="1200" height="1500" slot="media" loading="lazy">
  <p slot="eyebrow" class="eyebrow eyebrow--accent">From the founder</p>
  <h2 slot="heading">A different way to build a roofing company.</h2>
  <p slot="quote">“I started Harbor after one bad hail season too many — watching out-of-town crews patch roofs, cash the check, and leave before the first leak showed up.</p>
  <p slot="quote">Every roof we build comes with the same promise: the person who shakes your hand on day one walks the finished roof with you at the end. And the warranty is in writing, so you can hold us to it.”</p>
  <div slot="byline"><strong>Sam Calloway</strong><span>Founder &amp; master roofer</span></div>
</about-founder>
```

Variants: `<about-founder variant="reverse">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
