# Recompose for available space and reading order

ID: cmp-responsive-recomposition. Pilot lesson. Sources: [S12](https://web.dev/articles/baseline-in-action-container-queries), [S21](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), [S22](https://www.w3.org/WAI/WCAG22/Understanding/meaningful-sequence.html).

Teach preservation of meaning as geometry changes. Plan reading order, subject visibility, grouping, and action access before breakpoints. Local container width may differ from the viewport.

Application A: side annotations become captions directly after an image. Application B: comparisons retain explicit attribute labels when columns no longer fit.

Counterexample: visual reordering conflicts with keyboard sequence, or a sticky panel occupies most of the zoomed viewport.

Mobile: test configured phone width, intermediate widths, reflow conditions, and relevant breakpoints. Simple wrapping may be enough; a stack is not automatically a failure.

Storyboard: extend existing mobileTransformation with important element relations and observations. Review: confirm association, order, readability, and action access in renders and actual browser tasks.

## Authority and use

This is an original design-teaching hypothesis. It is advisory and does not change factual, accessibility, or functional requirements. Adapt it to verified business evidence and inspect the current render before accepting an outcome. The applications above are contrasting examples, not copyable site presets.
