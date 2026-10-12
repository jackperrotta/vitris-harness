# project-evidence

A project story led by one real image and a compact fact ledger. Captions explain what the image actually shows; facts remain independently verifiable. This example is for the fictional Tide &amp; Slate roofing company and uses a synthetic teaching image, never customer proof.

- **Category:** work
- **Media:** one project photo required
- **Registers:** trade, professional, b2b
- **Variants:** (none)

## Slots

| Slot | Content |
|------|---------|
| `eyebrow` | Optional project context |
| `heading` | `<h2>` with the project question or result |
| `summary` | Brief project narrative without unsupported claims |
| `media` | One image with truthful alt text and explicit dimensions |
| `caption` | Visible description and provenance context for the image |
| `facts` | Two to four `<div>` items containing `<dt>` and `<dd>` factual pairs |

## Example

```html
<project-evidence>
  <p slot="eyebrow" class="eyebrow eyebrow--accent">Tide &amp; Slate · fictional teaching example</p>
  <h2 slot="heading">A roof shaped by the coast.</h2>
  <p slot="summary" class="lede">The example shows how a project story can connect material choice, site conditions, and a clear next step without inventing a testimonial.</p>
  <img slot="media" src="/media/teaching/slate-roof-finished.webp" alt="Synthetic teaching image of a slate roof on a coastal house" width="1536" height="1024" loading="lazy">
  <span slot="caption">Synthetic teaching image. Replace with a verified project photograph and accurate caption.</span>
  <div slot="facts"><dt>Material</dt><dd>Slate tiles</dd></div>
  <div slot="facts"><dt>Setting</dt><dd>Coastal residence</dd></div>
</project-evidence>
```

The media is essential to this composition. Do not use it when no genuine project image exists. On a real site, source the facts and caption from the project record.
