# hero-menu

Restaurant/menu: headline + featured dishes strip.

- **Category:** hero
- **Media:** food photography
- **Registers:** food
- **Variants:** center

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Short line above headline |
| `(default)` | `<h1>` + `<p class="lede lede--lg">` |
| `actions` | 1–2 buttons |
| `cards` | 3 dish cards: `.card` with `.card__media.ratio-4x3`, `<h3>`, `<p>`, and `.price` |

## Example

```html
<hero-menu>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Neighborhood trattoria · Munjoy Hill</p>
  <h1>Handmade pasta, twelve tables, one long night.</h1>
  <p class="lede lede--lg">We roll the dough at four, open at five, and cook until the last table leaves.</p>
  <a slot="actions" class="btn btn-lg" href="/reserve">Reserve</a>
  <a slot="actions" class="btn-outline btn-lg" href="/menu">Full menu</a>
  <article slot="cards" class="card card--interactive"><div class="card__media ratio-4x3"><img src="/media/harvest/cacio.jpg" alt="Cacio e pepe" width="1200" height="900" loading="lazy"></div><div class="card__body"><h3>Cacio e pepe</h3><p class="price"><span class="price__amount">$19</span></p><p>Tonnarelli, pecorino, black pepper.</p></div></article>
  <article slot="cards" class="card card--interactive"><div class="card__media ratio-4x3"><img src="/media/harvest/ragu.jpg" alt="Pappardelle with short-rib ragù" width="1200" height="900" loading="lazy"></div><div class="card__body"><h3>Short-rib ragù</h3><p class="price"><span class="price__amount">$26</span></p><p>Pappardelle, six-hour braise, parmigiano.</p></div></article>
  <article slot="cards" class="card card--interactive"><div class="card__media ratio-4x3"><img src="/media/harvest/branzino.jpg" alt="Whole roasted branzino" width="1200" height="900" loading="lazy"></div><div class="card__body"><h3>Whole branzino</h3><p class="price"><span class="price__amount">$34</span></p><p>Lemon, capers, charred fennel.</p></div></article>
</hero-menu>
```

Variants: `<hero-menu variant="center">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
