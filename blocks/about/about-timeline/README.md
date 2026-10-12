# about-timeline

Horizontal milestones — year, photo, one line each.

- **Category:** about
- **Media:** one photo per milestone
- **Registers:** trade, professional, food
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` (one sentence) |
| `milestones` | 3–5 `<li><div class="frame ratio-4x3"><img></div><time>2009</time><h3>Title</h3><p>…</p></li>` |

## Example

```html
<about-timeline>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Our story</p>
  <h2 slot="heading">Local from day one.</h2>
  <p slot="lede" class="lede">Harbor started with one truck, a borrowed trailer, and one rule we've never broken: if our name goes on your roof, we stand behind it.</p>
  <li slot="milestones"><div class="frame ratio-4x3"><img src="/media/harvest/hist-2009.jpg" alt="" width="1200" height="900" loading="lazy"></div><time>2009</time><h3>One truck, one promise</h3><p>Sam Calloway starts Harbor after seeing too many bad storm repairs.</p></li>
  <li slot="milestones"><div class="frame ratio-4x3"><img src="/media/harvest/hist-2014.jpg" alt="" width="1200" height="900" loading="lazy"></div><time>2014</time><h3>The crew doubles</h3><p>Estimators and project managers join — still no subcontractors.</p></li>
  <li slot="milestones"><div class="frame ratio-4x3"><img src="/media/harvest/hist-2019.jpg" alt="" width="1200" height="900" loading="lazy"></div><time>2019</time><h3>2,000th roof</h3><p>Every one backed by the same written warranty.</p></li>
  <li slot="milestones"><div class="frame ratio-4x3"><img src="/media/harvest/hist-today.jpg" alt="" width="1200" height="900" loading="lazy"></div><time>Today</time><h3>A team of 40 locals</h3><p>3,500+ roofs across Greater Portland, and counting.</p></li>
</about-timeline>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
