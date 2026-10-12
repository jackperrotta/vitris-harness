# Fictional engine compatibility fixtures

These are synthetic local sites. Their names, addresses, and preferences are invented for engineering tests; none are human preference labels. `source-identities.json` records SHA-256 digests of authoritative fixture bytes. Generated `dist/` is deliberately absent.

| Fixture | Source format | Expected behavior |
| --- | --- | --- |
| `completed-current` | 1 | Minimal state/identity parser fixture; its empty node map is not a completed creation graph |
| `../active-agent-site` | graph v3 | Fully populated fictional preview-ready graph used by the upgrade-then-refine regression |
| `older-copied-kit` | legacy copied kit | Preserve unknown modified instructions during upgrade |
| `customized` | 1 | Preserve site-owned component, theme, and instruction override |
| `backend-free` | 1 | Build static pages without a backend endpoint |
| `interrupted` | 1 | Resume or discard only against its recorded source revision |
