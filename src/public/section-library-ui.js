/**
 * Visual section library dialog. Browse every section family across themes; add or remove
 * only the optional sections the current page supports, through the injected onToggle.
 */
import { bindingFor, needsRecord, usableKinds, bindingKinds, KIND_LABEL } from "./section-insert-rules.js";
import { SECTION_CATEGORIES, SECTION_THEMES, libraryEntries, sectionDisplayName } from "./section-library.js";
import {sectionLayouts} from "./section-layouts.js";
import {renderSectionLayoutPreview} from "./section-layout-preview.js";

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const cap = s => String(s || "").replace(/[-_]/g, " ").replace(/^./, c => c.toUpperCase());
const themeName = id => SECTION_THEMES.find(t=>t.id===id)?.name||cap(id);

/** Neutral layout illustration, deterministic per entry. Not a theme screenshot. */
export function layoutIllustration(id) {
  const a = "#cbb9c1", b = "#6b1735", f = "#efe4e8";
  const category = libraryEntries().find(item=>item.id===id)?.category;
  const v = ["products","trust","offers"].includes(category) ? 2
    : ["brand","images"].includes(category) || id==="hero-banner" ? 1
    : ["information","help","layout"].includes(category) ? 3 : 0;
  const blocks = [
    `<rect x="12" y="12" width="56" height="6" fill="${b}"/><rect x="12" y="24" width="96" height="4" fill="${a}"/><rect x="12" y="34" width="80" height="4" fill="${a}"/><rect x="12" y="50" width="30" height="8" fill="${b}"/>`,
    `<rect x="12" y="12" width="42" height="46" fill="${f}" stroke="${a}"/><rect x="62" y="14" width="46" height="6" fill="${b}"/><rect x="62" y="26" width="46" height="4" fill="${a}"/><rect x="62" y="36" width="36" height="4" fill="${a}"/>`,
    `<rect x="12" y="14" width="28" height="30" fill="${f}" stroke="${a}"/><rect x="46" y="14" width="28" height="30" fill="${f}" stroke="${a}"/><rect x="80" y="14" width="28" height="30" fill="${f}" stroke="${a}"/><rect x="12" y="50" width="96" height="4" fill="${a}"/>`,
    `<rect x="12" y="12" width="96" height="8" fill="${f}" stroke="${a}"/><rect x="12" y="26" width="96" height="8" fill="${f}" stroke="${a}"/><rect x="12" y="40" width="96" height="8" fill="${f}" stroke="${a}"/><rect x="12" y="54" width="40" height="4" fill="${b}"/>`,
  ];
  return `<svg class="sl-art" viewBox="0 0 120 70" role="img" aria-label="Layout illustration" focusable="false"><rect x=".5" y=".5" width="119" height="69" fill="#fff" stroke="${a}" stroke-dasharray="3 2"/>${blocks[v]}</svg>`;
}

export function openSectionLibrary(o) {
  const { host, page } = o;
  const allowed = o.allowedTypes || [];
  const prev = document.activeElement;
  const previousOverflow=document.body.style.overflow;
  document.body.style.overflow="hidden";
  const inst = o.instances || null;
  const edit = o.editInstance || null;
  const st = { query: "", category: "", theme: "", detail: edit ? edit.family : null, msg: "", err: false, kind: "", rec: "", layout: edit?.layout || "original", mods: null, token: 0 };
  const layoutId = () => (st.layout && st.layout !== "original" ? st.layout : undefined);
  const root = document.createElement("div");
  root.className = "sl-back";
  root.innerHTML = `<div class="sl" role="dialog" aria-modal="true" aria-labelledby="sl-title" tabindex="-1"></div>`;
  host.appendChild(root);
  const dlg = root.firstElementChild;
  const can = () => !o.readOnly && Boolean(o.ready());
  const themes = () => [...new Set((o.themes || []).concat(libraryEntries({ allowedTypes: allowed, selectedTypes: [] }).flatMap(e => e.themeIds || [])))];
  const lift = items => inst ? items.map(e => ({ ...e, available: e.kind !== "global" && bindingKinds(e.id, page).length > 0, selected: false })) : items;
  const list = () => lift(libraryEntries({ query: st.query, category: st.category, theme: st.theme, allowedTypes: allowed, selectedTypes: o.selectedTypes?.() || [] }));
  const full = () => inst && inst.count() >= inst.limit;
  const recs = () => inst.records();
  function bindingUi(e) {
    const u = usableKinds(e.id, page, recs());
    if (!u.kinds.length) return { html: `<p class="sl-note" data-sl-why>${esc(u.reason)}</p>`, ok: false };
    if (!u.kinds.includes(st.kind)) st.kind = u.kinds[0];
    const r = recs(), pool = st.kind === "product" ? r.products : r.collections;
    if (needsRecord(st.kind) && !pool.some(x => x.id === st.rec)) st.rec = pool[0]?.id || "";
    const kindSel = u.kinds.length > 1 ? `<label class="sl-bind">Shows<select data-sl-kind>${u.kinds.map(k => `<option value="${k}"${k === st.kind ? " selected" : ""}>${esc(KIND_LABEL[k])}</option>`).join("")}</select></label>` : `<p class="sl-note">${esc(KIND_LABEL[st.kind])}.</p>`;
    const recSel = needsRecord(st.kind) ? `<label class="sl-bind">${st.kind === "product" ? "Product" : "Collection"}<select data-sl-rec>${pool.map(x => `<option value="${esc(x.id)}"${x.id === st.rec ? " selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label>` : "";
    return { html: kindSel + recSel, ok: true };
  }

  function card(e) {
    const act = inst ? `<span class="sl-tag ${e.available ? "is-on" : ""}">${e.available ? "Can add here" : "View only"}</span>` : e.available
      ? `<span class="sl-tag ${e.selected ? "is-on" : ""}">${e.selected ? "On this page" : "Available on this page"}</span>`
      : `<span class="sl-tag">View only</span>`;
    return `<li class="sl-item"><button type="button" class="sl-open" data-sl-open="${esc(e.id)}">${layoutIllustration(e.id)}<strong>${esc(e.name)}</strong><span class="sl-desc">${esc(e.description)}</span>${act}</button></li>`;
  }
  const layoutList = fam => [{ id: "original", name: "Original", description: "Original balanced section arrangement." }, ...(st.mods?.sectionLayouts?.(fam) || []).filter(l => l.id !== "original")];
  function layoutUi(e) {
    if (!(inst || edit) || !o.context) return "";
    if (!st.mods) return `<p class="sl-note" role="status">Loading layouts.</p>`;
    if (!st.mods.sectionLayouts) return "";
    const ls = layoutList(e.id);
    if (!ls.some(l => l.id === st.layout)) st.layout = "original";
    return `<fieldset class="sl-lay"><legend>Theme-inspired layouts</legend><div class="sl-lays">${ls.map(l => `<button type="button" class="sl-lay-b" data-sl-layout="${esc(l.id)}" aria-pressed="${l.id === st.layout}" title="${esc(l.description || "")}"><strong>${esc(l.name)}</strong><small>${l.themeId ? esc(themeName(l.themeId)) : "Current"}</small></button>`).join("")}</div></fieldset><div class="sl-prev"><div class="sl-prev-h"><span>Preview of the selected layout</span><span>Sample using your store content</span></div><div data-sl-prev><p class="sl-prev-wait">Preparing preview.</p></div></div><p class="sl-note">These are theme-inspired arrangements. Your store colours and fonts stay the same.</p>`;
  }
  function previewInstance(fam) {
    if (edit) return { ...edit, layout: layoutId() };
    return { id: "preview", family: fam, binding: bindingFor(st.kind, needsRecord(st.kind) ? st.rec : undefined), layout: layoutId() };
  }
  async function loadPreview() {
    const host = dlg.querySelector("[data-sl-prev]"); if (!host || !st.detail || !o.context) return;
    const tok = ++st.token, fam = st.detail;
    try {
      const mod = {renderSectionLayoutPreview};
      if (tok !== st.token || !host.isConnected) return;
      const c = o.context() || {};
      const html = mod.renderSectionLayoutPreview({ data: c.data, design: c.design, page, instance: previewInstance(fam), layout: layoutId() || "original", productId: c.productId, collectionId: c.collectionId });
      host.innerHTML = `<iframe class="sl-frame" sandbox="" tabindex="-1" loading="lazy" title="Layout preview" data-sl-frame></iframe>`;
      host.firstElementChild.srcdoc = String(html || "");
    } catch { if (tok === st.token && host.isConnected) host.innerHTML = `<p class="sl-prev-wait">A preview is not available for this section yet.</p>`; }
  }
  async function loadMods() {
    if (st.mods || !(inst || edit) || !o.context) return;
    st.mods={sectionLayouts};
    if (root.isConnected) paint();
  }
  function detail(e) {
    if (edit) {
      const ok = can() && typeof o.onLayout === "function";
      return `<div class="sl-detail"><div><h3>${esc(e.name)}</h3><p>${esc(e.description)}</p><p class="sl-note">Changing the layout keeps this section's content and what it shows.</p></div></div>${layoutUi(e)}<button type="button" class="sl-primary" data-sl-apply${ok ? "" : " disabled"}>Use this layout</button>${ok ? "" : `<p class="sl-note">An editable saved design is required to change layouts.</p>`}`;
    }
    const names = (e.layouts || []).map(l => `<li>${esc(l.name)}<small>${l.themeId === "shared" ? "Shared layout" : esc(themeName(l.themeId))}</small></li>`).join("");
    const canAct = e.available && can();
    if (inst) {
      const b = e.available ? bindingUi(e) : { html: `<p class="sl-note">View only. This section cannot be added to the ${esc(cap(page))} page.</p>`, ok: false };
      const lim = full(), dis = !(can() && b.ok && !lim);
      const where = inst.afterId ? "after the selected section" : "at the start of the page";
      return `<button type="button" class="sl-back-btn" data-sl-back>Back to all sections</button><div class="sl-detail">${o.context ? "" : layoutIllustration(e.id)}<div><h3>${esc(e.name)}</h3><p>${esc(e.description)}</p>${o.context ? "" : `<p class="sl-note">Layout diagram, not a screenshot of your store. Your theme decides the final look.</p>`}</div></div>${e.available ? `<div class="sl-binds">${b.html}</div>` : b.html}${e.available ? layoutUi(e) : ""}<p class="sl-note">${inst.count()} of ${inst.limit} added sections used. Adding places it ${where}. You can add the same section more than once.</p>${lim ? `<p class="sl-note" role="alert">This page has reached its limit of ${inst.limit} added sections. Delete one to add another.</p>` : ""}<button type="button" class="sl-primary" data-sl-insert="${esc(e.id)}"${dis ? " disabled" : ""}>Add to ${esc(cap(page))} page</button>${can() ? "" : `<p class="sl-note">An editable saved design is required to add sections.</p>`}`;
    }
    const btn = !e.available ? `<p class="sl-note">View only. This section cannot be added to the ${esc(cap(page))} page in this release.</p>`
      : `<button type="button" class="sl-primary" data-sl-add="${esc(e.optionalType)}" data-on="${e.selected ? "0" : "1"}"${canAct ? "" : " disabled"}>${e.selected ? "Remove from " : "Add to "}${esc(cap(page))} page</button>${canAct ? "" : `<p class="sl-note">An editable saved design on this page is required to change sections.</p>`}`;
    return `<button type="button" class="sl-back-btn" data-sl-back>Back to all sections</button><div class="sl-detail">${layoutIllustration(e.id)}<div><h3>${esc(e.name)}</h3><p>${esc(e.description)}</p><p class="sl-note">Layout illustration, not a screenshot of your store.</p></div></div><h4>Existing layouts</h4><ul class="sl-layouts">${names || "<li>No layouts listed</li>"}</ul>${btn}`;
  }
  function paint(focusSel) {
    const input=dlg.querySelector("[data-sl-q]");
    const keepQ = input === document.activeElement;
    const selection=keepQ?[input.selectionStart,input.selectionEnd]:null;
    const all = list(), cur = st.detail ? lift(libraryEntries({ allowedTypes: allowed, selectedTypes: o.selectedTypes?.() || [] })).find(e => e.id === st.detail) : null;
    const th = themes();
    dlg.innerHTML = `<div class="sl-head"><h2 id="sl-title">Section library</h2><button type="button" class="sl-x" data-sl-close>Close</button></div>
<p class="sl-note">${edit ? `Choose a layout for this ${esc(cap(page))} page section.` : inst ? `Add any section family to the ${esc(cap(page))} page as its own copy.` : `Browse every section family. Only optional sections supported on the ${esc(cap(page))} page can be added.`} Browsing never changes your store style. Header and footer are global and are not added here.</p>
<div class="sl-msg ${st.err ? "is-err" : ""}" role="status">${esc(st.msg)}</div>
${cur ? (edit ? "" : "") + detail(cur) : `<div class="sl-filters"><label>Search<input type="search" data-sl-q value="${esc(st.query)}" placeholder="Search sections"></label><label>Category<select data-sl-cat><option value="">All categories</option>${SECTION_CATEGORIES.map(c => `<option value="${esc(c.id)}"${st.category === c.id ? " selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label><label>Theme<select data-sl-theme><option value="">All themes</option>${th.map(t => `<option value="${esc(t)}"${st.theme === t ? " selected" : ""}>${esc(themeName(t))}</option>`).join("")}</select></label></div>
<p class="sl-count">${all.length} section ${all.length === 1 ? "family" : "families"}</p>${all.length ? `<ul class="sl-grid">${all.map(card).join("")}</ul>` : `<p class="sl-empty">No sections match. Clear the search or filters.</p>`}`}`;
    if (cur && (inst || edit) && o.context) { if (!st.mods) loadMods(); else loadPreview(); }
    if (focusSel) dlg.querySelector(focusSel)?.focus();
    else if (keepQ) { const i = dlg.querySelector("[data-sl-q]"); i.focus(); if(selection.every(n=>Number.isInteger(n)))i.setSelectionRange(...selection); }
  }
  function close() { document.removeEventListener("keydown", onKey, true); root.remove(); document.body.style.overflow=previousOverflow; o.onClose?.(); (o.returnFocus?.() || prev)?.focus?.(); }
  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== "Tab") return;
    const f = [...dlg.querySelectorAll("button:not(:disabled),input,select")]; if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (!dlg.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  root.addEventListener("click", e => {
    if (e.target === root) return close();
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    const d = b.dataset;
    if ("slClose" in d) close();
    else if (d.slOpen) { st.detail = d.slOpen; st.msg = ""; st.kind = ""; st.rec = ""; paint("[data-sl-back]"); }
    else if ("slBack" in d) { const id = st.detail; st.detail = null; st.msg = ""; paint(`[data-sl-open="${id}"]`); }
    else if (d.slLayout) { st.layout = d.slLayout; paint(`[data-sl-layout="${CSS.escape(d.slLayout)}"]`); }
    else if ("slApply" in d && edit) {
      if (!can() || typeof o.onLayout !== "function") return;
      try { if (o.onLayout(layoutId() || "original") === false) throw new Error("not applied"); close(); }
      catch (err) { st.err = true; st.msg = `Layout could not be changed. ${String(err?.message || "").slice(0, 140)}`; paint("[data-sl-apply]"); }
    }
    else if (d.slInsert && inst) {
      if (!can() || full()) return;
      const fam = d.slInsert, u = usableKinds(fam, page, recs()); if (!u.kinds.includes(st.kind)) return;
      const name = sectionDisplayName(fam, cap(fam));
      try {
        const id = inst.add(fam, bindingFor(st.kind, needsRecord(st.kind) ? st.rec : undefined), layoutId());
        st.err = !id; st.msg = id ? `${name} added to the ${cap(page)} page. ${inst.count()} added ${inst.count() === 1 ? "section" : "sections"} on this page. Save draft to keep it.` : `${name} could not be added.`;
        if (id) inst.afterId = id;
      } catch (err) { st.err = true; st.msg = `${name} could not be added. ${String(err?.message || "").slice(0, 140)}`; }
      paint("[data-sl-insert]");
    }
    else if (d.slAdd) {
      if (!can()) return;
      const entry=libraryEntries({allowedTypes:allowed,selectedTypes:o.selectedTypes()}).find(item=>item.available&&item.optionalType===d.slAdd);
      if(!entry)return;
      const on = d.on === "1";
      try { o.onToggle(d.slAdd, on); } catch { /* reported below */ }
      const now = o.selectedTypes().includes(d.slAdd), name = sectionDisplayName(d.slAdd, cap(d.slAdd));
      st.err = now !== on;
      st.msg = st.err ? `${name} could not be ${on ? "added" : "removed"}.` : `${name} ${on ? "added to" : "removed from"} the ${cap(page)} page. Save draft to keep it.`;
      paint("[data-sl-add]");
    }
  });
  root.addEventListener("input", e => { if (e.target.matches("[data-sl-q]")) { st.query = e.target.value; paint(); } });
  root.addEventListener("change", e => {
    let selector;
    if (e.target.matches("[data-sl-cat]")) {st.category = e.target.value;selector="[data-sl-cat]";}
    else if (e.target.matches("[data-sl-kind]")) { st.kind = e.target.value; selector = "[data-sl-kind]"; }
    else if (e.target.matches("[data-sl-rec]")) { st.rec = e.target.value; selector = "[data-sl-rec]"; }
    else if (e.target.matches("[data-sl-theme]")) {st.theme = e.target.value;selector="[data-sl-theme]";}
    else return;
    paint(selector);
  });
  document.addEventListener("keydown", onKey, true);
  paint(edit ? "[data-sl-layout]" : "[data-sl-q]");
  return { close, element: root };
}
