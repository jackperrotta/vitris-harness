---
name: vitris-site-manager
description: Maintain this Vitris website, review health and analytics, check harness updates and anomalies, and keep edits consistent with its accepted design and architecture.
---

From the website repository, run `vitris manage prepare --site .` to refresh the site context. Read `SITE-MANAGER.md`, `agent/site-manager/CONTEXT.md`, and `agent/refs/site-manager.md`. Follow the site's `AGENTS.md` for editing and publication. Review `agent/site-manager/review-task.md` when configuring or executing a recurring review.

Use the current site sources and accepted memory to resolve details; generated context is an index, not proof of live health. Report findings and prepare justified fixes locally for review. Publishing requires the user's publication instruction.

Include website/admin harness release checks, compatibility and anomaly review in recurring reviews. Follow `agent/refs/site-manager.md` to compare the actual installed and deployed systems, then assess every proposed change against the site's accepted design, shared components and integration contracts. Preserve intentional differences and documented exceptions.

For requested recurring care, follow `agent/refs/site-care.md`: configure one daily coordinator, prefer an actually available native cloud scheduler with durable remote state, otherwise use an explicit local fallback. Inspect/reuse existing tasks, run a manual review and verify the task before recording setup. Use the current agent's native scheduling tools; repository files alone do not activate a task. During scheduled runs, begin/renew/complete the coordinator and run weekly/monthly scopes only when assigned. Never create more schedules from a scheduled review.
