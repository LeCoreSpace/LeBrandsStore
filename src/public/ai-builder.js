import { prepareAuraPhoto } from "./aura-upload.js";

const root = document.querySelector("[data-ai-builder]");
const boot = JSON.parse(document.getElementById("ai-builder-boot")?.textContent || "{}");
const sid = encodeURIComponent(boot.store_id || root?.dataset.storeId || "");
const API = `/api/stores/${sid}/ai`;
let readOnly = boot.read_only === true || boot.fixture === true;
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const VIBES = ["Minimal", "Luxe", "Earthy", "Bold", "Playful", "Traditional", "Modern Indian", "Street"];
const STYLES = ["background", "lifestyle", "flatlay", "closeup", "model"];
const GST = [0, 5, 18, 40];
const STEPS = ["Brand", "Products", "Selling", "Confirm"];
const LS = `aib-brief-${boot.store_id}`;

const S = { info: { ...boot }, job: boot.job || null, step: 0, brief: null, errors: {}, msg: null, busy: false, media: (boot.draft && boot.draft.media) || [] };
let timer = null;

const fromExisting = (p) => ({ ...blankProduct(), id: p.id, locked: true, name: p.title || p.name || "", price: p.price_paise != null ? String(Number(p.price_paise) / 100) : "", gst_rate: p.gst_rate ?? "", hsn: p.hsn_code || p.hsn || "", stock: p.stock ?? "", photo_ids: realIds((p.images || []).map((i) => i.id || i.media_id)) });
const blankProduct = () => ({ name: "", price: "", compare: "", gst_rate: "", hsn: "", stock: "", photo_ids: [], material: "", variants: "", care: "", features: "", how_to_use: "", sizes: "", ai_images: 0, image_styles: [] });
function loadBrief() {
  try { const v = JSON.parse(localStorage.getItem(LS) || "null"); if (v && v.brand) return v; } catch {}
  return { brand: { name: "", tagline: "", category: "", subcategory: "", sells: "", audience: "", differentiators: "", founder_story: "", year_started: "", city: "", vibe: "", reference_words: "", logo_id: "", colours: "", language: "English" },
    products: [blankProduct()],
    selling: { delivery_time: "", free_shipping_threshold: "", cod: false, returns_window: "", returns_conditions: "", contact_email: "", phone: "", whatsapp: "", address: "", first_order_offer: "", prepaid_discount: "" }, confirmed: false };
}
S.brief = loadBrief();
const save = () => { try { localStorage.setItem(LS, JSON.stringify(S.brief)); } catch {} };

async function api(action, opts = {}) {
  const init = { credentials: "same-origin", headers: {}, ...opts };
  if (opts.json !== undefined) { init.method = "POST"; init.headers["content-type"] = "application/json"; init.body = JSON.stringify(opts.json); delete init.json; }
  const res = await fetch(`${API}/${action}`, init);
  let data = {}; try { data = await res.json(); } catch {}
  if (!res.ok) { const e = new Error(data.error || data.message || `Request failed (${res.status})`); e.status = res.status; e.fields = data.fields || data.errors || null; throw e; }
  return data;
}
async function act(action, extra = {}) {
  if (readOnly) { S.msg = { t: "err", m: "This is a read-only preview. Actions are turned off." }; return draw(); }
  S.busy = true; S.msg = null; draw();
  try {
    const d = await api(action, { json: { job_id: S.job?.id, version: S.job?.version, ...extra } });
    if (d.job) S.job = d.job;
    if (d.message) S.msg = { t: "ok", m: d.message };
    return d;
  } catch (e) {
    if (e.status === 409) { S.msg = { t: "err", m: "This build changed in another tab or step. We refreshed it, please check and try again." }; await refresh(true); }
    else S.msg = { t: "err", m: e.message };
  } finally { S.busy = false; poll(); draw(); }
}
async function refresh(quiet) {
  try { const d = await api("state"); S.info = { ...S.info, ...d }; if ("job" in d) S.job = d.job; if (d.fixture === true) readOnly = true; } catch (e) { if (!quiet) S.msg = { t: "err", m: e.message }; }
}
function poll() {
  clearTimeout(timer);
  if (readOnly || !S.job || !["queued", "generating"].includes(S.job.status)) return;
  timer = setTimeout(async () => { await refresh(true); draw(); poll(); }, 2500);
}

const lines = (v) => String(v || "").split("\n").map((x) => x.trim()).filter(Boolean);
const csv = (v) => String(v || "").split(",").map((x) => x.trim()).filter(Boolean);
const lockedNote = "Price, GST and stock of existing products are set in Products. Edit them there first.";
const paise = (v) => v === "" || v == null ? null : Math.round(Number(v) * 100);
function toBrief() {
  const b = S.brief.brand, s = S.brief.selling;
  return {
    brand: { name: b.name.trim(), tagline: b.tagline.trim(), category: b.category.trim(), subcategory: b.subcategory.trim(), sells: b.sells.trim(), audience: b.audience.trim(), differentiators: lines(b.differentiators).slice(0, 3), founder_story: b.founder_story.trim(), year_started: b.year_started ? Number(b.year_started) : null, city: b.city.trim(), vibe: b.vibe, reference_words: csv(b.reference_words).slice(0, 3), logo_id: b.logo_id || "", colours: csv(b.colours).slice(0, 3), language: "English" },
    products: S.brief.products.map((p) => ({ ...(p.id ? { id: p.id } : {}), name: p.name.trim(), price_paise: paise(p.price), compare_at_paise: paise(p.compare), gst_rate: p.gst_rate === "" ? null : Number(p.gst_rate), hsn: p.hsn.trim(), stock: p.stock === "" ? null : Number(p.stock), photo_ids: p.photo_ids, material: p.material.trim(), variants: p.variants.trim(), care: p.care.trim(), features: lines(p.features).slice(0, 8), how_to_use: p.how_to_use.trim(),
      size_chart: lines(p.sizes).slice(0, 20).map((l) => { const [size, ...r] = l.split(":"); return { size: size.trim(), measurement: r.join(":").trim() }; }), ai_images: Number(p.ai_images) || 0, image_styles: p.image_styles })),
    selling: { delivery_time: s.delivery_time.trim(), free_shipping_threshold_paise: paise(s.free_shipping_threshold), cod: !!s.cod, returns_window: s.returns_window.trim(), returns_conditions: s.returns_conditions.trim(), contact_email: s.contact_email.trim(), phone: s.phone.trim(), whatsapp: s.whatsapp.trim(), address: s.address.trim(), first_order_offer: s.first_order_offer.trim(), prepaid_discount_paise: paise(s.prepaid_discount) },
  };
}
function validate(step) {
  const e = {}, br = S.brief.brand, b = toBrief();
  if (step === 0) {
    ["name", "category", "audience"].forEach((k) => { if (!br[k].trim()) e[`b.${k}`] = "Required."; });
    if (br.sells.trim().length < 50 || br.sells.trim().length > 500) e["b.sells"] = "Use 50 to 500 characters.";
    if (!VIBES.includes(br.vibe)) e["b.vibe"] = "Choose a style.";
    if (csv(br.colours).some((c) => !/^#[0-9a-f]{6}$/i.test(c))) e["b.colours"] = "Use hex values like #6b2a5e.";
  }
  if (step === 1) S.brief.products.forEach((p, i) => {
    const q = b.products[i];
    if (!q.name) e[`p.${i}.name`] = "Required.";
    if (!(q.price_paise > 0)) e[`p.${i}.price`] = "Enter a price.";
    if (q.compare_at_paise != null && q.compare_at_paise <= q.price_paise) e[`p.${i}.compare`] = "Must be above the price.";
    if (q.gst_rate == null) e[`p.${i}.gst_rate`] = "Choose a GST rate.";
    if (!q.hsn) e[`p.${i}.hsn`] = "Required.";
    if ((!p.id && q.stock == null) || (q.stock != null && q.stock < 0)) e[`p.${i}.stock`] = "Enter stock.";
    if (q.photo_ids.length < 1) e[`p.${i}.photos`] = "Choose 1 to 5 real photos.";
    if (q.ai_images > 0 && !q.image_styles.length) e[`p.${i}.styles`] = "Choose at least one style.";
  });
  if (step === 2 && b.selling.contact_email && !/^\S+@\S+\.\S+$/.test(b.selling.contact_email)) e["s.contact_email"] = "Enter a valid email.";
  return e;
}

const err = (k) => S.errors[k] ? `<span class="aib-err" role="alert">${esc(S.errors[k])}</span>` : "";
const fld = (path, label, val, o = {}) => `<label class="${o.wide ? "wide" : ""}">${esc(label)}${o.hint ? `<span class="aib-hint">${esc(o.hint)}</span>` : ""}${o.area ? `<textarea data-f="${path}" class="${S.errors[o.ek || path] ? "bad" : ""}">${esc(val)}</textarea>` : `<input type="${o.type || "text"}" data-f="${path}" value="${esc(val)}" ${o.step ? `step="${o.step}"` : ""} class="${S.errors[o.ek || path] ? "bad" : ""}">`}${err(o.ek || path)}</label>`;
const media = (type) => S.media.filter((m) => m && m.id && !m.ai_generated && !m.source_media_id && !["pending", "discarded"].includes(m.approval_status) && (type === "logo" ? m.type === "logo" : m.type === "image"));
const realIds = (ids) => (ids || []).filter((id) => media("product").some((m) => m.id === id)).slice(0, 5);
const existing = () => (boot.draft?.products || []).filter((p) => p && p.id && p.status !== "archived" && !p.archived_at);
const photoPick = (sel, name, multi, ek) => `<div class="aib-photos">${media(multi ? "product" : "logo").map((m) => `<label><input type="${multi ? "checkbox" : "radio"}" name="${name}" data-photo="${esc(m.id)}" ${sel.includes(m.id) ? "checked" : ""}><img src="${esc(m.url)}" alt="${esc(m.alt || "")}"></label>`).join("") || `<small>No uploads yet.</small>`}</div><div class="aib-row"><label class="aib-btn ghost" style="cursor:pointer">Upload photo<input type="file" accept="image/png,image/jpeg,image/webp,image/avif" data-upload="${multi ? "product" : "logo"}" data-name="${name}" hidden></label></div>${err(ek)}`;

function gates() {
  const i = S.info, g = [];
  if (!i.available) g.push("The guided builder is not available for this store yet.");
  if (i.available && !i.verified) g.push(`<strong>Verify your email first.</strong> We will send a link to your account address. <div class="aib-row"><button class="aib-btn" data-act="verify" ${S.busy ? "disabled" : ""}>Send verification email</button></div>`);
  if (i.available && (!i.provider_ready || !i.image_ready)) g.push("Setup is not finished: the text and image providers must be configured by the LeBrands team before building.");
  if (i.available && Number(i.remaining_builds) <= 0 && !S.job) g.push(`This store has used its one build, or the shared USD ${esc(i.monthly_cap_usd || 20)} monthly limit has been reached. Please try again next month or contact support.`);
  return g.map((m) => `<div class="aib-notice" role="status">${m}</div>`).join("");
}
const blocked = () => !S.info.available || !S.info.verified || !S.info.provider_ready || !S.info.image_ready || Number(S.info.remaining_builds) <= 0;

function formView() {
  const b = S.brief.brand, s = S.brief.selling, st = S.step;
  let h = "";
  if (st === 0) h = `<div class="aib-grid">${fld("b.name", "Brand name", b.name)}${fld("b.tagline", "Tagline", b.tagline)}${fld("b.category", "Category", b.category)}${fld("b.subcategory", "Subcategory", b.subcategory)}
    ${fld("b.sells", "What you sell", b.sells, { area: 1, wide: 1, hint: `50 to 500 characters (${b.sells.trim().length})` })}${fld("b.audience", "Who it is for", b.audience, { wide: 1 })}
    ${fld("b.differentiators", "What makes you different", b.differentiators, { area: 1, wide: 1, hint: "Up to 3, one per line" })}${fld("b.founder_story", "Founder story (optional)", b.founder_story, { area: 1, wide: 1 })}
    ${fld("b.year_started", "Year started", b.year_started, { type: "number" })}${fld("b.city", "City", b.city)}
    <label>Style<select data-f="b.vibe" class="${S.errors["b.vibe"] ? "bad" : ""}"><option value="">Choose</option>${VIBES.map((v) => `<option ${b.vibe === v ? "selected" : ""}>${v}</option>`).join("")}</select>${err("b.vibe")}</label>
    ${fld("b.reference_words", "Reference words", b.reference_words, { hint: "Up to 3, separated by commas" })}${fld("b.colours", "Brand colours (optional)", b.colours, { hint: "Up to 3 hex values, separated by commas", ek: "b.colours" })}
    <div class="wide"><strong>Logo (optional)</strong>${photoPick([b.logo_id], "logo", false, "b.logo")}</div></div>`;
  if (st === 1) h = S.brief.products.map((p, i) => `<fieldset class="aib-prod"><div class="aib-ph">Product ${i + 1}${S.brief.products.length > 1 ? ` <button class="aib-btn danger" type="button" data-rm="${i}" style="float:right;padding:3px 10px">Remove</button>` : ""}</div><div class="aib-grid">
    ${p.locked ? `<p class="aib-hint wide">${lockedNote} <a href="/stores/${sid}/products/${encodeURIComponent(p.id)}">Edit in Products</a></p>` : ""}${fld(`p.${i}.name`, "Name", p.name)}${fld(`p.${i}.price`, "Price (INR)", p.price, { type: "number", step: "0.01" })}${fld(`p.${i}.compare`, "Compare at price (optional)", p.compare, { type: "number", step: "0.01" })}
    <label>GST rate<select data-f="p.${i}.gst_rate" class="${S.errors[`p.${i}.gst_rate`] ? "bad" : ""}"><option value="">Select a rate</option>${[...GST,...(p.locked&&[12,28].includes(Number(p.gst_rate))?[Number(p.gst_rate)]:[])].map((r) => `<option value="${r}" ${String(p.gst_rate) === String(r) ? "selected" : ""}>${r}%</option>`).join("")}</select>${err(`p.${i}.gst_rate`)}</label>
    ${fld(`p.${i}.hsn`, "HSN code", p.hsn)}${fld(`p.${i}.stock`, "Stock", p.stock, { type: "number" })}
    <div class="wide"><strong>Real photos (1 to 5, kept first)</strong>${photoPick(p.photo_ids, `ph${i}`, true, `p.${i}.photos`)}</div>
    ${fld(`p.${i}.material`, "Material (optional)", p.material)}${fld(`p.${i}.variants`, "Variants (optional)", p.variants)}${fld(`p.${i}.care`, "Care (optional)", p.care, { wide: 1 })}
    ${fld(`p.${i}.features`, "Features (optional)", p.features, { area: 1, wide: 1, hint: "Up to 8, one per line" })}${fld(`p.${i}.how_to_use`, "How to use (optional)", p.how_to_use, { area: 1, wide: 1 })}
    ${fld(`p.${i}.sizes`, "Size chart (optional)", p.sizes, { area: 1, wide: 1, hint: "One per line as Size: measurement. Up to 20." })}
    <label>Extra AI photos for this product<select data-f="p.${i}.ai_images">${[0, 1, 2, 3, 4].map((n) => `<option ${Number(p.ai_images) === n ? "selected" : ""}>${n}</option>`).join("")}</select></label>
    <div><strong style="font-size:14px">Photo styles</strong><div class="aib-chips">${STYLES.map((x) => `<label><input type="checkbox" data-style="${i}" value="${x}" ${p.image_styles.includes(x) ? "checked" : ""}>${x}</label>`).join("")}</div>${err(`p.${i}.styles`)}</div></div></fieldset>`).join("") +
    (S.brief.products.length < 5 ? `<div class="aib-row"><button class="aib-btn ghost" type="button" data-add>Add a new product</button>${existing().filter((e) => !S.brief.products.some((p) => p.id === e.id)).length ? `<select data-existing aria-label="Use an existing product"><option value="">Use an existing product</option>${existing().filter((e) => !S.brief.products.some((p) => p.id === e.id)).map((e) => `<option value="${esc(e.id)}">${esc(e.title || "Untitled")}</option>`).join("")}</select>` : ""}</div>` : "") + `<p class="aib-hint">1 to 5 products. Your own photos always stay first.</p>`;
  if (st === 2) h = `<p class="aib-hint">Leave optional facts empty and we will not invent them. Free shipping, prepaid discount and first order offer are informational drafts only and do not change checkout.</p><div class="aib-grid">
    ${fld("s.delivery_time", "Delivery time", s.delivery_time)}${fld("s.free_shipping_threshold", "Free shipping above (INR, informational)", s.free_shipping_threshold, { type: "number", step: "0.01" })}
    <label><span style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-f="s.cod" ${s.cod ? "checked" : ""} style="width:auto">Cash on delivery (informational draft)</span></label><span></span>
    ${fld("s.returns_window", "Returns window", s.returns_window)}${fld("s.returns_conditions", "Returns conditions", s.returns_conditions)}
    ${fld("s.contact_email", "Contact email", s.contact_email, { type: "email" })}${fld("s.phone", "Phone", s.phone, { type: "tel" })}${fld("s.whatsapp", "WhatsApp", s.whatsapp, { type: "tel" })}${fld("s.address", "Address", s.address)}
    ${fld("s.first_order_offer", "First order offer (informational)", s.first_order_offer)}${fld("s.prepaid_discount", "Prepaid discount (INR, informational)", s.prepaid_discount, { type: "number", step: "0.01" })}</div>`;
  if (st === 3) { const br = toBrief(), n = br.products.reduce((a, p) => a + p.ai_images, 0); h = `<div class="aib-notice"><strong>Image warning.</strong> AI images are generated pictures, not photos of your goods. Every one is shown next to your real photo and only appears after you approve it. Private until approved.</div>
    <h3>Your facts</h3><p><strong>${esc(br.brand.name)}</strong>, ${esc(br.brand.category)}, ${esc(br.brand.vibe)}. ${br.products.length} product${br.products.length > 1 ? "s" : ""}: ${br.products.map((p) => esc(p.name)).join(", ")}.</p>
    <h3>Allowances</h3><ul><li>Up to 6 extra section images for the whole build</li><li>${n} product image${n === 1 ? "" : "s"} requested (at most 4 per product)</li><li>Each product image can be regenerated twice</li><li>One completed build per store, ${esc(S.info.remaining_builds)} remaining. Shared monthly limit: USD ${esc(S.info.monthly_cap_usd || 20)}.</li></ul>
    <p class="aib-hint">Pages are built in order: home, collection, product, cart, checkout. Product and collection layouts use one shared template. Nothing is published.</p>
    <label style="font-weight:400"><input type="checkbox" data-f="confirmed" ${S.brief.confirmed ? "checked" : ""} style="display:inline;width:auto"> These facts are accurate and I understand the image warning.</label>`; }
  return `<section class="aib-card"><ol class="aib-steps">${STEPS.map((x, i) => `<li class="${i === st ? "on" : i < st ? "done" : ""}" ${i === st ? 'aria-current="step"' : ""}>${i + 1}. ${x}</li>`).join("")}</ol>${h}
    <div class="aib-row end"><button class="aib-btn ghost" data-back ${st === 0 ? "disabled" : ""}>Back</button>${st < 3 ? `<button class="aib-btn" data-next>Continue</button>` : `<button class="aib-btn" data-start ${!S.brief.confirmed || S.busy || blocked() || readOnly ? "disabled" : ""}>Start building</button>`}</div></section>`;
}

function copyView(c) {
  const items = Array.isArray(c) ? c : [];
  if (!items.length) return "";
  return `<dl class="aib-copy">${items.map((x) => typeof x === "string" ? `<dd>${esc(x)}</dd>` : `<dt>${esc(x.label || x.key || x.field || "")}</dt><dd>${esc(typeof (x.value ?? x.text) === "string" ? (x.value ?? x.text) : JSON.stringify(x.value ?? x.text ?? ""))}</dd>`).join("")}</dl>`;
}
function jobView() {
  const j = S.job, st = j.status, cand = j.candidate, imgs = cand?.images || [], step = j.step || {};
  const pend = imgs.some((x) => x.status === "pending"), working = ["queued", "generating"].includes(st);
  const dis = S.busy || readOnly ? "disabled" : "";
  let bar = `<div class="aib-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${j.total_steps}" aria-valuenow="${j.cursor}">${Array.from({ length: j.total_steps }, (_, i) => `<i class="${i < j.cursor || st === "completed" ? "d" : i === j.cursor && working ? "c" : ""}"></i>`).join("")}</div>`;
  let h = `<section class="aib-card"><h2>${esc(step.label || "Build")}</h2><small>Step ${Math.min(j.cursor + 1, j.total_steps)} of ${j.total_steps}${step.page ? `, ${esc(step.page)} page` : ""}${step.type === "product" ? " (shared product layout, this product's content)" : ""}</small>${bar}`;
  if (st === "ready") h += `<p>Ready to prepare this section. Nothing is saved until you approve it.</p><button class="aib-btn" data-act="generate" ${dis}>Generate this section</button>`;
  if (working) h += `<p role="status">${st === "queued" ? "Queued" : "Generating"}. You can leave this page and come back, your build resumes here.</p>`;
  if (st === "review" && cand) {
    h += copyView(cand.copy) + (imgs.length ? `<h3 style="margin-top:14px">Proposed images</h3><p class="aib-hint">Each image needs your decision before you can approve the section.</p>` : "");
    h += `<div class="aib-side">${imgs.map((im) => { const left = Math.max(0, 2 - (im.regenerations || 0)), canRegen = !!im.product_id; return `<div class="aib-img"><img src="${esc(im.url)}" alt="${esc(im.label || "Proposed image")}" loading="lazy"><div class="st">${esc(im.label || "AI image")}: ${esc(im.status)}</div></div>${im.source_url ? `<div class="aib-img"><img src="${esc(im.source_url)}" alt="Your real photo for comparison" loading="lazy"><div class="st">Your real photo</div></div>` : `<div class="aib-img"><small>No real photo to compare for this section image.</small></div>`}
      <div class="aib-row wide" style="grid-column:1/-1;margin:0 0 8px"><button class="aib-btn" data-img="${esc(im.id)}" data-dec="approve" ${dis} ${im.status === "approved" ? "disabled" : ""}>Approve image</button>${canRegen ? `<button class="aib-btn ghost" data-img="${esc(im.id)}" data-dec="regenerate" ${dis} ${left < 1 || im.status === "approved" ? "disabled" : ""}>Regenerate (${left} left)</button>` : ""}<button class="aib-btn danger" data-img="${esc(im.id)}" data-dec="discard" ${dis} ${im.status === "discarded" ? "disabled" : ""}>Discard</button></div>`; }).join("")}</div>`;
    h += `<div class="aib-row"><button class="aib-btn" data-act="approve" ${dis} ${pend ? "disabled" : ""}>Approve section and continue</button></div>${pend ? `<p class="aib-hint">Decide on every image first.</p>` : ""}`;
  }
  if (st === "failed") h += `<div class="aib-notice err" role="alert">${esc(j.error || "This step failed.")} Retrying does not use another build.</div><button class="aib-btn" data-act="retry" ${dis}>Retry this step</button>`;
  if (st === "ready_to_save") h += `<p>All sections are approved. Saving stores them as drafts. Nothing is published.</p><button class="aib-btn" data-act="complete" ${dis}>Save approved layouts as drafts</button>`;
  if (st === "completed") h += `<div class="aib-notice ok">Saved as drafts. Review the full preview in the editor, then publish yourself when ready.</div><button class="aib-btn" data-preview ${dis}>Open full preview</button>`;
  if (st === "cancelled") h += `<p>This build was cancelled.</p>`;
  if (!["completed", "cancelled"].includes(st)) h += `<div class="aib-row"><button class="aib-btn danger" data-act="cancel" ${dis}>Cancel build</button></div>`;
  h += `</section>`;
  if (j.approved?.length) h += `<section class="aib-card"><h3>Approved so far</h3><ul class="aib-done">${j.approved.map((a) => `<li>${esc(typeof a === "string" ? a : a.label || a.type || "Section")}</li>`).join("")}</ul></section>`;
  if (j.usage) h += `<p class="aib-hint">Usage so far: ${esc(j.usage.images)} images, estimated cost USD ${esc(Number(j.usage.cost_usd || 0).toFixed(2))} (estimate).</p>`;
  return h;
}

function draw() {
  if (!root) return;
  const active = document.activeElement, keep = active?.dataset?.f;
  const j = S.job, showForm = !j || j.status === "cancelled";
  root.innerHTML = `<div class="aib-head"><h1>Build your store</h1><p>Answer a few questions. We draft each page and you approve every section and image.</p></div>
    ${readOnly ? `<div class="aib-notice">Read-only preview. You can look around but nothing will be sent.</div>` : ""}
    ${S.msg ? `<div class="aib-notice ${S.msg.t}" role="${S.msg.t === "err" ? "alert" : "status"}">${esc(S.msg.m)}</div>` : ""}
    ${gates()}${j && j.status === "cancelled" ? `<div class="aib-notice">Your last build was cancelled.</div>` : ""}${j && !showForm ? jobView() : showForm && !blocked() || (showForm && readOnly) ? formView() : ""}`;
  root.querySelectorAll("[data-f]").forEach((el) => { const m = /^p\.(\d+)\.(price|gst_rate|stock)$/.exec(el.dataset.f); if (m && S.brief.products[+m[1]]?.locked) el.disabled = true; });
  if (keep) { const el = root.querySelector(`[data-f="${keep}"]`); if (el && el.type !== "checkbox") { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch {} } }
}
function setPath(path, val) {
  const [k, a, b] = path.split(".");
  if (k === "b") S.brief.brand[a] = val; else if (k === "s") S.brief.selling[a] = val; else if (k === "p") S.brief.products[Number(a)][b] = val; else S.brief[path] = val;
  save();
}

root?.addEventListener("input", (e) => { const f = e.target.dataset.f; if (f && e.target.type !== "checkbox" && e.target.tagName !== "SELECT") { setPath(f, e.target.value); if (f === "b.sells") draw(); } });
root?.addEventListener("change", (e) => {
  const t = e.target, f = t.dataset.f;
  if (t.dataset.existing != null) { const e = existing().find((x) => x.id === t.value); if (e) { S.brief.products = S.brief.products.filter((p) => p.name || p.id); S.brief.products.push(fromExisting(e)); save(); draw(); } return; }
  if (f) { setPath(f, t.type === "checkbox" ? t.checked : t.value); if (f === "confirmed" || f.endsWith("ai_images")) draw(); return; }
  if (t.dataset.photo) {
    if (t.name === "logo") S.brief.brand.logo_id = t.dataset.photo;
    else { const i = Number(t.name.slice(2)), p = S.brief.products[i], set = new Set(p.photo_ids); if (t.checked) { if (set.size >= 5) { t.checked = false; return; } set.add(t.dataset.photo); } else set.delete(t.dataset.photo); p.photo_ids = [...set]; }
    save(); return;
  }
  if (t.dataset.style != null) { const p = S.brief.products[Number(t.dataset.style)], s = new Set(p.image_styles); t.checked ? s.add(t.value) : s.delete(t.value); p.image_styles = [...s]; save(); return; }
  if (t.dataset.upload && t.files?.[0]) upload(t);
});
async function extractPalette(file) {
  const bmp = await createImageBitmap(file), cv = document.createElement("canvas"), n = 48;
  cv.width = n; cv.height = n; const cx = cv.getContext("2d", { willReadFrequently: true }); cx.drawImage(bmp, 0, 0, n, n); bmp.close();
  const px = cx.getImageData(0, 0, n, n).data, bins = new Map();
  for (let i = 0; i < px.length; i += 4) {
    const [r, g, b, a] = [px[i], px[i + 1], px[i + 2], px[i + 3]];
    if (a < 200 || (r > 240 && g > 240 && b > 240)) continue;
    const k = [r, g, b].map((v) => Math.round(v / 32)).join(",");
    const e = bins.get(k) || { c: 0, r: 0, g: 0, b: 0 }; e.c++; e.r += r; e.g += g; e.b += b; bins.set(k, e);
  }
  const out = [];
  for (const e of [...bins.values()].sort((x, y) => y.c - x.c)) {
    const c = [e.r, e.g, e.b].map((v) => Math.round(v / e.c));
    if (out.some((o) => Math.hypot(o[0] - c[0], o[1] - c[1], o[2] - c[2]) < 60)) continue;
    out.push(c); if (out.length === 3) break;
  }
  return out.map((c) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join(""));
}
async function upload(input) {
  const kind = input.dataset.upload, name = input.dataset.name;
  try {
    S.msg = { t: "ok", m: "Uploading photo." }; draw();
    const file = await prepareAuraPhoto(input.files[0]);
    const form = new FormData(); form.append("file", file); form.append("type", kind === "logo" ? "logo" : "image"); form.append("alt", file.name.replace(/\.[^.]+$/, ""));
    const res = await fetch(`/api/stores/${sid}/media`, { method: "POST", body: form, credentials: "same-origin" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.media?.id) throw new Error(d.error || "The upload failed. Try again.");
    S.media = [...S.media, { ...d.media, type: kind === "logo" ? "logo" : "image" }];
    if (kind === "logo") { S.brief.brand.logo_id = d.media.id; if (!S.brief.brand.colours.trim()) { const c = await extractPalette(file).catch(() => []); if (c.length) S.brief.brand.colours = c.join(", "); } }
    else { const p = S.brief.products[Number(name.slice(2))]; if (p.photo_ids.length < 5) p.photo_ids.push(d.media.id); }
    save(); S.msg = { t: "ok", m: "Photo uploaded." };
  } catch (e) { S.msg = { t: "err", m: e.message }; }
  draw();
}
root?.addEventListener("click", async (e) => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.act === "verify") { if (readOnly) return; S.busy = true; draw(); try { const d = await api("verify", { json: {} }); S.msg = { t: "ok", m: d.message || "Verification email sent." }; } catch (x) { S.msg = { t: "err", m: x.message }; } S.busy = false; return draw(); }
  if (t.dataset.act) return act(t.dataset.act);
  if (t.dataset.img) return act("image", { image_id: t.dataset.img, decision: t.dataset.dec });
  if (t.hasAttribute("data-preview")) { await api("preview", { json: { job_id: S.job.id } }).catch(() => {}); location.href = `/stores/${sid}/editor`; return; }
  if (t.dataset.rm != null) { S.brief.products.splice(Number(t.dataset.rm), 1); save(); return draw(); }
  if (t.dataset.add != null) { S.brief.products.push(blankProduct()); save(); return draw(); }
  if (t.dataset.back != null) { S.step = Math.max(0, S.step - 1); S.errors = {}; return draw(); }
  if (t.dataset.next != null) { S.errors = validate(S.step); if (Object.keys(S.errors).length) { S.msg = { t: "err", m: "Please fix the highlighted fields." }; draw(); root.querySelector(".bad,.aib-err")?.scrollIntoView({ block: "center" }); return; } S.msg = null; S.step++; draw(); return window.scrollTo(0, 0); }
  if (t.dataset.start != null) {
    S.errors = {}; for (let i = 0; i < 3; i++) Object.assign(S.errors, validate(i));
    if (Object.keys(S.errors).length) { S.step = Number(Object.keys(S.errors)[0].startsWith("b") ? 0 : Object.keys(S.errors)[0].startsWith("p") ? 1 : 2); S.msg = { t: "err", m: "Some facts need attention." }; return draw(); }
    if (readOnly) return;
    S.busy = true; S.msg = null; draw();
    try { const d = await api("start", { json: { brief: toBrief() } }); S.job = d.job; try { localStorage.removeItem(LS); } catch {} }
    catch (x) { S.msg = { t: "err", m: x.message }; if (x.fields && typeof x.fields === "object") S.msg.m += " " + Object.values(x.fields).flat().map(String).join(" "); }
    S.busy = false; poll(); draw();
  }
});

draw();
poll();
if (!readOnly) refresh(true).then(() => { poll(); draw(); });
