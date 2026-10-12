# menu-sections

Categorized menu lists.

- **Category:** pricing
- **Media:** optional
- **Registers:** food, beauty
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` |
| `sections` | 2–6 `.c-menu-sections__group`: `<h3>` category, then `.c-menu-sections__item` rows (`<div><strong>name</strong><span>description</span></div><span class="c-menu-sections__price">`) |

## Example

```html
<menu-sections>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Dinner</p>
  <h2 slot="heading">The menu</h2>
  <p slot="lede" class="lede">Served 5–10 pm. Ask about tonight's specials.</p>
  <div slot="sections" class="c-menu-sections__group"><h3>Starters</h3><div class="c-menu-sections__item"><div><strong>Oysters on the half shell</strong><span>Six, mignonette</span></div><span class="c-menu-sections__price">$18</span></div><div class="c-menu-sections__item"><div><strong>Burrata</strong><span>Peaches, basil, olive oil</span></div><span class="c-menu-sections__price">$14</span></div><div class="c-menu-sections__item"><div><strong>Clam chowder</strong><span>Bacon, thyme, oyster crackers</span></div><span class="c-menu-sections__price">$12</span></div></div>
  <div slot="sections" class="c-menu-sections__group"><h3>Mains</h3><div class="c-menu-sections__item"><div><strong>Seared scallops</strong><span>Brown butter, sweet corn</span></div><span class="c-menu-sections__price">$28</span></div><div class="c-menu-sections__item"><div><strong>Roast half chicken</strong><span>Potato purée, jus</span></div><span class="c-menu-sections__price">$24</span></div><div class="c-menu-sections__item"><div><strong>Haddock</strong><span>Leeks, mussels, saffron broth</span></div><span class="c-menu-sections__price">$27</span></div><div class="c-menu-sections__item"><div><strong>Ribeye</strong><span>16 oz, salsa verde</span></div><span class="c-menu-sections__price">$44</span></div></div>
  <div slot="sections" class="c-menu-sections__group"><h3>Sides</h3><div class="c-menu-sections__item"><div><strong>Fries</strong><span>Rosemary salt</span></div><span class="c-menu-sections__price">$7</span></div><div class="c-menu-sections__item"><div><strong>Charred broccolini</strong><span>Chili, lemon</span></div><span class="c-menu-sections__price">$9</span></div></div>
  <div slot="sections" class="c-menu-sections__group"><h3>Dessert</h3><div class="c-menu-sections__item"><div><strong>Blueberry buckle</strong><span>Vanilla ice cream</span></div><span class="c-menu-sections__price">$10</span></div><div class="c-menu-sections__item"><div><strong>Chocolate pot de crème</strong><span>Sea salt, olive oil</span></div><span class="c-menu-sections__price">$10</span></div></div>
</menu-sections>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
