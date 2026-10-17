// Reusable catalogue form controller. No globals: model, callbacks and scope are passed in.
import { initCatalogueReference, attributeFor, referenceAxesAllowed } from "./catalogue-reference.js";
import { createProductSku } from "./catalogue-model.js";
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const instances = new WeakMap();
export function ensureProductSku(scope, generate = createProductSku) {
  const input = scope?.querySelector('[name="sku"]');
  if (!input) return "";
  if (!String(input.value || "").trim()) input.value = generate();
  return input.value;
}
const key = values => JSON.stringify(values);
const rupeesToPaise = text => {
  const t = String(text ?? "").trim();
  if (t === "") return null;
  return /^\d+(?:\.\d{1,2})?$/.test(t) ? Math.round(Number(t) * 100) : NaN;
};

// Plain rows for validators: only known keys, never UI flags such as isNew.
export const toModelRows = rows => rows.map(r => {
  const out = { values: r.values, sku: String(r.sku ?? "").trim(), stock: r.stock, price_paise: r.price_paise ?? null };
  if (r.id) out.id = r.id;
  if (r.expected_stock != null) out.expected_stock = r.expected_stock;
  return out;
});
// True when saved variant rows cannot be validated against the saved axes (older data); these are kept untouched on save.
export function hasLegacyVariants(model, axes, rows) {
  if (!rows.length) return false;
  try { model.validateVariants(toModelRows(rows), { axes }); return false; } catch { return true; }
}

export function initCatalogueForm(scope, { model, notify = () => {}, confirm = () => true, baseSku, referenceUrl } = {}) {
  const box = scope?.querySelector("[data-catalogue-options]");
  if (!scope || !model || !box) return null;
  if (instances.has(scope)) return instances.get(scope);
  const maxAxes = model.MAX_AXES || 3, maxVariants = model.MAX_VARIANTS || 200;
  const field = name => scope.querySelector(`[name="${name}"]`);
  const getBaseSku = baseSku || (() => String(field("sku")?.value || "").trim());
  let initial = { axes: [], variants: [] };
  try { initial = JSON.parse(box?.dataset.initial || "{}"); } catch { /* keep empty */ }
  const state = {
    axes: (initial.axes || []).map(a => ({ name: a.name || "", values: [...(a.values || [])] })),
    rows: (initial.variants || []).map(v => ({ id: v.id, values: v.values, sku: v.sku, stock: v.stock, price_paise: v.price_paise ?? null, expected_stock: v.stock })),
    generated: null,
    legacy: false,
  };
  state.legacy = hasLegacyVariants(model, (initial.axes || []).map(a => ({ name: a.name, values: a.values })), state.rows);

  let reference = { status: "loading", attributes: [] };
  const initialScope = [field("catalogue_category")?.value || "", field("catalogue_subcategory")?.value || ""];
  const changedScope = () => JSON.stringify(initialScope) !== JSON.stringify([field("catalogue_category")?.value || "", field("catalogue_subcategory")?.value || ""]);
  const cleanAxes = () => state.axes.map(a => ({ name: a.name, values: [...a.values] })).filter(a => a.name || a.values.length);
  const axesKey = () => key(cleanAxes().map(a => [a.name, a.values]));
  state.generated = axesKey();
  const comboCount = axes => axes.reduce((n, a) => n * a.values.length, axes.length ? 1 : 0);
  const identity = () => ({
    vendor: String(field("catalogue_vendor")?.value || "").trim(),
    category: String(field("catalogue_category")?.value || "").trim(),
    subcategory: String(field("catalogue_subcategory")?.value || "").trim(),
    seo_title: String(field("seo_title")?.value || "").trim(),
    seo_description: String(field("seo_description")?.value || "").trim(),
  });
  const errorNode = box?.querySelector("[data-options-error]");
  const showError = message => { if (!errorNode) return; errorNode.textContent = message || ""; errorNode.hidden = !message; };

  function axisProblems() {
    const axes = cleanAxes();
    if (changedScope() && axes.length && reference.status !== "ready") return "Load the selected subcategory's options before generating or saving.";
    if (!referenceAxesAllowed(axes, reference.attributes, initial.axes || [], changedScope())) return "Choose options and values for the selected subcategory, or remove the old options.";
    for (const [i, a] of axes.entries()) {
      if (!a.name) return `Name option ${i + 1}.`;
      if (!a.values.length) return `Add at least one value for ${a.name}.`;
      if (new Set(a.values.map(v => v.toLowerCase())).size !== a.values.length) return `${a.name} repeats a value. Each value must be different.`;
    }
    if (new Set(axes.map(a => a.name.toLowerCase())).size !== axes.length) return "Each option needs a different name.";
    return "";
  }
  function paintCount() {
    const node = box.querySelector("[data-combo-count]");
    const axes = cleanAxes(), problem = axisProblems();
    const stale = axesKey() !== state.generated;
    const n = comboCount(axes);
    let text = "";
    if (problem) text = problem;
    else if (n > maxVariants) text = `${n.toLocaleString("en-IN")} combinations is over the limit of ${maxVariants}. Remove values or an option.`;
    else if (!axes.length) text = stale ? "Generating will remove the existing combinations." : "";
    else text = `${n.toLocaleString("en-IN")} ${n === 1 ? "combination" : "combinations"} from these options.${stale ? " Generate to update the table before saving." : ""}`;
    node.textContent = text;
    node.dataset.tone = problem || n > maxVariants ? "error" : stale ? "pending" : "ok";
    box.querySelector("[data-axis-add]").disabled = state.axes.length >= maxAxes || reference.status !== "ready" || !reference.attributes.some(a => !state.axes.some(p => p.name === a.name));
    const generateButton = box.querySelector("[data-variants-generate]");
    if (generateButton) generateButton.disabled = !state.rows.length && (!axes.length || !!problem || n > maxVariants);
    box.querySelectorAll("[data-add-reference-axis]").forEach(button => {
      button.disabled = state.axes.length >= maxAxes || state.axes.some(a => a.name === button.dataset.addReferenceAxis);
    });
  }
  function paintAxes() {
    const available = box.querySelector("[data-available-axes]");
    if (available) available.innerHTML = reference.status === "ready" ? reference.attributes.map(a =>
      `<button type="button" class="lb-button lb-button-outline" data-add-reference-axis="${esc(a.name)}">${esc(a.name)}</button>`).join("") : "";
    const host = box.querySelector("[data-axes]");
    host.innerHTML = state.axes.map((a, i) => {
      const current = attributeFor(reference.attributes, a.name);
      const values = [...new Set([...(current?.values || []).map(v => v.value), ...a.values])];
      return `<fieldset class="lb-axis" data-axis="${i}"><legend>Option ${i + 1}</legend>
      <label class="lb-field">Option<select data-axis-name${reference.status !== "ready" ? " disabled" : ""}><option value="">Choose an option</option>${a.name && !current ? `<option value="${esc(a.name)}" selected>${esc(a.name)} (saved)</option>` : ""}${reference.attributes.map(at => `<option value="${esc(at.name)}"${at.name === a.name ? " selected" : ""}${at.name !== a.name && state.axes.some(x => x.name === at.name) ? " disabled" : ""}>${esc(at.name)}</option>`).join("")}</select></label>
      <div class="lb-check-list" role="group" aria-label="${esc(a.name || "Option")} values">${values.map(value => `<label class="lb-check-input"><input type="checkbox" data-axis-choice value="${esc(value)}"${a.values.includes(value) ? " checked" : ""}>${esc(value)}${!current?.values.some(v => v.value === value) ? " (saved value)" : ""}</label>`).join("") || '<span class="lb-muted">Choose an option to see its values.</span>'}</div>
      <button type="button" class="lb-text-button" data-axis-remove aria-label="Remove option ${i + 1}">Remove option</button></fieldset>`;
    }).join("");
    paintCount();
  }
  function paintMatrix() {
    const body = box.querySelector("[data-matrix-body]");
    const ro = state.legacy ? " disabled" : "";
    const note = box.querySelector("[data-legacy-note]");
    if (note) note.hidden = !state.legacy;
    box.querySelector("[data-matrix-region]").hidden = !state.rows.length;
    box.querySelector("[data-matrix-empty]").hidden = state.rows.length > 0;
    body.innerHTML = state.rows.map((r, i) => `<tr data-row="${i}"><th scope="row">${esc((r.values || []).join(" / "))}${r.isNew ? ' <span class="lb-pill-new">New, SKU generated</span>' : ""}</th>
      <td><input data-v-sku value="${esc(r.sku)}" maxlength="80"${ro} aria-label="SKU for ${esc((r.values || []).join(" "))}"></td>
      <td><input data-v-stock type="number" min="0" step="1" value="${esc(r.stock)}"${ro} aria-label="Stock for ${esc((r.values || []).join(" "))}"></td>
      <td><input data-v-price inputmode="decimal"${ro} value="${r.price_paise == null ? "" : esc((r.price_paise / 100).toFixed(2))}" placeholder="Base price" aria-label="Price override for ${esc((r.values || []).join(" "))}"></td></tr>`).join("");
  }
  const paint = () => { paintAxes(); paintMatrix(); };

  box.addEventListener("input", event => {
    const axis = event.target.closest("[data-axis]");
    if (axis) {
      const a = state.axes[Number(axis.dataset.axis)];
      if (event.target.matches("[data-axis-name]")) {
        if (a.name !== event.target.value) { a.name = event.target.value; a.values = []; }
        paintAxes();
        box.querySelector(`[data-axis="${axis.dataset.axis}"] select`)?.focus();
      }
      if (event.target.matches("[data-axis-choice]")) a.values = event.target.checked ? [...new Set([...a.values, event.target.value])] : a.values.filter(v => v !== event.target.value);
      showError(""); paintCount(); return;
    }
    const tr = event.target.closest("[data-row]");
    if (!tr) return;
    const r = state.rows[Number(tr.dataset.row)];
    if (event.target.matches("[data-v-sku]")) { r.sku = event.target.value; r.isNew = false; }
    if (event.target.matches("[data-v-stock]")) r.stock = event.target.value === "" ? NaN : Number(event.target.value);
    if (event.target.matches("[data-v-price]")) r.price_paise = rupeesToPaise(event.target.value);
    showError("");
  });
  box.addEventListener("click", event => {
    const suggested = event.target.closest("[data-add-reference-axis]");
    if (suggested) {
      const name = suggested.dataset.addReferenceAxis;
      if (reference.status === "ready" && state.axes.length < maxAxes && attributeFor(reference.attributes, name) && !state.axes.some(a => a.name === name)) {
        state.axes.push({ name, values: [] }); paintAxes();
        box.querySelector(`[data-axis="${state.axes.length - 1}"] input`)?.focus();
      }
    } else if (event.target.closest("[data-buying-retry]")) {
      scope.querySelector("[data-reference-retry]")?.click();
    } else if (event.target.closest("[data-axis-add]")) {
      if (reference.status === "ready" && state.axes.length < maxAxes) { state.axes.push({ name: "", values: [] }); paintAxes(); box.querySelector(`[data-axis="${state.axes.length - 1}"] select`)?.focus(); }
    } else if (event.target.closest("[data-axis-remove]")) {
      state.axes.splice(Number(event.target.closest("[data-axis]").dataset.axis), 1); paintAxes();
    } else if (event.target.closest("[data-variants-generate]")) generate();
  });

  function generate() {
    const problem = axisProblems();
    if (problem) { showError(problem); return false; }
    const axes = cleanAxes(), n = comboCount(axes);
    if (n > maxVariants) { showError(`This would create ${n.toLocaleString("en-IN")} combinations. A product can have at most ${maxVariants}.`); return false; }
    const base = getBaseSku() || ensureProductSku(scope);
    let catalogue;
    try { catalogue = model.validateCatalogue({ ...identity(), axes }); } catch (e) { showError(e.message); return false; }
    const existing = toModelRows(state.rows.filter(r => r.values));
    const next = n ? model.reconcileVariants(catalogue.axes, existing, base) : [];
    const byKey = new Map(state.rows.filter(r => r.values).map(r => [key(r.values), r]));
    const nextKeys = new Set(next.map(r => key(r.values)));
    const dropped = existing.filter(r => !nextKeys.has(key(r.values)));
    const added = next.filter(r => !byKey.has(key(r.values))).length;
    const kept = next.length - added;
    if (dropped.length || (n >= 25 && added)) {
      const parts = [`This will create ${n.toLocaleString("en-IN")} combinations: ${kept} kept, ${added} new.`];
      if (dropped.length) parts.push(`${dropped.length} existing ${dropped.length === 1 ? "combination" : "combinations"} will be removed with their SKU, stock and price entries when you save.`);
      if (!confirm(parts.join(" ") + " Continue?")) return false;
    }
    state.rows = next.map(r => {
      const old = byKey.get(key(r.values));
      return { ...r, id: old?.id ?? r.id, expected_stock: old ? old.expected_stock : undefined, isNew: !old };
    });
    state.legacy = false;
    state.generated = axesKey();
    showError(""); paint();
    notify(n ? `${n} ${n === 1 ? "combination" : "combinations"} ready.` : "Buying options cleared.");
    return true;
  }

  // Throws an Error with a merchant-readable message when the catalogue cannot be saved.
  function payload() {
    const problem = axisProblems();
    if (problem) throw new Error(problem);
    if (axesKey() !== state.generated) throw new Error("Buying options changed. Generate combinations to update the variant table before saving.");
    const search = readSearchFields(scope);
    if (state.legacy) {
      // Keep older variant rows exactly as saved; send identity and SEO only.
      const saved = (initial.axes || []).map(a => ({ name: a.name, values: a.values }));
      const kept = { ...model.validateCatalogue({ ...identity(), axes: saved }), seo_title: search.seo_title, seo_description: search.seo_description };
      return { catalogue: kept, collection_ids: [...scope.querySelectorAll("[data-collection-pick]:checked")].map(i => i.value), slug: search.slug };
    }
    const axes = cleanAxes();
    const catalogue = { ...model.validateCatalogue({ ...identity(), axes }), seo_title: search.seo_title, seo_description: search.seo_description };
    const rows = toModelRows(state.rows);
    const checked = model.validateVariants(rows, catalogue);
    const expected = new Map(state.rows.map(r => [key(r.values), r.expected_stock]));
    const variants = checked.map(r => {
      const out = { values: r.values, sku: r.sku, stock: r.stock, price_paise: r.price_paise ?? null };
      if (r.id) out.id = r.id;
      const e = expected.get(key(r.values));
      if (r.id && Number.isInteger(e)) out.expected_stock = e;
      return out;
    });
    const collection_ids = [...scope.querySelectorAll("[data-collection-pick]:checked")].map(i => i.value);
    return { catalogue, collection_ids, variants, slug: search.slug };
  }
  paint();
  const api = { payload, generate, state };
  instances.set(scope, api);
  const params = new URLSearchParams(globalThis.location?.search || "");
  const defaults = scope.dataset.new === "true" && params.get("ann_modal") === "1"
    ? { category_id: params.get("ann_category_id"), subcategory_id: params.get("ann_subcategory_id") } : {};
  initCatalogueReference(scope, { url: referenceUrl, defaults, onChange(next) {
    reference = next;
    const status = box.querySelector("[data-buying-status]");
    if (status) status.textContent = next.message || "Choose a category and subcategory in Organisation to see buying options.";
    const retry = box.querySelector("[data-buying-retry]");
    if (retry) retry.hidden = next.status !== "error";
    paintAxes();
  } });
  return api;
}

// Returns {catalogue, collection_ids, variants}, or {} when the scope has no catalogue fields.
export function readCataloguePayload(scope) {
  const instance = instances.get(scope);
  return instance ? instance.payload() : {};
}

export const slugify = text => String(text || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/, "");
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Wires counters, live preview and slug suggestion. Saved handles are never regenerated from title edits.
export function initSearchPreview(scope, { titleName = "title", descriptionName = "description" } = {}) {
  const box = scope?.querySelector("[data-search-preview]");
  if (!box) return null;
  const q = sel => box.querySelector(sel);
  const src = name => scope.querySelector(`[name="${name}"]`);
  const seoTitle = q("[data-seo-title]"), seoDesc = q("[data-seo-description]"), slug = q("[data-slug-input]");
  let auto = box.dataset.slugAuto === "true" && !slug.value;
  const host = box.dataset.host, segment = box.dataset.segment;
  const paint = () => {
    const title = seoTitle.value.trim() || String(src(titleName)?.value || "").trim() || "Untitled";
    const desc = (seoDesc.value.trim() || String(src(descriptionName)?.value || "").trim()).replace(/\s+/g, " ").slice(0, 160);
    q("[data-serp-title]").textContent = title;
    q("[data-serp-desc]").textContent = desc;
    q("[data-serp-url]").textContent = `${host || "your-store"}/${segment}/${slug.value}`;
    q("[data-slug-full]").textContent = `${host ? `https://${host}` : "Your store address"}/${segment}/${slug.value}`;
    q('[data-count-for="seo_title"]').textContent = `${[...seoTitle.value].length} of 70`;
    q('[data-count-for="seo_description"]').textContent = `${[...seoDesc.value].length} of 160`;
  };
  scope.addEventListener("input", event => {
    if (event.target === slug) {
      auto = false;
      const clean = slug.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-{2,}/g, "-");
      if (clean !== slug.value) slug.value = clean;
    } else if (auto && event.target === src(titleName)) slug.value = slugify(event.target.value);
    paint();
  });
  slug.addEventListener("blur", () => { slug.value = slug.value.replace(/^-+|-+$/g, ""); paint(); });
  paint();
  return { paint };
}

// Returns {slug, seo_title, seo_description}; slug is derived from the title only when left empty.
export function readSearchFields(scope, titleName = "title") {
  const get = name => String(scope.querySelector(`[name="${name}"]`)?.value || "").trim();
  const slug = get("slug") || slugify(get(titleName));
  if (!SLUG_PATTERN.test(slug) || slug.length > 80) throw new Error("Use lowercase letters, numbers and hyphens for the web address handle.");
  const seo_title = get("seo_title"), seo_description = get("seo_description");
  if ([...seo_title].length > 70) throw new Error("Keep the search title within 70 characters.");
  if ([...seo_description].length > 160) throw new Error("Keep the search description within 160 characters.");
  return { slug, seo_title, seo_description };
}
