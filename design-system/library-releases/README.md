# Library profiles

`legacy-v0.json` freezes the 114 block IDs present in the 2026-09-22 pre-change working-tree hash manifest. It does **not** reconstruct the old source bytes or old agent prompts. It is a rollout control, not experimental Arm A.

New sites default to `legacy-v0`. A site can opt into the working slice by setting `"designLibraryProfile": "slice-v1"` in its `launch.json`. This enables all 120 current blocks and metadata-backed preview evidence in component selection. The packet records the selected profile and a release identity hash. Roll back future selections by restoring `legacy-v0`; already copied site-owned components and accepted progress are not rewritten.

`slice-v1` is a draft pilot profile. Do not promote it as a general release until publication QA, matched evaluation, held-out review, and installed workflow pilots pass. The exact pre-change baseline is documented in `docs/baselines/design-library-working-tree-2026-09-22.json`; hashes alone cannot restore Arm A bytes.
