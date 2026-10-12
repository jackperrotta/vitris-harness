# contact-visit

Location, hours, and access information without relying on a decorative map. The address gets prominence; practical notes answer what a visitor needs before traveling. This is a fictional teaching example.

- **Category:** contact
- **Media:** none
- **Registers:** food, beauty, professional, trade
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional context label |
| `heading` | `<h2>` about visiting |
| `intro` | Optional arrival context |
| `place` | Verified address in `<address>` |
| `hours` | Current opening hours, including exceptions if relevant |
| `access` | Optional access, transit, or parking information |
| `actions` | Optional directions or booking link |

## Example

```html
<contact-visit>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Visit us · fictional example</p>
  <h2 slot="heading">Find us before you set out.</h2>
  <p slot="intro" class="lede">The arrival details belong here when the visit is part of the service.</p>
  <address slot="place">Example Studio<br>12 Sample Street<br>Portland, ME 04101</address>
  <div slot="hours"><h3>Hours</h3><p>Monday–Friday, 9 a.m.–5 p.m.</p></div>
  <div slot="access"><h3>Access</h3><p>Confirm entrance and accessibility details with the business before publishing.</p></div>
  <a slot="actions" class="btn-outline" href="/contact">Contact the studio</a>
</contact-visit>
```

This block works with no photo or map. Replace every address, hour, and access statement with checked facts; add an accurate map link if useful.
