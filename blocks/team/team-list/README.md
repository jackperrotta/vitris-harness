# team-list

Compact name/role list.

- **Category:** team
- **Media:** optional avatars
- **Registers:** professional, b2b
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` |
| `people` | 4–10 `<li>`: `<img class="avatar">`, a `<div>` with `<strong>` name + `<span>` role, optional trailing `<a>` (email/LinkedIn) |

## Example

```html
<team-list>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">People</p>
  <h2 slot="heading">Who you'll work with</h2>
  <li slot="people"><img src="/media/harvest/avatar-1.jpg" alt="" width="96" height="96" class="avatar"><div><strong>Rachel Osei</strong><span>Partner · estates &amp; trusts</span></div><a href="mailto:rachel@example.com">rachel@example.com</a></li>
  <li slot="people"><img src="/media/harvest/avatar-2.jpg" alt="" width="96" height="96" class="avatar"><div><strong>Daniel Whitcomb</strong><span>Partner · probate &amp; elder law</span></div><a href="mailto:daniel@example.com">daniel@example.com</a></li>
  <li slot="people"><img src="/media/harvest/avatar-3.jpg" alt="" width="96" height="96" class="avatar"><div><strong>Maya Torres</strong><span>Paralegal</span></div><a href="mailto:maya@example.com">maya@example.com</a></li>
  <li slot="people"><img src="/media/harvest/avatar-4.jpg" alt="" width="96" height="96" class="avatar"><div><strong>Ben Carver</strong><span>Client coordinator</span></div><a href="tel:+15550102000">(555) 010-2000</a></li>
</team-list>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
