# trust-badges

Rating chip + cert badges row.

- **Category:** trust-strip
- **Media:** optional badge icons
- **Registers:** trade, beauty, food, professional
- **Variants:** muted

## Slots

| Slot | Content |
|------|---------|
| `(default)` | 3–6 `.badge` chips: a rating first, then licenses / guarantees / associations |

## Example

```html
<trust-badges>
  <span class="badge"><span class="rating" aria-label="5 out of 5 stars"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg></span> 4.9 · 212 Google reviews</span>
  <span class="badge badge--outline"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6l-8-3z"/><path d="m9 12 2 2 4-4"/></svg> Licensed &amp; insured</span>
  <span class="badge badge--outline"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="6"/><path d="m8.5 14-1.5 7 5-3 5 3-1.5-7"/></svg> GAF Master Elite</span>
  <span class="badge badge--outline"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg> Since 2009</span>
  <span class="badge badge--outline"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 12 3l9 8v10H3z"/><path d="M9 21v-6h6v6"/></svg> 10-year workmanship warranty</span>
</trust-badges>
```

Variants: `<trust-badges variant="muted">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
