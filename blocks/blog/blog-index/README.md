# blog-index

Post card grid.

- **Category:** blog
- **Media:** cover images
- **Registers:** b2b, professional, food
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` |
| `actions` | Optional link (e.g. "All posts") |
| `posts` | 3 or 6 `<article class="card card--interactive">`: linked `.card__media.ratio-16x9`, `<p class="eyebrow">` meta, `<h3><a>`, `<p>` excerpt, `.btn-arrow` |

## Example

```html
<blog-index>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Guides</p>
  <h2 slot="heading">Straight answers about roofs</h2>
  <p slot="lede" class="lede">Written by the people who install them, not a content agency.</p>
  <a slot="actions" class="btn-outline" href="/blog">All posts</a>
  <article slot="posts" class="card card--interactive"><a class="card__media ratio-16x9" href="/blog/post" tabindex="-1" aria-hidden="true"><img src="/media/harvest/post-1.jpg" alt="" width="1600" height="900" loading="lazy"></a><div class="card__body"><p class="eyebrow">Guides · 6 min read</p><h3><a href="/blog/post">How long does an asphalt roof actually last in Maine?</a></h3><p>The brochure says 30 years. Here's what we see on tear-offs, and what shortens or extends it.</p><a class="btn-arrow" href="/blog/post">Read</a></div></article>
  <article slot="posts" class="card card--interactive"><a class="card__media ratio-16x9" href="/blog/post" tabindex="-1" aria-hidden="true"><img src="/media/harvest/post-2.jpg" alt="" width="1600" height="900" loading="lazy"></a><div class="card__body"><p class="eyebrow">Money · 4 min read</p><h3><a href="/blog/post">Repair or replace? A five-question checklist</a></h3><p>Most roofs we're asked to replace don't need it yet. Run through these before you get quotes.</p><a class="btn-arrow" href="/blog/post">Read</a></div></article>
  <article slot="posts" class="card card--interactive"><a class="card__media ratio-16x9" href="/blog/post" tabindex="-1" aria-hidden="true"><img src="/media/harvest/post-3.jpg" alt="" width="1600" height="900" loading="lazy"></a><div class="card__body"><p class="eyebrow">Behind the scenes · 3 min read</p><h3><a href="/blog/post">What happens to your old shingles</a></h3><p>About 90% of what comes off your roof gets recycled into road base. Here's how.</p><a class="btn-arrow" href="/blog/post">Read</a></div></article>
</blog-index>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
