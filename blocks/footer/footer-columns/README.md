# footer-columns

Multi-column directory footer.

- **Category:** footer
- **Media:** logo optional
- **Registers:** all
- **Variants:** dark

## Slots

| Slot | Content |
|------|---------|
| `brand` | Business name or logo |
| `tagline` | `<p>` one line about the business + location |
| `social` | Icon links (`<a aria-label>` with `.icon`) |
| `columns` | 2–4 `<div>`: `<h3>` heading then `<a>` links |
| `legal` | `<a>` links + a trailing `<span>` copyright |

## Example

```html
<footer-columns>
  <span slot="brand">Harbor Roofing</span>
  <p slot="tagline">Residential roofing for Greater Portland since 2009. Licensed, insured, and local.</p>
  <a slot="social" href="https://instagram.com/example" aria-label="Instagram" rel="noopener"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8"/></svg></a>
  <a slot="social" href="https://facebook.com/example" aria-label="Facebook" rel="noopener"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z"/></svg></a>
  <div slot="columns"><h3>Services</h3><a href="/services/replacement">Roof replacement</a><a href="/services/repair">Leak repair</a><a href="/services/gutters">Gutters</a><a href="/services/metal">Metal roofing</a></div>
  <div slot="columns"><h3>Company</h3><a href="/about">About</a><a href="/team">Crew</a><a href="/work">Projects</a><a href="/blog">Guides</a></div>
  <div slot="columns"><h3>Contact</h3><a href="tel:+15550102000">(555) 010-2000</a><a href="mailto:hello@harborroofing.example">hello@harborroofing.example</a><a href="https://maps.example/harbor" rel="noopener">12 Harbor St, Portland</a></div>
  <a slot="legal" href="/privacy">Privacy</a>
  <a slot="legal" href="/cookie-compliance">Cookie compliance</a>
  <span slot="legal">© 2026 Harbor Roofing LLC · Maine license #RC-20419</span>
</footer-columns>
```

Variants: `<footer-columns variant="dark">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
