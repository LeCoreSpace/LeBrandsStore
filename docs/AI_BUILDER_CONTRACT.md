# Phase 3 interface contract

The Worker renders `/stores/:storeId/build` inside the existing dashboard shell.
Frontend is vanilla ES modules, not React. Use `src/public/ai-builder.js`,
`src/public/ai-builder.css`, and `src/ui/ai-builder.js`. Do not edit backend,
schema, migration, existing dashboard shell, or authentication files.

Boot data: `{store_id, available, verified, provider_ready, image_ready,
remaining_builds, monthly_cap_usd:20, job:null|Job, draft:loadDraft}`.
All API calls are same-origin under `/api/stores/:storeId/ai/:action`.
Use existing same-origin CSRF behaviour; JSON mutations carry
`content-type: application/json`, never put credentials in the browser.

- GET `state`: boot state and active/latest job.
- POST `verify`: sends verification email; `{message}`.
- POST `start`: `{brief}`; returns `{job}`.
- POST `generate`: `{job_id,version}`; queues only the current section.
- POST `approve`: `{job_id,version}`; approves current section and advances.
- POST `image`: `{job_id,version,image_id,decision:"approve"|"discard"|"regenerate"}`.
- POST `retry`: `{job_id,version}`; retries a failed current step without consuming allowance.
- POST `cancel`: `{job_id,version}`; cancels incomplete job.
- POST `complete`: `{job_id,version}`; saves approved layouts as drafts, never publishes.
- POST `preview`: `{job_id}`; records the user opening the completed full draft preview.
- GET `image?media_id=UUID`: authenticated private generated-image bytes.

Job: `{id,status,version,cursor,total_steps,step:{page,type,label,product_id?},
candidate:null|{section,images:Image[],copy:[]},
approved:[],error:null|string,completed_at,usage:{tokens,images,cost_usd,cost_estimated:true}}`.
Statuses: `ready`, `queued`, `generating`, `review`, `failed`,
`ready_to_save`, `completed`, `cancelled`.
Image: `{id,media_id,url,source_url,label,status:"pending"|"approved"|"discarded",
regenerations:0,product_id?}`. Private URL is the above API image URL.

Poll state while queued/generating; never automatically approve or advance.
Sections progress in home, collection, product, cart, checkout order. Product
and collection layouts are shared defaults. Product content steps are per
product, not separate product templates. The user must explicitly approve
each section and every proposed image. Preview uses the existing
`/stores/:id/editor` once the completed build is saved. Call `preview` only
when the user opens that full preview, not automatically on completion.

Four-step brief:
1. `brand`: name, tagline, category, subcategory, sells (50–500 chars),
   audience (text), differentiators (array max 3), founder_story,
   year_started, city, vibe (enum Minimal/Luxe/Earthy/Bold/Playful/Traditional/
   Modern Indian/Street), reference_words (max 3), logo_id (uploaded media
   UUID or empty), colours (array up to 3 hex values), language ("English").
2. `products` (1–5): existing `id` optional, name, description (optional plain text, max 5000 chars), price_paise,
   compare_at_paise optional/null, gst_rate (explicit required selection,
   never guessed for new products; saved rates retained for existing products), hsn, stock, photo_ids (1–5 real uploaded image UUIDs),
   material, variants (text), care, features (max 8 strings), how_to_use,
   size_chart (array max 20 `{size,measurement}`), `ai_images` (0–4),
   `image_styles` (array selections background/lifestyle/flatlay/closeup/model).

The form prefills known store settings, the selected owned logo, and up to five
non-archived products from the tenant's draft. It preserves saved builder answers,
including explicitly cleared fields and changed product selections. Public
contact details come from business support settings, not the login email.
Legal/GST registration fields are not added to the AI brief. Unknown commercial
claims and creative facts remain blank for the merchant to supply.
3. `selling`: delivery_time, free_shipping_threshold_paise optional/null,
   cod (boolean), returns_window, returns_conditions, contact_email,
   phone, whatsapp, address, first_order_offer, prepaid_discount_paise
   optional/null. Optional facts left empty must not be invented.
4. Confirm facts, image warning, allowances, and submit.

Reuse `/api/stores/:id/media` POST FormData `{file,type:"product"|"logo",alt}`
for uploads (returns `{media}`), with existing preview-safe upload handling.
The metadata already appears in `boot.draft.media`. Real photos stay first.
The builder does not add new payment options, discounts, shipping prices,
gift extras or change checkout logic; unimplemented selling options must
be labelled informational drafts, not enabled features.

Use white surfaces, existing platform plum accent and logo, normal readable
font/headings, subtle section assembly motion with reduced-motion support.
No sparkle icons, no emoji, no em/en dashes. Show verification/setup gates,
server validation errors, stale-revision refresh, cap-friendly error and
resumable jobs. Four-image/two-regeneration allowance is explicit; section
images are at most six per build. One completed build per store.
