# Accessibility

Load this when building or reviewing pages. The normative target is WCAG 2.2 levels A and AA. The entry point is the [W3C quick reference](https://www.w3.org/WAI/WCAG22/quickref/). Widget patterns come from the [ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/) and apply only to widgets the page uses. Prefer native HTML when it already has the behavior.

Required for a service site: document language and landmarks, a meaningful order, names for controls, text alternatives, contrast with its exceptions, keyboard access, visible focus that is not covered by sticky UI, and form labels, errors, and status text.

Automated checks do not certify conformance. [W3C evaluation guidance](https://www.w3.org/WAI/test-evaluate/) requires human judgment. Say "automated checks passed; manual checks pending." A keyboard trap on the contact path blocks production. A subjective style comment does not.

Longer rationale is in knowledge release `2026-09-22`. Inspect it with `vitris knowledge explain --stage representative`.
