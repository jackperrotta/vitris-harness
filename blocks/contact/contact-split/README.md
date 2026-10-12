# contact-split

NAP + lead form.

- **Category:** contact
- **Media:** optional map still
- **Registers:** all
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` |
| `details` | 3 `<a>` rows: `.icon-tile` + `<span><strong>value</strong><span>note</span></span>` (phone, email, address) |
| `form-title` | `<h3>` for the form card |
| `form` | `<form data-lead-form class="form-grid">` with `.field`s and a `.btn` |

## Example

```html
<contact-split>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Contact</p>
  <h2 slot="heading">Tell us about the roof.</h2>
  <p slot="lede" class="lede">A real person reads every message. Estimates are free and never pushy.</p>
  <a slot="details" href="tel:+15550102000"><span class="icon-tile icon-tile--muted"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h4l2 5-3 2a12 12 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z"/></svg></span><span><strong>(555) 010-2000</strong><span>Mon–Fri 7:30–5:00 · Sat by appointment</span></span></a>
  <a slot="details" href="mailto:hello@harborroofing.example"><span class="icon-tile icon-tile--muted"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg></span><span><strong>hello@harborroofing.example</strong><span>We reply within one business day</span></span></a>
  <a slot="details" href="https://maps.example/harbor" rel="noopener"><span class="icon-tile icon-tile--muted"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg></span><span><strong>12 Harbor St, Portland, ME 04101</strong><span>Free parking behind the building</span></span></a>
  <h3 slot="form-title">Request an estimate</h3>
  <form slot="form" data-lead-form class="form-grid form-grid--2">
    <div class="field"><label for="cs-name">Name</label><input class="input" id="cs-name" name="name" autocomplete="name" required></div>
    <div class="field"><label for="cs-phone">Phone</label><input class="input" id="cs-phone" name="phone" type="tel" autocomplete="tel"></div>
    <div class="field field--full"><label for="cs-email">Email</label><input class="input" id="cs-email" name="email" type="email" autocomplete="email" required></div>
    <div class="field field--full"><label for="cs-msg">What's going on?</label><textarea class="textarea" id="cs-msg" name="message" placeholder="Leak over the kitchen, house built 1987, asphalt shingles…"></textarea></div>
    <div class="field field--full"><button class="btn btn-lg" type="submit">Send request</button></div>
    <small class="field--full">We'll call or email within one business day.</small>
  </form>
</contact-split>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
