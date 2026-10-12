# feature-bento

Mixed-span bento feature board.

- **Category:** feature
- **Media:** mixed media tiles
- **Registers:** b2b, beauty, food
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` (one sentence) |
| `tiles` | 4–6 `.card` tiles using `bento__wide` / `bento__narrow` / `bento__tall`; mix one media tile, one stat, and copy tiles |

## Example

```html
<feature-bento>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">How we work</p>
  <h2 slot="heading">One team from estimate to final walkthrough.</h2>
  <p slot="lede" class="lede">No subcontractor roulette — the crew that quotes the job is the crew that shows up.</p>
  <article slot="tiles" class="card bento__wide"><div class="card__media"><img src="/media/harvest/crew.jpg" alt="Our crew on a Cape Elizabeth job site" width="1600" height="900" loading="lazy"></div><div class="card__body"><h3>One crew, start to finish</h3><p>Eight employees, zero subcontractors. The foreman who quotes the job runs the job.</p></div></article>
  <div slot="tiles" class="card card--flat bento__narrow"><div class="card__body"><div class="stat"><p class="stat__value">48h</p><p class="stat__label">Written estimate turnaround</p></div></div></div>
  <div slot="tiles" class="card bento__narrow"><div class="card__body"><span class="icon-tile"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6l-8-3z"/><path d="m9 12 2 2 4-4"/></svg></span><h3>Insured to $2M</h3><p>Certificates included with every estimate.</p></div></div>
  <div slot="tiles" class="card bento__wide"><div class="card__body"><h3>Everything in writing</h3><p>Materials by brand and line, a start window, and a fixed price.</p><ul class="list-check"><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Fixed-price contract</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Daily photo updates</li><li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Final walkthrough checklist</li></ul></div></div>
</feature-bento>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
