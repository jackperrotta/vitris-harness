# Composition authoring

The default theme-led workflow adapts the chosen template direction using site-owned components. For the optional composition lesson protocol, set `designAuthoring` in the site-owned `launch.json` to `{ "mode": "composition-v1", "lessonRelease": "2026-09-28.1" }`. Unknown modes and lesson releases fail explicitly. Managed instruction upgrades use `vitris upgrade --site SITE --plan` before `--apply`; they do not rewrite `launch.json`.

Composition lessons are advisory teaching; customer facts come from verified business evidence. Record consequential decisions, inspect the compiled pages, and complete the actual browser and review gates. To return to theme-led authoring, set `{ "mode": "theme-v1" }` or remove the field, then reprepare affected design stages. Preserve authored components and customer content.
