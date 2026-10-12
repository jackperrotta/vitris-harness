# footer-social

Social icons + NAP strip.

- **Category:** footer
- **Media:** social icons
- **Registers:** beauty, food, trade
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `brand` | Business name or logo |
| `tagline` | Optional `<p>` one-liner |
| `social` | Icon links |
| `details` | `<p>` address, `<p>` phone/email, `<p>` hours |
| `legal` | `<a>` links + trailing `<span>` copyright |

## Example

```html
<footer-social>
  <span slot="brand">Maison Lune</span>
  <p slot="tagline">Color, cuts, and the occasional glass of something on Exchange Street.</p>
  <a slot="social" href="https://instagram.com/example" aria-label="Instagram" rel="noopener"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8"/></svg></a>
  <a slot="social" href="https://facebook.com/example" aria-label="Facebook" rel="noopener"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z"/></svg></a>
  <p slot="details"><strong>41 Exchange St, Portland, ME 04101</strong></p>
  <p slot="details"><a href="tel:+15550102000">(555) 010-2000</a> · <a href="mailto:hello@maisonlune.example">hello@maisonlune.example</a></p>
  <p slot="details">Tue–Sat 9–7 · Sun–Mon closed</p>
  <a slot="legal" href="/privacy">Privacy</a>
  <a slot="legal" href="/cookie-compliance">Cookie compliance</a>
  <span slot="legal">© 2026 Maison Lune</span>
</footer-social>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
