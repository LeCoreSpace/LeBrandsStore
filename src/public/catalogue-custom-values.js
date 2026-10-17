// Pure helpers for store-private custom option values. No DOM, no globals.
export const MAX_CUSTOM_VALUE = 200;

// Returns {value} (trimmed) or {error}.
export function cleanCustomValue(text) {
  const value = String(text ?? "").trim();
  if (!value) return { error: "Enter a value to add." };
  if ([...value].length > MAX_CUSTOM_VALUE) return { error: `Keep the value within ${MAX_CUSTOM_VALUE} characters.` };
  if (/[\u0000-\u001f\u007f-\u009f]/.test(value)) return { error: "Remove line breaks and control characters from the value." };
  if (/[<>]/.test(value)) return { error: "Remove angle brackets from the value." };
  return { value };
}

export const findExistingValue = (option, value) =>
  (option?.values || []).find(v => String(v.value).toLowerCase() === String(value).toLowerCase()) || null;

export const variantValuesUrl = referenceUrl =>
  referenceUrl ? String(referenceUrl).replace(/\/ann\/reference(?=$|\?)/, "/catalogue/variant-values") : "";

// Adds {id,value} to the option with optionId, in place, unless already present. Returns the stored value or null.
export function insertValue(catalogue, optionId, added) {
  const option = (catalogue?.options || []).find(o => Number(o.id) === Number(optionId));
  if (!option || !added) return null;
  const have = (option.values || []).find(v => Number(v.id) === Number(added.id) || String(v.value).toLowerCase() === String(added.value).toLowerCase());
  if (have) return have;
  option.values = [...(option.values || []), { id: added.id, value: added.value }];
  return added;
}

const FRIENDLY = { 400: "That value is not valid.", 403: "You do not have permission to add values here.", 409: "That value conflicts with an existing one." };

// Posts one value. Result: {status:"stale"} | {status:"error",message} | {status:"added"|"reused",value}.
export async function submitCustomValue({ fetcher, url, productTypeId, optionId, text, scopeKey, currentScopeKey, option }) {
  const cleaned = cleanCustomValue(text);
  if (cleaned.error) return { status: "error", message: cleaned.error };
  const existing = findExistingValue(option, cleaned.value);
  if (existing) return { status: "reused", value: existing };
  if (!url) return { status: "error", message: "Custom values are not available here." };
  let res, body = {};
  try {
    res = await fetcher(url, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ product_type_id: Number(productTypeId), option_id: Number(optionId), value: cleaned.value }) });
    try { body = await res.json(); } catch { body = {}; }
  } catch {
    return scopeKey === currentScopeKey() ? { status: "error", message: "The value could not be saved. Check your connection and try again." } : { status: "stale" };
  }
  if (scopeKey !== currentScopeKey()) return { status: "stale" };
  if (!res.ok) return { status: "error", message: (typeof body.error === "string" && body.error) || FRIENDLY[res.status] || "The value could not be saved. Please try again." };
  const v = body.value;
  if (!v || v.id == null || typeof v.value !== "string") return { status: "error", message: "The value could not be saved. Please try again." };
  return { status: body.created === false ? "reused" : "added", value: { id: v.id, value: v.value } };
}

let counter = 0;
export const nextRequestToken = () => ++counter;

// True when the node sits in a disabled fieldset, inert or aria-disabled region, or is flagged read only.
export function isReadOnlyScope(node) {
  if (!node) return true;
  if (node.dataset?.readonly === "true" || node.getAttribute?.("aria-readonly") === "true") return true;
  return !!node.closest?.("fieldset[disabled], [inert], [aria-disabled='true'], [data-readonly='true']");
}

// Applies a finished request to the axis that started it. Only mutates that axis, and only if it is still
// in the list, still the same request, and still the same option name. Returns {live, selected}.
export function applyCustomResult({ axes, axis, token, name, result, text, max = 50 }) {
  const live = axes.includes(axis) && axis.req === token && axis.name === name;
  if (axis.req === token) { axis.pending = false; axis.req = 0; }
  if (!live || result.status === "stale") return { live: false, selected: false };
  if (result.status === "error") { axis.customError = result.message; return { live: true, selected: false }; }
  axis.customError = "";
  if (axis.draft === text) axis.draft = "";
  let selected = false;
  if (!axis.values.includes(result.value.value) && axis.values.length < max) { axis.values = [...axis.values, result.value.value]; selected = true; }
  return { live: true, selected };
}
