---
name: Product media direction
description: Approved product-media scope and distinction between uploads, agent image generation and later AI credits.
---

The user approved professional product image/video uploads, a 4:5 framing preview
with a non-cropping fit option, optimised WebP images and WebM video with an MP4
fallback, Cloudinary storage and database-backed media associations.

AI credits and recharge billing are deferred. The user requested image generation
by the agent, not the earlier OpenAI setup. Do not silently introduce an OpenAI
generation integration or describe agent-only image tools as a merchant-facing
runtime capability.

**Why:** The user explicitly approved the media phases and said, “we will implement
ai credits later” and “aigeneration by you, not openai as it was causing issues earlier.”

**How to apply:** Preserve existing media and private business-document storage.
Distinguish agent-generated assets delivered through chat from any future in-app
generation service; agree on a runtime provider before implementing the latter.
