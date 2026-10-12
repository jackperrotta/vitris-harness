# testimonial-switcher

Pick a reviewer, read their quote (tabs island).

- **Category:** testimonial
- **Media:** small portraits
- **Registers:** trade, beauty, professional
- **Variants:** avatars

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` (one sentence) |
| `panels` | 3–6 `<blockquote role="tabpanel" id="…" class="quote">“…”<cite>Name · Context</cite></blockquote>` |
| `tabs` | Matching `<button role="tab" type="button" class="tabs__tab" aria-controls="…"><img class="avatar"><span><strong>Name</strong><small>Job · Town</small></span></button>` (first has `aria-selected="true"`) |

## Example

```html
<testimonial-switcher>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Five-star work</p>
  <h2 slot="heading">In their words.</h2>
  <blockquote slot="panels" role="tabpanel" id="rev-tommy" class="quote">“Every crew member could tell me exactly what was happening on my roof and why. You can feel it's the same team, job after job.”<cite>Tommy Nguyen · Re-deck, Falmouth</cite></blockquote>
  <blockquote slot="panels" role="tabpanel" id="rev-karen" class="quote">“Storm damage on a Tuesday, tarped by Wednesday morning, new roof the next week. The insurance paperwork was handled for us.”<cite>Karen Doyle · Storm repair, Yarmouth</cite></blockquote>
  <blockquote slot="panels" role="tabpanel" id="rev-luis" class="quote">“The estimate was the invoice. Nobody else we called would put that in writing.”<cite>Luis Herrera · Full replacement, Scarborough</cite></blockquote>
  <blockquote slot="panels" role="tabpanel" id="rev-dana" class="quote">“They found a ventilation problem two other roofers missed and fixed it without changing the price.”<cite>Dana Whitmore · Warranty visit, Portland</cite></blockquote>
  <button slot="tabs" role="tab" type="button" class="tabs__tab" aria-controls="rev-tommy" aria-selected="true"><img src="/media/harvest/avatar-1.jpg" alt="" width="96" height="96" class="avatar"><span><strong>Tommy Nguyen</strong><small>Re-deck · Falmouth</small></span></button>
  <button slot="tabs" role="tab" type="button" class="tabs__tab" aria-controls="rev-karen"><img src="/media/harvest/avatar-2.jpg" alt="" width="96" height="96" class="avatar"><span><strong>Karen Doyle</strong><small>Storm repair · Yarmouth</small></span></button>
  <button slot="tabs" role="tab" type="button" class="tabs__tab" aria-controls="rev-luis"><img src="/media/harvest/avatar-3.jpg" alt="" width="96" height="96" class="avatar"><span><strong>Luis Herrera</strong><small>Full replacement · Scarborough</small></span></button>
  <button slot="tabs" role="tab" type="button" class="tabs__tab" aria-controls="rev-dana"><img src="/media/harvest/avatar-4.jpg" alt="" width="96" height="96" class="avatar"><span><strong>Dana Whitmore</strong><small>Warranty visit · Portland</small></span></button>
</testimonial-switcher>
```

Variants: `<testimonial-switcher variant="avatars">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
