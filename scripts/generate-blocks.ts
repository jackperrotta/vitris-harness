#!/usr/bin/env node
/**
 * One-shot scaffold used to author the FIRST draft of the wave-1 block library.
 *
 * `blocks/` is now the source of truth and has been hand-refined well beyond
 * what this script emits (README slot tables + examples, mobile rules,
 * primitives-based CSS). Re-running it would clobber that work, so it refuses
 * to write over an existing library unless you pass `--force`.
 *
 *   node --experimental-strip-types scripts/generate-blocks.ts --force
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "blocks");

const force = process.argv.includes("--force");
const existing = existsSync(root)
  ? readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).length
  : 0;
if (existing > 0 && !force) {
  console.error(
    `blocks/ already contains ${existing} categories. This generator only emits the original draft ` +
      `and would overwrite hand-refined templates, styles and READMEs.\n` +
      `Edit blocks/**/ directly (then \`node --experimental-strip-types scripts/write-blocks-index.ts\`), ` +
      `or pass --force if you really mean to regenerate.`,
  );
  process.exit(1);
}

type Block = {
  cat: string;
  name: string;
  look: string;
  media: string;
  registers: string;
  variants: string[];
  html: string;
  css: string;
  island?: string;
};

function writeBlock(b: Block): void {
  const dir = join(root, b.cat, b.name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "template.html"), b.html.trim() + "\n");
  writeFileSync(join(dir, "styles.css"), b.css.trim() + "\n");
  if (b.island) writeFileSync(join(dir, "island.js"), b.island.trim() + "\n");
  const readme = `# ${b.name}

${b.look}

- **Category:** ${b.cat}
- **Media:** ${b.media}
- **Registers:** ${b.registers}
- **Variants:** ${b.variants.length ? b.variants.join(", ") : "(none)"}

## Usage

\`\`\`html
<${b.name}${b.variants[0] ? ` variant="${b.variants[0]}"` : ""}>
  <!-- fill slots from template.html -->
</${b.name}>
\`\`\`

Copy this folder into the site repo as \`components/<your-name>/\` and adapt slots/copy/media.
`;
  writeFileSync(join(dir, "README.md"), readme);
}

const i = {
  check: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>`,
  star: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.3L20 9.2l-4 3.9.9 5.4L12 15.9 7.1 18.5 8 13.1 4 9.2l5.4-.9L12 3z"/></svg>`,
  arrow: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
  phone: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h4l2 5-3 2a12 12 0 006 6l2-3 5 2v4a2 2 0 01-2 2A16 16 0 014 5a2 2 0 012-2z"/></svg>`,
  menu: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`,
};

const blocks: Block[] = [];

function add(
  cat: string,
  name: string,
  look: string,
  media: string,
  registers: string,
  variants: string[],
  html: string,
  css: string,
  island?: string,
): void {
  blocks.push({ cat, name, look, media, registers, variants, html, css, island });
}

// —— NAVBAR (5) ——
add(
  "navbar",
  "nav-split",
  "Sticky blurred header: logo left, links center-right, filled CTA.",
  "logo optional",
  "trade, beauty, b2b, food, professional",
  ["sticky"],
  `<header class="c-nav-split header--sticky" data-island="header">
  <div class="wrap c-nav-split__inner">
    <a class="c-nav-split__brand" href="/"><slot name="brand"></slot></a>
    <nav class="c-nav-split__links" aria-label="Primary"><slot name="links"></slot></nav>
    <div class="c-nav-split__actions"><slot name="actions"></slot>
      <button type="button" class="c-nav-split__toggle btn-ghost btn-sm" data-nav-toggle aria-expanded="false" aria-label="Open menu">${i.menu}</button>
    </div>
  </div>
  <div class="nav-drawer" hidden><div class="nav-drawer__panel"><nav aria-label="Mobile"><slot name="links"></slot></nav><div class="btn-group" style="margin-top:1rem"><slot name="actions"></slot></div></div></div>
</header>`,
  `.c-nav-split__inner{display:flex;align-items:center;gap:var(--space-4);min-height:var(--header-h)}
.c-nav-split__brand{font-weight:700;text-decoration:none;letter-spacing:-.02em}
.c-nav-split__links{display:none;gap:var(--space-4);margin-inline:auto}
.c-nav-split__links a{text-decoration:none;font-weight:600;font-size:var(--step-0);color:var(--color-muted)}
.c-nav-split__links a:hover{color:var(--color-text)}
.c-nav-split__actions{display:flex;align-items:center;gap:var(--space-3);margin-inline-start:auto}
.c-nav-split__toggle{display:inline-flex}
.c-nav-split .nav-drawer{display:block}
@media(min-width:720px){
  .c-nav-split__links{display:flex}
  .c-nav-split__toggle{display:none}
  .c-nav-split .nav-drawer{display:none}
}`,
);

add(
  "navbar",
  "nav-utility",
  "Dual-tier: slim utility row (phone/hours) + primary bar. B2B default.",
  "logo optional",
  "b2b, professional, trade",
  ["sticky"],
  `<header class="c-nav-utility header--sticky" data-island="header">
  <div class="c-nav-utility__bar"><div class="wrap c-nav-utility__util"><slot name="utility"></slot></div></div>
  <div class="wrap c-nav-utility__inner">
    <a class="c-nav-utility__brand" href="/"><slot name="brand"></slot></a>
    <nav class="c-nav-utility__links" aria-label="Primary"><slot name="links"></slot></nav>
    <div class="c-nav-utility__actions"><slot name="actions"></slot>
      <button type="button" class="btn-ghost btn-sm" data-nav-toggle aria-expanded="false" aria-label="Open menu">${i.menu}</button>
    </div>
  </div>
  <div class="nav-drawer"><div class="nav-drawer__panel"><nav aria-label="Mobile"><slot name="links"></slot></nav></div></div>
</header>`,
  `.c-nav-utility__bar{background:var(--color-surface-2);border-bottom:1px solid var(--color-border);font-size:var(--step-0);color:var(--color-muted)}
.c-nav-utility__util{display:flex;flex-wrap:wrap;gap:var(--space-4);padding:var(--space-2) 0}
.c-nav-utility__inner{display:flex;align-items:center;gap:var(--space-4);min-height:var(--header-h)}
.c-nav-utility__brand{font-weight:700;text-decoration:none}
.c-nav-utility__links{display:none;gap:var(--space-4);margin-inline-start:auto}
.c-nav-utility__links a{text-decoration:none;font-weight:600;font-size:var(--step-0);color:var(--color-muted)}
.c-nav-utility__actions{display:flex;gap:var(--space-3);align-items:center}
@media(min-width:720px){.c-nav-utility__links{display:flex}.c-nav-utility [data-nav-toggle]{display:none}}`,
);

add(
  "navbar",
  "nav-centered",
  "Centered mark with flanking link clusters — beauty / premium.",
  "logo preferred",
  "beauty, food, professional",
  ["sticky"],
  `<header class="c-nav-centered header--sticky" data-island="header">
  <div class="wrap c-nav-centered__inner">
    <nav class="c-nav-centered__left" aria-label="Primary left"><slot name="links-left"></slot></nav>
    <a class="c-nav-centered__brand" href="/"><slot name="brand"></slot></a>
    <div class="c-nav-centered__right"><nav aria-label="Primary right"><slot name="links-right"></slot></nav><slot name="actions"></slot>
      <button type="button" class="btn-ghost btn-sm" data-nav-toggle aria-expanded="false" aria-label="Open menu">${i.menu}</button>
    </div>
  </div>
  <div class="nav-drawer"><div class="nav-drawer__panel"><nav aria-label="Mobile"><slot name="links-left"></slot><slot name="links-right"></slot></nav></div></div>
</header>`,
  `.c-nav-centered__inner{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;min-height:var(--header-h);gap:var(--space-3)}
.c-nav-centered__brand{justify-self:center;font-weight:700;text-decoration:none;font-family:var(--font-display);font-size:var(--step-2)}
.c-nav-centered__left{display:none;gap:var(--space-4)}
.c-nav-centered__right{display:flex;justify-content:flex-end;align-items:center;gap:var(--space-3)}
.c-nav-centered nav a{text-decoration:none;font-weight:600;font-size:var(--step-0);color:var(--color-muted)}
@media(min-width:900px){.c-nav-centered__left{display:flex}.c-nav-centered [data-nav-toggle]{display:none}}`,
);

add(
  "navbar",
  "nav-minimal",
  "Logo + CTA only — landing / lead-capture pages.",
  "logo optional",
  "trade, b2b, beauty",
  [],
  `<header class="c-nav-minimal">
  <div class="wrap c-nav-minimal__inner">
    <a class="c-nav-minimal__brand" href="/"><slot name="brand"></slot></a>
    <div class="c-nav-minimal__actions"><slot name="actions"></slot></div>
  </div>
</header>`,
  `.c-nav-minimal__inner{display:flex;align-items:center;justify-content:space-between;min-height:var(--header-h)}
.c-nav-minimal__brand{font-weight:700;text-decoration:none}`,
);

add(
  "navbar",
  "nav-announcement",
  "Announcement strip above sticky split nav.",
  "logo optional",
  "trade, beauty, food, b2b",
  ["sticky"],
  `<div class="c-nav-announcement">
  <div class="announcement"><slot name="announcement"></slot></div>
  <header class="c-nav-announcement__bar header--sticky" data-island="header">
    <div class="wrap c-nav-announcement__inner">
      <a href="/" class="c-nav-announcement__brand"><slot name="brand"></slot></a>
      <nav class="c-nav-announcement__links" aria-label="Primary"><slot name="links"></slot></nav>
      <div class="btn-group"><slot name="actions"></slot>
        <button type="button" class="btn-ghost btn-sm" data-nav-toggle aria-expanded="false" aria-label="Open menu">${i.menu}</button>
      </div>
    </div>
    <div class="nav-drawer"><div class="nav-drawer__panel"><nav aria-label="Mobile"><slot name="links"></slot></nav></div></div>
  </header>
</div>`,
  `.c-nav-announcement__inner{display:flex;align-items:center;gap:var(--space-4);min-height:var(--header-h)}
.c-nav-announcement__brand{font-weight:700;text-decoration:none}
.c-nav-announcement__links{display:none;gap:var(--space-4);margin-inline:auto}
.c-nav-announcement__links a{text-decoration:none;font-weight:600;font-size:var(--step-0);color:var(--color-muted)}
@media(min-width:720px){.c-nav-announcement__links{display:flex}.c-nav-announcement [data-nav-toggle]{display:none}}`,
);

// —— HERO (10) ——
add(
  "hero",
  "hero-split",
  "50/50 copy + media; default trade/home-service hero.",
  "photo or illustration LCP",
  "trade, beauty, food, professional",
  ["reverse", "dark"],
  `<section class="c-hero-split section">
  <div class="wrap split">
    <div class="c-hero-split__copy">
      <slot name="eyebrow"></slot>
      <slot></slot>
      <div class="btn-group"><slot name="actions"></slot></div>
    </div>
    <div class="c-hero-split__media ratio-4x3"><slot name="media"></slot></div>
  </div>
</section>`,
  `.c-hero-split__copy{display:grid;gap:var(--space-4);align-content:center}
.c-hero-split__copy h1{margin:0}
.c-hero-split--reverse .split > :first-child{order:2}
.c-hero-split.section--dark,.c-hero-split--dark{background:#141210;color:#F7F4EF}`,
);

add(
  "hero",
  "hero-overlay",
  "Full-bleed photo with scrim and dual CTAs — immersive home default.",
  "darker LCP photo",
  "trade, beauty, food",
  ["tall", "center"],
  `<section class="c-hero-overlay">
  <div class="c-hero-overlay__media"><slot name="media"></slot></div>
  <div class="c-hero-overlay__scrim"></div>
  <div class="wrap c-hero-overlay__copy">
    <slot name="eyebrow"></slot>
    <slot></slot>
    <div class="btn-group"><slot name="actions"></slot></div>
  </div>
</section>`,
  `.c-hero-overlay{position:relative;min-height:min(78vh,42rem);display:grid;align-items:end;color:#fff;isolation:isolate}
.c-hero-overlay--tall{min-height:min(92vh,52rem)}
.c-hero-overlay__media{position:absolute;inset:0;z-index:0}
.c-hero-overlay__media img{width:100%;height:100%;object-fit:cover}
.c-hero-overlay__scrim{position:absolute;inset:0;z-index:1;background:linear-gradient(180deg,transparent 20%,color-mix(in srgb,#000 62%,transparent) 100%)}
.c-hero-overlay__copy{position:relative;z-index:2;display:grid;gap:var(--space-4);padding-block:var(--space-8);max-width:40rem}
.c-hero-overlay--center .c-hero-overlay__copy{margin-inline:auto;text-align:center;justify-items:center}
.c-hero-overlay .eyebrow{color:color-mix(in srgb,#fff 80%,transparent)}
.c-hero-overlay p{color:color-mix(in srgb,#fff 86%,transparent)}`,
);

add(
  "hero",
  "hero-editorial",
  "Type-led hero with generous air — premium / professional.",
  "optional small media",
  "professional, b2b, beauty",
  ["center"],
  `<section class="c-hero-editorial section">
  <div class="wrap c-hero-editorial__inner">
    <slot name="eyebrow"></slot>
    <slot></slot>
    <div class="btn-group"><slot name="actions"></slot></div>
    <div class="c-hero-editorial__media"><slot name="media"></slot></div>
  </div>
</section>`,
  `.c-hero-editorial__inner{display:grid;gap:var(--space-4);max-width:44rem;padding-block:var(--space-6)}
.c-hero-editorial--center .c-hero-editorial__inner{margin-inline:auto;text-align:center;justify-items:center}
.c-hero-editorial__media{margin-top:var(--space-5)}
.c-hero-editorial__media img{border-radius:var(--radius-lg);box-shadow:var(--shadow-2)}`,
);

add(
  "hero",
  "hero-form",
  "Lead form in the fold beside value prop.",
  "optional side media",
  "trade, b2b, professional",
  ["dark"],
  `<section class="c-hero-form section">
  <div class="wrap split">
    <div class="c-hero-form__copy"><slot name="eyebrow"></slot><slot></slot></div>
    <div class="card card--elevated c-hero-form__card"><div class="card__body"><slot name="form"></slot></div></div>
  </div>
</section>`,
  `.c-hero-form__copy{display:grid;gap:var(--space-4);align-content:center}
.c-hero-form--dark{background:#141210;color:#F7F4EF}
.c-hero-form--dark .card{background:#1E1B18;border-color:#3A342E;color:#F7F4EF}`,
);

add(
  "hero",
  "hero-product",
  "Product/mockup as architecture — b2b/agency.",
  "device mockup or product still",
  "b2b, professional",
  ["reverse"],
  `<section class="c-hero-product section section--muted">
  <div class="wrap split">
    <div class="c-hero-product__copy"><slot name="eyebrow"></slot><slot></slot><div class="btn-group"><slot name="actions"></slot></div><div class="logo-row"><slot name="logos"></slot></div></div>
    <div class="c-hero-product__media"><slot name="media"></slot></div>
  </div>
</section>`,
  `.c-hero-product__copy{display:grid;gap:var(--space-4)}
.c-hero-product__media img{border-radius:var(--radius-lg);box-shadow:var(--shadow-3)}
.c-hero-product--reverse .split > :first-child{order:2}`,
);

add(
  "hero",
  "hero-menu",
  "Restaurant/menu: headline + featured dishes strip.",
  "food photography",
  "food",
  [],
  `<section class="c-hero-menu section">
  <div class="wrap c-hero-menu__top"><slot name="eyebrow"></slot><slot></slot><div class="btn-group"><slot name="actions"></slot></div></div>
  <div class="wrap grid grid--3 c-hero-menu__cards"><slot name="cards"></slot></div>
</section>`,
  `.c-hero-menu__top{display:grid;gap:var(--space-4);max-width:40rem;margin-bottom:var(--space-6)}
.c-hero-menu__cards .card__media{aspect-ratio:4/3}`,
);

add(
  "hero",
  "hero-stats",
  "Headline with proof metrics under the fold of the hero.",
  "optional LCP",
  "trade, b2b, professional",
  ["overlay"],
  `<section class="c-hero-stats section">
  <div class="wrap c-hero-stats__copy"><slot name="eyebrow"></slot><slot></slot><div class="btn-group"><slot name="actions"></slot></div></div>
  <div class="wrap grid grid--4 c-hero-stats__row" data-island="counter"><slot name="stats"></slot></div>
</section>`,
  `.c-hero-stats__copy{display:grid;gap:var(--space-4);max-width:42rem;margin-bottom:var(--space-7)}
.c-hero-stats__row{padding:var(--space-5);border:1px solid var(--color-border);border-radius:var(--radius-lg);background:var(--color-surface)}
.c-hero-stats--overlay{position:relative;color:#fff;min-height:28rem;display:grid;align-content:end}
.c-hero-stats--overlay::before{content:"";position:absolute;inset:0;background:color-mix(in srgb,#000 45%,transparent);z-index:0}
.c-hero-stats--overlay > *{position:relative;z-index:1}`,
);

add(
  "hero",
  "hero-before-after",
  "Trade showcase with draggable before/after beside copy.",
  "paired before/after photos",
  "trade",
  [],
  `<section class="c-hero-before-after section">
  <div class="wrap split">
    <div class="c-hero-before-after__copy"><slot name="eyebrow"></slot><slot></slot><div class="btn-group"><slot name="actions"></slot></div></div>
    <div class="before-after" data-island="before-after"><slot name="compare"></slot><div class="before-after__handle" aria-hidden="true"></div></div>
  </div>
</section>`,
  `.c-hero-before-after__copy{display:grid;gap:var(--space-4)}`,
);

add(
  "hero",
  "hero-video-still",
  "Poster still with play affordance linking to content clip — never autoplay bg.",
  "poster still",
  "beauty, food, b2b",
  [],
  `<section class="c-hero-video-still section">
  <div class="wrap c-hero-video-still__frame">
    <div class="ratio-16x9"><slot name="media"></slot>
      <a class="c-hero-video-still__play btn" href="#video"><slot name="play-label"></slot></a>
    </div>
    <div class="c-hero-video-still__copy"><slot name="eyebrow"></slot><slot></slot><div class="btn-group"><slot name="actions"></slot></div></div>
  </div>
</section>`,
  `.c-hero-video-still__frame{display:grid;gap:var(--space-5)}
.c-hero-video-still__play{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2}
.c-hero-video-still__copy{display:grid;gap:var(--space-3);max-width:40rem}`,
);

add(
  "hero",
  "hero-asymmetric",
  "Diagonal balance: heavy type corner vs dense photo.",
  "strong subject photo",
  "beauty, professional, trade",
  [],
  `<section class="c-hero-asymmetric section">
  <div class="wrap c-hero-asymmetric__grid">
    <div class="c-hero-asymmetric__copy"><slot name="eyebrow"></slot><slot></slot><div class="btn-group"><slot name="actions"></slot></div></div>
    <div class="c-hero-asymmetric__media ratio-3x4"><slot name="media"></slot></div>
  </div>
</section>`,
  `.c-hero-asymmetric__grid{display:grid;gap:var(--space-5)}
@media(min-width:720px){
  .c-hero-asymmetric__grid{grid-template-columns:1.1fr .9fr;align-items:end}
  .c-hero-asymmetric__copy{padding-bottom:var(--space-8)}
}
.c-hero-asymmetric__copy{display:grid;gap:var(--space-4)}`,
);

console.log(`Prepared ${blocks.length} blocks so far (nav+hero)...`);

// Continue in same file - trust, feature, etc.
// I'll append more below by pushing to blocks array

// TRUST (3)
add("trust-strip","trust-logos","Grayscale logo row under hero.","partner marks","trade,b2b,professional,food",["muted"],
`<section class="c-trust-logos section--tight"><div class="wrap"><p class="eyebrow"><slot name="eyebrow"></slot></p><div class="logo-row"><slot name="logos"></slot></div></div></section>`,
`.c-trust-logos .eyebrow{margin-bottom:var(--space-4);text-align:center}
.c-trust-logos .logo-row{justify-content:center}
.c-trust-logos--muted{background:var(--color-surface-2)}`);

add("trust-strip","trust-badges","Rating chip + cert badges row.","optional badge icons","trade,beauty,food,professional",[],
`<section class="c-trust-badges section--tight"><div class="wrap c-trust-badges__row"><slot></slot></div></section>`,
`.c-trust-badges__row{display:flex;flex-wrap:wrap;gap:var(--space-3);justify-content:center;align-items:center}`);

add("trust-strip","trust-quote","Single spotlight quote as trust band.","optional portrait","all",["dark"],
`<section class="c-trust-quote section section--muted"><div class="wrap c-trust-quote__inner"><blockquote class="quote"><slot></slot></blockquote></div></section>`,
`.c-trust-quote__inner{max-width:40rem;margin-inline:auto;text-align:center}
.c-trust-quote--dark{background:#141210;color:#F7F4EF}`);

// FEATURE (8)
add("feature","feature-grid-3","Three icon+title+blurb pillars.","icons or small media","all",["center"],
`<section class="c-feature-grid-3 section"><div class="wrap"><div class="section__head section__head--center"><slot name="eyebrow"></slot><slot name="heading"></slot><p class="lede"><slot name="lede"></slot></p></div><div class="grid grid--3"><slot name="items"></slot></div></div></section>`,
`.c-feature-grid-3 .card__body{gap:var(--space-2)}`);

add("feature","feature-bento","Mixed-span bento feature board.","mixed media tiles","b2b,beauty,food",[],
`<section class="c-feature-bento section"><div class="wrap"><div class="section__head"><slot name="eyebrow"></slot><slot name="heading"></slot><p class="lede"><slot name="lede"></slot></p></div><div class="bento"><slot name="tiles"></slot></div></div></section>`,
`.c-feature-bento .card{height:100%}`);

add("feature","feature-zigzag","Alternating copy/media story rows.","media per row","trade,beauty,professional",[],
`<section class="c-feature-zigzag section"><div class="wrap c-feature-zigzag__stack"><div class="section__head"><slot name="eyebrow"></slot><slot name="heading"></slot></div><slot name="rows"></slot></div></section>`,
`.c-feature-zigzag__stack{display:grid;gap:var(--space-8)}
.c-feature-zigzag .split:nth-child(even) > :first-child{order:2}`);

add("feature","feature-tabs","Tabbed feature panels.","optional per-panel media","b2b,professional",[],
`<section class="c-feature-tabs section"><div class="wrap"><div class="section__head"><slot name="eyebrow"></slot><slot name="heading"></slot></div><div class="tabs" data-island="tabs"><slot name="tabs"></slot></div></div></section>`,
`.c-feature-tabs .tabs__panel{padding-top:var(--space-4)}`);

add("feature","feature-icon-list","Dense checklist of capabilities.","icons","trade,b2b,professional",["two-col"],
`<section class="c-feature-icon-list section section--muted"><div class="wrap split"><div><div class="section__head"><slot name="eyebrow"></slot><slot name="heading"></slot><p class="lede"><slot name="lede"></slot></p></div><div class="btn-group"><slot name="actions"></slot></div></div><ul class="c-feature-icon-list__list"><slot name="items"></slot></ul></div></section>`,
`.c-feature-icon-list__list{list-style:none;margin:0;padding:0;display:grid;gap:var(--space-4)}
.c-feature-icon-list__list li{display:flex;gap:var(--space-3);align-items:flex-start}
.c-feature-icon-list--two-col .c-feature-icon-list__list{@media(min-width:720px){grid-template-columns:1fr 1fr}}`);

add("feature","feature-stats-band","Four stats with optional count-up.","none","trade,b2b,professional",["dark"],
`<section class="c-feature-stats-band section" data-island="counter"><div class="wrap"><div class="section__head section__head--center"><slot name="heading"></slot></div><div class="grid grid--4"><slot name="stats"></slot></div></div></section>`,
`.c-feature-stats-band--dark{background:#141210;color:#F7F4EF}`);

add("feature","feature-comparison","Simple two-column compare cards.","optional","b2b,trade,professional",[],
`<section class="c-feature-comparison section"><div class="wrap"><div class="section__head section__head--center"><slot name="eyebrow"></slot><slot name="heading"></slot></div><div class="grid grid--2"><slot name="cards"></slot></div></div></section>`,
`.c-feature-comparison .card__body h3{margin:0}`);

add("feature","feature-spotlight","One large feature with side bullets.","hero media","beauty,food,b2b",["reverse"],
`<section class="c-feature-spotlight section"><div class="wrap split"><div class="ratio-4x3"><slot name="media"></slot></div><div class="c-feature-spotlight__copy"><slot name="eyebrow"></slot><slot name="heading"></slot><p class="lede"><slot name="lede"></slot></p><ul class="c-feature-spotlight__list"><slot name="bullets"></slot></ul><div class="btn-group"><slot name="actions"></slot></div></div></div></section>`,
`.c-feature-spotlight__copy{display:grid;gap:var(--space-4)}
.c-feature-spotlight__list{margin:0;padding-left:1.1rem;color:var(--color-muted);display:grid;gap:var(--space-2)}
.c-feature-spotlight--reverse .split > :first-child{order:2}`);

// SERVICES (5)
add("services","services-cards","Service cards with optional price.","card images optional","trade,beauty,professional,food",[],
`<section class="c-services-cards section"><div class="wrap"><div class="section__head"><slot name="eyebrow"></slot><slot name="heading"></slot><p class="lede"><slot name="lede"></slot></p></div><div class="grid grid--3"><slot name="cards"></slot></div></div></section>`,
`.c-services-cards .card__body{gap:var(--space-2)}`);

add("services","services-list","Editorial service list with CTA per row.","optional thumbs","professional,trade,b2b",[],
`<section class="c-services-list section"><div class="wrap"><div class="section__head"><slot name="heading"></slot></div><div class="c-services-list__rows"><slot name="rows"></slot></div></div></section>`,
`.c-services-list__rows{display:grid}
.c-services-list__rows > *{display:grid;gap:var(--space-3);padding:var(--space-5) 0;border-top:1px solid var(--color-border)}
@media(min-width:720px){.c-services-list__rows > *{grid-template-columns:1fr auto;align-items:center}}`);

add("services","services-carousel","Buttoned carousel for 4+ services.","card media","trade,beauty,food",[],
`<section class="c-services-carousel section"><div class="wrap"><div class="section__head"><slot name="heading"></slot><p class="lede"><slot name="lede"></slot></p></div><div class="carousel" data-island="carousel" tabindex="0"><div class="carousel__track"><slot name="cards"></slot></div><div class="carousel__nav"><button type="button" class="btn-ghost btn-sm" data-carousel-prev aria-label="Previous">←</button><button type="button" class="btn-ghost btn-sm" data-carousel-next aria-label="Next">→</button></div></div></div></section>`,
`.c-services-carousel .carousel__track > *{flex-basis:min(100%,18rem)}`);

add("services","services-menu","Menu-style priced items.","food photos optional","food,beauty",["two-col"],
`<section class="c-services-menu section"><div class="wrap"><div class="section__head section__head--center"><slot name="eyebrow"></slot><slot name="heading"></slot></div><div class="c-services-menu__grid"><slot name="items"></slot></div></div></section>`,
`.c-services-menu__grid{display:grid;gap:var(--space-4)}
.c-services-menu--two-col .c-services-menu__grid{@media(min-width:720px){grid-template-columns:1fr 1fr;gap:var(--space-5) var(--space-7)}}
.c-services-menu__item{display:grid;grid-template-columns:1fr auto;gap:var(--space-2);align-items:baseline;border-bottom:1px dotted var(--color-border);padding-bottom:var(--space-3)}`);

add("services","services-packages","Tiered packages / retainers.","none","b2b,professional,trade",["highlight-mid"],
`<section class="c-services-packages section section--muted"><div class="wrap"><div class="section__head section__head--center"><slot name="heading"></slot><p class="lede"><slot name="lede"></slot></p></div><div class="grid grid--3"><slot name="cards"></slot></div></div></section>`,
`.c-services-packages .card{height:100%}
.c-services-packages--highlight-mid .grid > :nth-child(2){box-shadow:var(--shadow-3);border-color:var(--color-accent)}`);

// PROCESS (4)
add("process","process-steps","Numbered horizontal/stacked steps.","optional icons","trade,b2b,professional",[],
`<section class="c-process-steps section"><div class="wrap"><div class="section__head"><slot name="eyebrow"></slot><slot name="heading"></slot></div><ol class="grid grid--4 c-process-steps__grid"><slot name="steps"></slot></ol></div></section>`,
`.c-process-steps__grid{list-style:none;margin:0;padding:0;counter-reset:step}
.c-process-steps__grid > *{counter-increment:step;display:grid;gap:var(--space-2)}
.c-process-steps__grid > *::before{content:counter(step, decimal-leading-zero);font-family:var(--font-display);font-size:var(--step-2);color:var(--color-accent);font-weight:600}`);

add("process","process-timeline","Vertical timeline.","optional","professional,b2b,trade",[],
`<section class="c-process-timeline section"><div class="wrap split"><div class="section__head"><slot name="eyebrow"></slot><slot name="heading"></slot><p class="lede"><slot name="lede"></slot></p></div><ol class="c-process-timeline__list"><slot name="steps"></slot></ol></div></section>`,
`.c-process-timeline__list{list-style:none;margin:0;padding:0;border-left:2px solid var(--color-border);display:grid;gap:var(--space-5)}
.c-process-timeline__list > *{padding-left:var(--space-5);position:relative}
.c-process-timeline__list > *::before{content:"";position:absolute;left:-5px;top:.35rem;width:8px;height:8px;border-radius:99px;background:var(--color-accent)}`);

add("process","process-carousel","Process cards in buttoned carousel.","optional","trade,beauty",[],
`<section class="c-process-carousel section section--muted"><div class="wrap"><div class="section__head"><slot name="heading"></slot></div><div class="carousel" data-island="carousel" tabindex="0"><div class="carousel__track"><slot name="cards"></slot></div><div class="carousel__nav"><button type="button" class="btn-ghost btn-sm" data-carousel-prev aria-label="Previous">←</button><button type="button" class="btn-ghost btn-sm" data-carousel-next aria-label="Next">→</button></div></div></div></section>`,
`.c-process-carousel .carousel__track > *{flex-basis:min(100%,16rem)}`);

add("process","process-split","Copy + large how-it-works media.","illustration or photo","b2b,trade,beauty",["reverse"],
`<section class="c-process-split section"><div class="wrap split"><div><div class="section__head"><slot name="eyebrow"></slot><slot name="heading"></slot><p class="lede"><slot name="lede"></slot></p></div><ol class="c-process-split__list"><slot name="steps"></slot></ol></div><div class="ratio-4x3"><slot name="media"></slot></div></div></section>`,
`.c-process-split__list{margin:0;padding-left:1.1rem;display:grid;gap:var(--space-3);color:var(--color-muted)}
.c-process-split--reverse .split > :first-child{order:2}`);

// ABOUT (4)
add("about","about-story","Heritage story split.","owner/place photo","all",["reverse"],
`<section class="c-about-story section"><div class="wrap split"><div class="ratio-4x3"><slot name="media"></slot></div><div class="c-about-story__copy"><slot name="eyebrow"></slot><slot name="heading"></slot><div class="prose"><slot></slot></div><div class="btn-group"><slot name="actions"></slot></div></div></div></section>`,
`.c-about-story__copy{display:grid;gap:var(--space-4)}
.c-about-story--reverse .split > :first-child{order:2}`);

add("about","about-values","Values as three cards.","optional icons","professional,beauty,b2b",[],
`<section class="c-about-values section section--muted"><div class="wrap"><div class="section__head section__head--center"><slot name="heading"></slot></div><div class="grid grid--3"><slot name="cards"></slot></div></div></section>`,
`.c-about-values .card{height:100%}`);

add("about","about-mission","Centered mission statement.","optional background still","professional,beauty,food",["dark"],
`<section class="c-about-mission section"><div class="wrap c-about-mission__inner"><slot name="eyebrow"></slot><slot></slot></div></section>`,
`.c-about-mission__inner{max-width:40rem;margin-inline:auto;text-align:center;display:grid;gap:var(--space-4)}
.c-about-mission--dark{background:#141210;color:#F7F4EF}`);

add("about","about-credentials","Credentials / licenses grid.","badge marks","trade,professional",[],
`<section class="c-about-credentials section"><div class="wrap"><div class="section__head"><slot name="heading"></slot><p class="lede"><slot name="lede"></slot></p></div><div class="grid grid--4"><slot name="items"></slot></div></div></section>`,
`.c-about-credentials .card__body{text-align:center;justify-items:center}`);

// STATS (3)
add("stats","stats-row","Inline four metrics.","none","trade,b2b,professional",["dark"],
`<section class="c-stats-row section--tight" data-island="counter"><div class="wrap grid grid--4"><slot name="stats"></slot></div></section>`,
`.c-stats-row--dark{background:#141210;color:#F7F4EF;padding-block:var(--space-6)}`);

add("stats","stats-cards","Metric cards with labels.","none","b2b,trade",[],
`<section class="c-stats-cards section" data-island="counter"><div class="wrap grid grid--3"><slot name="cards"></slot></div></section>`,
`.c-stats-cards .stat__value{font-size:var(--step-4)}`);

add("stats","stats-split","Stat cluster beside copy.","optional media","professional,trade",[],
`<section class="c-stats-split section section--muted" data-island="counter"><div class="wrap split"><div><div class="section__head"><slot name="heading"></slot><p class="lede"><slot name="lede"></slot></p></div><div class="btn-group"><slot name="actions"></slot></div></div><div class="grid grid--2"><slot name="stats"></slot></div></div></section>`,
`.c-stats-split .stat{padding:var(--space-4);background:var(--color-surface);border-radius:var(--radius-lg);border:1px solid var(--color-border)}`);

// TESTIMONIAL (5)
add("testimonial","testimonial-spotlight","Large quote with avatar attribution.","portrait optional","all",["dark"],
`<section class="c-testimonial-spotlight section"><div class="wrap c-testimonial-spotlight__inner"><blockquote class="quote"><slot></slot><cite><span class="avatar-group"><slot name="avatar"></slot></span><slot name="attribution"></slot></cite></blockquote></div></section>`,
`.c-testimonial-spotlight__inner{max-width:42rem;margin-inline:auto;text-align:center}
.c-testimonial-spotlight cite{display:flex;gap:var(--space-3);align-items:center;justify-content:center}
.c-testimonial-spotlight--dark{background:#141210;color:#F7F4EF}`);

add("testimonial","testimonial-grid","Three testimonial cards.","portraits optional","all",[],
`<section class="c-testimonial-grid section section--muted"><div class="wrap"><div class="section__head section__head--center"><slot name="heading"></slot></div><div class="grid grid--3"><slot name="cards"></slot></div></div></section>`,
`.c-testimonial-grid .quote{font-size:var(--step-1)}`);

add("testimonial","testimonial-carousel","Buttoned testimonial carousel.","portraits","trade,beauty,food",[],
`<section class="c-testimonial-carousel section"><div class="wrap"><div class="section__head"><slot name="heading"></slot></div><div class="carousel" data-island="carousel" tabindex="0"><div class="carousel__track"><slot name="cards"></slot></div><div class="carousel__nav"><button type="button" class="btn-ghost btn-sm" data-carousel-prev aria-label="Previous">←</button><button type="button" class="btn-ghost btn-sm" data-carousel-next aria-label="Next">→</button></div></div></div></section>`,
`.c-testimonial-carousel .carousel__track > *{flex-basis:min(100%,22rem)}`);

add("testimonial","testimonial-rating","Star rating band with review count.","none","trade,beauty,food,professional",[],
`<section class="c-testimonial-rating section--tight"><div class="wrap c-testimonial-rating__row"><div class="rating" aria-hidden="true">★★★★★</div><p><slot></slot></p></div></section>`,
`.c-testimonial-rating__row{display:flex;flex-wrap:wrap;gap:var(--space-3);align-items:center;justify-content:center}
.c-testimonial-rating__row p{margin:0;color:var(--color-muted)}`);

add("testimonial","testimonial-wall","Dense quote wall / press mentions.","press marks optional","b2b,professional",[],
`<section class="c-testimonial-wall section"><div class="wrap"><div class="section__head"><slot name="heading"></slot></div><div class="grid grid--2"><slot name="quotes"></slot></div></div></section>`,
`.c-testimonial-wall .card__body{gap:var(--space-3)}`);

// TEAM (3)
add("team","team-grid","Portrait grid of people.","portraits","professional,beauty,b2b,trade",[],
`<section class="c-team-grid section"><div class="wrap"><div class="section__head"><slot name="eyebrow"></slot><slot name="heading"></slot><p class="lede"><slot name="lede"></slot></p></div><div class="grid grid--4"><slot name="people"></slot></div></div></section>`,
`.c-team-grid .card__media{aspect-ratio:3/4}`);

add("team","team-featured","Featured person + roster.","portraits","professional,beauty",[],
`<section class="c-team-featured section section--muted"><div class="wrap split"><div class="c-team-featured__lead card card--bordered"><div class="ratio-3x4"><slot name="media"></slot></div><div class="card__body"><slot name="lead"></slot></div></div><div><div class="section__head"><slot name="heading"></slot></div><div class="grid grid--2"><slot name="people"></slot></div></div></div></section>`,
`.c-team-featured__lead{overflow:hidden}`);

add("team","team-list","Compact name/role list.","optional avatars","professional,b2b",[],
`<section class="c-team-list section"><div class="wrap"><div class="section__head"><slot name="heading"></slot></div><ul class="c-team-list__rows"><slot name="people"></slot></ul></div></section>`,
`.c-team-list__rows{list-style:none;margin:0;padding:0;display:grid}
.c-team-list__rows > *{display:flex;gap:var(--space-3);align-items:center;padding:var(--space-4) 0;border-top:1px solid var(--color-border)}`);

// GALLERY (4)
add("gallery","gallery-grid","Responsive photo grid.","photos","trade,beauty,food",[],
`<section class="c-gallery-grid section" data-island="lightbox"><div class="wrap"><div class="section__head"><slot name="heading"></slot></div><div class="grid grid--3"><slot name="items"></slot></div><dialog><img alt=""><form method="dialog"><button type="submit" class="btn-ghost" data-lightbox-close>Close</button></form></dialog></div></section>`,
`.c-gallery-grid .ratio-1x1{cursor:zoom-in}`);

add("gallery","gallery-masonry","Mixed aspect gallery.","photos","beauty,food,trade",[],
`<section class="c-gallery-masonry section"><div class="wrap"><div class="section__head section__head--center"><slot name="heading"></slot></div><div class="bento"><slot name="items"></slot></div></div></section>`,
`.c-gallery-masonry .ratio-16x9,.c-gallery-masonry .ratio-1x1{height:100%}`);

add("gallery","gallery-before-after","Before/after project cases.","paired photos","trade",[],
`<section class="c-gallery-before-after section section--muted"><div class="wrap"><div class="section__head"><slot name="heading"></slot><p class="lede"><slot name="lede"></slot></p></div><div class="grid grid--2"><slot name="cases"></slot></div></div></section>`,
`.c-gallery-before-after .before-after{margin-top:var(--space-3)}`);

add("gallery","gallery-carousel","Full-bleed project carousel.","photos","trade,beauty,food",[],
`<section class="c-gallery-carousel section"><div class="wrap"><div class="section__head"><slot name="heading"></slot></div><div class="carousel" data-island="carousel" tabindex="0"><div class="carousel__track"><slot name="items"></slot></div><div class="carousel__nav"><button type="button" class="btn-ghost btn-sm" data-carousel-prev aria-label="Previous">←</button><button type="button" class="btn-ghost btn-sm" data-carousel-next aria-label="Next">→</button></div></div></div></section>`,
`.c-gallery-carousel .carousel__track > *{flex-basis:min(100%,28rem)}`);

// PRICING / MENU (5)
add("pricing","pricing-tiers","Three pricing tiers.","none","b2b,professional,beauty",["highlight-mid"],
`<section class="c-pricing-tiers section"><div class="wrap"><div class="section__head section__head--center"><slot name="eyebrow"></slot><slot name="heading"></slot><p class="lede"><slot name="lede"></slot></p></div><div class="grid grid--3"><slot name="tiers"></slot></div></div></section>`,
`.c-pricing-tiers .card{height:100%}
.c-pricing-tiers--highlight-mid .grid > :nth-child(2){transform:scale(1.02);box-shadow:var(--shadow-3);border-color:var(--color-accent)}`);

add("pricing","pricing-table","Simple feature compare table.","none","b2b,professional",[],
`<section class="c-pricing-table section section--muted"><div class="wrap"><div class="section__head"><slot name="heading"></slot></div><div class="c-pricing-table__scroll"><slot name="table"></slot></div></div></section>`,
`.c-pricing-table__scroll{overflow-x:auto}
.c-pricing-table table{width:100%;border-collapse:collapse}
.c-pricing-table th,.c-pricing-table td{padding:var(--space-3);border-bottom:1px solid var(--color-border);text-align:left}`);

add("pricing","menu-featured","Featured dishes with prices.","food photos","food",[],
`<section class="c-menu-featured section"><div class="wrap"><div class="section__head section__head--center"><slot name="heading"></slot></div><div class="grid grid--3"><slot name="cards"></slot></div></div></section>`,
`.c-menu-featured .card__media{aspect-ratio:4/3}`);

add("pricing","menu-sections","Categorized menu lists.","optional","food,beauty",[],
`<section class="c-menu-sections section"><div class="wrap c-menu-sections__stack"><div class="section__head section__head--center"><slot name="heading"></slot></div><slot name="sections"></slot></div></section>`,
`.c-menu-sections__stack{display:grid;gap:var(--space-7)}
.c-menu-sections__item{display:grid;grid-template-columns:1fr auto;gap:var(--space-2);padding:var(--space-3) 0;border-bottom:1px dotted var(--color-border)}`);

add("pricing","pricing-toggle","Monthly/annual toggle via tabs island.","none","b2b,professional",[],
`<section class="c-pricing-toggle section"><div class="wrap"><div class="section__head section__head--center"><slot name="heading"></slot></div><div class="tabs" data-island="tabs"><slot name="tabs"></slot></div></div></section>`,
`.c-pricing-toggle .tabs__list{justify-content:center}`);

// FAQ (3)
add("faq","faq-accordion","Default details/summary FAQ.","none","all",["two-col"],
`<section class="c-faq-accordion section"><div class="wrap"><div class="section__head"><slot name="eyebrow"></slot><slot name="heading"></slot></div><div class="accordion"><slot name="items"></slot></div></div></section>`,
`.c-faq-accordion--two-col .accordion{@media(min-width:900px){columns:2;column-gap:var(--space-7)}
.c-faq-accordion--two-col .accordion details{break-inside:avoid}}`);

add("faq","faq-split","FAQ beside contact CTA.","none","trade,professional,b2b",[],
`<section class="c-faq-split section section--muted"><div class="wrap split"><div><div class="section__head"><slot name="heading"></slot><p class="lede"><slot name="lede"></slot></p></div><div class="btn-group"><slot name="actions"></slot></div></div><div class="accordion"><slot name="items"></slot></div></div></section>`,
`.c-faq-split .accordion{background:var(--color-surface);padding:0 var(--space-5);border-radius:var(--radius-lg);border:1px solid var(--color-border)}`);

add("faq","faq-tabs","Categorized FAQ tabs.","none","b2b,professional",[],
`<section class="c-faq-tabs section"><div class="wrap"><div class="section__head"><slot name="heading"></slot></div><div class="tabs" data-island="tabs"><slot name="tabs"></slot></div></div></section>`,
`.c-faq-tabs .accordion{margin-top:var(--space-4)}`);

// CTA (5)
add("cta","cta-band","Full-width conversion band.","none","all",["dark","accent"],
`<section class="c-cta-band section"><div class="wrap c-cta-band__inner"><div><slot name="eyebrow"></slot><slot name="heading"></slot><p class="lede"><slot name="lede"></slot></p></div><div class="btn-group"><slot name="actions"></slot></div></div></section>`,
`.c-cta-band__inner{display:grid;gap:var(--space-5);align-items:center}
@media(min-width:720px){.c-cta-band__inner{grid-template-columns:1fr auto}}
.c-cta-band--dark{background:#141210;color:#F7F4EF}
.c-cta-band--accent{background:var(--color-accent);color:var(--color-accent-text)}
.c-cta-band--accent .lede{color:color-mix(in srgb,var(--color-accent-text) 85%,transparent)}`);

add("cta","cta-card","Centered elevated CTA card.","optional media","beauty,food,b2b",[],
`<section class="c-cta-card section"><div class="wrap"><div class="card card--elevated c-cta-card__card"><div class="card__body"><slot name="eyebrow"></slot><slot name="heading"></slot><p class="lede"><slot name="lede"></slot></p><div class="btn-group"><slot name="actions"></slot></div></div></div></div></section>`,
`.c-cta-card__card{max-width:40rem;margin-inline:auto;text-align:center}
.c-cta-card .card__body{justify-items:center;gap:var(--space-4)}`);

add("cta","cta-split","CTA copy + form or phone block.","optional","trade,professional",["dark"],
`<section class="c-cta-split section"><div class="wrap split"><div><slot name="eyebrow"></slot><slot name="heading"></slot><p class="lede"><slot name="lede"></slot></p></div><div class="card"><div class="card__body"><slot name="panel"></slot></div></div></div></section>`,
`.c-cta-split--dark{background:#141210;color:#F7F4EF}
.c-cta-split--dark .card{background:#1E1B18;border-color:#3A342E}`);

add("cta","cta-newsletter","Email capture strip.","none","food,beauty,b2b",[],
`<section class="c-cta-newsletter section section--muted"><div class="wrap c-cta-newsletter__inner"><div><slot name="heading"></slot><p class="lede"><slot name="lede"></slot></p></div><div><slot name="form"></slot></div></div></section>`,
`.c-cta-newsletter__inner{display:grid;gap:var(--space-4)}
@media(min-width:720px){.c-cta-newsletter__inner{grid-template-columns:1fr 1fr;align-items:end}}`);

add("cta","cta-floating-bar","Compact bottom/inline urgency bar (static).","none","trade,food",[],
`<aside class="c-cta-floating-bar announcement"><slot></slot><slot name="actions"></slot></aside>`,
`.c-cta-floating-bar{justify-content:space-between;gap:var(--space-4)}`);

// CONTACT (4)
add("contact","contact-split","NAP + lead form.","optional map still","all",[],
`<section class="c-contact-split section"><div class="wrap split"><div class="c-contact-split__details"><div class="section__head"><slot name="eyebrow"></slot><slot name="heading"></slot></div><slot name="details"></slot></div><div class="card card--bordered"><div class="card__body"><slot name="form"></slot></div></div></div></section>`,
`.c-contact-split__details{display:grid;gap:var(--space-4);align-content:start}`);

add("contact","contact-cards","Phone / email / address cards.","none","trade,professional",[],
`<section class="c-contact-cards section section--muted"><div class="wrap"><div class="section__head section__head--center"><slot name="heading"></slot></div><div class="grid grid--3"><slot name="cards"></slot></div></div></section>`,
`.c-contact-cards .card__body{gap:var(--space-2)}`);

add("contact","contact-map","Media/map still beside details.","map or storefront","trade,food,beauty",[],
`<section class="c-contact-map section"><div class="wrap split"><div class="ratio-4x3"><slot name="media"></slot></div><div><div class="section__head"><slot name="heading"></slot></div><slot name="details"></slot><div class="btn-group"><slot name="actions"></slot></div></div></div></section>`,
`.c-contact-map .section__head{margin-bottom:var(--space-4)}`);

add("contact","contact-hours","Hours table + CTA.","none","trade,food,beauty",[],
`<section class="c-contact-hours section"><div class="wrap split"><div><div class="section__head"><slot name="heading"></slot><p class="lede"><slot name="lede"></slot></p></div><div class="btn-group"><slot name="actions"></slot></div></div><table class="c-contact-hours__table"><slot name="hours"></slot></table></div></section>`,
`.c-contact-hours__table{width:100%;border-collapse:collapse}
.c-contact-hours__table td{padding:var(--space-3) 0;border-bottom:1px solid var(--color-border)}
.c-contact-hours__table td:last-child{text-align:right;color:var(--color-muted)}`);

// BLOG (3)
add("blog","blog-index","Post card grid.","cover images","b2b,professional,food",[],
`<section class="c-blog-index section"><div class="wrap"><div class="section__head"><slot name="heading"></slot><p class="lede"><slot name="lede"></slot></p></div><div class="grid grid--3"><slot name="posts"></slot></div></div></section>`,
`.c-blog-index .card__media{aspect-ratio:16/9}`);

add("blog","blog-featured","One featured + side list.","covers","professional,b2b",[],
`<section class="c-blog-featured section section--muted"><div class="wrap split"><article class="card"><div class="ratio-16x9"><slot name="media"></slot></div><div class="card__body"><slot name="featured"></slot></div></article><div class="c-blog-featured__list"><slot name="posts"></slot></div></div></section>`,
`.c-blog-featured__list{display:grid;gap:var(--space-4)}`);

add("blog","blog-post-header","Article title block.","optional hero","all",[],
`<header class="c-blog-post-header section--tight"><div class="wrap c-blog-post-header__inner"><p class="eyebrow"><slot name="meta"></slot></p><slot></slot><p class="lede"><slot name="lede"></slot></p></div></header>`,
`.c-blog-post-header__inner{max-width:42rem;display:grid;gap:var(--space-3)}`);

// FOOTER (4)
add("footer","footer-columns","Multi-column directory footer.","logo optional","all",["dark"],
`<footer class="c-footer-columns section--tight"><div class="wrap c-footer-columns__grid"><div><slot name="brand"></slot></div><slot name="columns"></slot></div><div class="wrap c-footer-columns__legal"><slot name="legal"></slot></div></footer>`,
`.c-footer-columns{border-top:1px solid var(--color-border);padding-block:var(--space-7) var(--space-5)}
.c-footer-columns__grid{display:grid;gap:var(--space-5)}
@media(min-width:720px){.c-footer-columns__grid{grid-template-columns:1.2fr repeat(3,1fr)}}
.c-footer-columns__grid a{display:block;text-decoration:none;color:var(--color-muted);font-size:var(--step-0);margin-top:var(--space-2)}
.c-footer-columns__legal{margin-top:var(--space-6);padding-top:var(--space-4);border-top:1px solid var(--color-border);color:var(--color-muted);font-size:var(--step-0);display:flex;flex-wrap:wrap;gap:var(--space-4)}
.c-footer-columns--dark{background:#141210;color:#F7F4EF;border-color:#3A342E}`);

add("footer","footer-compact","Brand + legal + cookie link.","logo optional","all",[],
`<footer class="c-footer-compact"><div class="wrap c-footer-compact__inner"><div><slot name="brand"></slot></div><nav aria-label="Legal"><slot name="legal"></slot></nav></div></footer>`,
`.c-footer-compact{border-top:1px solid var(--color-border);padding:var(--space-5) 0}
.c-footer-compact__inner{display:flex;flex-wrap:wrap;gap:var(--space-4);justify-content:space-between;align-items:center}
.c-footer-compact nav{display:flex;flex-wrap:wrap;gap:var(--space-4)}
.c-footer-compact a{color:var(--color-muted);text-decoration:none;font-size:var(--step-0)}`);

add("footer","footer-cta","Mini CTA above compact footer.","none","trade,beauty,food",["dark"],
`<footer class="c-footer-cta"><div class="c-footer-cta__band section--tight"><div class="wrap c-footer-cta__row"><div><slot name="heading"></slot></div><div class="btn-group"><slot name="actions"></slot></div></div></div><div class="wrap c-footer-cta__legal"><slot name="legal"></slot></div></footer>`,
`.c-footer-cta__band{background:var(--color-surface-2);border-top:1px solid var(--color-border)}
.c-footer-cta__row{display:flex;flex-wrap:wrap;gap:var(--space-4);justify-content:space-between;align-items:center}
.c-footer-cta__legal{padding:var(--space-4) 0;font-size:var(--step-0);color:var(--color-muted);display:flex;gap:var(--space-4);flex-wrap:wrap}
.c-footer-cta--dark .c-footer-cta__band{background:#141210;color:#F7F4EF}`);

add("footer","footer-social","Social icons + NAP strip.","social icons","beauty,food,trade",[],
`<footer class="c-footer-social section--tight"><div class="wrap c-footer-social__inner"><div><slot name="brand"></slot><div class="c-footer-social__icons"><slot name="social"></slot></div></div><div><slot name="details"></slot></div><nav aria-label="Legal"><slot name="legal"></slot></nav></div></footer>`,
`.c-footer-social{border-top:1px solid var(--color-border)}
.c-footer-social__inner{display:grid;gap:var(--space-5)}
@media(min-width:720px){.c-footer-social__inner{grid-template-columns:1fr 1fr 1fr}}
.c-footer-social__icons{display:flex;gap:var(--space-3);margin-top:var(--space-3)}
.c-footer-social a{color:var(--color-muted);text-decoration:none}`);

// INCENTIVES (2)
add("incentives","incentive-banner","Promo / offer banner.","none","trade,beauty,food",["accent"],
`<aside class="c-incentive-banner announcement"><slot></slot><slot name="actions"></slot></aside>`,
`.c-incentive-banner--accent{background:color-mix(in srgb,var(--color-accent) 14%,var(--color-surface-2));border-color:color-mix(in srgb,var(--color-accent) 30%,var(--color-border))}`);

add("incentives","incentive-cards","Offer cards (financing, warranty, gift).","optional icons","trade,beauty,professional",[],
`<section class="c-incentive-cards section--tight"><div class="wrap grid grid--3"><slot name="cards"></slot></div></section>`,
`.c-incentive-cards .card__body{gap:var(--space-2)}`);

for (const b of blocks) writeBlock(b);
console.log(`Wrote ${blocks.length} blocks to ${root}`);
