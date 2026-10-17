/**
 * Collapsible design workspace for Ann. It drives the SAME attachAnnDesign
 * controller used by the standalone theme editor, so there is one draft.
 * Pure helpers (sectionMeta, nextSections) are exported for unit tests.
 */
import { designSections } from "./ann-section-layout.js";
import { ANN_EXTRA_SECTIONS, ANN_SECTION_LABELS, ANN_PALETTES, ANN_FONTS } from "./ann-config.js";
import { DESIGN_COPY_LIMITS, DESIGN_MEDIA_KEYS } from "./ann-design-model.js";

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const FIELD_LABELS = { kicker: "Intro line", title: "Main headline", description: "Introduction", button: "Main button text", statement: "Brand statement", products: "Products heading", collections: "Collections heading", about: "About page heading", story0: "Story paragraph 1", story1: "Story paragraph 2", story2: "Story paragraph 3", footer: "Footer text", hero: "Main photo", lifestyle: "Lifestyle photo", collection0: "First collection photo", collection1: "Second collection photo" };

/** Section metadata for one page: Map id -> {label, required, hidden, index, count}. */
export function sectionMeta(baseHtml, sectionsCfg = {}, page = "home") {
  const items = designSections(baseHtml, page).sections;
  const cfg = sectionsCfg?.[page] || {};
  const map = new Map(items.map(i => [i.id, i]));
  const order = [...(cfg.order || []), ...items.map(i => i.id)].filter((id, i, a) => a.indexOf(id) === i && map.has(id));
  const meta = new Map();
  order.forEach((id, i) => meta.set(id, { label: map.get(id).label, required: Boolean(map.get(id).required), hidden: Boolean(cfg.hidden?.includes(id)), index: i, count: order.length }));
  return { meta, map, order };
}
/** New sections value after move/toggle, or null when the action is not allowed. */
export function nextSections(baseHtml, sectionsCfg, page, id, act) {
  const { map } = sectionMeta(baseHtml, sectionsCfg, page);
  if (!id || !map.has(id) || map.get(id).required) return null;
  const all = structuredClone(sectionsCfg || {}), cfg = all[page] ||= { order: [], hidden: [] };
  cfg.order = [...(cfg.order || []), ...[...map.keys()]].filter((x, i, a) => a.indexOf(x) === i && map.has(x));
  cfg.hidden ||= [];
  if (act === "toggle") cfg.hidden = cfg.hidden.includes(id) ? cfg.hidden.filter(x => x !== id) : [...cfg.hidden, id];
  else {
    const i = cfg.order.indexOf(id), j = i + (act === "up" ? -1 : 1);
    if (i < 0 || j < 0 || j >= cfg.order.length || map.get(cfg.order[j])?.required) return null;
    [cfg.order[i], cfg.order[j]] = [cfg.order[j], cfg.order[i]];
  }
  return all;
}

export function attachAnnWorkspace(o) {
  const { mount, readOnly } = o;
  let tab = "sections", open = false;
  mount.hidden = true;
  const tabs = [["sections", "Sections"], ["content", "Content"], ["style", "Style"]];
  function body() {
    const c = o.controller(), ready = Boolean(c?.active() && o.canEdit());
    if (!ready) return `<p class="ann-note">Adopt your style at the Style step to edit your store here. Showcase styles are never edited.</p>`;
    const page = o.getPage(), plan = o.getPlan();
    if (tab === "content") return `<div class="ann-ws-list"><h3>Text</h3>${Object.keys(DESIGN_COPY_LIMITS).map(k => `<button type="button" data-ws-edit="copy" data-key="${k}"${readOnly ? " disabled" : ""}>${esc(FIELD_LABELS[k] || k)}</button>`).join("")}<h3>Photos</h3>${DESIGN_MEDIA_KEYS.map(k => `<button type="button" data-ws-edit="image" data-key="${k}"${readOnly ? " disabled" : ""}>${esc(FIELD_LABELS[k] || k)}</button>`).join("")}</div>`;
    if (tab === "style") return `<div class="ann-ws-list"><label class="ann-field">Background<select data-ws-plan="color_preset"${readOnly ? " disabled" : ""}>${ANN_PALETTES.map(v => `<option${plan.color_preset === v ? " selected" : ""}>${esc(v)}</option>`).join("")}</select></label><label class="ann-field">Font style<select data-ws-plan="font_preset"${readOnly ? " disabled" : ""}>${ANN_FONTS.map(v => `<option${plan.font_preset === v ? " selected" : ""}>${esc(v)}</option>`).join("")}</select></label><label class="ann-field">Button and highlight colour<input type="color" data-ws-plan="accent_color" value="${esc(plan.accent_color || "#661329")}"${readOnly ? " disabled" : ""}></label></div>`;
    const { meta } = o.sectionInfo(), extras = ANN_EXTRA_SECTIONS[page] || [];
    return `<div class="ann-ws-list"><h3>${esc(page)} page</h3>${[...meta].map(([id, x]) => { const lock = readOnly || x.required, n = esc(x.label); return `<div class="ann-ws-sec${x.hidden ? " off" : ""}"><button type="button" data-ws-edit="section" data-key="${esc(id)}"${readOnly ? " disabled" : ""}>${n}${x.hidden ? " (removed)" : x.required ? " (protected)" : ""}</button><span><button type="button" data-ws-sec="${esc(id)}" data-act="up" aria-label="Move ${n} up"${lock || x.index <= 0 ? " disabled" : ""}>Up</button><button type="button" data-ws-sec="${esc(id)}" data-act="down" aria-label="Move ${n} down"${lock || x.index >= x.count - 1 ? " disabled" : ""}>Down</button><button type="button" data-ws-sec="${esc(id)}" data-act="toggle"${lock ? " disabled" : ""}>${x.hidden ? "Restore" : "Remove"}</button></span></div>`; }).join("") || '<p class="ann-note">This page has a fixed shopping layout.</p>'}${extras.length ? `<fieldset class="ann-ws-opt"><legend>Optional sections</legend>${extras.map(t => `<label class="ann-check"><input type="checkbox" data-ws-extra="${t}"${plan.section_options?.[page]?.includes(t) ? " checked" : ""}${readOnly ? " disabled" : ""}> ${esc(ANN_SECTION_LABELS[t] || t)}</label>`).join("")}</fieldset>` : ""}</div>`;
  }
  function paint() {
    mount.hidden = !open;
    if (!open) return;
    mount.innerHTML = `<div class="ann-ws-head"><strong>Design tools</strong><button type="button" class="ann-btn alt sm" data-ws-close>Close</button></div><div class="ann-ws-tabs" role="tablist">${tabs.map(([k, t]) => `<button type="button" role="tab" aria-selected="${k === tab}" data-ws-tab="${k}">${t}</button>`).join("")}</div>${body()}`;
  }
  mount.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    const c = o.controller();
    if (b.dataset.wsTab) { tab = b.dataset.wsTab; paint(); }
    else if ("wsClose" in b.dataset) api.close();
    else if (b.dataset.wsEdit) c?.selectContent(b.dataset.wsEdit, b.dataset.key);
    else if (b.dataset.wsSec && !readOnly) o.onSectionAction(b.dataset.wsSec, b.dataset.act);
  });
  mount.addEventListener("change", e => {
    const n = e.target; if (readOnly) return;
    if (n.dataset.wsPlan) o.setPlan(n.dataset.wsPlan, n.value);
    if (n.dataset.wsExtra) o.setExtra(n.dataset.wsExtra, n.checked);
  });
  const api = {
    isOpen: () => open,
    open() { open = true; paint(); o.onToggle?.(true); },
    close() { open = false; paint(); o.onToggle?.(false); },
    toggle() { open ? api.close() : api.open(); },
    refresh() { if (open) paint(); },
  };
  return api;
}
