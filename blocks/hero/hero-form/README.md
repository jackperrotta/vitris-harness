# hero-form

Lead form in the fold beside value prop.

- **Category:** hero
- **Media:** optional side media
- **Registers:** trade, b2b, professional
- **Variants:** dark

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Short line above headline |
| `(default)` | `<h1>` + `<p class="lede lede--lg">`; optionally a `<ul class="list-check">` |
| `proof` | Optional `.byline` proof row |
| `form-title` | `<h2>` or `<h3>` heading inside the card |
| `form` | `<form data-lead-form>` using `.form-grid` / `.field` / `.input` |

## Example

```html
<hero-form>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Commercial HVAC · Southern Maine</p>
  <h1>Keep every tenant comfortable and every unit under warranty.</h1>
  <p class="lede lede--lg">Preventive maintenance plans for property managers. One contract, quarterly visits, 4-hour emergency response.</p>
  <ul class="list-check">
    <li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Fixed annual price per unit</li>
    <li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Licensed EPA 608 technicians</li>
    <li><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Reporting after every visit</li>
  </ul>
  <div slot="proof" class="byline"><div class="avatar-group"><img src="/media/harvest/review-1.jpg" alt="" width="96" height="96" class="avatar avatar--sm"><img src="/media/harvest/review-2.jpg" alt="" width="96" height="96" class="avatar avatar--sm"><img src="/media/harvest/review-3.jpg" alt="" width="96" height="96" class="avatar avatar--sm"></div><div><span class="rating" aria-label="5 out of 5 stars"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg></span><span> 4.9 from 212 local reviews</span></div></div>
  <h3 slot="form-title">Get a maintenance quote</h3>
  <form slot="form" data-lead-form class="form-grid">
    <div class="field"><label for="hf-name">Name</label><input class="input" id="hf-name" name="name" autocomplete="name" required></div>
    <div class="field"><label for="hf-email">Work email</label><input class="input" id="hf-email" name="email" type="email" autocomplete="email" required></div>
    <div class="field"><label for="hf-units">How many units?</label><select class="select" id="hf-units" name="units"><option>1–10</option><option>11–50</option><option>50+</option></select></div>
    <button class="btn btn-lg" type="submit">Send my request</button>
    <small>We reply within one business day. No spam.</small>
  </form>
</hero-form>
```

Variants: `<hero-form variant="dark">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
