# trust-reviews

Avatar cluster + rating line + review-platform marks.

- **Category:** trust-strip
- **Media:** 3–5 tiny portraits, 2–4 platform marks
- **Registers:** trade, beauty, food, professional
- **Variants:** center

## Slots

| Slot | Content |
|------|---------|
| `avatars` | 3–5 `<img class="avatar">` |
| `rating` | `<p>` stars + `<strong>4.9</strong>` + count |
| `platforms` | Optional 2–4 `<img>` platform marks (~120×32) |

## Example

```html
<trust-reviews>
  <img slot="avatars" src="/media/harvest/avatar-1.jpg" alt="" width="96" height="96" class="avatar">
  <img slot="avatars" src="/media/harvest/avatar-2.jpg" alt="" width="96" height="96" class="avatar">
  <img slot="avatars" src="/media/harvest/avatar-3.jpg" alt="" width="96" height="96" class="avatar">
  <img slot="avatars" src="/media/harvest/avatar-4.jpg" alt="" width="96" height="96" class="avatar">
  <p slot="rating"><span class="rating" aria-label="5 out of 5 stars"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg></span> <strong>4.9</strong> from 1,800+ clients</p>
  <img src="/media/harvest/logo-google.svg" alt="Google" width="120" height="32" slot="platforms">
  <img src="/media/harvest/logo-yelp.svg" alt="Yelp" width="120" height="32" slot="platforms">
  <img src="/media/harvest/logo-avvo.svg" alt="Avvo" width="120" height="32" slot="platforms">
</trust-reviews>
```

Variants: `<trust-reviews variant="center">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
