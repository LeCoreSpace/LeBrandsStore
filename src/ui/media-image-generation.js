import { escapeHtml } from "./layout.js";

const esc = escapeHtml;
const safeJson = v => JSON.stringify(v ?? {}).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

export function renderMediaImageGeneration({ storeId, preview = false, placements = [] } = {}) {
  const sid = String(storeId || "");
  const list = Array.isArray(placements) ? placements : [];
  const cfg = { storeId: sid, preview: !!preview };
  const dis = preview ? " disabled" : "";
  return `<section class="mig" data-ai-root data-store-id="${esc(sid)}" data-preview="${preview ? "true" : "false"}">
<script type="application/json" data-ai-config>${safeJson(cfg)}</script>
<div class="mig-head"><h2>AI Image Generation</h2><p>Create a product image sized for the exact place it will be used. No cropping step, and nothing is published automatically.</p></div>
${preview ? '<p class="mig-note is-preview" role="note">Read-only preview. This page shows the full layout, but generation and saving are turned off and no images are created.</p>' : ""}
<p class="mig-note" data-ai-status role="status" aria-live="polite">${preview ? "Generation is disabled in preview." : "Loading availability..."}</p>
<div class="mig-layout">
<form class="mig-form" data-ai-form novalidate>
<fieldset${dis}><legend>1. Placement</legend>
<label><span>Where will this image be used?</span><select name="placement" data-ai-placement required${dis}><option value="">${list.length ? "Choose a placement" : "Loading placements..."}</option>${list.map(p => `<option value="${esc(p.id)}">${esc(p.title)}${p.width && p.height ? ` (${esc(p.width)} x ${esc(p.height)})` : ""}</option>`).join("")}</select></label>
<p class="mig-hint" data-ai-placement-info></p><p class="mig-hint">The size shown is the exact output size set by the server. It can be smaller than the recommended export in the size guide.</p></fieldset>
<fieldset${dis}><legend>2. Product reference (optional)</legend>
<p class="mig-hint">The chosen image is sent to OpenAI to guide the result. Only PNG, JPEG or WebP files up to 4 MB and 4 megapixels can be used. Always review product details such as labels, colours and text before you save.</p>
<div class="mig-ref-selected" data-ai-ref-selected><span>No reference selected</span><button type="button" class="lb-button lb-button-small lb-button-outline" data-ai-ref-clear hidden>Remove</button></div>
<button type="button" class="lb-button lb-button-small lb-button-outline" data-ai-ref-toggle aria-expanded="false" aria-controls="mig-ref-panel"${dis}>Choose from your media</button>
<div class="mig-ref-panel" id="mig-ref-panel" data-ai-ref-panel hidden>
<div class="mig-ref-search" role="search"><label><span>Search images</span><input type="search" data-ai-ref-q maxlength="100" placeholder="File name"></label><button type="button" class="lb-button lb-button-small" data-ai-ref-search>Search</button></div>
<p class="mig-hint" data-ai-ref-msg role="status" aria-live="polite"></p>
<ul class="mig-ref-grid" data-ai-ref-grid></ul>
<div class="mig-pager"><button type="button" class="lb-button lb-button-small lb-button-outline" data-ai-ref-prev disabled>Previous</button><span data-ai-ref-page></span><button type="button" class="lb-button lb-button-small lb-button-outline" data-ai-ref-next disabled>Next</button></div>
</div></fieldset>
<fieldset${dis}><legend>3. Prompt</legend>
<label><span>Describe the image</span><textarea name="prompt" data-ai-prompt rows="5" maxlength="1500" required placeholder="Describe the product, setting, light and mood."${dis}></textarea></label>
<p class="mig-hint"><span data-ai-count>0</span> / 1500</p></fieldset>
<p class="mig-error" data-ai-error role="alert" hidden></p>
<div class="mig-actions"><button type="submit" class="lb-button" data-ai-generate disabled>Generate image</button></div>
<p class="mig-hint" data-ai-trial>Controlled trial: no charge to your store. Limits: 3 requests per store per day (UTC), and unsaved previews (up to 5) count toward your storage. Only store owners can generate.</p>
</form>
<div class="mig-side">
<section class="mig-result" aria-labelledby="mig-result-h"><h3 id="mig-result-h">4. Review</h3>
<div class="mig-stage" data-ai-stage><p class="mig-empty">Your generated image will appear here.</p></div>
<p class="mig-elapsed" data-ai-elapsed role="status"></p>
<div class="mig-actions" data-ai-result-actions hidden><button type="button" class="lb-button" data-ai-save>Save to library</button><button type="button" class="lb-button lb-button-outline" data-ai-check>Check status</button><button type="button" class="lb-button lb-button-outline" data-ai-retry>Edit prompt and retry</button></div>
<p class="mig-hint" data-ai-save-msg role="status" aria-live="polite"></p></section>
<section class="mig-recent"><h3>Recent generations</h3><ul class="mig-jobs" data-ai-jobs><li class="mig-hint">None yet.</li></ul></section>
</div></div></section>`;
}
