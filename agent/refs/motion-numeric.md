# Precise and qualified formats

FICTIONAL teaching facts only: a research workshop conserved approximately $12.5m of materials; supplied change was -3.25 units; recorded capacity was +1,250 units. These are display examples, not financial/customer claims. Prefix/suffix are authored literal text; numeric display may use 0–3 decimals, grouping (default true), and sign auto/always. Values are bounded to ±1e12. Exact final text is validated, never synthesized as a replacement claim.

```html
<strong id="materials" data-motion="count" data-motion-kind="statistic"
 data-motion-value="12.5" data-motion-decimals="1" data-motion-prefix="~$"
 data-motion-suffix="m conserved" data-motion-fact="brief:materials">~$12.5m conserved</strong>
<strong id="change" data-motion="count" data-motion-kind="statistic"
 data-motion-value="-3.25" data-motion-decimals="2" data-motion-suffix=" units"
 data-motion-fact="brief:change">-3.25 units</strong>
```

An approved abbreviated numeric value is explicitly the displayed scale (12.5m), with the source fact documenting full magnitude. Use `data-motion-sign="always"` for + values, `data-motion-group="false"` where supplied formatting requires it. Percent suffix is permitted only when intermediate emphasis cannot imply a live result; usually keep rates/static financial data still. Do not localize canonical formatting silently: v1 uses en-US numeric grouping, literals supply units. Other locales remain static until authored/verified. Normal/static/reduced lessons preserve identical strings and width. No rounding beyond authored precision and no invented facts.
