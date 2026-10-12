# Site components

Every visual block for this website lives here — not in the harness.

```
components/<name>/
  template.html   # layout + <slot> / <slot name="…">
  styles.css      # scoped .c-<name>, tokens only
  island.js       # optional; targets flattened DOM, no Shadow DOM
```

Invent components for this business (header, hero, offers, …), then reuse them across `pages/*.html`.

Do not add `schema.json` — there is no owner visual editor. Agents read the template and `agent/refs/components.md`.

Template roots should use `div` / `section` with class `c-<name>` — not a tag that matches the component folder name (avoids flatten loops).

See `agent/refs/components.md`.
