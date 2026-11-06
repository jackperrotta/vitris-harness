# Site manager

This is the site's operational handbook. Keep business goals, important journeys, service owners, known issues and maintenance decisions here as they become known. Use file paths and service/dashboard references, never credentials or customer records.

Run `vitris manage prepare --site .` before management work. It refreshes [site context](agent/site-manager/CONTEXT.md) and the [recurring review brief](agent/site-manager/review-task.md) from current source without replacing this handbook or accepted site memory. The [site manager instructions](agent/refs/site-manager.md) explain editing, live checks and review setup. `site-manager.json` records portable review preferences. The external scheduler's confirmed provider/task ID stays in ignored `agent/site-manager/schedule.json` when connected.

## Goals and important journeys

Record the business outcome, main visitor journeys and useful success measures here. Confirm goals with the owner rather than assuming traffic growth is the only objective.

## Services and ownership

Record who maintains hosting/domain, forms, booking/admin and analytics, with references to the existing configuration and dashboards. Mark unknown or disconnected services explicitly.

## Maintenance decisions

For recurring care, use [the daily coordinator](agent/refs/site-care.md). One daily task adds weekly/monthly checks when due. Record the chosen scheduler, timezone/time and cloud/local execution reason here after verified setup. Cloud execution needs durable remote state and configured repository/source access; local fallback requires the computer and agent to remain on. Record where cloud reports and proposed patches are retained for review. Provider/task IDs and credentials belong only in ignored operator records and secret stores.

### System baseline and update history

Record the website harness and, when present, the separate admin harness/contracts versions with the package/lockfile, managed-kit and deployment evidence that establish them. Keep local and deployed versions distinct, date release checks and compatibility decisions, and mark unknown versions explicitly. Record accepted design-system/theme references, shared component and route conventions, integration contracts and intentional exceptions so future changes can be checked against how the whole site is built. Retain previous verified baselines and their rollback references when an update passes verification.

Record accepted maintenance decisions and unresolved issues with dates and evidence. Keep design and content preferences in `agent/site-memory.json` through the existing refinement workflow.
