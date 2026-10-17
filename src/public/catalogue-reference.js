// Uses the same authenticated reference endpoint as Ann, not a second suggestion list.
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
const matches = (row, value) => [row.name, row.slug, row.subcategory_id ?? row.category_id].some(v => String(v ?? "").toLowerCase() === String(value).toLowerCase());
export const findReference = (rows, value) => value ? rows.find(row => matches(row, value)) : null;
export const attributeFor = (attributes, name) => attributes.find(a => a.name === name);
export function referenceAxesAllowed(axes, attributes, savedAxes = [], changedScope = false) {
  return axes.every(axis => {
    const current = attributeFor(attributes, axis.name);
    const saved = changedScope ? null : savedAxes.find(a => a.name === axis.name);
    return axis.values.every(value => current?.values.some(v => v.value === value) || saved?.values.includes(value));
  });
}
function fill(select, rows, value, placeholder, keepSaved) {
  const found = findReference(rows, value);
  select.innerHTML = `<option value="">${placeholder}</option>` +
    (value && !found && keepSaved ? `<option selected value="${esc(value)}">${esc(value)} (saved)</option>` : "") +
    rows.map(row => `<option value="${esc(found === row ? value : row.name)}"${found === row ? " selected" : ""}>${esc(row.name)}</option>`).join("");
}
export function catalogueDefaultSelection(reference, defaults = {}) {
  const categoryId = Number(defaults.category_id), subcategoryId = Number(defaults.subcategory_id);
  const sub = reference.subcategories.find(s => Number(s.subcategory_id) === subcategoryId);
  const parent = reference.categories.find(c => Number(c.category_id) === (categoryId || Number(sub?.category_id)));
  if (!parent || (sub && Number(sub.category_id) !== Number(parent.category_id))) return {};
  return { category: parent.name, subcategory: sub?.name || "" };
}
export function initCatalogueReference(scope, { url, onChange, defaults = {}, fetcher = globalThis.fetch } = {}) {
  const category = scope.querySelector('[name="catalogue_category"]');
  const subcategory = scope.querySelector('[name="catalogue_subcategory"]');
  const status = scope.querySelector("[data-reference-status]");
  const retry = scope.querySelector("[data-reference-retry]");
  if (!category || !subcategory || !url) { onChange({ status: "empty", attributes: [], catalogue: { enabled: false, product_types: [], product_type: null, options: [], descriptors: [] } }); return null; }
  let reference, token = 0;
  const cache = new Map();
  const emit = (state, message) => {
    if (status) status.textContent = message;
    if (retry) retry.hidden = state.status !== "error";
    onChange({ ...state, message });
  };
  async function get(path) {
    const response = await fetcher(path, { credentials: "same-origin" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Product options could not be loaded.");
    return body;
  }
  const typeSelect = scope.querySelector('[name="catalogue_product_type"]');
  const savedType = typeSelect?.dataset?.initialType || "";
  const savedTypeLabel = String(typeSelect?.selectedOptions?.[0]?.textContent || "Saved product type").replace(/\s+\(saved\)$/, "");
  let scopeMoved = false;
  const noCatalogue = { enabled: false, product_types: [], product_type: null, options: [], descriptors: [] };
  function paintTypes(types) {
    if (!typeSelect) return;
    const current = String(typeSelect.value || "");
    const listed = types.some(t => String(t.id) === current);
    const keep = current && !listed && !scopeMoved && current === String(savedType);
    typeSelect.innerHTML = `<option value="">${types.length ? "Choose a product type" : "No approved product types yet"}</option>` +
      (keep ? `<option selected value="${esc(current)}">${esc(savedTypeLabel)} (saved, no longer offered)</option>` : "") +
      types.map(t => `<option value="${esc(t.id)}"${String(t.id) === current ? " selected" : ""}>${esc(t.name)}</option>`).join("");
    typeSelect.disabled = !types.length && !keep;
  }
  function normaliseCatalogue(raw) {
    if (!raw || raw.enabled !== true) return noCatalogue;
    const list = k => Array.isArray(raw[k]) ? raw[k] : null;
    const types = list("product_types"), options = list("options") || [], descriptors = list("descriptors") || [];
    if (!types || types.some(t => !t || t.id == null || !t.name)
      || options.some(o => !o || o.id == null || !o.name || !Array.isArray(o.values) || o.values.some(v => typeof v?.value !== "string"))
      || descriptors.some(d => !d || d.id == null || !d.name || !Array.isArray(d.values || [])))
      throw new Error("The product type reference is incomplete. Please retry.");
    return { enabled: true, custom_values_enabled: raw.custom_values_enabled === true, product_types: types, product_type: raw.product_type || null, options, descriptors: descriptors.map(d => ({ ...d, values: d.values || [] })) };
  }
  async function attributes() {
    const attempt = ++token;
    const parent = findReference(reference.categories, category.value);
    const sub = findReference(reference.subcategories.filter(s => Number(s.category_id) === Number(parent?.category_id)), subcategory.value);
    const ids = { categoryId: parent ? Number(parent.category_id) : null, subcategoryId: sub ? Number(sub.subcategory_id) : null };
    if (!sub) { paintTypes([]); if(typeSelect&&!savedType)typeSelect.innerHTML='<option value="">Choose a category and subcategory first</option>'; emit({ status: "empty", attributes: [], catalogue: noCatalogue, ...ids }, "Choose a category and subcategory above to load product types."); return; }
    if(typeSelect)typeSelect.disabled=true;
    emit({ status: "loading", attributes: [], catalogue: noCatalogue, ...ids }, "Loading product options…");
    const fetchScope = async typeId => {
      const key = `${sub.subcategory_id}:${typeId}`;
      return cache.get(key) || get(`${url}?subcategory_id=${encodeURIComponent(sub.subcategory_id)}&catalogue=1${typeId ? `&product_type_id=${encodeURIComponent(typeId)}` : ""}`).then(b => ({ key, b }));
    };
    try {
      const pending = [];
      let hit = await fetchScope("");
      if (attempt !== token) return;
      let body = hit.b || hit;
      let catalogue = normaliseCatalogue(body.catalogue);
      if (catalogue.enabled) {
        paintTypes(catalogue.product_types);
        const want = String(typeSelect?.value || "");
        if (want && Number(catalogue.product_type?.id) !== Number(want) && catalogue.product_types.some(t => String(t.id) === want)) {
          const second = await fetchScope(want);
          if (attempt !== token) return;
          pending.push(second);
          body = second.b || second;
          catalogue = normaliseCatalogue(body.catalogue);
        }
      } else paintTypes([]);
      pending.push(hit);
      if (!Array.isArray(body.attributes) || body.attributes.some(a => !a.name || !Array.isArray(a.values) || a.values.some(v => typeof v.value !== "string"))) throw new Error("The product option reference is incomplete. Please retry.");
      pending.forEach(p => p.key && cache.set(p.key, p.b));
      let message = body.attributes.length ? "Choose your product options and the values you sell." : "No predefined product options for this subcategory.";
      if (catalogue.enabled) message = !catalogue.product_types.length ? "Product types for this subcategory are pending approval." : catalogue.product_type ? "Choose your product options and product details." : `${catalogue.product_types.length} product ${catalogue.product_types.length===1?"type available":"types available"}. Choose a product type to see its variants and product details.`;
      emit({ status: "ready", attributes: body.attributes, catalogue, ...ids }, message);
    } catch (error) {
      if (attempt === token) {if(typeSelect)typeSelect.disabled=true;emit({ status: "error", attributes: [], catalogue: noCatalogue, ...ids }, error.message);}
    }
  }
  function subs(keepSaved, value = subcategory.value) {
    const parent = findReference(reference.categories, category.value);
    fill(subcategory, reference.subcategories.filter(s => Number(s.category_id) === Number(parent?.category_id)), value, "Choose a subcategory", keepSaved);
    subcategory.disabled = !parent;
  }
  async function load() {
    const attempt = ++token;
    category.disabled = subcategory.disabled = true;
    emit({ status: "loading", attributes: [] }, "Loading product categories…");
    try {
      const body = await get(url);
      if (attempt !== token) return;
      if (!Array.isArray(body.categories) || !Array.isArray(body.subcategories)) throw new Error("Product categories could not be loaded. Please retry.");
      reference = body;
      const selected = !category.value && !subcategory.value ? catalogueDefaultSelection(reference, defaults) : {};
      fill(category, reference.categories, category.value || selected.category, "Choose a category", true);
      category.disabled = false;
      subs(true, subcategory.value || selected.subcategory);
      await attributes();
    } catch (error) {
      if (attempt === token) emit({ status: "error", attributes: [] }, error.message);
    }
  }
  const resetType = () => { scopeMoved = true; if (typeSelect) typeSelect.innerHTML = '<option value="">Choose a product type</option>'; };
  category.addEventListener("change", () => { if (reference) { resetType(); subs(false); attributes(); } });
  subcategory.addEventListener("change", () => { if (reference) { resetType(); attributes(); } });
  typeSelect?.addEventListener("change", () => { if (reference) attributes(); });
  retry?.addEventListener("click", () => reference ? attributes() : load());
  load();
  return { reload: load };
}
