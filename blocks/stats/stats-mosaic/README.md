# stats-mosaic

Dark stat tiles alternating with photos in one band.

- **Category:** stats
- **Media:** 2 photos
- **Registers:** professional, b2b, trade
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `tiles` | 4 tiles alternating `<div class="stat" data-scheme="dark"><p class="eyebrow">Label</p><p class="stat__value">200+</p><p>Sentence.</p></div>` and `<div class="frame"><img></div>` |

## Example

```html
<stats-mosaic>
  <div slot="tiles" class="stat" data-scheme="dark"><p class="eyebrow">Cases</p><p class="stat__value">200+</p><p>Cases successfully resolved — showing the steady results we deliver.</p></div>
  <div slot="tiles" class="frame"><img src="/media/harvest/mosaic-1.jpg" alt="Partners reviewing a brief" width="900" height="900" loading="lazy"></div>
  <div slot="tiles" class="stat" data-scheme="dark"><p class="eyebrow">Clients</p><p class="stat__value">100+</p><p>Clients served with personal attention, clear advice, and dedicated support.</p></div>
  <div slot="tiles" class="frame"><img src="/media/harvest/mosaic-2.jpg" alt="Lawyers walking through the office" width="900" height="900" loading="lazy"></div>
</stats-mosaic>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
