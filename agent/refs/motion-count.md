# Verified magnitude, calm emphasis

Use a count once for an important supplied statistic. Quote its source in the plan; `data-motion-fact` binds that source reference. Example below is FICTIONAL teaching: the brief supplies exactly 1,250 repaired books, not customer evidence.

```html
<p><strong id="books" data-motion="count" data-motion-kind="statistic"
 data-motion-value="1250" data-motion-suffix=" repaired books" data-motion-fact="brief:books"
 data-motion-duration="900">1,250 repaired books</strong></p>
```

The final string must match metadata exactly or compilation fails. Preserve qualifiers. Canonical author text remains in the accessibility tree and flow; the temporary visual number is aria-hidden, unselectable and absolutely overlaid, reserving the full final width. No aria-live. One shared frame runs only while counts are active. Focus/cancel/reduced/no JS show the exact final string immediately. Mobile can use same or `data-motion-mobile="static"`.

Contraindications: phone/date/postal/model numbers, fees/prices, identifiers, uncertain claims, misleading intermediate percentages. A count is not evidence of business quality. Missing facts means omit it. Confirm accessible snapshot contains final text once during playback, stable geometry with delayed fonts, exact finish and no reversal replay. See motion-numeric.md for formatting and the count lesson for normal/static/reduced playback.
