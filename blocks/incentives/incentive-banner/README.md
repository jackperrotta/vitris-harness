# incentive-banner

Promo / offer banner.

- **Category:** incentives
- **Media:** none
- **Registers:** trade, beauty, food
- **Variants:** accent

## Slots

| Slot | Content |
|------|---------|
| `(default)` | One line: `<strong>` offer + short terms |
| `actions` | One `<a>` (text link or `.btn.btn-sm`) |

## Example

```html
<incentive-banner>
  <strong>0% financing for 12 months</strong> on full roof replacements — approvals in minutes.
  <a slot="actions" href="/financing">See terms</a>
</incentive-banner>
```

Variants: `<incentive-banner variant="accent">`.

Copy this folder into the site repo as `components/<your-name>/`, rename the root class to `c-<your-name>`, and adapt slots, copy, and media.
