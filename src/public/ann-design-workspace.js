/**
 * Shared design workspace for Ann. Both the Ann builder drawer and the standalone
 * theme editor sidebar render THIS component (tabs: Sections, Content, Style, Menus)
 * and drive the same attachAnnDesign controller, so there is one draft.
 * Pure helpers (sectionMeta, nextSections, applyMenuAction) are exported for tests.
 */
import { designSections } from "./ann-section-layout.js";
import { ANN_EXTRA_SECTIONS, ANN_SECTION_LABELS, ANN_PALETTES, ANN_FONTS } from "./ann-config.js";
import { DESIGN_COPY_LIMITS, DESIGN_MEDIA_KEYS } from "./ann-design-model.js";
import { openSectionLibrary } from "./section-library-ui.js";
import { sectionDisplayName, selectedLibraryTypes } from "./section-library.js";
import { attachSectionDrag } from "./section-drag.js";
import { INSTANCE_PAGES, SECTION_INSTANCE_LIMIT, isInstanceId, instanceCount, selectableRecords } from "./section-insert-rules.js";
import { MAX_MENU_ITEMS, MAX_MENU_CHILDREN, defaultDesignMenus } from "./ann-menu-model.js";

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const FIELD_LABELS = { kicker: "Intro line", title: "Main headline", description: "Introduction", button: "Main button text", statement: "Brand statement", products: "Products heading", collections: "Collections heading", about: "About page heading", story0: "Story paragraph 1", story1: "Story paragraph 2", story2: "Story paragraph 3", footer: "Footer text", hero: "Main photo", lifestyle: "Lifestyle photo", collection0: "First collection photo", collection1: "Second collection photo" };
export const WORKSPACE_TABS = [["sections", "Sections"], ["content", "Content"], ["style", "Style"], ["menus", "Menus"]];
export const MAX_MENU_LINKS = 60;
const PAGE_LABEL = p => p[0].toUpperCase() + p.slice(1);

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

const linkCount = list => (list || []).reduce((n, l) => n + 1 + (l.children?.length || 0), 0);
export const menuLinkTotal = menus => linkCount(menus?.header) + linkCount(menus?.footer);
/**
 * Pure menu edit. act: add | addchild | up | down | remove, on menus[which] at index i
 * (and child index j). Returns a new menus value, or null when the action is not allowed.
 */
export function applyMenuAction(menus, which, act, i, j) {
  if (!["header", "footer"].includes(which)) return null;
  const next = structuredClone(menus || { header: [], footer: [] });
  const list = next[which] ||= [];
  const hasJ = j !== undefined && j !== null && j !== "";
  if (menuLinkTotal(next) >= MAX_MENU_LINKS && (act === "add" || act === "addchild")) return null;
  if (act === "add") { if (list.length >= MAX_MENU_ITEMS) return null; list.push({ label: "New link", url: "/" }); return next; }
  const parent = list[i]; if (!parent) return null;
  if (act === "addchild") { const kids = parent.children ||= []; if (kids.length >= MAX_MENU_CHILDREN) return null; kids.push({ label: "New link", url: "/" }); return next; }
  const arr = hasJ ? parent.children : list, k = hasJ ? Number(j) : Number(i);
  if (!arr || !arr[k]) return null;
  if (act === "remove") { arr.splice(k, 1); if (hasJ && !arr.length) delete parent.children; return next; }
  const t = k + (act === "up" ? -1 : 1);
  if (act === "up" || act === "down") { if (t < 0 || t >= arr.length) return null; [arr[k], arr[t]] = [arr[t], arr[k]]; return next; }
  return null;
}
/** Set label or url on one menu link (pure). */
export function setMenuField(menus, which, i, j, field, value) {
  const next = structuredClone(menus || { header: [], footer: [] });
  const hasJ = j !== undefined && j !== null && j !== "";
  const item = hasJ ? next[which]?.[i]?.children?.[j] : next[which]?.[i];
  if (!item || !["label", "url"].includes(field)) return next;
  item[field] = value; return next;
}
/** Existing destinations offered by the link picker. */
export function menuDestinations(data = {}) {
  const pick = (list, fn) => (list || []).filter(x => x && x.status !== "archived").map(fn).filter(Boolean);
  const groups = [
    ["Pages", [["Home", "/"], ["Cart", "/cart"], ["About", "/pages/about"], ["Contact", "/pages/contact"]]],
    ["Collections", pick(data.collections, c => { const k = c.slug || c.id; return k ? [c.name || c.title || String(k), `/collections/${encodeURIComponent(k)}`] : null; })],
    ["Products", pick(data.products, p => p.id ? [p.name || p.title || String(p.id), `/products/${encodeURIComponent(p.id)}`] : null)],
    ["Policies", pick(data.policies, p => { const k = p.kind || p.type || p.slug; return k ? [p.title || PAGE_LABEL(String(k).replace(/[-_]/g, " ")), `/policies/${encodeURIComponent(k)}`] : null; })],
  ];
  return groups.filter(g => g[1].length);
}

const ICON = path => `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
const I_GRIP = `<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><circle cx="5" cy="3" r="1.2"/><circle cx="9" cy="3" r="1.2"/><circle cx="5" cy="7" r="1.2"/><circle cx="9" cy="7" r="1.2"/><circle cx="5" cy="11" r="1.2"/><circle cx="9" cy="11" r="1.2"/></svg>`, I_DUP = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><rect x="4.5" y="4.5" width="7" height="7" rx="1"/><path d="M9.5 2.5h-6a1 1 0 0 0-1 1v6"/></svg>`;
const I_UP = ICON("M7 11V3M3.5 6.5 7 3l3.5 3.5"), I_DOWN = ICON("M7 3v8M3.5 7.5 7 11l3.5-3.5"), I_DEL = ICON("M4 4l6 6M10 4l-6 6"), I_ADD = ICON("M3 7h8M7 3v8");
const focusKey = el => el?.dataset ? el.tagName + "|" + Object.entries(el.dataset).map(([k, v]) => `${k}=${v}`).join("|") : "";

/**
 * options: mount, variant ("drawer" | "sidebar"), readOnly, controller(), canEdit(), getPage(), setPage(p), pages,
 * getPlan(), setPlan(k,v), setExtra(type,on), sectionInfo(), onSectionAction(id,act), getData(), onOwn(), getNote(),
 * onToggle(open). The sidebar variant is always open and exposes slot() for the design card.
 */
export function attachAnnWorkspace(o) {
  const { mount, readOnly } = o, sidebar = o.variant === "sidebar";
  const pages = o.pages || ["home", "collection", "product", "cart", "checkout", "about", "contact"];
  let tab = "sections", open = sidebar, draftMenus = null, draftBase = "", menuError = "", menuNote = "",seenMenuRevision=null;
  mount.classList.add("aw", sidebar ? "aw-sidebar" : "aw-drawer");
  mount.dataset.tab = tab;
  mount.hidden = !open;
  mount.innerHTML = `${sidebar ? "" : `<div class="aw-head"><strong>Design workspace</strong><button type="button" class="aw-close" data-ws-close>Close</button></div>`}
<div class="aw-side-head"><p class="aw-kicker">Design workspace</p><p class="aw-lede" data-ws-note></p></div>
<div class="aw-pages"><label class="aw-label">Editing page<select data-ws-page>${pages.map(p => `<option value="${p}">${esc(PAGE_LABEL(p))}</option>`).join("")}</select></label>${o.onOwn ? `<button type="button" class="aw-own" data-ws-own>Use my own products</button>` : ""}</div>
<div class="aw-slot" data-ws-slot></div>
<div class="aw-tablist" role="tablist" aria-label="Design panels">${WORKSPACE_TABS.map(([k, t]) => `<button type="button" role="tab" id="aw-tab-${k}" data-ws-tab="${k}" aria-controls="aw-panel" aria-selected="${k === tab}" tabindex="${k === tab ? 0 : -1}">${t}</button>`).join("")}</div>
<div class="aw-panel" id="aw-panel" role="tabpanel" aria-labelledby="aw-tab-sections" data-ws-panel></div><div class="aw-live" role="status" aria-live="polite" data-ws-live></div>`;
  const q = s => mount.querySelector(s), panel = q("[data-ws-panel]");
  const ready = () => { const c = o.controller(); return Boolean(c?.active() && o.canEdit()); };
  const off = () => readOnly ? " disabled" : "";

  function modelMenus() {
    let m = null; try { m = o.controller()?.getMenus?.(); } catch { m = null; }
    return m && typeof m === "object" ? m : defaultDesignMenus();
  }
  function currentMenus() {
    const revision=o.controller()?.getMenuRevision?.()??null;
    if(revision!==seenMenuRevision){draftMenus=null;menuError="";menuNote="";seenMenuRevision=revision;}
    // A local invalid draft survives ordinary refreshes; undo or load changing the model discards it.
    if (draftMenus && JSON.stringify(modelMenus()) !== draftBase) { draftMenus = null; menuError = ""; o.controller()?.setMenuDraftError?.(""); }
    return draftMenus || modelMenus();
  }
  function tryMenus(next, opts) {
    const c = o.controller();
    try {
      const r = opts ? c.setMenus(next, opts) : c.setMenus(next);
      if (r && r.ok === false) throw new Error(r.error || r.errors?.[0]?.message || r.errors?.[0] || "These links could not be saved.");
      draftMenus = null; menuError = ""; return true;
    } catch (e) {
      draftBase = JSON.stringify(modelMenus()); draftMenus = next; menuError = String(e?.message || e || "These links could not be used.");
      try { c.setMenuDraftError?.(menuError); } catch { /* gate is optional */ }
      return false;
    }
  }
  function commitMenus(next) {
    menuNote = tryMenus(next) ? "Menu updated. Save draft to keep it." : "";
    paintPanel();
  }

  const instancesOn = () => !readOnly && typeof o.controller()?.addSection === "function" && INSTANCE_PAGES.includes(o.getPage());
  const canEditSecs = () => { const c = o.controller(); return !readOnly && ready() && (typeof c?.canEditSections === "function" ? c.canEditSections() !== false : c?.canPublish?.() !== false); };
  const say = text => { const l = q("[data-ws-live]"); if (l) l.textContent = text; };
  function sectionsPanel() {
    const page = o.getPage(), plan = o.getPlan(), { meta } = o.sectionInfo(), extras = ANN_EXTRA_SECTIONS[page] || [], inst = instancesOn();
    const ids = [...meta.keys()], used = instanceCount(ids), canGap = inst && used < SECTION_INSTANCE_LIMIT;
    const gap = after => canGap ? `<button type="button" class="aw-gap" data-ws-insert="${esc(after)}" aria-label="Insert a section ${after ? "after " + esc(meta.get(after)?.label || "this section") : "at the start"}"><span>${I_ADD}Insert here</span></button>` : "";
    const rows = ids.map((id, n) => { const x = meta.get(id), lock = readOnly || x.required, nm = esc(x.label), k = esc(id), mine = isInstanceId(id);
      const grip = x.required || readOnly ? `<span class="aw-grip is-off" aria-hidden="true"></span>` : `<button type="button" class="aw-grip" data-ws-grip="${k}" aria-pressed="false" title="Drag to reorder" aria-label="Reorder ${nm}. Press Space to pick up, arrows to move, Space to drop."${""}>${I_GRIP}</button>`;
      const acts = mine ? `<button type="button" data-ws-dup="${k}" title="Duplicate" aria-label="Duplicate ${nm}"${lock || used >= SECTION_INSTANCE_LIMIT ? " disabled" : ""}>${I_DUP}</button><button type="button" data-ws-del="${k}" title="Delete section" aria-label="Delete ${nm}"${lock ? " disabled" : ""}>${I_DEL}</button>`
        : `<button type="button" data-ws-sec="${k}" data-act="toggle" title="${x.hidden ? "Restore section" : "Remove section"}" aria-label="${x.hidden ? "Restore" : "Remove"} ${nm}"${lock ? " disabled" : ""}>${x.hidden ? I_ADD : I_DEL}</button>`;
      const row = `<div class="aw-sec${x.hidden ? " is-off" : ""}${mine ? " is-mine" : ""}${x.required ? " is-core" : ""}" data-sec-row="${k}">${grip}<button type="button" class="aw-sec-name" data-ws-edit="section" data-key="${k}"${off()}>${nm}${x.hidden ? "<small>Removed</small>" : x.required ? "<small>Protected</small>" : mine ? "<small>Added section</small>" : ""}</button><span class="aw-acts"><button type="button" data-ws-sec="${k}" data-act="up" title="Move up" aria-label="Move ${nm} up"${lock || x.index <= 0 ? " disabled" : ""}>${I_UP}</button><button type="button" data-ws-sec="${k}" data-act="down" title="Move down" aria-label="Move ${nm} down"${lock || x.index >= x.count - 1 ? " disabled" : ""}>${I_DOWN}</button>${acts}</span></div>`;
      return (n === 0 && x.required ? "" : n === 0 ? gap("") : "") + row + gap(id); }).join("");
    const legacy = (plan.section_options?.[page] || []).filter(t => extras.includes(t));
    const addBtn = inst || extras.length ? `<div class="aw-opt"><button type="button" class="aw-add aw-libopen" data-ws-library aria-haspopup="dialog"${off()}>Add section</button>${typeof o.controller()?.undo === "function" ? `<button type="button" class="aw-mini aw-undo" data-ws-undo${readOnly || !o.controller().canUndo?.() ? " disabled" : ""}>Undo last edit</button>` : ""}${inst ? `<p class="aw-muted">${used} of ${SECTION_INSTANCE_LIMIT} added sections used on this page.</p>` : legacy.length ? `<p class="aw-muted">Optional on this page: ${legacy.map(t => esc(sectionDisplayName(t, ANN_SECTION_LABELS[t] || t))).join(", ")}</p>` : ""}</div>` : `<button type="button" class="aw-add aw-libopen" data-ws-library aria-haspopup="dialog">Browse section library</button>`;
    return `<div class="aw-ph"><h3>${esc(PAGE_LABEL(page))} page</h3><span>${meta.size} sections</span></div>${rows ? `<div class="aw-list" data-ws-list>${rows}</div>` : '<p class="aw-muted">This page has a fixed shopping layout.</p>'}${addBtn}`;
  }
  const contentPanel = () => `<div class="aw-gh">Text</div><div class="aw-list">${Object.keys(DESIGN_COPY_LIMITS).map(k => `<button type="button" class="aw-row" data-ws-edit="copy" data-key="${k}"${off()}>${esc(FIELD_LABELS[k] || k)}</button>`).join("")}</div><div class="aw-gh">Photos</div><div class="aw-list">${DESIGN_MEDIA_KEYS.map(k => `<button type="button" class="aw-row" data-ws-edit="image" data-key="${k}"${off()}>${esc(FIELD_LABELS[k] || k)}</button>`).join("")}</div>`;
  const stylePanel = () => { const plan = o.getPlan(); return `<div class="aw-ph"><h3>Colours and fonts</h3></div><label class="aw-field">Background<select data-ws-plan="color_preset"${off()}>${ANN_PALETTES.map(v => `<option${plan.color_preset === v ? " selected" : ""}>${esc(v)}</option>`).join("")}</select></label><label class="aw-field">Font style<select data-ws-plan="font_preset"${off()}>${ANN_FONTS.map(v => `<option${plan.font_preset === v ? " selected" : ""}>${esc(v)}</option>`).join("")}</select></label><label class="aw-field">Button and highlight colour<input type="color" data-ws-plan="accent_color" value="${esc(plan.accent_color || "#661329")}"${off()}></label>`; };

  function menuRow(which, item, i, j, count, dests) {
    const child = j !== "", a = `data-m="${which}" data-i="${i}" data-j="${j}"`, n = esc(item.label || "link"), pos = child ? `${i + 1}.${Number(j) + 1}` : String(i + 1);
    const known = dests.some(g => g[1].some(d => d[1] === item.url));
    const btn = (act, label, icon, dis) => `<button type="button" ${a} data-m-act="${act}" title="${label}" aria-label="${label} ${n}"${readOnly || dis ? " disabled" : ""}>${icon}</button>`;
    return `<li class="aw-link${child ? " is-child" : ""}"><div class="aw-link-top"><span class="aw-link-n">${pos}</span><input type="text" ${a} data-f="label" value="${esc(item.label)}" maxlength="60" aria-label="Link text ${pos}" placeholder="Link text"${off()}><span class="aw-acts">${btn("up", "Move up", I_UP, Number(child ? j : i) <= 0)}${btn("down", "Move down", I_DOWN, Number(child ? j : i) >= count - 1)}${btn("remove", "Remove", I_DEL, false)}</span></div>
<div class="aw-link-url"><select ${a} data-f="pick" aria-label="Choose destination for ${n}"${off()}><option value="__custom"${known ? "" : " selected"}>Custom address</option>${dests.map(([g, list]) => `<optgroup label="${g}">${list.map(([t, u]) => `<option value="${esc(u)}"${u === item.url ? " selected" : ""}>${esc(t)}</option>`).join("")}</optgroup>`).join("")}</select><input type="text" ${a} data-f="url" value="${esc(item.url)}" maxlength="500" aria-label="Link address ${pos}" placeholder="/pages/about or https://"${off()}></div></li>`;
  }
  function menusPanel() {
    const m = currentMenus(), dests = menuDestinations(o.getData?.() || {}), total = menuLinkTotal(m), full = total >= MAX_MENU_LINKS;
    const block = which => { const list = m[which] || [];
      return `<section class="aw-menu" aria-label="${PAGE_LABEL(which)} menu"><div class="aw-ph"><h3>${PAGE_LABEL(which)} menu</h3><span>${list.length} of ${MAX_MENU_ITEMS}</span></div>${list.length ? `<ul class="aw-links">${list.map((it, i) => menuRow(which, it, i, "", list.length, dests) + (it.children?.length ? `<li class="aw-kids"><ul class="aw-links">${it.children.map((c, j) => menuRow(which, c, i, String(j), it.children.length, dests)).join("")}</ul></li>` : "") + `<li class="aw-addkid"><button type="button" class="aw-mini" data-m="${which}" data-i="${i}" data-j="" data-m-act="addchild"${readOnly || full || (it.children?.length || 0) >= MAX_MENU_CHILDREN ? " disabled" : ""}>Add sub link to ${esc(it.label || "link")}</button></li>`).join("")}</ul>` : `<p class="aw-muted">No links. This menu stays empty in your store.</p>`}<button type="button" class="aw-add" data-m="${which}" data-i="" data-j="" data-m-act="add"${readOnly || full || list.length >= MAX_MENU_ITEMS ? " disabled" : ""}>Add ${which} link</button></section>`; };
    return `<p class="aw-muted">Choose a page, product, collection or policy, or type your own address. Safe local paths, https, mailto and tel links only. ${total} of ${MAX_MENU_LINKS} links used.</p>${menuError ? `<p class="aw-error" role="alert">${esc(menuError)} Your edit is kept here so you can fix it.</p>` : menuNote ? `<p class="aw-ok" role="status">${esc(menuNote)}</p>` : ""}${block("header")}${block("footer")}`;
  }

  function paintChrome() {
    const sel = q("[data-ws-page]"); if (sel && sel.value !== o.getPage()) sel.value = o.getPage();
    const own = q("[data-ws-own]"); if (own) own.disabled = readOnly || !o.controller()?.active();
    const note = o.getNote?.() || ""; q("[data-ws-note]").textContent = note; q("[data-ws-note]").hidden = !note;
    mount.querySelectorAll("[data-ws-tab]").forEach(b => { const on = b.dataset.wsTab === tab; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; });
    panel.setAttribute("aria-labelledby", `aw-tab-${tab}`); mount.dataset.tab = tab;
  }
  function paintPanel() {
    if (!open) return;
    paintChrome();
    const act = document.activeElement, inside = act && panel.contains(act), key = inside ? focusKey(act) : "", sel = inside && "selectionStart" in act ? [act.selectionStart, act.selectionEnd] : null, top = panel.scrollTop;
    let html;
    if (!ready()) html = `<p class="aw-muted">Adopt your style at the Style step to edit your store here. Showcase styles are never edited.</p><button type="button" class="aw-add aw-libopen" data-ws-library aria-haspopup="dialog">Browse section library</button>`;
    else html = tab === "content" ? contentPanel() : tab === "style" ? stylePanel() : tab === "menus" ? menusPanel() : sectionsPanel();
    panel.innerHTML = html; panel.scrollTop = top;
    if (key) { const el = [...panel.querySelectorAll("button,input,select")].find(e => focusKey(e) === key); if (el) { el.focus({ preventScroll: true }); if (sel) try { el.setSelectionRange(...sel); } catch { /* not text */ } } }
  }
  function setTab(t, focus) { tab = t; paintPanel(); if (focus) q(`[data-ws-tab="${t}"]`)?.focus(); }

  mount.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b || b.disabled || !mount.contains(b)) return;
    const c = o.controller(), d = b.dataset;
    if (d.wsTab) setTab(d.wsTab);
    else if ("wsClose" in d) api.close();
    else if ("wsOwn" in d) o.onOwn?.();
    else if ("wsLibrary" in d || "wsInsert" in d) {
      const pg = o.getPage(), after = "wsInsert" in d ? (d.wsInsert || null) : (() => { const k = [...o.sectionInfo().meta.keys()]; return k.length ? k[k.length - 1] : null; })();
      const modern = instancesOn() && ready();
      const common = { host: document.body, page: pg, allowedTypes: ANN_EXTRA_SECTIONS[pg] || [], ready: () => ready() && o.getPage() === pg, readOnly, returnFocus: () => q("[data-ws-library]"), onClose: () => paintPanel() };
      if (modern) {
        const instances = { afterId: after, limit: SECTION_INSTANCE_LIMIT, records: () => selectableRecords(o.getData?.() || {}), count: () => instanceCount(o.sectionInfo().meta.keys()),
          add(family, binding) { const order = [...o.sectionInfo().meta.keys()], id = o.controller().addSection(pg, family, binding, instances.afterId, order); paintPanel(); return id; } };
        openSectionLibrary({ ...common, instances });
      } else openSectionLibrary({
        ...common,
        selectedTypes: () => selectedLibraryTypes(o.getPlan().section_options?.[pg],o.sectionInfo()),
        onToggle: (t,on) => {
          if (!ready() || readOnly || o.getPage()!==pg || !ANN_EXTRA_SECTIONS[pg]?.includes(t))return;
          o.setExtra(t,on);
          if(on){
            const {meta,map}=o.sectionInfo();
            for(const [id,entry] of meta) if(entry.hidden&&map?.get(id)?.type===t)o.onSectionAction?.(id,"toggle");
          }
        },
      });
    }
    else if ("wsUndo" in d && !readOnly) { let ok = false; try { if (c.canUndo?.()) { c.undo(); ok = true; } } catch { ok = false; } say(ok ? "Last edit undone." : "Nothing to undo."); paintPanel(); mount.querySelector("[data-ws-undo]")?.focus?.({ preventScroll: true }); }
    else if (d.wsDup && !readOnly) { if (!canEditSecs()) { say("Editing is unavailable right now."); return; } try { const id = c.duplicateSection(o.getPage(), d.wsDup, [...o.sectionInfo().meta.keys()]); say(id ? "Section duplicated. Save draft to keep it." : "Section could not be duplicated."); paintPanel(); if (id) mount.querySelector(`[data-ws-edit][data-key="${CSS.escape(id)}"]`)?.focus?.({ preventScroll: true }); } catch (err) { say("Section could not be duplicated. " + String(err?.message || "")); paintPanel(); } }
    else if (d.wsDel && !readOnly) {
      if (!canEditSecs()) { say("Editing is unavailable right now."); return; }
      const ks = [...o.sectionInfo().meta.keys()], i = ks.indexOf(d.wsDel), near = ks[i + 1] ?? ks[i - 1];
      let ok = false; try { ok = c.removeSection(o.getPage(), d.wsDel) === true; } catch { ok = false; }
      say(ok ? "Section deleted. Use Undo last edit to bring it back." : "Section could not be deleted. Nothing changed."); paintPanel();
      (mount.querySelector(`[data-ws-edit][data-key="${CSS.escape(String(near ?? ""))}"]`) || mount.querySelector("[data-ws-library]"))?.focus?.({ preventScroll: true });
    }
    else if (d.wsEdit) c?.selectContent(d.wsEdit, d.key);
    else if (d.wsSec && !readOnly) o.onSectionAction(d.wsSec, d.act);
    else if (d.mAct && !readOnly && c) { const next = applyMenuAction(currentMenus(), d.m, d.mAct, d.i === "" ? undefined : Number(d.i), d.j); if (next) commitMenus(next); }
  });
  mount.addEventListener("keydown", e => {
    const t = e.target.closest?.("[data-ws-tab]");
    if (!t || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const ids = WORKSPACE_TABS.map(x => x[0]), i = ids.indexOf(t.dataset.wsTab), n = ids.length;
    setTab(ids[e.key === "Home" ? 0 : e.key === "End" ? n - 1 : (i + (e.key === "ArrowRight" ? 1 : n - 1)) % n], true);
  });
  // Typing only updates a local draft; the shared controller is updated on change (blur or Enter) so focus is never lost.
  mount.addEventListener("input", e => {
    const n = e.target; if (readOnly || n.dataset.f === undefined || n.dataset.f === "pick" || !o.controller()?.setMenus) return;
    const had = Boolean(menuError);
    const ok = tryMenus(setMenuField(currentMenus(), n.dataset.m, Number(n.dataset.i), n.dataset.j, n.dataset.f, n.value), { typing: true });
    if (ok) menuNote = "";
    if (had !== !ok || !ok) paintPanel();
  });
  mount.addEventListener("change", e => {
    const n = e.target;
    if (n.dataset.wsPage !== undefined) { o.setPage(n.value); return; }
    if (readOnly) return;
    if (n.dataset.wsPlan) o.setPlan(n.dataset.wsPlan, n.value);
    if (n.dataset.f === "pick" && o.controller()?.setMenus) {
      const m = n.dataset.m, i = Number(n.dataset.i), j = n.dataset.j;
      const next = n.dataset.f === "pick" ? (n.value === "__custom" ? currentMenus() : setMenuField(currentMenus(), m, i, j, "url", n.value)) : setMenuField(currentMenus(), m, i, j, n.dataset.f, n.value);
      commitMenus(next);
    }
  });
  attachSectionDrag({
    root: panel, scroller: () => mount,
    getOrder: () => [...o.sectionInfo().meta.keys()],
    locked: id => Boolean(o.sectionInfo().meta.get(id)?.required),
    label: id => o.sectionInfo().meta.get(id)?.label || "Section",
    announce: say,
    canDrag: canEditSecs,
    onDrop: order => {
      const c = o.controller(), pg = o.getPage(); if (!canEditSecs() || !c?.setSections) return false;
      const cfg = structuredClone(c.previewDesign?.()?.sections || {}); const e = cfg[pg] ||= { order: [], hidden: [] };
      e.order = order; e.hidden ||= [];
      const r = c.setSections(cfg); if (r === false || r?.ok === false) return false;
      paintPanel(); return true;
    },
  });
  const api = {
    isOpen: () => open,
    slot: () => q("[data-ws-slot]"),
    open() { open = true; mount.hidden = false; paintPanel(); o.onToggle?.(true); },
    close() { if (sidebar) return; open = false; mount.hidden = true; o.onToggle?.(false); },
    toggle() { open ? api.close() : api.open(); },
    refresh() { if (open) paintPanel(); },
    setTab,
  };
  if (sidebar) paintPanel();
  return api;
}
