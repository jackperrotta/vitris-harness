# Managed-kit upgrades

Sites created by current Vitris record hashes for package-owned graph, prompt, refs, and evaluators in `agent/managed-files.json`. A site override belongs in `agent/overrides/`. Existing copied-kit files without recorded provenance are preserved as conflicts.

```sh
vitris upgrade --site . --plan
vitris upgrade --site . --apply
```

The plan records authored source and kit hashes, managed-file updates, unknown customization conflicts, deferred graph migrations, required checks, and evidence invalidation. Apply requires that exact baseline and no active stage. Changed kit files are backed up in `agent-backups/`; an interrupted application writes `agent/kit-upgrade-journal.json` and can be recovered with `vitris upgrade --site . --recover`. Journals and receipts carry the same transaction identity; an older receipt cannot settle a later interrupted upgrade. Previous receipts are kept in `agent/kit-upgrade-receipts/`. `--rollback` restores unchanged kit files from the matching backup and rejects later edits to those files.

This command updates managed instructions from the installed harness. Install the desired exact package version and lockfile separately, then plan the kit update. It does not claim npm installation is atomic, roll back a dependency/lockfile, or migrate a completed site to a new creation graph automatically. New checks remain unevaluated until an explicit audit or applicable work. Publication is separate.
