# Add components

Invent trade-specific folders under `components/<name>/`:

- `template.html` — semantic HTML, named slots, root `.c-<name>`
- `styles.css` — scoped `.c-<name>`, colors only via `var(--color-*)`
- optional `island.js` — tiny, no Shadow DOM

## Use blocks where they fit

Check `launch.json` for `designLibraryProfile`. The default `legacy-v0` catalog contains the 114 pre-slice block IDs and uses legacy README metadata. `slice-v1` explicitly opts this site into the six draft additions and twelve metadata-backed previews. This profile is recorded with component-selection receipts. The legacy profile is a rollout control, not a byte-for-byte historical harness baseline. Existing site-owned components remain unchanged when the profile changes.

INDEX is a vocabulary, not a required set. Hunt by job and available media (`sections.md`, `compose.md`); the Registers column is a tone hint.

1. Open `node_modules/@vitris/kernel/blocks/INDEX.md` (or kernel `blocks/INDEX.md`).
2. Pick a **Look** that matches the chapter. Copy that folder — do not concatenate a register “starter stack.”
3. Copy into this site as `components/<your-name>/`. Start from the README **Example** (it fills every slot and is what the block preview renders); the **Slots** table tells you which slots are optional. Templates expose bare slots — typography classes (`eyebrow`, `lede`, `btn`, `card`) go on the slotted content.
4. Kernel primitives such as `.section`, `.grid`, `.split`, `.card`, `.tabs` and `.accordion` are available when they fit the planned composition. Write site-owned CSS when they do not. Surface, border, shadow and radius choices follow the selected direction. A dark panel can use `data-scheme="dark"` to resolve semantic color tokens.
5. Authoring tags may pass `variant="overlay dark"` — the compiler adds `c-<name>--overlay c-<name>--dark` on the root.

Before an important composition choice, compare 3–5 viable alternatives when the library has them. Filter only genuine impossibilities, such as essential media that is absent or required behavior the block cannot supply. Treat registers as hints. Inspect the actual mobile and desktop images for metadata-backed blocks under `design-system/block-previews/v1/` when their manifest source hash and image hashes are current; otherwise open the live structural example and mark visual evidence unavailable. Jev recommendations are metadata-only and do not prove that images were inspected. A site-owned custom component is always an option.

Record each important choice in `agent/decisions/component-selection.json`: section and visitor job, eligible IDs, hard-filter reasons, shortlist IDs, preview hashes actually inspected, selected block ID or `custom`, source revision, adaptation notes, and why the chosen composition fits the adjacent sections. Only list an image as inspected after opening it. Keep this trace separate from customer facts.

Build shared chrome and components required by the storyboard. Section counts and geometry follow the business narrative; avoid repetitive equal emphasis.

No `schema.json`. No shared runtime catalog — uniqueness lives in this repo after you copy/adapt.
