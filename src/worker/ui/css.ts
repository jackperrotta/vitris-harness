export const adminCss = `:root {
  --admin-bg: #F4F7F8;
  --admin-surface: #FFFFFF;
  --admin-text: #164E63;
  --admin-muted: #3D6570;
  --admin-line: #D7E4E8;
  --admin-primary: #0891B2;
  --admin-primary-text: #FFFFFF;
  --admin-ok: #15803D;
  --admin-danger: #B91C1C;
  --admin-sidebar: #0E2A33;
  --admin-sidebar-text: #E8F4F7;
  --admin-sidebar-muted: #9BBBC4;
  --radius: 8px;
}
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  font-family: ui-sans-serif, system-ui, "Segoe UI", sans-serif;
  background: var(--admin-bg);
  color: var(--admin-text);
  line-height: 1.5;
}
a { color: inherit; }
:focus-visible { outline: 2px solid var(--admin-primary); outline-offset: 2px; }
.skip {
  position: absolute;
  left: -999px;
}
.skip:focus { left: 1rem; top: 1rem; background: #fff; padding: 0.4rem 0.6rem; }
.shell { display: grid; min-height: 100vh; grid-template-columns: 15.5rem 1fr; }
.shell:has(.main--canvas) { height: 100vh; overflow: hidden; }
.side {
  background: var(--admin-sidebar);
  color: var(--admin-sidebar-text);
  padding: 1.1rem 0.75rem 1rem;
  display: flex;
  flex-direction: column;
  min-height: 100%;
}
.side a { text-decoration: none; }
.brand {
  font-weight: 700;
  letter-spacing: -0.03em;
  font-size: 1.15rem;
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin: 0 0.25rem 1.15rem;
  min-height: 2.4rem;
}
.brand-mark {
  width: 1.7rem;
  height: 1.7rem;
  border-radius: 6px;
  display: grid;
  place-items: center;
  background: rgb(255 255 255 / 0.12);
  font-size: 0.85rem;
  flex-shrink: 0;
}
.nav { display: grid; gap: 0.2rem; }
.nav a, .side-icon, .nav-toggle {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.5rem 0.65rem;
  border-radius: 6px;
  color: var(--admin-sidebar-muted);
  cursor: pointer;
  min-height: 2.5rem;
  border: 0;
  background: transparent;
  font: inherit;
  text-align: left;
  width: 100%;
  transition: background-color 160ms ease, color 160ms ease;
}
.nav a svg, .side-icon svg, .nav-toggle svg {
  width: 1.25rem;
  height: 1.25rem;
  flex-shrink: 0;
}
.nav a:hover, .nav a[aria-current="page"], .side-icon:hover, .nav-toggle:hover {
  background: rgb(255 255 255 / 0.08);
  color: var(--admin-sidebar-text);
}
.side-foot { margin-top: auto; display: grid; gap: 0.35rem; }
.side .who {
  margin: 0;
  color: var(--admin-sidebar-muted);
  font-size: 0.8rem;
  display: grid;
  gap: 0.15rem;
}
.who-email { padding: 0 0.65rem; overflow: hidden; text-overflow: ellipsis; }
html[data-nav="collapsed"] .shell { grid-template-columns: 4.35rem 1fr; }
html[data-nav="collapsed"] .nav-label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
html[data-nav="collapsed"] .brand { justify-content: center; margin-inline: 0; }
html[data-nav="collapsed"] .nav a,
html[data-nav="collapsed"] .side-icon,
html[data-nav="collapsed"] .nav-toggle { justify-content: center; padding-inline: 0.45rem; }
html[data-nav="collapsed"] .nav-toggle svg { transform: rotate(180deg); }
.main { padding: 1.5rem 1.75rem 3rem; min-width: 0; }
.main--canvas { padding: 0; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.editor { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.editor-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.55rem 0.75rem;
  padding: 0.55rem 0.85rem;
  background: var(--admin-surface);
  border-bottom: 1px solid var(--admin-line);
  z-index: 5;
}
.editor-bar .flash { margin: 0; padding: 0.35rem 0.65rem; font-size: 0.85rem; }
.editor-bar__pages {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-right: auto;
}
.editor-bar__pages label { font-size: 0.78rem; font-weight: 650; }
.editor-bar__pages select { width: auto; min-width: 10rem; }
.editor-bar__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; }
.editor-stage { flex: 1; min-height: 0; position: relative; background: #0b1c22; }
.editor-stage iframe {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
  background: #fff;
}
.inspector {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(26rem, 100%);
  background: var(--admin-surface);
  border-left: 1px solid var(--admin-line);
  box-shadow: -12px 0 32px rgb(15 23 42 / 0.12);
  display: flex;
  flex-direction: column;
  transform: translateX(110%);
  transition: transform 200ms ease;
  z-index: 6;
}
.inspector.is-open { transform: translateX(0); }
.inspector__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid var(--admin-line);
}
.inspector__head h2 { margin: 0; font-size: 1.05rem; }
.inspector__close {
  width: 2.5rem;
  height: 2.5rem;
  border: 0;
  background: transparent;
  color: var(--admin-text);
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  border-radius: 6px;
}
.inspector__close:hover { background: var(--admin-bg); }
.inspector__body { padding: 1rem; overflow: auto; flex: 1; }
.inspector__hint { margin: 0 0 1rem; color: var(--admin-muted); font-size: 0.9rem; }
.top {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: baseline;
  margin-bottom: 1.25rem;
}
h1 { margin: 0; font-size: 1.45rem; letter-spacing: -0.03em; }
.muted { color: var(--admin-muted); }
.kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.75rem; margin: 1rem 0 1.5rem; }
.kpis--dense { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.card {
  background: var(--admin-surface);
  border: 1px solid var(--admin-line);
  border-radius: var(--radius);
  padding: 1rem 1.1rem;
}
.card strong { display: block; font-size: 1.6rem; letter-spacing: -0.04em; }
.card__title { margin: 0 0 0.85rem; font-size: 1rem; letter-spacing: -0.02em; }
.card__sub { margin: 1rem 0 0.5rem; font-size: 0.85rem; color: var(--admin-muted); font-weight: 650; }
.grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; margin: 0 0 1rem; }
.range { display: flex; gap: 0.4rem; }
.btn.ghost.is-on { border-color: var(--admin-primary); color: var(--admin-primary); background: color-mix(in srgb, var(--admin-primary) 8%, #fff); }
.live { margin: 0 0 1rem; }
.live__head { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
.live__dot {
  width: 0.55rem; height: 0.55rem; border-radius: 999px;
  background: var(--admin-ok); box-shadow: 0 0 0 3px color-mix(in srgb, var(--admin-ok) 25%, transparent);
}
.live__paths { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.25rem; font-size: 0.9rem; }
.bars { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.45rem; }
.bars li { display: grid; grid-template-columns: 7rem minmax(0, 1fr) 2.5rem; gap: 0.5rem; align-items: center; font-size: 0.85rem; }
.bars__label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bars__track { background: var(--admin-bg); border-radius: 999px; height: 0.45rem; overflow: hidden; }
.bars__fill { display: block; height: 100%; background: var(--admin-primary); border-radius: 999px; }
.bars__n { text-align: right; color: var(--admin-muted); font-variant-numeric: tabular-nums; }
.spark { color: var(--admin-primary); display: block; }
.hours { display: grid; grid-template-columns: repeat(24, minmax(0, 1fr)); gap: 2px; align-items: end; height: 5rem; }
.hours__col { display: flex; align-items: end; height: 100%; }
.hours__bar { display: block; width: 100%; background: var(--admin-primary); border-radius: 2px 2px 0 0; min-height: 2px; }
.flash {
  background: #ECFDF3;
  color: var(--admin-ok);
  border: 1px solid #BBF7D0;
  padding: 0.7rem 0.85rem;
  border-radius: var(--radius);
  margin-bottom: 1rem;
}
.flash.err { background: #FEF2F2; color: var(--admin-danger); border-color: #FECACA; }
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--admin-primary);
  color: var(--admin-primary-text);
  border: 0;
  border-radius: 6px;
  padding: 0.55rem 0.9rem;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  transition: background-color 160ms ease;
}
.btn:hover { background: #0E7490; }
.btn.ghost {
  background: transparent;
  color: var(--admin-text);
  border: 1px solid var(--admin-line);
}
.btn.ghost:hover { background: var(--admin-bg); }
.field { display: grid; gap: 0.25rem; margin-bottom: 0.85rem; }
.field label { font-size: 0.82rem; font-weight: 650; }
input[type="text"], input[type="email"], input[type="url"], input[type="tel"], input[type="color"], textarea, select {
  font: inherit;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--admin-line);
  border-radius: 6px;
  background: #fff;
  color: var(--admin-text);
  width: 100%;
}
.builder { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(20rem, 0.85fr); gap: 1rem; align-items: start; }
.preview {
  background: #fff;
  border: 1px solid var(--admin-line);
  border-radius: var(--radius);
  min-height: 70vh;
  width: 100%;
}
.panel { max-height: 78vh; overflow: auto; }
.list-block {
  border: 1px dashed var(--admin-line);
  border-radius: 6px;
  padding: 0.75rem;
  margin-bottom: 1rem;
}
.list-row {
  border-top: 1px solid var(--admin-line);
  padding-top: 0.75rem;
  margin-top: 0.75rem;
}
.row-actions { display: flex; gap: 0.5rem; justify-content: flex-end; }
table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
th, td { text-align: left; padding: 0.65rem 0.4rem; border-bottom: 1px solid var(--admin-line); vertical-align: top; }
.login {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 1.5rem;
}
.login .card { width: min(24rem, 100%); }
.login h1 { margin-bottom: 0.35rem; }
@media (max-width: 960px) {
  .shell { grid-template-columns: 1fr; }
  .shell:has(.main--canvas) { height: auto; min-height: 100vh; overflow: auto; }
  .side { display: flex; flex-direction: row; flex-wrap: wrap; gap: 0.5rem; align-items: center; padding: 0.65rem 0.75rem; }
  .brand { margin: 0; }
  .nav { display: flex; flex-wrap: wrap; }
  .side-foot { margin: 0; display: flex; align-items: center; gap: 0.35rem; margin-left: auto; }
  html[data-nav="collapsed"] .shell { grid-template-columns: 1fr; }
  .builder { grid-template-columns: 1fr; }
  .kpis, .kpis--dense, .grid-2 { grid-template-columns: 1fr; }
  .bars li { grid-template-columns: 5rem minmax(0, 1fr) 2.2rem; }
  .preview { min-height: 50vh; }
  .main--canvas { height: auto; min-height: calc(100vh - 4rem); }
  .editor-stage { min-height: 70vh; }
  .inspector { width: 100%; }
}
@media (min-width: 1100px) {
  .kpis--dense { grid-template-columns: repeat(6, minmax(0, 1fr)); }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition: none !important; }
}
`;
