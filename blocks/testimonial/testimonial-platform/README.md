# testimonial-platform

Review-platform card: big rating, three recent reviews, "write a review" link.

- **Category:** testimonial
- **Media:** small portraits
- **Registers:** trade, beauty, food
- **Variants:** dark

## Slots

| Slot | Content |
|------|---------|
| `rating` | `<p class="stat__value">4.9</p>` |
| `summary` | `<p>` stars + review count + platform |
| `actions` | Optional 1–2 buttons / `.btn-arrow` links |
| `reviews` | 2–3 `<article class="card"><div class="card__body"><div class="byline">…</div>stars<p>…</p></div></article>` |

## Example

```html
<testimonial-platform>
  <p slot="rating" class="stat__value">4.9</p>
  <p slot="summary"><span class="rating" aria-label="5 out of 5 stars"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg></span> from 1,200+ Google reviews</p>
  <a slot="actions" class="btn-outline" href="https://g.page/example/review" rel="noopener">Write a review</a>
  <article slot="reviews" class="card"><div class="card__body"><div class="byline"><img src="/media/harvest/avatar-7.jpg" alt="" width="96" height="96" class="avatar"><div><strong>Karen Doyle</strong><span>2 weeks ago</span></div></div><span class="rating" aria-label="5 out of 5 stars"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg></span><p>Great service, highly recommend. The crew was on time both days and the yard was cleaner when they left.</p></div></article>
  <article slot="reviews" class="card"><div class="card__body"><div class="byline"><img src="/media/harvest/avatar-8.jpg" alt="" width="96" height="96" class="avatar"><div><strong>Gary Hutchins</strong><span>1 month ago</span></div></div><span class="rating" aria-label="5 out of 5 stars"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg></span><p>Outstanding from the first visit to the final walkthrough. They photographed every layer as they went.</p></div></article>
  <article slot="reviews" class="card"><div class="card__body"><div class="byline"><img src="/media/harvest/avatar-9.jpg" alt="" width="96" height="96" class="avatar"><div><strong>Janet Solomon</strong><span>1 month ago</span></div></div><span class="rating" aria-label="5 out of 5 stars"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg></span><p>Fair price, no upsell, and the estimate matched the invoice to the dollar.</p></div></article>
</testimonial-platform>
```

Variants: `<testimonial-platform variant="dark">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
