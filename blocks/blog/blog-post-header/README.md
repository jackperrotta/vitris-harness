# blog-post-header

Article title block.

- **Category:** blog
- **Media:** optional hero
- **Registers:** all
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `meta` | `<span>` category · read time · date |
| `(default)` | `<h1>` + `<p class="lede lede--lg">` standfirst |
| `byline` | Optional `.byline` with avatar + author |
| `media` | Optional cover `<img>` (21:9) |

## Example

```html
<blog-post-header>
  <span slot="meta">Guides · 6 min read · March 12, 2026</span>
  <h1>How long does an asphalt roof actually last in Maine?</h1>
  <p class="lede lede--lg">The brochure says 30 years. Here's what we see on tear-offs after 15, 20, and 25 winters — and the three things that make the difference.</p>
  <div slot="byline" class="byline"><img src="/media/harvest/team-mike.jpg" alt="" width="96" height="96" class="avatar"><div><strong>Mike Harbor</strong><span>Founder, 26 years on roofs</span></div></div>
  <img src="/media/harvest/post-1.jpg" alt="Close-up of aged asphalt shingles" width="2100" height="900" slot="media" fetchpriority="high">
</blog-post-header>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
