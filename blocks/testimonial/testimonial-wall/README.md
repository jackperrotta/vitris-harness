# testimonial-wall

Dense quote wall / press mentions.

- **Category:** testimonial
- **Media:** press marks optional
- **Registers:** b2b, professional
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` |
| `quotes` | 6–9 `<blockquote class="quote quote--card">` each with `<p>` + `<cite>` |

## Example

```html
<testimonial-wall>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Word of mouth</p>
  <h2 slot="heading">What owners tell each other about us</h2>
  <blockquote slot="quotes" class="quote quote--card"><p>“Books closed by the 5th, like clockwork. I stopped checking.”</p><cite>Marco D.<span>Dunn Plumbing</span></cite></blockquote>
  <blockquote slot="quotes" class="quote quote--card"><p>“They found $14k in uncategorized expenses my old bookkeeper missed.”</p><cite>Lena R.<span>Castine Electric</span></cite></blockquote>
  <blockquote slot="quotes" class="quote quote--card"><p>“First bookkeeper who understood job costing without me explaining it.”</p><cite>Tom H.<span>Ridgeline Builders</span></cite></blockquote>
  <blockquote slot="quotes" class="quote quote--card"><p>“Tax season used to take me a week. This year it took one email.”</p><cite>Sam O.<span>Bay Paving</span></cite></blockquote>
  <blockquote slot="quotes" class="quote quote--card"><p>“Flat monthly price. No surprise hours. That alone was worth switching.”</p><cite>Aisha B.<span>Harbor Roofing</span></cite></blockquote>
  <blockquote slot="quotes" class="quote quote--card"><p>“I finally know which jobs make money.”</p><cite>Kevin T.<span>Tidewater Landscaping</span></cite></blockquote>
</testimonial-wall>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
