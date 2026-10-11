---
name: Mobile animation viewport
description: Hidden off-screen transforms can still widen Chromium's mobile layout viewport
---

Keep off-screen landing animation transforms contained, and verify the mobile
layout viewport against the requested device width, not just its own scroll width.

**Why:** In Chromium mobile emulation, `overflow-x: clip` did not prevent unrevealed
translated elements from inflating a requested 390px viewport. Comparing
`scrollWidth <= innerWidth` falsely passed because both had expanded. Root
horizontal hidden overflow prevented the expansion.

**How to apply:** When adding lateral or flying arrivals, compare `innerWidth`
with the configured device width as well as checking horizontal scroll overflow.
Check during animation and after settling. Preserve intentional overlap inside
the showcase without allowing page-level horizontal movement.
