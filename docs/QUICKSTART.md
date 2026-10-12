# Active-agent quickstart

Vitris gives your coding agent the business context, design judgment, and verification process to build distinctive websites on a consistent technical foundation.

## Normal interaction

1. Provide an existing site URL, or start blank. Add optional goals, preferences, and references.
2. In the site repo, run `npm.cmd run go -- --prepare` (Windows) or `npm run go -- --prepare`.
3. Read `agent/CURRENT.md`, inspect the evidence it names, and edit only the allowed paths.
4. Complete with `npm.cmd run go -- --complete --preparation <id>`.
5. Repeat until the local `dist/` preview is verified.
6. Ask for a scoped change, for example a headline or a replacement image. Launch to Cloudflare only when you explicitly want that.

Optional advisory checks, still leaving the final judgment with the agent:

```text
npm.cmd run go -- --design-assist --prepare
```

`--jev-mode off` remains off. No API key is required for the standard path.

## Hosts

| Host | Entry file | Status |
| --- | --- | --- |
| Cursor | `AGENTS.md` in the site repo | Instruction loading observed in this workspace. A full site generation was not run as part of this change. |
| Claude Code | `CLAUDE.md` points at `AGENTS.md` | Setup file shipped. End-to-end run not executed here. |
| Codex | `AGENTS.md` | Setup file shipped. End-to-end run not executed here. |
| Antigravity | `GEMINI.md` or `AGENTS.md` ([rules docs](https://antigravity.google/docs/rules-workflows/)) | Setup file shipped from the published docs. End-to-end run not executed here. |

Do not add an always-on `.cursor/skills` tree. Stage knowledge stays in `agent/refs/` and is loaded for the active node. Token usage the host does not report stays unknown.
