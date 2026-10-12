# contact-map

Media/map still beside details.

- **Category:** contact
- **Media:** map or storefront
- **Registers:** trade, food, beauty
- **Variants:** reverse

## Slots

| Slot | Content |
|------|---------|
| `media` | Static map image or storefront photo (4:3) |
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` |
| `details` | 3 `<a>` rows (same markup as contact-split) |
| `actions` | 1–2 buttons (directions, call) |

## Example

```html
<contact-map>
  <img src="/media/harvest/map.jpg" alt="Map showing 12 Harbor St, Portland" width="1200" height="900" slot="media" loading="lazy">
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Find us</p>
  <h2 slot="heading">Bakery &amp; café, East End</h2>
  <p slot="lede" class="lede">Corner of Harbor and Fore. Look for the blue awning.</p>
  <a slot="details" href="tel:+15550102000"><span class="icon-tile icon-tile--muted"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h4l2 5-3 2a12 12 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z"/></svg></span><span><strong>(555) 010-2000</strong><span>Mon–Fri 7:30–5:00 · Sat by appointment</span></span></a>
  <a slot="details" href="mailto:hello@harborroofing.example"><span class="icon-tile icon-tile--muted"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg></span><span><strong>hello@harborroofing.example</strong><span>We reply within one business day</span></span></a>
  <a slot="details" href="https://maps.example/harbor" rel="noopener"><span class="icon-tile icon-tile--muted"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg></span><span><strong>12 Harbor St, Portland, ME 04101</strong><span>Free parking behind the building</span></span></a>
  <a slot="actions" class="btn" href="https://maps.example/harbor" rel="noopener">Get directions</a>
  <a slot="actions" class="btn-outline" href="tel:+15550102000">Call ahead</a>
</contact-map>
```

Variants: `<contact-map variant="reverse">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
