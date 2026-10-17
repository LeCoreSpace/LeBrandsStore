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
export function initCatalogueReference(scope, { url, onChange, fetcher = globalThis.fetch } = {}) {
  const category = scope.querySelector('[name="catalogue_category"]');
  const subcategory = scope.querySelector('[name="catalogue_subcategory"]');
  const status = scope.querySelector("[data-reference-status]");
  const retry = scope.querySelector("[data-reference-retry]");
  if (!category || !subcategory || !url) { onChange({ status: "empty", attributes: [] }); return null; }
  let reference, token = 0;
  const cache = new Map();
  const emit = (state, message) => {
    if (status) status.textContent = message;
    if (retry) retry.hidden = state.status !== "error";
    onChange(state);
  };
  async function get(path) {
    const response = await fetcher(path, { credentials: "same-origin" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Product options could not be loaded.");
    return body;
  }
  async function attributes() {
    const attempt = ++token;
    const parent = findReference(reference.categories, category.value);
    const sub = findReference(reference.subcategories.filter(s => Number(s.category_id) === Number(parent?.category_id)), subcategory.value);
    if (!sub) { emit({ status: "empty", attributes: [] }, "Choose a category and subcategory to see their buying options."); return; }
    emit({ status: "loading", attributes: [] }, "Loading buying options…");
    try {
      const body = cache.get(sub.subcategory_id) || await get(`${url}?subcategory_id=${encodeURIComponent(sub.subcategory_id)}`);
      if (attempt !== token) return;
      if (!Array.isArray(body.attributes) || body.attributes.some(a => !a.name || !Array.isArray(a.values) || a.values.some(v => typeof v.value !== "string"))) throw new Error("The product option reference is incomplete. Please retry.");
      cache.set(sub.subcategory_id, body);
      emit({ status: "ready", attributes: body.attributes }, body.attributes.length ? "Choose your buying options and the values you sell." : "No predefined buying options for this subcategory.");
    } catch (error) {
      if (attempt === token) emit({ status: "error", attributes: [] }, error.message);
    }
  }
  function subs(keepSaved) {
    const parent = findReference(reference.categories, category.value);
    fill(subcategory, reference.subcategories.filter(s => Number(s.category_id) === Number(parent?.category_id)), subcategory.value, "Choose a subcategory", keepSaved);
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
      fill(category, reference.categories, category.value, "Choose a category", true);
      category.disabled = false;
      subs(true);
      await attributes();
    } catch (error) {
      if (attempt === token) emit({ status: "error", attributes: [] }, error.message);
    }
  }
  category.addEventListener("change", () => { if (reference) { subs(false); attributes(); } });
  subcategory.addEventListener("change", () => { if (reference) attributes(); });
  retry?.addEventListener("click", () => reference ? attributes() : load());
  load();
  return { reload: load };
}
