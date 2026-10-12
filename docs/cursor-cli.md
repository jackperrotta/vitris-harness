# Cursor Agent CLI (Windows)

The Windows desktop **Cursor** launcher is not the same product as **Cursor Agent**. Desktop opens the IDE; Agent is the headless CLI used for unattended edits and reviews.

## Installer note

The native Windows installer selector labeled `win32` names the Windows platform target. It does **not** mean a 32-bit install.

## Authentication

Run `agent login` once. That authenticates the CLI against your Cursor account. Dispatched Agent work then runs under that signed-in account. The coordinating chat or operator session stays separate; only the Agent invocation is billed and credentialed through the login.

## PATH fallback

If `agent` is missing from PATH after install or update, call the launcher explicitly:

```powershell
& "$env:LOCALAPPDATA\cursor-agent\agent.cmd" --help
```

## Headless documentation edit (PowerShell)

```powershell
agent --print --force --output-format text "Add a one-line note to docs/cursor-cli.md clarifying that win32 is the Windows platform selector, not a 32-bit binary."
```

Use `--print` for non-interactive output, `--force` to apply edits without confirmation, and `--output-format text` for plain stdout suitable for scripts.
