# process-stepper

One large photo panel per step with a step strip below (tabs island).

- **Category:** process
- **Media:** one photo per step
- **Registers:** professional, trade, beauty
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` (one sentence) |
| `panels` | 3–6 `<div role="tabpanel" id="…" class="photo-card"><img><div class="photo-card__body"><p class="eyebrow">Step n of N</p><h3>…</h3><p>…</p></div></div>` |
| `tabs` | Matching `<button role="tab" type="button" class="tabs__tab" aria-controls="…"><span>Step n</span><strong>Title</strong></button>` (first has `aria-selected="true"`) |

## Example

```html
<process-stepper>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Our process</p>
  <h2 slot="heading">Five clear steps from first call to final result.</h2>
  <p slot="lede" class="lede">Same steps, same care, every case. The same senior team is with you from the first call to the end.</p>
  <div slot="panels" role="tabpanel" id="step-call" class="photo-card"><img src="/media/harvest/step-1.jpg" alt="" width="1600" height="900" loading="lazy"><div class="photo-card__body"><p class="eyebrow">Step 1 of 5</p><h3>First call</h3><p>A senior lawyer takes your call — never an assistant. We check for conflicts and decide together if we're the right fit.</p></div></div>
  <div slot="panels" role="tabpanel" id="step-strategy" class="photo-card"><img src="/media/harvest/step-2.jpg" alt="" width="1600" height="900" loading="lazy"><div class="photo-card__body"><p class="eyebrow">Step 2 of 5</p><h3>Strategy</h3><p>A written plan with the likely paths, costs, and timelines — before you commit to anything.</p></div></div>
  <div slot="panels" role="tabpanel" id="step-prep" class="photo-card"><img src="/media/harvest/step-3.jpg" alt="" width="1600" height="900" loading="lazy"><div class="photo-card__body"><p class="eyebrow">Step 3 of 5</p><h3>Preparation</h3><p>Evidence, witnesses, and filings assembled by the team that will actually argue the case.</p></div></div>
  <div slot="panels" role="tabpanel" id="step-pretrial" class="photo-card"><img src="/media/harvest/step-4.jpg" alt="" width="1600" height="900" loading="lazy"><div class="photo-card__body"><p class="eyebrow">Step 4 of 5</p><h3>Pre-trial</h3><p>Motions and negotiations that often end the matter before a courtroom is needed.</p></div></div>
  <div slot="panels" role="tabpanel" id="step-result" class="photo-card"><img src="/media/harvest/step-5.jpg" alt="" width="1600" height="900" loading="lazy"><div class="photo-card__body"><p class="eyebrow">Step 5 of 5</p><h3>Final result</h3><p>Trial, settlement, or dismissal — and a plain-language debrief on what it means for you.</p></div></div>
  <button slot="tabs" role="tab" type="button" class="tabs__tab" aria-controls="step-call" aria-selected="true"><span>Step 1</span><strong>First call</strong></button>
  <button slot="tabs" role="tab" type="button" class="tabs__tab" aria-controls="step-strategy"><span>Step 2</span><strong>Strategy</strong></button>
  <button slot="tabs" role="tab" type="button" class="tabs__tab" aria-controls="step-prep"><span>Step 3</span><strong>Preparation</strong></button>
  <button slot="tabs" role="tab" type="button" class="tabs__tab" aria-controls="step-pretrial"><span>Step 4</span><strong>Pre-trial</strong></button>
  <button slot="tabs" role="tab" type="button" class="tabs__tab" aria-controls="step-result"><span>Step 5</span><strong>Final result</strong></button>
</process-stepper>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
