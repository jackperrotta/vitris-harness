# contact-cards

Phone / email / address cards.

- **Category:** contact
- **Media:** none
- **Registers:** trade, professional
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` |
| `cards` | 3 `.card` items: `.icon-tile`, `<h3>` label, `<p>` value (with `<a>`), `<p>` note |

## Example

```html
<contact-cards>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Get in touch</p>
  <h2 slot="heading">Three ways to reach us</h2>
  <p slot="lede" class="lede">Pick whichever is easiest — they all land with the same two people.</p>
  <div slot="cards" class="card"><div class="card__body"><span class="icon-tile icon-tile--round"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h4l2 5-3 2a12 12 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z"/></svg></span><h3>Call</h3><p><a href="tel:+15550102000">(555) 010-2000</a></p><p>Mon–Fri 7:30–5:00</p></div></div>
  <div slot="cards" class="card"><div class="card__body"><span class="icon-tile icon-tile--round"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg></span><h3>Email</h3><p><a href="mailto:hello@harborroofing.example">hello@harborroofing.example</a></p><p>Replies within one business day</p></div></div>
  <div slot="cards" class="card"><div class="card__body"><span class="icon-tile icon-tile--round"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg></span><h3>Visit</h3><p><a href="https://maps.example/harbor" rel="noopener">12 Harbor St, Portland</a></p><p>Free parking out back</p></div></div>
</contact-cards>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
