# hero-product

Product/mockup as architecture — b2b/agency.

- **Category:** hero
- **Media:** device mockup or product still
- **Registers:** b2b, professional
- **Variants:** reverse

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Short line above headline |
| `(default)` | `<h1>` + `<p class="lede lede--lg">` |
| `actions` | 1–2 buttons |
| `logos-label` | Tiny label above logo row (e.g. "Trusted by") |
| `logos` | 3–6 grayscale `<img>` marks |
| `media` | Product still / mockup `<img>` (4:3 or 3:2) |

## Example

```html
<hero-product>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Bookkeeping for trades</p>
  <h1>Your books closed by the 5th, every month.</h1>
  <p class="lede lede--lg">We reconcile, categorize, and send you one clear report. You keep the trucks moving.</p>
  <a slot="actions" class="btn btn-lg" href="/contact">Book a 20-minute call</a>
  <a slot="actions" class="btn-outline btn-lg" href="/pricing">See pricing</a>
  <span slot="logos-label">Trusted by 60+ contractors</span>
  <img src="/media/harvest/logo-1.svg" alt="Dunn Plumbing" width="160" height="48" slot="logos">
  <img src="/media/harvest/logo-2.svg" alt="Castine Electric" width="160" height="48" slot="logos">
  <img src="/media/harvest/logo-3.svg" alt="Ridgeline Builders" width="160" height="48" slot="logos">
  <img src="/media/harvest/logo-4.svg" alt="Bay Paving" width="160" height="48" slot="logos">
  <img src="/media/harvest/report-mockup.jpg" alt="Monthly report on a laptop screen" width="1600" height="1200" slot="media" fetchpriority="high">
</hero-product>
```

Variants: `<hero-product variant="reverse">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
