# menu-featured

Featured dishes with prices.

- **Category:** pricing
- **Media:** food photos
- **Registers:** food
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` |
| `actions` | Optional link to the full menu |
| `cards` | 3 or 6 dish `.card`: `.card__media.ratio-4x3`, `<h3>`, `.price`, `<p>` description |

## Example

```html
<menu-featured>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">From the kitchen</p>
  <h2 slot="heading">This week's favorites</h2>
  <p slot="lede" class="lede">Menu changes with the market — these three rarely leave.</p>
  <a slot="actions" class="btn-outline" href="/menu">Full menu</a>
  <article slot="cards" class="card card--interactive"><div class="card__media ratio-4x3"><img src="/media/harvest/dish-1.jpg" alt="Seared scallops" width="1200" height="900" loading="lazy"></div><div class="card__body"><h3>Seared scallops</h3><p class="price"><span class="price__amount">$28</span></p><p>Brown butter, sweet corn, chive.</p></div></article>
  <article slot="cards" class="card card--interactive"><div class="card__media ratio-4x3"><img src="/media/harvest/dish-2.jpg" alt="Roast half chicken" width="1200" height="900" loading="lazy"></div><div class="card__body"><h3>Roast half chicken</h3><p class="price"><span class="price__amount">$24</span></p><p>Potato purée, charred lemon, jus.</p></div></article>
  <article slot="cards" class="card card--interactive"><div class="card__media ratio-4x3"><img src="/media/harvest/dish-3.jpg" alt="Mushroom tagliatelle" width="1200" height="900" loading="lazy"></div><div class="card__body"><h3>Mushroom tagliatelle</h3><p class="price"><span class="price__amount">$22</span></p><p>Hen of the woods, thyme, pecorino.</p></div></article>
</menu-featured>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
