# blog-featured

One featured + side list.

- **Category:** blog
- **Media:** covers
- **Registers:** professional, b2b
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` |
| `media` | Featured cover `<img>` (16:9) |
| `featured` | `<p class="eyebrow">` meta, `<h3><a>` title, `<p>` excerpt, `.btn-arrow` |
| `posts` | 3–5 compact `<a class="c-blog-featured__row">`: `<span class="eyebrow">` meta + `<strong>` title |

## Example

```html
<blog-featured>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">From the blog</p>
  <h2 slot="heading">Latest</h2>
  <img src="/media/harvest/post-1.jpg" alt="" width="1600" height="900" slot="media" loading="lazy">
  <p slot="featured" class="eyebrow">Guides · 6 min read</p>
  <h3 slot="featured"><a href="/blog/roof-lifespan">How long does an asphalt roof actually last in Maine?</a></h3>
  <p slot="featured">The brochure says 30 years. Here's what we see on tear-offs after 15, 20, and 25 winters — and the three things that make the difference.</p>
  <a slot="featured" class="btn-arrow" href="/blog/roof-lifespan">Read the guide</a>
  <a slot="posts" class="c-blog-featured__row" href="/blog/repair-or-replace"><span class="eyebrow">Money · 4 min</span><strong>Repair or replace? A five-question checklist</strong></a>
  <a slot="posts" class="c-blog-featured__row" href="/blog/recycling"><span class="eyebrow">Behind the scenes · 3 min</span><strong>What happens to your old shingles</strong></a>
  <a slot="posts" class="c-blog-featured__row" href="/blog/ice-dams"><span class="eyebrow">Winter · 5 min</span><strong>Ice dams: what causes them and what doesn't</strong></a>
  <a slot="posts" class="c-blog-featured__row" href="/blog/metal-vs-shingle"><span class="eyebrow">Materials · 7 min</span><strong>Metal vs. shingle in a coastal climate</strong></a>
</blog-featured>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
