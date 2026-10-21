---
name: Product media direction
description: Approved product-media scope and distinction between uploads, agent image generation and later AI credits.
---

The user approved professional product image/video uploads, a 4:5 framing preview
with a non-cropping fit option, optimised WebP images, WebM conversion where
supported, an original MP4 upload option and database-backed media associations.
Use the existing Cloudflare R2 storage, not Cloudinary.

**Why:** After the Cloudinary credentials request was dismissed, the user explicitly
changed the storage direction: “we can save the images in cloudflare.”

AI credits and recharge billing remain deferred. The user subsequently approved a
controlled Media Library generation trial using the platform's existing OpenAI
API secret. This supersedes the earlier agent-only generation restriction, but
does not authorise a wallet, credit sales or an unlimited free-generation service.

**Why:** On 2026-10-21 the user explicitly requested the third tab, connection to
their own OpenAI account and real generation/timing checks.

**How to apply:** Preserve existing media and private business-document storage.
Keep the Media Library runtime separate from the historical AI store builder.
Connecting the approved image service must not reactivate legacy store-generation
behaviour through a shared credential alias.

Generation briefs are private instructions, not public image descriptions.

**Why:** A prompt can contain unreleased campaign details or editing instructions
that should not appear in storefront alt text.

**How to apply:** Saving an image must not copy its prompt into public captions or
alt text. Use neutral metadata until the merchant supplies publication-ready copy.

Do not automatically repeat a provider call or assume a failed request was free.

**Why:** OpenAI may complete and bill a request even when the client or worker
loses the response.

**How to apply:** Preserve conservative trial-cost reservations after uncertain
failures and recover queue delivery without repeating a claimed generation.

The proposed Media Library AI Image Generation tab must let the merchant attach an existing library creative as a product reference while describing the desired image.

**Why:** The user explicitly requested reference attachments from the media library, not a text-only generation form.

**How to apply:** Support reference-image input in the approved OpenAI trial.
This does not change the deferred credits decision.

Do not add a merchant cropping step to the placement-based AI generation flow. The selected placement determines the output dimensions and aspect ratio before generation; review is for accepting or regenerating the result.

**Why:** The user explicitly removed cropping because the image size is already decided when choosing the placement.

**How to apply:** Use placement, optional library reference, description, generation, review and save as the flow. Produce the required framing and dimensions without asking the merchant to crop; retain existing crop tools for ordinary uploads.

Placement guidance must distinguish recommended creative exports from hard
upload limits, and follow the current page renderer rather than old showcase
mockups.

**Why:** Saved Ann designs and classic Aura themes use different media frames;
some storefront pages share a newer commerce surface despite retaining themed
navigation. A desktop/mobile crop difference does not create a second upload.

**How to apply:** Check the active renderer and effective responsive CSS before
recommending ratios. Label natural/flexible frames honestly, explain reuse of
the same asset, and keep theme comparison read-only.
