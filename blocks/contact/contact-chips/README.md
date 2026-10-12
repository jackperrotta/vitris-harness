# contact-chips

Lead form with pill choices (what / budget) beside a short intro.

- **Category:** contact
- **Media:** none
- **Registers:** b2b, beauty, professional, trade
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` (one sentence) |
| `details` | Optional 1–3 `<a>` rows (`.icon-tile` + `<span><strong>value</strong><span>note</span></span>`) |
| `fields` | `<fieldset class="chips">` groups (radio inputs) followed by `.field`s |
| `submit` | `<button class="btn" type="submit">` + optional `<small>` |

## Example

```html
<contact-chips>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Work with Hive</p>
  <h2 slot="heading">Tell us about the project.</h2>
  <p slot="lede" class="lede">Two quick choices, then a sentence or two. We reply within one business day.</p>
  <a slot="details" href="mailto:hello@hive.example"><span class="icon-tile icon-tile--muted"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg></span><span><strong>hello@hive.example</strong><span>Portfolio requests welcome</span></span></a>
  <a slot="details" href="tel:+15550104040"><span class="icon-tile icon-tile--muted"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h4l2 5-3 2a12 12 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z"/></svg></span><span><strong>(555) 010-4040</strong><span>Tue–Fri, 10–5</span></span></a>
  <fieldset slot="fields" class="chips"><legend>How can we help?</legend><label><input type="radio" name="service" value="logo" checked><span>Logo design</span></label><label><input type="radio" name="service" value="identity"><span>Brand identity</span></label><label><input type="radio" name="service" value="rebrand"><span>Rebranding</span></label><label><input type="radio" name="service" value="icons"><span>Icon design</span></label></fieldset>
  <fieldset slot="fields" class="chips"><legend>What's your budget range?</legend><label><input type="radio" name="budget" value="10-20" checked><span>$10k – $20k</span></label><label><input type="radio" name="budget" value="20-50"><span>$20k – $50k</span></label><label><input type="radio" name="budget" value="50-100"><span>$50k – $100k</span></label><label><input type="radio" name="budget" value="100+"><span>$100k +</span></label></fieldset>
  <div slot="fields" class="field"><label for="cc-name">Your name</label><input class="input" id="cc-name" name="name" autocomplete="name" required></div>
  <div slot="fields" class="field"><label for="cc-email">Email</label><input class="input" id="cc-email" name="email" type="email" autocomplete="email" required></div>
  <div slot="fields" class="field"><label for="cc-company">Company</label><input class="input" id="cc-company" name="company" autocomplete="organization"></div>
  <div slot="fields" class="field"><label for="cc-msg">Tell us about the project</label><textarea class="textarea" id="cc-msg" name="message" placeholder="What you make, who it's for, and when you'd like to launch."></textarea></div>
  <button slot="submit" class="btn" type="submit">Kick things off</button>
  <small slot="submit">No retainers, no surprise invoices. We'll send a scope before any work starts.</small>
</contact-chips>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
