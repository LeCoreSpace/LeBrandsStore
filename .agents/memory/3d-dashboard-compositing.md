---
name: 3D dashboard compositing
description: Avoid content occlusion when animating the marketing dashboard in depth
---

Compose dashboard content as a flattened plane. Apply 3D entrance and exit
transforms to the whole dashboard, not individual panels inside its opaque
background.

**Why:** Preserved 3D contexts combined with continuously rotating inner panels
caused invoice amounts and other content to intersect the background and become
hidden. Static markup tests passed despite the visible defect.

**How to apply:** Keep depth in outer surfaces, offset shadows and materials.
Keep decorative notification cards in reserved space rather than over metric
labels. Check readable settled content as well as transitions. Resolve interrupted
transitions explicitly when visibility, motion preferences or viewport activity
change; do not rely solely on animationcancel delivery.
For page-wide scroll reveals, animate a content group or its descendants,
not both. Compounding transforms makes the text harder to read and makes
viewport containment harder to control.
