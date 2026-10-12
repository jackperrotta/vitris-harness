# feature-tabs

Tabbed feature panels.

- **Category:** feature
- **Media:** optional per-panel media
- **Registers:** b2b, professional
- **Variants:** pill

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` (one sentence) |
| `tabs` | A `.tabs__list[role=tablist]` of `button.tabs__tab[role=tab]`, then one `.tabs__panel[role=tabpanel]` per tab (`hidden` on all but the first). Panels can use `.split`. |

## Example

```html
<feature-tabs>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Services</p>
  <h2 slot="heading">Pick the plan that fits how you run the building.</h2>
  <div slot="tabs" class="tabs__list" role="tablist">
    <button type="button" class="tabs__tab" role="tab" id="ft-1" aria-controls="ft-p1" aria-selected="true">Preventive</button>
    <button type="button" class="tabs__tab" role="tab" id="ft-2" aria-controls="ft-p2" aria-selected="false">On-call</button>
    <button type="button" class="tabs__tab" role="tab" id="ft-3" aria-controls="ft-p3" aria-selected="false">Retrofit</button>
  </div>
  <div slot="tabs" class="tabs__panel split" role="tabpanel" id="ft-p1" aria-labelledby="ft-1"><div><h3>Quarterly visits, zero surprises</h3><p>Filters, belts, coils, and refrigerant checked on a schedule. You get a report with photos after every visit.</p><a class="btn-arrow" href="/plans">Plan details</a></div><div class="frame ratio-4x3"><img src="/media/harvest/rooftop-unit.jpg" alt="Technician servicing a rooftop unit" width="1200" height="900" loading="lazy"></div></div>
  <div slot="tabs" class="tabs__panel split" role="tabpanel" id="ft-p2" aria-labelledby="ft-2" hidden><div><h3>Four-hour response, 24/7</h3><p>A dispatcher who knows your buildings and a truck stocked for your equipment.</p><a class="btn-arrow" href="/plans#on-call">How dispatch works</a></div><div class="frame ratio-4x3"><img src="/media/harvest/van-night.jpg" alt="Service van at night" width="1200" height="900" loading="lazy"></div></div>
  <div slot="tabs" class="tabs__panel split" role="tabpanel" id="ft-p3" aria-labelledby="ft-3" hidden><div><h3>Replace before it fails</h3><p>Lifecycle planning for units past 15 years, with rebate paperwork handled for you.</p><a class="btn-arrow" href="/plans#retrofit">Retrofit process</a></div><div class="frame ratio-4x3"><img src="/media/harvest/new-unit.jpg" alt="New condenser install" width="1200" height="900" loading="lazy"></div></div>
</feature-tabs>
```

Variants: `<feature-tabs variant="pill">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
