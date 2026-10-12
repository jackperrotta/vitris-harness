# footer-compact

Brand + legal + cookie link.

- **Category:** footer
- **Media:** logo optional
- **Registers:** all
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `brand` | Business name or logo |
| `links` | Optional 3–5 `<a>` nav links |
| `legal` | `<a>` links + trailing `<span>` copyright |

## Example

```html
<footer-compact>
  <span slot="brand">Harbor Roofing</span>
  <a slot="links" href="/services">Services</a>
  <a slot="links" href="/work">Our work</a>
  <a slot="links" href="/about">About</a>
  <a slot="links" href="/contact">Contact</a>
  <a slot="legal" href="/privacy">Privacy</a>
  <a slot="legal" href="/cookie-compliance">Cookie compliance</a>
  <span slot="legal">© 2026 Harbor Roofing LLC · Maine license #RC-20419</span>
</footer-compact>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
