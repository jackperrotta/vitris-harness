# Pages

Each HTML file under `pages/` becomes a public URL:

| File | URL |
|------|-----|
| `index.html` | `/` |
| `about.html` | `/about` |
| `services.html` | `/services` |
| `blog/index.html` | `/blog` |
| `blog/my-post.html` | `/blog/my-post` |

Optional frontmatter:

```html
---
title: Home
description: One-line SEO description.
---
<header></header>
<hero motion="off">
  <h1>Your headline</h1>
</hero>
<footer></footer>
```

Authoring tags (`<header>`, `<hero>`, …) must match folders in `components/`. Copy for a page lives in that page file (slots / children). Shared chrome copy lives inside `components/header` and `components/footer`.

The build flattens authoring tags to ordinary HTML. Do not wrap `<main>` or add a skip-link in the page file — the kernel injects those (`#main`).

See `agent/refs/compose.md`, `sections.md`, `layout.md`, `counterpoint.md`, `usability.md`, `components.md`.
