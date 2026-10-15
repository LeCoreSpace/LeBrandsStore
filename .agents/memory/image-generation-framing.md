---
name: Image generation framing
description: Requested aspect ratios are not guaranteed by the image-generation tool.
---
Verify actual image dimensions before promising a desktop hero aspect ratio.

**Why:** Five hero requests explicitly asked for wide 16:9 compositions at high
resolution, but every generated image was a 1024-pixel square. Prompt wording
alone did not enforce the requested shape.

**How to apply:** Preserve uncropped originals. Do not silently upscale or crop
away models or products to claim the requested format was delivered. Use a
compatible layout or explicitly review layout-specific crops before integration.
