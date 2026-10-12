# Vitris public site design system

Each site owns its art direction: typography, spacing, composition, imagery, surface treatment, and motion. Derive these from the business brief and selected theme in onboarding/direction.json. Kernel primitives are implementation defaults, not a house style.

Operator knowledge: `agent/refs/*`, the compatible teaching collection at `design-system/knowledge/v1`, sourced requirements at `design-system/knowledge/v2`, and the opt-in composition teaching release at `design-system/knowledge/v3`. The block library at `blocks/` remains an optional implementation source. Composition lessons are advisory design hypotheses; applicable v2 requirements retain their separate authority. The calibration pack contains inspected references, not a preference model.

Each site authors its own `components/` and `pages/*.html`. In `composition-v1`, design the relationships among the site's actual content elements, then implement site-owned markup and styles. In `blocks-v0`, the compatible block selection method remains available. The kernel compiles source to flat HTML/CSS/JS; it does **not** ship a runtime section catalog.

## Contrast

| Pair | Minimum |
|------|---------|
| `--color-text` on `--color-bg` | 4.5:1 |
| `--color-muted` on `--color-bg` | 4.5:1 for body-length text |
| `--color-accent-text` on `--color-accent` | 4.5:1 |
| Focus ring (`--color-focus`) | Visible against background |

Give color roles a clear purpose. Preserve readable contrast and identifiable actions within the selected direction.

## Tokens

- Colors: bg, surface, surface-2, text, muted, accent, accent-text, border, focus
- Type: `--step-0` â€¦ `--step-5` (`clamp`), `--font-body`, `--font-display`
- Space: `--space-1` â€¦ `--space-8`, `--section-y`
- Layout: `--max-width`, `--radius`, `--radius-lg`, `--radius-pill`, `--tap-min`, `--header-h`
- Elevation: `--shadow-1/2/3`, `--ring`, `--blur-header`

**Radius:** choose geometry for the direction. Pill buttons and rounded cards are available defaults, not requirements.

## Primitives

Kernel `site.css` ships layout/surface helpers: `.section`, `.section__head`, `.grid`, `.split`, `.bento`, `.card`, `.badge`, `.stat`, `.avatar`, `.accordion`, `.tabs`, `.header--sticky`, `.nav-drawer`, form fields, ratios. Use these where they support the planned composition; site-owned CSS may replace them.

Local dark bands: `.section--dark` remaps tokens inside that section only.

## Type & focus

- Headings may use `text-wrap: pretty` or `balance`; choose hero scale and body measure from actual language, hierarchy, and available width
- Visible `:focus-visible` rings; never `outline: none` without a replacement
- Forms: visible labels, correct `type` / `autocomplete`, no placeholder-only inputs
- Nav: logo â†’ `/`. Let verified routes and visitor tasks determine labels, grouping, and action placement.

## Layout

Use the storyboard to give each section a narrative purpose and appropriate visual emphasis. Evaluate rhythm in the rendered page; a fixed quota of layouts or images does not establish quality. Adapt breakpoints to content.

## Motifs

Choose motifs that support the business and recur coherently. Preserve conventional, usable controls. Avoid distracting motion and interactions that hide essential content.

Judge originality by business fit and thoughtful composition, not the number of unconventional sections.

## Scroll reveal and deliberate motion

Operator-owned in `site.json` (`motion`) and per-instance attributes (`motion="whisper"`). Presets: `off` | `whisper` | `editorial` | `noticeable`. Header / footer / hero default `off`. Honor `prefers-reduced-motion`. New behavior opts in with `scrollMotion: {version:1, policy:"enabled"}` and explicit native/component `data-motion` targets; `policy:"off"` disables all motion. Legacy strength off remains a default with per-instance precedence. Use stage-scoped `agent/refs/motion.md`, business-specific scenes and quiet intervals. Review temporal behavior in normal/reduced/static modes; avoid whole-page reveals.

New authored sites and reauthored routes compose the entire temporal journey with motionPlan v2. Every authored page has located opening/development/closing relationships, connected quiet intervals and immediate reading/actions; contact and short pages use appropriate subtle treatments. New scaffold policy enables explicit targets and requires all authored route coverage. Historical configurations remain unchanged by upgrade. Load stage-scoped motion-page guidance and review complete normal desktop/mobile journeys plus reduced/static readability; two effects in one section or an explained calm brand is insufficient. Numeric counts require supplied facts and canonical accessible final text. Agent judgments and human preference remain separate.

## Components & pages

- Source: `pages/**/*.html` + `components/<name>/{template.html,styles.css,island.js?}`
- Authoring tags flatten at build; `variant` / `id` pass through to the root
- Kernel islands via `data-island="header|carousel|tabs|before-after|counter|lightbox"`
- One `h1` per page; skip link + `<main id="main">` from the compiler
- Lead forms: `data-lead-form` â†’ kernel `/api/leads`
- Cookie page: kernel-owned `/cookie-compliance` â€” link from footer

## Copy & images

- `agent/refs/copy.md` / `agent/refs/media.md`. Use edited, supported claims and the complete media inventory. Choose assets by meaning and quality.

## Performance

Used-component CSS only, islands only when needed. Give the actual LCP image priority when there is one; lazy-load images outside the initial view. Avoid `transition: all`.
