# Later-life refinement

Use this skill only when `agent/change-request.json` is present. Do not restart harvest. Load site memory and the classified slice, not the full onboarding kit.

Keep `originalRequest` verbatim. Expand `proposedChanges` into concrete, file-level edits before changing source. Write `implementationReason`, and record likes, dislikes, and preserve items at website, page, section, or element grain (`path`, `sectionId`, `hook` when known).

Honor current memory decisions. Treat `superseded` items as historical experiments. Do not invent business facts or drop original media IDs. If layout and navigation hashes are unchanged after a copy edit, do not rewrite pages for their own sake; content review still applies.

After the edit, the runner writes `agent/refine-report.json` and updates `agent/site-memory.json`. Do not mark STATE passed by hand.
