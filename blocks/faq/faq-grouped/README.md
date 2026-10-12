# faq-grouped

Grouped FAQ with a sticky jump-nav and optional rating card.

- **Category:** faq
- **Media:** none
- **Registers:** trade, professional, b2b
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` (one sentence) |
| `nav` | One `<a href="#group-id">` per group |
| `aside` | Optional `<div class="card card--flat">` (rating, phone) under the nav |
| `groups` | 3–6 `<div id="group-id"><h3>Group</h3><div class="accordion"><details><summary>…</summary><p>…</p></details>…</div></div>` |

## Example

```html
<faq-grouped>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">FAQ</p>
  <h2 slot="heading">Common questions from homeowners.</h2>
  <p slot="lede" class="lede">Costs, timelines, insurance, warranties, and what to expect on install day — answered the way we'd explain it to a neighbour.</p>
  <a slot="nav" href="#faq-pricing">Estimates &amp; pricing</a>
  <a slot="nav" href="#faq-job">During the job</a>
  <a slot="nav" href="#faq-roof">Your roof, explained</a>
  <a slot="nav" href="#faq-warranty">Warranty &amp; after</a>
  <div slot="aside" class="card card--flat"><div class="card__body"><p class="stat__value">4.9</p><p><span class="rating" aria-label="5 out of 5 stars"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg></span> from 1,200+ Google reviews</p></div></div>
  <div slot="groups" id="faq-pricing"><h3>Estimates &amp; pricing</h3><div class="accordion"><details open><summary>How much does an estimate cost?</summary><p>Nothing. We get on your roof, take photos, and give you a written estimate — whether or not you hire us.</p></details><details><summary>Do you offer financing?</summary><p>Yes — 0% for 18 months through a local credit union, or fixed-rate plans up to ten years.</p></details><details><summary>Do I have to be there for the estimate?</summary><p>No. We'll send the photos and the written quote the same day and talk it through by phone.</p></details></div></div>
  <div slot="groups" id="faq-job"><h3>During the job</h3><div class="accordion"><details><summary>Do I need to be home during the install?</summary><p>No. We need access to the driveway and an outdoor outlet — that's it.</p></details><details><summary>How long will my roof take?</summary><p>Most homes are one or two days. We'll give you a firm window in the estimate.</p></details><details><summary>What if it rains in the forecast?</summary><p>We don't open a roof we can't close the same day. If weather moves in, we reschedule and tell you first.</p></details></div></div>
  <div slot="groups" id="faq-roof"><h3>Your roof, explained</h3><div class="accordion"><details><summary>Why does my roof look wavy?</summary><p>Usually damp or delaminated decking. We check every sheet during tear-off and replace what's soft.</p></details><details><summary>What is underlayment, and do I need it?</summary><p>The water barrier under the shingles. Code requires it, and we use a synthetic that won't wrinkle or tear.</p></details></div></div>
  <div slot="groups" id="faq-warranty"><h3>Warranty &amp; after</h3><div class="accordion"><details><summary>What does the warranty actually cover?</summary><p>Twenty-five years on our workmanship, in writing, plus the manufacturer's material warranty. If a leak is our fault, we fix it for free.</p></details><details><summary>Does the warranty transfer if I sell?</summary><p>Yes, once, to the next owner — a selling point most buyers ask about.</p></details></div></div>
</faq-grouped>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
