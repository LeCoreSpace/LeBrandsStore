---
name: Long-page screenshots
description: Handling complete saved screenshots when the tool's image preview exceeds its size limit
---

The screenshot tool can report the 8000-pixel image preview limit while
still writing a complete full-page JPEG to the requested save path.
Do not shorten an editorial page merely to fit that preview limit.

**Why:** Full desktop and mobile homepage captures exceeded the tool's
preview limit, but the saved files contained the complete pages and were
valid images.

**How to apply:** Check the saved image's dimensions first. Inspect cropped
top, middle and bottom sections with an image reader, then present the
complete original as a downloadable asset. Do not repeat the capture just
because its inline preview was rejected.

A full-height file can still contain blank offscreen lazy-loaded images.

**Why:** The static capture tool did not scroll to trigger those image loads,
even though the assets themselves returned HTTP 200.

**How to apply:** Inspect the actual media in the saved file. For final
full-page exports, scroll through the page with Playwright, wait for images
to finish loading, return to the top and capture. Preserve normal lazy
loading rather than changing application behavior just for an export.
