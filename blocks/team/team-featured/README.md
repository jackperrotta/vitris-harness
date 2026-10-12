# team-featured

Featured person + roster.

- **Category:** team
- **Media:** portraits
- **Registers:** professional, beauty
- **Variants:** reverse

## Slots

| Slot | Content |
|------|---------|
| `media` | Featured portrait `<img>` (3:4) |
| `lead` | `<h3>` name, `<p class="c-team-role">`, 1–2 `<p>` bio |
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` |
| `people` | 2 or 4 compact `.card` people (portrait, `<h3>`, `<p class="c-team-role">`) |

## Example

```html
<team-featured>
  <img src="/media/harvest/team-elena.jpg" alt="Dr. Elena Marsh" width="900" height="1200" slot="media" loading="lazy">
  <h3 slot="lead">Dr. Elena Marsh, DDS</h3>
  <p slot="lead" class="c-team-role">Owner &amp; general dentist</p>
  <p slot="lead">Elena bought the practice in 2016 after eight years in a hospital dental clinic. She's known for talking through every step and for a very steady hand.</p>
  <p slot="lead">Tufts DMD · Maine Dental Association · Invisalign certified</p>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Our team</p>
  <h2 slot="heading">Small on purpose</h2>
  <p slot="lede" class="lede">Four people who know your name and your history.</p>
  <div slot="people" class="card"><div class="card__media ratio-3x4"><img src="/media/harvest/team-nick.jpg" alt="Nick Alvarez" width="900" height="1200" loading="lazy"></div><div class="card__body"><h3>Nick Alvarez</h3><p class="c-team-role">Hygienist</p></div></div>
  <div slot="people" class="card"><div class="card__media ratio-3x4"><img src="/media/harvest/team-june.jpg" alt="June Park" width="900" height="1200" loading="lazy"></div><div class="card__body"><h3>June Park</h3><p class="c-team-role">Hygienist</p></div></div>
  <div slot="people" class="card"><div class="card__media ratio-3x4"><img src="/media/harvest/team-rob.jpg" alt="Rob Feeney" width="900" height="1200" loading="lazy"></div><div class="card__body"><h3>Rob Feeney</h3><p class="c-team-role">Dental assistant</p></div></div>
  <div slot="people" class="card"><div class="card__media ratio-3x4"><img src="/media/harvest/team-tess.jpg" alt="Tess Morrow" width="900" height="1200" loading="lazy"></div><div class="card__body"><h3>Tess Morrow</h3><p class="c-team-role">Front desk &amp; billing</p></div></div>
</team-featured>
```

Variants: `<team-featured variant="reverse">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
