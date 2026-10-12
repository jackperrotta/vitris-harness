# hero-stats

Headline with proof metrics under the fold of the hero.

- **Category:** hero
- **Media:** optional LCP
- **Registers:** trade, b2b, professional
- **Variants:** dark

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Short line above headline |
| `(default)` | `<h1>` + `<p class="lede lede--lg">` |
| `actions` | 1–2 buttons |
| `stats` | 3–4 `.stat` blocks (`data-count-to` on the value for count-up) |

## Example

```html
<hero-stats>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Electrical contractors · Since 1998</p>
  <h1>Wired right the first time.</h1>
  <p class="lede lede--lg">Residential and light-commercial electrical for Cumberland County. Panel upgrades, EV chargers, generators, and the odd mystery outlet.</p>
  <a slot="actions" class="btn btn-lg" href="/contact">Get a free estimate</a>
  <a slot="actions" class="btn-outline btn-lg" href="/work">See our work</a>
  <div slot="stats" class="stat"><p class="stat__value" data-count-to="26">26</p><p class="stat__label">Years in business</p></div>
  <div slot="stats" class="stat"><p class="stat__value" data-count-to="4800" data-count-suffix="+">4800+</p><p class="stat__label">Jobs completed</p></div>
  <div slot="stats" class="stat"><p class="stat__value">4.9</p><p class="stat__label">Average rating</p></div>
  <div slot="stats" class="stat"><p class="stat__value" data-count-to="24" data-count-suffix="h">24h</p><p class="stat__label">Emergency response</p></div>
</hero-stats>
```

Variants: `<hero-stats variant="dark">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
