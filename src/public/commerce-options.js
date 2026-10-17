// Pure SKU-variant helpers. No DOM. Shared by renderers, the cart script and tests.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const s = (v) => typeof v === "string" ? v.trim() : "";
export const optionId = (v) => UUID.test(String(v || "")) ? String(v).toLowerCase() : "";
export const cartKey = (item) => `${String(item?.product_id ?? "")}|${optionId(item?.product_option_id)}`;
export const sameLine = (a, b) => cartKey(a) === cartKey(b);
/** Only product_id, quantity and a valid product_option_id are ever sent or stored. */
export const cleanLine = (item) => { const o = optionId(item?.product_option_id); return { product_id: String(item.product_id), ...(o ? { product_option_id: o } : {}), quantity: item.quantity }; };
export function normaliseCart(list) {
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    if (!raw || typeof raw.product_id !== "string" || !Number.isInteger(raw.quantity) || raw.quantity < 1 || raw.quantity > 99) continue;
    if (raw.product_option_id != null && raw.product_option_id !== "" && !optionId(raw.product_option_id)) continue;
    const line = cleanLine(raw), at = out.find((e) => sameLine(e, line));
    if (at) at.quantity = Math.min(99, at.quantity + line.quantity); else out.push(line);
  }
  return out;
}
export const matchIssue = (issues, item) => (issues || []).filter((i) => String(i.product_id) === String(item.product_id) && (i.product_option_id ? optionId(i.product_option_id) === optionId(item.product_option_id) : true))
  .sort((a, b) => (b.product_option_id ? 1 : 0) - (a.product_option_id ? 1 : 0))[0];
export const axesOf = (p) => (Array.isArray(p?.catalogue?.axes) ? p.catalogue.axes : []).map((a) => ({ name: s(a?.name), values: (Array.isArray(a?.values) ? a.values : []).map(s).filter(Boolean) })).filter((a) => a.name && a.values.length);
export const variantsOf = (p) => (Array.isArray(p?.variants) ? p.variants : []).filter((v) => v && optionId(v.id) && Array.isArray(v.values));
export const hasOptions = (p) => !p?.demo && axesOf(p).length > 0 && variantsOf(p).length > 0;
export const variantPrice = (p, v) => Number.isInteger(v?.price_paise) && v.price_paise >= 0 ? v.price_paise : p.price_paise;
export const variantMax = (v) => v.stock == null ? 99 : Math.max(0, Math.min(99, Number(v.stock) || 0));
const find = (p, sel) => { const ax = axesOf(p); return variantsOf(p).find((v) => ax.every((a, i) => v.values[i] === sel[a.name])) || null; };
export function resolveSelection(p, sel = {}) {
  const ax = axesOf(p), missing = ax.filter((a) => !sel[a.name]).map((a) => a.name);
  if (missing.length) return { state: "incomplete", missing, variant: null, price_paise: p.price_paise, max: 0, label: `Choose ${missing.join(", ")}` };
  const v = find(p, sel);
  if (!v) return { state: "missing", missing: [], variant: null, price_paise: p.price_paise, max: 0, label: "This combination is not available" };
  const max = variantMax(v);
  if (max < 1) return { state: "soldout", missing: [], variant: v, price_paise: variantPrice(p, v), max: 0, label: "Sold out" };
  return { state: "ok", missing: [], variant: v, price_paise: variantPrice(p, v), max, label: v.stock == null ? "Available" : `${max} available` };
}
/** Status of one value given the other axes already chosen: ok | soldout | unavailable. */
export function valueStatus(p, sel, axisName, value) {
  const ax = axesOf(p), idx = ax.findIndex((a) => a.name === axisName);
  const fits = variantsOf(p).filter((v) => v.values[idx] === value && ax.every((a, i) => i === idx || !sel[a.name] || v.values[i] === sel[a.name]));
  if (!fits.length) return "unavailable";
  return fits.some((v) => variantMax(v) > 0) ? "ok" : "soldout";
}
export const safeJson = (o) => JSON.stringify(o).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
export function optionData(p) {
  return safeJson({ id: p.id, price: p.price_paise, axes: axesOf(p), variants: variantsOf(p).map((v) => ({ id: optionId(v.id), values: v.values, sku: s(v.sku), stock: v.stock == null ? null : Number(v.stock), price_paise: Number.isInteger(v.price_paise) ? v.price_paise : null })) });
}
/** Selector + quantity + button. Nothing preselected. Buttons stay disabled until a valid SKU is chosen. */
export function renderOptionBuy(p, { esc, money, word = "Add to cart", compare = false }) {
  const ax = axesOf(p);
  const groups = ax.map((a, ai) => `<fieldset class="au-opt" data-opt-axis="${esc(a.name)}"><legend>${esc(a.name)}</legend>${a.values.map((val, vi) => { const id = `opt-${ai}-${vi}`; const st = valueStatus(p, {}, a.name, val); return `<span class="au-opt-v"><input type="radio" name="opt-${ai}" id="${id}" value="${esc(val)}" data-opt-name="${esc(a.name)}" ${st === "unavailable" ? 'data-opt-flag="unavailable"' : st === "soldout" ? 'data-opt-flag="soldout"' : ""}><label for="${id}">${esc(val)}<small data-opt-note></small></label></span>`; }).join("")}</fieldset>`).join("");
  const init = resolveSelection(p, {});
  return `<div class="au-options" data-product-options data-product-id="${esc(p.id)}" data-option-json="${esc(optionData(p))}" data-word="${esc(word)}">${groups}<p class="au-opt-status" data-opt-status role="status" aria-live="polite">${esc(init.label)}</p><p class="au-opt-sku" data-opt-sku hidden></p></div><div class="au-buy"><label for="aura-quantity">Quantity</label><input id="aura-quantity" type="number" min="1" max="1" value="1" inputmode="numeric" aria-label="Quantity" disabled><button class="au-btn" type="button" data-add-product="${esc(p.id)}" data-needs-option disabled aria-disabled="true">${esc(word)}</button></div><p class="au-feedback" data-commerce-feedback role="status"></p>`;
}
export const renderOptionSticky = (p, { esc, money }) => `<button type="button" class="au-btn" data-add-product="${esc(p.id)}" data-needs-option disabled aria-disabled="true">Choose options</button>`;
export function variantTitleLines(item) { return (Array.isArray(item?.variant_values) ? item.variant_values : []).filter((v) => v && s(v.name) && s(v.value)).map((v) => `${s(v.name)}: ${s(v.value)}`); }
export const OPTION_CSS = `
.au-options{display:grid;gap:.7rem;margin:.8rem 0;font-size:.9rem;color:inherit}
.au-opt{border:0;margin:0;padding:0;min-width:0}.au-opt legend{font-weight:700;margin-bottom:.3rem;padding:0}
.au-opt-v{display:inline-block;margin:0 .35rem .35rem 0;position:relative}
.au-opt-v input{position:absolute;opacity:0;inset:0;width:100%;height:100%;margin:0;cursor:pointer}
.au-opt-v label{display:inline-flex;flex-direction:column;min-width:2.75rem;min-height:2.75rem;justify-content:center;padding:.4rem .85rem;border:1.5px solid currentColor;border-radius:var(--au-radius,6px);cursor:pointer;opacity:.85;text-align:center}
.au-opt-v input:checked+label{opacity:1;outline:2px solid currentColor;outline-offset:2px;font-weight:700;background:rgba(127,127,127,.16)}
.au-opt-v input:focus-visible+label{outline:3px solid currentColor;outline-offset:3px}
.au-opt-v input[data-opt-flag] +label{border-style:dashed}.au-opt-v label small{font-size:.7rem;font-weight:400}
.au-opt-status{margin:0;font-weight:600}.au-opt-sku{margin:0;font-size:.8rem;opacity:.75}
.au-line-opts{display:block;font-size:.8rem;opacity:.8}
`;
