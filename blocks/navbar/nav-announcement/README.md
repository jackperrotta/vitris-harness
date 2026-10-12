# nav-announcement

Announcement strip above sticky split nav.

- **Category:** navbar
- **Media:** logo optional
- **Registers:** trade, beauty, food, b2b
- **Variants:** accent

## Slots

| Slot | Content |
|------|---------|
| `announcement` | One short line, optionally with an inline `<a>` |
| `brand` | Business name or logo |
| `links` | 3–5 `<a>` primary links |
| `actions` | Primary CTA button |

## Example

```html
<nav-announcement>
  <span slot="announcement">Spring roof inspections are free through May — <a href="/contact">book yours</a></span>
  <span slot="brand">Harbor Roofing</span>
  <a slot="links" href="/services">Services</a>
  <a slot="links" href="/work">Our work</a>
  <a slot="links" href="/about">About</a>
  <a slot="links" href="/contact">Contact</a>
  <a slot="actions" class="btn" href="/contact">Free estimate</a>
</nav-announcement>
```

Variants: `<nav-announcement variant="accent">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
