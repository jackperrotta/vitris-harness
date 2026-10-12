/** Shared layout/surface primitives appended to every site.css (token-only). */

export const primitivesCss = `
/* —— Layout —— */
.section {
  padding-block: var(--section-y);
}
.section--tight { padding-block: var(--space-6); }
.section--roomy { padding-block: calc(var(--section-y) + var(--space-5)); }
.section--surface { background: var(--color-surface); }
.section--muted { background: var(--color-surface-2); }
.section--dark,
[data-scheme="dark"] {
  --color-bg: #141210;
  --color-text: #F7F4EF;
  --color-muted: #B8B0A4;
  --color-surface: #1E1B18;
  --color-surface-2: #2A2622;
  --color-border: #3A342E;
  background: var(--color-bg);
  color: var(--color-text);
}
.section__head {
  display: grid;
  gap: var(--space-3);
  margin-bottom: var(--space-7);
  max-width: 42rem;
}
.section__head--center {
  margin-inline: auto;
  text-align: center;
  justify-items: center;
}
.section__head--row {
  max-width: none;
  grid-template-columns: minmax(0, 42rem);
  align-items: end;
  justify-content: space-between;
}
@media (min-width: 720px) {
  .section__head--row { grid-template-columns: minmax(0, 42rem) auto; }
}
.section__head--row > .btn-group { justify-self: end; }
/* Editorial split head: short label column, heading + lede column. */
.section__head--split { max-width: none; }
@media (min-width: 720px) {
  .section__head--split {
    grid-template-columns: minmax(0, 14rem) minmax(0, 42rem);
    gap: var(--space-5) var(--space-7);
    align-items: start;
  }
  .section__head--split > .eyebrow { padding-top: 0.45em; }
  .section__head--split > :not(.eyebrow) { grid-column: 2; }
}
.sticky-col { align-self: start; }
@media (min-width: 1080px) {
  .sticky-col { position: sticky; top: calc(var(--header-h, 4rem) + var(--space-5)); }
}
.section__head .lede,
.lede {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--step-1);
  line-height: 1.55;
  max-width: 38rem;
}
.lede--lg { font-size: var(--step-2); line-height: 1.45; }
.eyebrow {
  margin: 0;
  font-size: var(--step-0);
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-muted);
}
.eyebrow--accent { color: var(--color-accent); }
.grid {
  display: grid;
  gap: var(--gap, var(--space-5));
}
.grid--2 { grid-template-columns: 1fr; }
.grid--3 { grid-template-columns: 1fr; }
.grid--4 { grid-template-columns: 1fr; }
@media (min-width: 720px) {
  .grid--2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .grid--3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .grid--4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (min-width: 1080px) {
  .grid--4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
.split {
  display: grid;
  gap: var(--space-6);
  align-items: center;
}
.split--top { align-items: start; }
@media (min-width: 720px) {
  .split { grid-template-columns: 1fr 1fr; gap: var(--space-7); }
  .split--reverse > :first-child { order: 2; }
}
@media (min-width: 1080px) {
  .split { gap: var(--space-8); }
}
.bento {
  display: grid;
  gap: var(--space-3);
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.bento__wide, .bento__full { grid-column: span 2; }
@media (min-width: 720px) {
  .bento {
    gap: var(--space-4);
    grid-template-columns: repeat(6, minmax(0, 1fr));
    grid-auto-rows: minmax(9rem, auto);
    grid-auto-flow: dense;
  }
  .bento > * { grid-column: span 3; }
  .bento__wide { grid-column: span 4; }
  .bento__tall { grid-row: span 2; }
  .bento__full { grid-column: span 6; }
  .bento__narrow { grid-column: span 2; }
}
.stack { display: grid; gap: var(--space-4); }
.stack--tight { gap: var(--space-2); }
.stack--loose { gap: var(--space-6); }
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}
.row--between { justify-content: space-between; }

/* —— Surfaces —— */
.card {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.card--bordered { box-shadow: none; }
.card--elevated { box-shadow: var(--shadow-2); border-color: transparent; }
.card--flat {
  box-shadow: none;
  border-color: transparent;
  background: var(--color-surface-2);
}
.card--accent { border-color: var(--color-accent); box-shadow: 0 0 0 1px var(--color-accent); }
.card--interactive {
  transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
}
.card--interactive:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-2);
}
.card__media {
  position: relative;
  overflow: hidden;
  background: var(--color-surface-2);
  border-radius: 0;
}
.card__media img,
.card__media video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 400ms ease;
}
.card--interactive:hover .card__media img { transform: scale(1.03); }
.card__body {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-5);
  flex: 1;
  align-content: start;
}
.card__body > h3,
.card__body > h4 {
  font-size: var(--step-2);
  line-height: 1.25;
}
.card__body > p { margin: 0; color: var(--color-muted); font-size: var(--step-1); }
.card__body > .btn-group,
.card__body > .btn,
.card__body > .btn-outline,
.card__body > .btn-arrow {
  margin-top: var(--space-2);
  justify-self: start;
}
.card__body > .btn-arrow { align-self: end; margin-top: auto; padding-top: var(--space-3); }
/* Photo tile with a bottom scrim and light text (services tiles, project grids, step panels). */
.photo-card {
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  overflow: hidden;
  border-radius: var(--radius-lg);
  background: var(--color-surface-2);
  color: #fff;
  text-decoration: none;
}
.photo-card > img {
  position: absolute;
  inset: 0;
  z-index: -2;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 500ms ease;
}
.photo-card::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.05) 30%, rgba(0, 0, 0, 0.72) 100%);
}
.photo-card__body {
  display: grid;
  gap: var(--space-1);
  padding: var(--space-5);
}
.photo-card__body h2,
.photo-card__body h3,
.photo-card__body strong { color: #fff; }
.photo-card__body p { margin: 0; color: rgba(255, 255, 255, 0.82); }
.photo-card__body .eyebrow { color: rgba(255, 255, 255, 0.72); }
a.photo-card:hover > img,
a.photo-card:focus-visible > img { transform: scale(1.04); }
a.photo-card:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
.card__footer {
  margin-top: auto;
  padding: var(--space-4) var(--space-5);
  border-top: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}
.hairline {
  border: 0;
  border-top: 1px solid var(--color-border);
  margin: var(--space-6) 0;
}
.frame {
  overflow: hidden;
  border-radius: var(--radius-lg);
  background: var(--color-surface-2);
  box-shadow: var(--shadow-2);
}
.frame > img,
.frame > video { width: 100%; height: 100%; object-fit: cover; }
.ratio-16x9,
.ratio-4x3,
.ratio-3x2,
.ratio-1x1,
.ratio-3x4,
.ratio-21x9 {
  position: relative;
  overflow: hidden;
  border-radius: var(--radius-lg);
  background: var(--color-surface-2);
}
.ratio-16x9 { aspect-ratio: 16 / 9; }
.ratio-4x3 { aspect-ratio: 4 / 3; }
.ratio-3x2 { aspect-ratio: 3 / 2; }
.ratio-1x1 { aspect-ratio: 1 / 1; }
.ratio-3x4 { aspect-ratio: 3 / 4; }
.ratio-21x9 { aspect-ratio: 21 / 9; }
.card__media[class*="ratio-"] { border-radius: 0; }
.ratio-16x9 > img,
.ratio-4x3 > img,
.ratio-3x2 > img,
.ratio-1x1 > img,
.ratio-3x4 > img,
.ratio-21x9 > img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.icon-tile {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--color-accent) 12%, transparent);
  color: var(--color-accent);
  flex-shrink: 0;
}
.icon-tile .icon { width: 1.35rem; height: 1.35rem; }
.icon-tile--round { border-radius: var(--radius-pill); }
.icon-tile--muted { background: var(--color-surface-2); color: var(--color-text); }

/* —— Marks —— */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 1.85rem;
  padding: 0.25rem 0.75rem;
  border-radius: var(--radius-pill);
  font-size: var(--step-0);
  font-weight: 600;
  line-height: 1.2;
  background: var(--color-surface-2);
  color: var(--color-text);
  border: 1px solid transparent;
  white-space: nowrap;
}
.badge .icon { width: 1rem; height: 1rem; }
.badge--accent {
  background: color-mix(in srgb, var(--color-accent) 14%, transparent);
  color: var(--color-accent);
}
.badge--muted { color: var(--color-muted); }
.badge--outline {
  background: transparent;
  border-color: var(--color-border);
}
.stat { display: grid; gap: var(--space-1); align-content: start; }
.stat__value {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--step-4);
  font-weight: 600;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
  line-height: 1.05;
}
.stat__label {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--step-0);
}
.stat--sm .stat__value { font-size: var(--step-3); }
.rating {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  color: var(--color-accent);
  letter-spacing: 0.05em;
  line-height: 1;
}
.rating .icon { width: 1.05rem; height: 1.05rem; fill: currentColor; stroke: none; }
.price {
  display: flex;
  align-items: baseline;
  gap: 0.3rem;
  margin: 0;
}
.price__amount {
  font-family: var(--font-display);
  font-size: var(--step-4);
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.price__period { color: var(--color-muted); font-size: var(--step-0); }
.prose {
  max-width: 65ch;
}
.prose > * + * { margin-top: var(--space-4); }
.list-check,
.list-plain {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space-3);
}
.list-check li {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  line-height: 1.5;
}
.list-check li > .icon {
  margin-top: 0.2em;
  color: var(--color-accent);
}
.table-wrap { overflow-x: auto; }
.table {
  width: 100%;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}
.table th,
.table td {
  padding: var(--space-3) var(--space-4);
  text-align: left;
  border-bottom: 1px solid var(--color-border);
  vertical-align: top;
}
.table th {
  font-size: var(--step-0);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-muted);
}
.table td:not(:first-child),
.table th:not(:first-child) { text-align: right; }
.table--plain th,
.table--plain td { padding-inline: 0; }

/* —— People / proof —— */
.avatar {
  width: 2.75rem;
  height: 2.75rem;
  border-radius: var(--radius-pill);
  object-fit: cover;
  background: var(--color-surface-2);
  border: 2px solid var(--color-surface);
  flex-shrink: 0;
}
.avatar--sm { width: 2rem; height: 2rem; }
.avatar--lg { width: 4rem; height: 4rem; }
.avatar-group {
  display: inline-flex;
  align-items: center;
}
.avatar-group .avatar { margin-inline-start: -0.55rem; box-shadow: 0 0 0 2px var(--color-bg); }
.avatar-group .avatar:first-child { margin-inline-start: 0; }
/* —— Chips (radio / checkbox pills) —— */
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  border: 0;
}
.chips > legend,
.chips__label {
  display: block;
  width: 100%;
  margin-bottom: var(--space-2);
  font-size: var(--step-0);
  font-weight: 600;
  color: var(--color-text);
}
.chips label { position: relative; display: inline-flex; }
.chips input {
  position: absolute;
  inset: 0;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}
.chips span {
  display: inline-flex;
  align-items: center;
  min-height: 2.25rem;
  padding: 0.35rem 0.9rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  font-size: var(--step-0);
  font-weight: 500;
  color: var(--color-text);
  background: var(--color-surface);
  transition: background 0.15s ease, border-color 0.15s ease;
}
.chips label:hover span { border-color: var(--color-text); }
.chips input:checked + span {
  background: var(--color-text);
  border-color: var(--color-text);
  color: var(--color-bg);
}
.chips input:focus-visible + span { outline: 2px solid var(--color-focus); outline-offset: 2px; }
.byline {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-size: var(--step-0);
}
.byline strong { display: block; font-weight: 600; color: var(--color-text); }
.byline span { color: var(--color-muted); }
.logo-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--space-5) var(--space-7);
  opacity: 0.65;
}
.logo-row img {
  max-height: 1.75rem;
  width: auto;
  filter: grayscale(1);
}
.quote {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--step-2);
  line-height: 1.4;
  letter-spacing: -0.015em;
  text-wrap: pretty;
}
.quote--lg { font-size: var(--step-3); line-height: 1.3; letter-spacing: -0.02em; }
.quote cite,
.quote footer {
  display: block;
  margin-top: var(--space-4);
  font-style: normal;
  font-family: var(--font-body);
  font-size: var(--step-0);
  letter-spacing: 0;
  color: var(--color-muted);
}
.quote--card {
  font-family: var(--font-body);
  font-size: var(--step-1);
  line-height: 1.6;
  letter-spacing: 0;
}

/* —— Controls —— */
.btn-lg { padding: 0.9rem 1.75rem; min-height: 3rem; font-size: var(--step-1); }
.btn-sm { padding: 0.45rem 1rem; min-height: 2.25rem; font-size: var(--step-0); }
.btn-icon {
  width: var(--tap-min);
  height: var(--tap-min);
  padding: 0;
  border-radius: var(--radius-pill);
}
.btn-group {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: center;
}
.field {
  display: grid;
  gap: var(--space-2);
}
.field label {
  font-weight: 600;
  font-size: var(--step-0);
}
.field + .field { margin-top: var(--space-4); }
.form-grid {
  display: grid;
  gap: var(--space-4);
}
.form-grid .field + .field { margin-top: 0; }
@media (min-width: 720px) {
  .form-grid--2 { grid-template-columns: 1fr 1fr; }
  .form-grid .field--full { grid-column: 1 / -1; }
}
.input,
.textarea,
.select {
  width: 100%;
  min-height: var(--tap-min);
  padding: 0.65rem 0.9rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  line-height: 1.4;
}
.textarea { min-height: 7rem; resize: vertical; }
.input:focus-visible,
.textarea:focus-visible,
.select:focus-visible {
  outline: none;
  box-shadow: var(--ring);
  border-color: var(--color-focus);
}
.input-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.input-row .input { flex: 1 1 14rem; }
.checkbox {
  width: 1.15rem;
  height: 1.15rem;
  accent-color: var(--color-accent);
}
.accordion {
  border-top: 1px solid var(--color-border);
}
.accordion details {
  border-bottom: 1px solid var(--color-border);
}
.accordion summary {
  list-style: none;
  cursor: pointer;
  min-height: var(--tap-min);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-4) 0;
  font-weight: 600;
  font-size: var(--step-1);
}
.accordion summary::-webkit-details-marker { display: none; }
.accordion summary::after {
  content: "+";
  flex-shrink: 0;
  width: 1.75rem;
  height: 1.75rem;
  display: inline-grid;
  place-items: center;
  border-radius: var(--radius-pill);
  background: var(--color-surface-2);
  font-weight: 500;
  color: var(--color-muted);
  transition: transform 180ms ease;
}
.accordion details[open] summary::after { content: "–"; }
.accordion details > *:not(summary) {
  margin: 0;
  padding-bottom: var(--space-4);
  max-width: 60ch;
  color: var(--color-muted);
}
.tabs {
  display: grid;
  gap: var(--space-5);
}
.tabs__list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  border-bottom: 1px solid var(--color-border);
}
.tabs__list--pill {
  border-bottom: 0;
  gap: var(--space-1);
  padding: var(--space-1);
  background: var(--color-surface-2);
  border-radius: var(--radius-pill);
  width: fit-content;
}
.tabs__tab {
  appearance: none;
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  padding: var(--space-3) var(--space-4);
  min-height: var(--tap-min);
  font: inherit;
  font-weight: 600;
  color: var(--color-muted);
  cursor: pointer;
  transition: color 160ms ease;
}
.tabs__tab:hover { color: var(--color-text); }
.tabs__tab[aria-selected="true"] {
  color: var(--color-text);
  border-bottom-color: var(--color-accent);
}
.tabs__list--pill .tabs__tab {
  border: 0;
  margin: 0;
  min-height: 2.5rem;
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-pill);
}
.tabs__list--pill .tabs__tab[aria-selected="true"] {
  background: var(--color-surface);
  box-shadow: var(--shadow-1);
}
.tabs__panel[hidden] { display: none; }
.announcement {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--space-2) var(--space-4);
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface-2);
  border-bottom: 1px solid var(--color-border);
  font-size: var(--step-0);
  text-align: center;
}
.announcement a { font-weight: 600; color: inherit; }

/* —— Chrome —— */
.header--sticky {
  position: sticky;
  top: 0;
  z-index: 50;
  background: color-mix(in srgb, var(--color-bg) 86%, transparent);
  backdrop-filter: blur(var(--blur-header));
  -webkit-backdrop-filter: blur(var(--blur-header));
  border-bottom: 1px solid transparent;
  transition: border-color 180ms ease, background-color 180ms ease;
}
.header--sticky.is-scrolled {
  border-bottom-color: var(--color-border);
  background: color-mix(in srgb, var(--color-bg) 92%, transparent);
}
.nav-links {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}
.nav-links a {
  display: inline-flex;
  align-items: center;
  min-height: 2.5rem;
  padding: 0 var(--space-3);
  border-radius: var(--radius-pill);
  font-size: var(--step-0);
  font-weight: 500;
  color: var(--color-muted);
  text-decoration: none;
  transition: color 160ms ease, background-color 160ms ease;
}
.nav-links a:hover,
.nav-links a[aria-current="page"] {
  color: var(--color-text);
  background: color-mix(in srgb, var(--color-text) 5%, transparent);
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: var(--step-2);
  letter-spacing: -0.02em;
  color: var(--color-text);
  text-decoration: none;
  white-space: nowrap;
}
.brand img { height: 2rem; width: auto; }
.nav-drawer {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: color-mix(in srgb, var(--color-text) 40%, transparent);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity 180ms ease, visibility 180ms ease;
}
.nav-drawer.is-open {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
}
.nav-drawer__panel {
  position: absolute;
  inset-block: 0;
  inset-inline-end: 0;
  width: min(20rem, 88vw);
  background: var(--color-surface);
  color: var(--color-text);
  padding: calc(var(--header-h) + var(--space-2)) var(--space-5) var(--space-5);
  box-shadow: var(--shadow-3);
  transform: translateX(100%);
  transition: transform 200ms ease;
  display: grid;
  align-content: start;
  gap: var(--space-5);
}
.nav-drawer.is-open .nav-drawer__panel { transform: none; }
.nav-drawer__panel nav {
  display: grid;
}
.nav-drawer__panel nav a {
  display: block;
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--color-border);
  font-weight: 600;
  text-decoration: none;
  color: var(--color-text);
}
.nav-drawer__panel .btn-group > * { flex: 1; }

/* —— Island widgets —— */
.carousel {
  display: grid;
  gap: var(--space-5);
}
.carousel__track {
  display: flex;
  gap: var(--space-4);
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scroll-behavior: smooth;
  padding-bottom: var(--space-2);
  scrollbar-width: none;
}
.carousel__track::-webkit-scrollbar { display: none; }
.carousel__track > * {
  flex: 0 0 min(100%, 22rem);
  scroll-snap-align: start;
}
.carousel__nav {
  display: flex;
  gap: var(--space-2);
}
.carousel__nav > button {
  display: inline-grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  min-height: 0;
  padding: 0;
  border-radius: var(--radius-pill);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
  transition: border-color 160ms ease, background-color 160ms ease;
}
.carousel__nav > button:hover { border-color: var(--color-text); }
.carousel__nav > button:disabled { opacity: 0.4; cursor: default; }
.before-after {
  position: relative;
  overflow: hidden;
  border-radius: var(--radius-lg);
  background: var(--color-surface-2);
  user-select: none;
  touch-action: none;
}
.before-after__before,
.before-after__after {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 10;
  object-fit: cover;
}
.before-after__after {
  position: absolute;
  inset: 0;
  clip-path: inset(0 0 0 50%);
}
.before-after__handle {
  position: absolute;
  inset-block: 0;
  left: 50%;
  width: 2px;
  background: var(--color-surface);
  transform: translateX(-50%);
  cursor: ew-resize;
}
.before-after__handle::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--radius-pill);
  border: 2px solid var(--color-surface);
  background: color-mix(in srgb, var(--color-text) 70%, transparent);
  box-shadow: var(--shadow-2);
  transform: translate(-50%, -50%);
}
.before-after__label {
  position: absolute;
  top: var(--space-3);
  padding: 0.2rem 0.6rem;
  border-radius: var(--radius-pill);
  font-size: var(--step-0);
  font-weight: 600;
  background: color-mix(in srgb, var(--color-bg) 80%, transparent);
  color: var(--color-text);
  pointer-events: none;
}
.before-after__label--before { left: var(--space-3); }
.before-after__label--after { right: var(--space-3); }
.icon {
  width: 1.25rem;
  height: 1.25rem;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex-shrink: 0;
}
.icon--lg { width: 1.75rem; height: 1.75rem; }
.icon--sm { width: 1rem; height: 1rem; }
`;
