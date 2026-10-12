# footer-wordmark

Directory footer with a giant clipped wordmark.

- **Category:** footer
- **Media:** logo optional
- **Registers:** trade, b2b, beauty
- **Variants:** dark

## Slots

| Slot | Content |
|------|---------|
| `brand` | Business name or logo |
| `tagline` | `<p>` one line about the business |
| `social` | Optional icon links (`<a aria-label>` with `.icon`) |
| `columns` | 2–3 `<div>`: `<h3>` heading then `<a>` links |
| `wordmark` | `<span>` short brand word (1–2 words) rendered huge |
| `legal` | `<a>` links + a trailing `<span>` copyright |

## Example

```html
<footer-wordmark>
  <span slot="brand">Apex Roofing</span>
  <p slot="tagline">Done in days. Built for decades.</p>
  <a slot="social" href="https://instagram.com/example" aria-label="Instagram" rel="noopener"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8"/></svg></a>
  <a slot="social" href="https://facebook.com/example" aria-label="Facebook" rel="noopener"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z"/></svg></a>
  <div slot="columns"><h3>Menu</h3><a href="/services">Services</a><a href="/about">About</a><a href="/blog">Blog</a><a href="/faq">FAQ</a><a href="/contact">Contact</a></div>
  <div slot="columns"><h3>Services</h3><a href="/services/roofing">Roofing</a><a href="/services/gutters">Gutters</a><a href="/services/siding">Siding</a><a href="/services/windows">Windows</a><a href="/services/masonry">Masonry</a></div>
  <span slot="wordmark">Apex</span>
  <a slot="legal" href="/privacy">Privacy policy</a>
  <a slot="legal" href="/cookie-compliance">Cookie compliance</a>
  <span slot="legal">© 2026 Apex Roofing · Licensed &amp; insured · Serving Greater Portland</span>
</footer-wordmark>
```

Variants: `<footer-wordmark variant="dark">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
