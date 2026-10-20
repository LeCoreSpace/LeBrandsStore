/**
 * Visual section library dialog. Browse every section family across themes; add or remove
 * only the optional sections the current page supports, through the injected onToggle.
 */
import { SECTION_CATEGORIES, SECTION_THEMES, libraryEntries, sectionDisplayName } from "./section-library.js";

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
  const st = { query: "", category: "", theme: "", detail: null, msg: "", err: false };
  const root = document.createElement("div");
  root.className = "sl-back";
  root.innerHTML = `<div class="sl" role="dialog" aria-modal="true" aria-labelledby="sl-title" tabindex="-1"></div>`;
  host.appendChild(root);
  const dlg = root.firstElementChild;
  const can = () => !o.readOnly && Boolean(o.ready());
  const themes = () => [...new Set((o.themes || []).concat(libraryEntries({ allowedTypes: allowed, selectedTypes: [] }).flatMap(e => e.themeIds || [])))];
  const list = () => libraryEntries({ query: st.query, category: st.category, theme: st.theme, allowedTypes: allowed, selectedTypes: o.selectedTypes() });

  function card(e) {
    const act = e.available
      ? `<span class="sl-tag ${e.selected ? "is-on" : ""}">${e.selected ? "On this page" : "Available on this page"}</span>`
      : `<span class="sl-tag">View only</span>`;
    return `<li class="sl-item"><button type="button" class="sl-open" data-sl-open="${esc(e.id)}">${layoutIllustration(e.id)}<strong>${esc(e.name)}</strong><span class="sl-desc">${esc(e.description)}</span>${act}</button></li>`;
  }
  function detail(e) {
    const names = (e.layouts || []).map(l => `<li>${esc(l.name)}<small>${l.themeId === "shared" ? "Shared layout" : esc(themeName(l.themeId))}</small></li>`).join("");
    const canAct = e.available && can();
    const btn = !e.available ? `<p class="sl-note">View only. This section cannot be added to the ${esc(cap(page))} page in this release.</p>`
      : `<button type="button" class="sl-primary" data-sl-add="${esc(e.optionalType)}" data-on="${e.selected ? "0" : "1"}"${canAct ? "" : " disabled"}>${e.selected ? "Remove from " : "Add to "}${esc(cap(page))} page</button>${canAct ? "" : `<p class="sl-note">An editable saved design on this page is required to change sections.</p>`}`;
    return `<button type="button" class="sl-back-btn" data-sl-back>Back to all sections</button><div class="sl-detail">${layoutIllustration(e.id)}<div><h3>${esc(e.name)}</h3><p>${esc(e.description)}</p><p class="sl-note">Layout illustration, not a screenshot of your store.</p></div></div><h4>Existing layouts</h4><ul class="sl-layouts">${names || "<li>No layouts listed</li>"}</ul>${btn}`;
  }
  function paint(focusSel) {
    const input=dlg.querySelector("[data-sl-q]");
    const keepQ = input === document.activeElement;
    const selection=keepQ?[input.selectionStart,input.selectionEnd]:null;
    const all = list(), cur = st.detail ? libraryEntries({ allowedTypes: allowed, selectedTypes: o.selectedTypes() }).find(e => e.id === st.detail) : null;
    const th = themes();
    dlg.innerHTML = `<div class="sl-head"><h2 id="sl-title">Section library</h2><button type="button" class="sl-x" data-sl-close>Close</button></div>
<p class="sl-note">Browse every section family. Only optional sections supported on the ${esc(cap(page))} page can be added. Browsing never changes your store style. Header and footer are global and are not added here.</p>
<div class="sl-msg ${st.err ? "is-err" : ""}" role="status">${esc(st.msg)}</div>
${cur ? detail(cur) : `<div class="sl-filters"><label>Search<input type="search" data-sl-q value="${esc(st.query)}" placeholder="Search sections"></label><label>Category<select data-sl-cat><option value="">All categories</option>${SECTION_CATEGORIES.map(c => `<option value="${esc(c.id)}"${st.category === c.id ? " selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label><label>Theme<select data-sl-theme><option value="">All themes</option>${th.map(t => `<option value="${esc(t)}"${st.theme === t ? " selected" : ""}>${esc(themeName(t))}</option>`).join("")}</select></label></div>
<p class="sl-count">${all.length} section ${all.length === 1 ? "family" : "families"}</p>${all.length ? `<ul class="sl-grid">${all.map(card).join("")}</ul>` : `<p class="sl-empty">No sections match. Clear the search or filters.</p>`}`}`;
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
    else if (d.slOpen) { st.detail = d.slOpen; st.msg = ""; paint("[data-sl-back]"); }
    else if ("slBack" in d) { const id = st.detail; st.detail = null; st.msg = ""; paint(`[data-sl-open="${id}"]`); }
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
    else if (e.target.matches("[data-sl-theme]")) {st.theme = e.target.value;selector="[data-sl-theme]";}
    else return;
    paint(selector);
  });
  document.addEventListener("keydown", onKey, true);
  paint("[data-sl-q]");
  return { close, element: root };
}
