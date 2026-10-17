// Product type, buying-option ids and descriptor values for the shared catalogue form.
// Pure helpers: no globals. The controller in catalogue-form.js owns the DOM and requests.
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const arr = v => Array.isArray(v) ? v : [];
const posInt = v => Number.isInteger(Number(v)) && Number(v) > 0 && String(v).trim() !== "" ? Number(v) : null;

export const PENDING_NOTICE = "Product types for this subcategory are pending approval. Buying options and product details open up once a type is approved. Your product still saves without them.";

export function initDescriptorState(classification) {
  const out = {};
  for (const d of arr(classification?.descriptors)) {
    out[d.descriptor_id] = {
      ids: arr(d.value_ids).map(Number),
      text: d.text_value ?? "",
      number: d.number_value == null ? "" : String(d.number_value),
      bool: typeof d.boolean_value === "boolean" ? String(d.boolean_value) : "",
    };
  }
  return out;
}
const slot = (state, id) => state[id] || (state[id] = { ids: [], text: "", number: "", bool: "" });

// Applies one changed control (data-descriptor) to the descriptor state.
export function applyDescriptorInput(state, el) {
  const id = el.dataset.descId, kind = el.dataset.descKind, s = slot(state, id);
  if (kind === "single_select") s.ids = el.value === "" ? [] : [Number(el.value)];
  else if (kind === "multi_select") {
    const v = Number(el.value);
    s.ids = el.checked ? [...new Set([...s.ids, v])] : s.ids.filter(x => x !== v);
  } else if (kind === "text") s.text = el.value;
  else if (kind === "number") s.number = el.value;
  else if (kind === "boolean") s.bool = el.value;
}

const savedValueName = (ref, descId, valueId) => {
  const d = arr(ref?.descriptors).find(x => Number(x.id) === Number(descId));
  return arr(d?.values).find(v => Number(v.id) === Number(valueId))?.value;
};
const savedLabel = (ref, descId, id) => { const n = savedValueName(ref, descId, id); return n ? `${esc(n)} (saved, not currently offered)` : "Saved value (not currently offered)"; };

// Readonly summary of saved details when the whole product type is retired.
export function renderSavedSummary(classification, ref) {
  const rows = [];
  for (const d of arr(classification?.descriptors)) {
    const def = arr(ref?.descriptors).find(x => Number(x.id) === Number(d.descriptor_id));
    const name = def?.name || "Saved detail";
    let value;
    if (arr(d.value_ids).length) value = d.value_ids.map(id => savedValueName(ref, d.descriptor_id, id) || "Saved value").join(", ");
    else if (d.text_value != null) value = d.text_value;
    else if (d.number_value != null) value = `${d.number_value}${def?.unit ? ` ${def.unit}` : ""}`;
    else if (typeof d.boolean_value === "boolean") value = d.boolean_value ? "Yes" : "No";
    else continue;
    rows.push(`<div><dt>${esc(name)}</dt><dd>${esc(value)}</dd></div>`);
  }
  if (!rows.length) return "";
  return `<p class="lb-field-note">This product type is no longer offered. These saved details are kept as they are and cannot be edited.</p><dl class="lb-saved-details">${rows.join("")}</dl>`;
}

export function renderDescriptors(descriptors, state, ref) {
  return arr(descriptors).map(d => {
    const s = state[d.id] || { ids: [], text: "", number: "", bool: "" };
    const req = d.is_required ? ' <span class="lb-req" aria-hidden="true">Required</span>' : "";
    const attrs = `data-descriptor data-desc-id="${esc(d.id)}" data-desc-kind="${esc(d.input_type)}"${d.is_required ? " required" : ""}`;
    const label = `${esc(d.name)}${d.unit ? ` (${esc(d.unit)})` : ""}${req}`;
    const known = new Set(arr(d.values).map(v => Number(v.id)));
    const extra = s.ids.filter(id => !known.has(id));
    if (d.input_type === "single_select") {
      return `<label class="lb-field lb-descriptor">${label}<select ${attrs}><option value="">Choose</option>${extra.map(id => `<option value="${id}" selected>${savedLabel(ref, d.id, id)}</option>`).join("")}${arr(d.values).map(v => `<option value="${esc(v.id)}"${s.ids.includes(Number(v.id)) ? " selected" : ""}>${esc(v.value)}</option>`).join("")}</select></label>`;
    }
    if (d.input_type === "multi_select") {
      return `<fieldset class="lb-field lb-descriptor"><legend class="lb-field-label">${label}</legend><div class="lb-check-list">${extra.map(id => `<label class="lb-check-input"><input type="checkbox" ${attrs.replace(" required", "")} value="${id}" checked>${savedLabel(ref, d.id, id)}</label>`).join("")}${arr(d.values).map(v => `<label class="lb-check-input"><input type="checkbox" ${attrs.replace(" required", "")} value="${esc(v.id)}"${s.ids.includes(Number(v.id)) ? " checked" : ""}>${esc(v.value)}</label>`).join("") || '<span class="lb-muted">No approved values yet.</span>'}</div></fieldset>`;
    }
    if (d.input_type === "boolean") {
      return `<label class="lb-field lb-descriptor">${label}<select ${attrs}><option value="">Not set</option><option value="true"${s.bool === "true" ? " selected" : ""}>Yes</option><option value="false"${s.bool === "false" ? " selected" : ""}>No</option></select></label>`;
    }
    if (d.input_type === "number") {
      return `<label class="lb-field lb-descriptor">${label}<input ${attrs} type="number" step="any" value="${esc(s.number)}"></label>`;
    }
    return `<label class="lb-field lb-descriptor">${label}<input ${attrs} type="text" maxlength="4000" value="${esc(s.text)}"></label>`;
  }).join("");
}

// Returns undefined (send nothing), {clear:true,expected_revision}, or a full classification. Throws merchant-readable errors.
export function buildClassification({ initial, revision, typeId, categoryId, subcategoryId, axes = [], savedAxes = [], options = [], descriptors = [], descriptorState = {} }) {
  const expected_revision = Number.isInteger(initial?.expected_revision) ? initial.expected_revision : Number.isInteger(revision) ? revision : 0;
  const type = posInt(typeId);
  if (!type) return initial?.product_type_id ? { clear: true, expected_revision } : undefined;
  const category_id = posInt(categoryId), subcategory_id = posInt(subcategoryId);
  if (!category_id || !subcategory_id) throw new Error("Choose a category and subcategory before choosing a product type.");
  const sameType = Number(initial?.product_type_id) === type;
  const out = { category_id, subcategory_id, product_type_id: type, expected_revision, options: [], descriptors: [] };
  for (const axis of axes) {
    const active = options.find(o => o.name === axis.name);
    const si = sameType ? savedAxes.findIndex(a => a.name === axis.name) : -1;
    const saved = si >= 0 ? arr(initial.options)[si] : null;
    const savedIds = si >= 0 && saved ? arr(saved.value_ids) : [];
    const option_id = active ? active.id : saved?.option_id;
    if (!posInt(option_id)) throw new Error(`${axis.name || "This option"} is not an approved option for this product type. Remove it or choose an approved option.`);
    const value_ids = axis.values.map(v => {
      const found = active?.values.find(x => x.value === v)?.id;
      if (posInt(found)) return Number(found);
      const idx = si >= 0 ? savedAxes[si].values.indexOf(v) : -1;
      if (saved && Number(saved.option_id) === Number(option_id) && idx >= 0 && posInt(savedIds[idx])) return Number(savedIds[idx]);
      throw new Error(`"${v}" is not an approved value for ${axis.name}. Remove it or choose an approved value.`);
    });
    out.options.push({ option_id: Number(option_id), value_ids });
  }
  const activeIds = new Set(arr(descriptors).map(d => Number(d.id)));
  for (const d of arr(descriptors)) {
    const s = descriptorState[d.id] || { ids: [], text: "", number: "", bool: "" };
    const row = { descriptor_id: Number(d.id) };
    if (d.input_type === "single_select" || d.input_type === "multi_select") {
      const savedIds = new Set(sameType ? arr(arr(initial.descriptors).find(x => Number(x.descriptor_id) === Number(d.id))?.value_ids).map(Number) : []);
      const allowed = new Set(arr(d.values).map(v => Number(v.id)));
      const bad = s.ids.find(id => !allowed.has(Number(id)) && !savedIds.has(Number(id)));
      if (bad !== undefined) throw new Error(`Choose an approved value for ${d.name}.`);
      if (s.ids.length) row.value_ids = d.input_type === "single_select" ? [s.ids[0]] : [...s.ids];
    } else if (d.input_type === "text") {
      const t = String(s.text).trim();
      if ([...t].length > 4000) throw new Error(`Keep ${d.name} within 4000 characters.`);
      if (t) row.text_value = t;
    } else if (d.input_type === "number") {
      if (String(s.number).trim() !== "") {
        const n = Number(s.number);
        if (!Number.isFinite(n)) throw new Error(`Enter a number for ${d.name}.`);
        row.number_value = n;
      }
    } else if (d.input_type === "boolean") {
      if (s.bool === "true" || s.bool === "false") row.boolean_value = s.bool === "true";
    }
    if (Object.keys(row).length === 1) {
      if (d.is_required) throw new Error(`Fill in ${d.name} for this product type.`);
      continue;
    }
    out.descriptors.push(row);
  }
  if (sameType) for (const d of arr(initial.descriptors)) if (!activeIds.has(Number(d.descriptor_id))) out.descriptors.push(d);
  return out;
}
