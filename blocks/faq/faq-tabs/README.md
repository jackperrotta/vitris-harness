# faq-tabs

Categorized FAQ tabs.

- **Category:** faq
- **Media:** none
- **Registers:** b2b, professional
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional `<p class="eyebrow">` |
| `heading` | `<h2>` |
| `lede` | Optional `<p class="lede">` |
| `tabs` | A `.tabs__list.tabs__list--pill[role=tablist]`, then one `.tabs__panel[role=tabpanel]` per category, each containing an `.accordion` of `<details>` |

## Example

```html
<faq-tabs>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Help center</p>
  <h2 slot="heading">Answers by topic</h2>
  <div slot="tabs" class="tabs__list tabs__list--pill" role="tablist">
    <button type="button" class="tabs__tab" role="tab" id="fq-1" aria-controls="fq-p1" aria-selected="true">Billing</button>
    <button type="button" class="tabs__tab" role="tab" id="fq-2" aria-controls="fq-p2" aria-selected="false">Onboarding</button>
    <button type="button" class="tabs__tab" role="tab" id="fq-3" aria-controls="fq-p3" aria-selected="false">Security</button>
  </div>
  <div slot="tabs" class="tabs__panel" role="tabpanel" id="fq-p1" aria-labelledby="fq-1"><div class="accordion"><details><summary>When am I billed?</summary><p>On the 1st of each month for that month. Annual plans are billed once, up front, with the 15% discount applied.</p></details><details><summary>Can I change plans mid-month?</summary><p>Yes. Upgrades apply immediately and are prorated; downgrades take effect at the next billing date.</p></details><details><summary>Is there a setup fee?</summary><p>No setup fee. Catch-up bookkeeping for prior months is quoted separately if you need it.</p></details></div></div>
  <div slot="tabs" class="tabs__panel" role="tabpanel" id="fq-p2" aria-labelledby="fq-2" hidden><div class="accordion"><details><summary>What do you need from me to start?</summary><p>Read-only bank and credit card feeds, your last tax return, and payroll access. Most owners finish intake in under an hour.</p></details><details><summary>How long until my first close?</summary><p>Four weeks from intake for a clean set of books; longer if we're cleaning up prior years.</p></details></div></div>
  <div slot="tabs" class="tabs__panel" role="tabpanel" id="fq-p3" aria-labelledby="fq-3" hidden><div class="accordion"><details><summary>Do you have access to move money?</summary><p>Never. All bank connections are read-only, and we don't hold check-signing authority.</p></details><details><summary>Where is my data stored?</summary><p>In your own accounting system. We work inside your books; nothing is copied to ours.</p></details></div></div>
</faq-tabs>
```

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
