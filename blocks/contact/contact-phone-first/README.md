# contact-phone-first

A direct call path for businesses whose visitors need a conversation more than a form. Useful availability and alternate contact details remain visible. The example business and number are fictional.

- **Category:** contact
- **Media:** none
- **Registers:** trade, professional, food
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional section label |
| `heading` | `<h2>` with the purpose of contact |
| `intro` | Optional explanation of who should call and what happens next |
| `phone` | Labeled `tel:` link to a verified business number |
| `details` | Optional hours, email, location, or response expectation |

## Example

```html
<contact-phone-first>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Northline Counsel · fictional example</p>
  <h2 slot="heading">Talk through the next step.</h2>
  <p slot="intro" class="lede">Call the office to explain what you need. We will tell you who can help and how to prepare for a first meeting.</p>
  <div slot="phone"><p class="eyebrow">Call the office</p><a href="tel:+12075550123">(207) 555-0123</a></div>
  <p slot="details">Monday–Friday, 9 a.m.–5 p.m.</p>
  <p slot="details"><a href="mailto:hello@example.test">hello@example.test</a></p>
</contact-phone-first>
```

Use a real `tel:` destination, actual hours, and a fallback channel. If a form is essential, pair this with a suitable form section rather than hiding the form behind the phone treatment.
