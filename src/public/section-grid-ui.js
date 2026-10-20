/** Compact block settings dialog for grid-family sections. All edits go through controller methods. */
import { attachSectionDrag } from "./section-drag.js";

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const OPT = {
  arrangement: [["grid", "Grid"], ["featured", "Featured first"], ["masonry", "Staggered"], ["strip", "Scrolling strip"]],
  gap: [["compact", "Compact"], ["normal", "Normal"], ["relaxed", "Relaxed"]],
  ratio: [["portrait", "Portrait"], ["square", "Square"], ["wide", "Wide"], ["natural", "Natural"]],
  fit: [["cover", "Fill the frame"], ["contain", "Show whole image"]],
  align: [["left", "Left"], ["center", "Centre"]],
  card: [["plain", "Plain"], ["outlined", "Outlined"], ["filled", "Filled"]],
  source: [["automatic", "Automatic"], ["manual", "Chosen by me"]],
  focus: [["center", "Centre"], ["top", "Top"], ["bottom", "Bottom"]],
};
const NUM = { desktop: [1, 6, "Columns on desktop"], tablet: [1, 4, "Columns on tablet"], mobile: [1, 2, "Columns on mobile"], limit: [1, 10, "Number shown"] };
export const GRID_FAMILIES = ["product-grid", "collection-cards", "related-products", "related-collections", "product-set", "image-gallery", "before-after", "customer-photos", "press-logos", "customer-reviews"];

export function openSectionGrid(o) {
  const { host, controller: c, page, id } = o;
  const prev = document.activeElement, prevOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  const st = { open: null, msg: "", err: false, snap: null };
  const root = document.createElement("div");
  root.className = "sl-back sg-back";
  root.innerHTML = `<div class="sl sg" role="dialog" aria-modal="true" aria-labelledby="sg-title" tabindex="-1"></div>`;
  host.appendChild(root);
  const dlg = root.firstElementChild;
  const can = () => { try { return Boolean(o.ready()); } catch { return false; } };
  const read = () => { try { st.snap = c.getSectionGrid(page, id); } catch { st.snap = null; } return st.snap; };
  const sel = (name, list, val, dis, extra = "") => `<select ${extra} data-sg-set="${name}"${dis}>${list.map(([v, t]) => `<option value="${v}"${v === val ? " selected" : ""}>${esc(t)}</option>`).join("")}</select>`;

  function cellRow(it, n, all, s) {
    const dis = can() ? "" : " disabled", k = esc(it.id), open = st.open === it.id, kind = s.kind;
    const rec = s.records.find(r => r.id === it.recordId);
    const name = it.title || rec?.label || (kind === "images" ? `Image ${n + 1}` : `Item ${n + 1}`);
    const fixed = s.fixedCount != null, manual = s.grid.source === "manual" || kind === "images";
    const btn = (act, label, svg, off) => `<button type="button" data-sg-act="${act}" data-cell="${k}" title="${label}" aria-label="${label}: ${esc(name)}"${dis || off ? " disabled" : ""}>${svg}</button>`;
    const I = p => `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${p}"/></svg>`;
    const grip = manual && can() ? `<button type="button" class="aw-grip" data-ws-grip="${k}" aria-pressed="false" title="Drag to reorder" aria-label="Reorder ${esc(name)}. Press Space to pick up, arrows to move, Space to drop."><svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><circle cx="5" cy="3" r="1.2"/><circle cx="9" cy="3" r="1.2"/><circle cx="5" cy="7" r="1.2"/><circle cx="9" cy="7" r="1.2"/><circle cx="5" cy="11" r="1.2"/><circle cx="9" cy="11" r="1.2"/></svg></button>` : `<span class="aw-grip is-off" aria-hidden="true"></span>`;
    const f = (field, label, max, area) => `<label class="sg-f">${label}${area ? `<textarea rows="2" maxlength="${max}" data-sg-cell="${field}" data-cell="${k}"${dis}>${esc(it[field])}</textarea>` : `<input type="text" maxlength="${max}" data-sg-cell="${field}" data-cell="${k}" value="${esc(it[field])}"${dis}>`}</label>`;
    let body = "";
    if (open) {
      if (kind !== "images" && s.records.length) body += `<label class="sg-f">${kind === "reviews" ? "Review" : kind === "products" ? "Product" : "Collection"}<select data-sg-cell="recordId" data-cell="${k}"${dis}>${s.records.map(r => `<option value="${esc(r.id)}"${r.id === it.recordId ? " selected" : ""}>${esc(r.label)}</option>`).join("")}</select></label>`;
      if (!s.readOnlyContent) {
        if (kind === "images") body += `<div class="sg-img"><span>${it.hasImage ? "Photo chosen" : "No photo yet"}</span><button type="button" class="sg-btn" data-sg-img="${esc(it.imageKey || "")}" data-cell="${k}"${dis}>${it.hasImage ? "Change photo" : "Choose photo"}</button></div>`;
        body += f("title", kind === "images" ? "Caption" : "Display title", 80) + f("body", "Text", 240, true);
        if (kind === "images") body += f("label", "Link text", 40) + f("link", "Link address", 300) + f("alt", "Description for screen readers", 140) + `<label class="sg-f">Focus when cropped${sel("focus", OPT.focus, it.focus, dis, `data-sg-cell="focus" data-cell="${k}"`).replace(' data-sg-set="focus"', "")}</label>`;
      } else body += `<p class="sg-note">Catalogue details such as price, stock and review text come from your store records and are not edited here.</p>`;
    }
    return `<li class="sg-cell${open ? " is-open" : ""}" data-sec-row="${k}">${grip}<button type="button" class="sg-name" data-sg-open="${k}" aria-expanded="${open}"><span>${esc(name)}</span><small>${n + 1} of ${all.length}</small></button><span class="aw-acts">${btn("up", "Move earlier", I("M7 11V3M3.5 6.5 7 3l3.5 3.5"), !manual || n === 0)}${btn("down", "Move later", I("M7 3v8M3.5 7.5 7 11l3.5-3.5"), !manual || n === all.length - 1)}${btn("dup", "Duplicate", I("M4.5 4.5h7v7h-7zM9.5 2.5h-6a1 1 0 0 0-1 1v6"), !manual || fixed || all.length >= s.maxItems)}${btn("del", "Remove", I("M4 4l6 6M10 4l-6 6"), !manual || fixed || all.length <= 1)}</span>${open ? `<div class="sg-body">${body}</div>` : ""}</li>`;
  }

  function paint(focusSel) {
    const s = st.snap || read(), top = dlg.scrollTop;
    if (!s) { dlg.innerHTML = `<div class="sl-head"><h2 id="sg-title">Block settings</h2><button type="button" class="sl-x" data-sg-close>Close</button></div><p class="sg-note">This section has no block settings.</p>`; return; }
    const g = s.grid, dis = can() ? "" : " disabled", manual = g.source === "manual" || s.kind === "images";
    const num = k => `<label class="sg-f">${NUM[k][2]}<input type="number" inputmode="numeric" min="${NUM[k][0]}" max="${NUM[k][1]}" data-sg-set="${k}" value="${g[k]}"${dis||k==="limit"&&s.fixedCount?" disabled":""}></label>`;
    const fl = (k, t) => `<label class="sg-f">${t}${sel(k, OPT[k], g[k], dis)}</label>`;
    const canAdd = can() && manual && s.fixedCount == null && s.items.length < s.maxItems;
    dlg.innerHTML = `<div class="sl-head"><h2 id="sg-title">Block settings</h2><span class="sg-tools"><button type="button" class="sg-btn" data-sg-undo${can() && c.canUndo?.() ? "" : " disabled"}>Undo</button><button type="button" class="sl-x" data-sg-close>Close</button></span></div>
<div class="sg-msg${st.err ? " is-err" : ""}" role="${st.err ? "alert" : "status"}">${esc(st.msg)}</div>
<div class="sg-grid">${fl("arrangement", "Arrangement")}${num("desktop")}${num("tablet")}${num("mobile")}${fl("gap", "Spacing")}${fl("ratio", "Image shape")}${fl("fit", "Image fit")}${fl("align", "Text alignment")}${fl("card", "Card style")}${num("limit")}${s.kind === "images" ? "" : fl("source", "Items from")}</div>
<h4>${s.fixedCount != null ? "Images" : "Items"} <span class="sg-count">${s.items.length} of ${s.fixedCount ?? s.maxItems}</span></h4>
 ${!manual ? `<p class="sg-note">These are chosen automatically. Select “Chosen by me” to manage individual cells.</p>` : ""}
<ul class="sg-cells" data-sg-cells>${s.items.map((it, n) => cellRow(it, n, s.items, s)).join("")}</ul>
${!s.items.length ? `<p class="sg-note">Nothing here yet.</p>` : ""}
<button type="button" class="sg-add" data-sg-add${canAdd ? "" : " disabled"}>Add ${s.kind === "images" ? "image slot" : "item"}</button>${can() ? "" : `<p class="sg-note">An editable saved design is required to change this block.</p>`}`;
    dlg.scrollTop = top;
    if (focusSel) dlg.querySelector(focusSel)?.focus?.({ preventScroll: true });
  }
  const say = (msg, err) => { st.msg = msg; st.err = Boolean(err); const m = dlg.querySelector(".sg-msg"); if (m) { m.textContent = msg; m.className = "sg-msg" + (err ? " is-err" : ""); m.setAttribute("role", err ? "alert" : "status"); } };
  /** Run a controller edit. repaint=false keeps the form (and focus) untouched. */
  function run(fn, okMsg, focusSel, repaint = true) {
    if (!can()) return say("Editing is unavailable right now.", true), false;
    try { if (fn() !== true) throw new Error("This change was not applied."); }
    catch (e) { say(String(e?.message || e || "This change could not be applied."), true); if (repaint) { read(); paint(focusSel); } return false; }
    read(); say(okMsg); if (repaint) paint(focusSel); return true;
  }
  function close() { document.removeEventListener("keydown", onKey, true); drag.cancel(); root.remove(); document.body.style.overflow = prevOverflow; o.onClose?.(); (o.returnFocus?.() || prev)?.focus?.(); }
  function onKey(e) {
    if (e.key === "Escape" && !drag.active()) { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== "Tab") return;
    const f = [...dlg.querySelectorAll("button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)")]; if (!f.length) return;
    const a = document.activeElement;
    if (!dlg.contains(a)) { e.preventDefault(); f[0].focus(); }
    else if (e.shiftKey && a === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && a === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }
  const cid = n => `[data-cell="${CSS.escape(n)}"]`;
  root.addEventListener("click", e => {
    if (e.target === root) return close();
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    const d = b.dataset, s = st.snap;
    if ("sgClose" in d) close();
    else if (d.sgOpen) { st.open = st.open === d.sgOpen ? null : d.sgOpen; paint(`[data-sg-open="${CSS.escape(d.sgOpen)}"]`); }
    else if ("sgUndo" in d) { try { if (c.canUndo?.()) { c.undo(); say("Last edit undone."); } else say("Nothing to undo."); } catch { say("Undo failed.", true); } read(); paint("[data-sg-undo]"); }
    else if ("sgAdd" in d) {
      const before = new Set(s.items.map(x => x.id));
      if (run(() => c.addSectionCell(page, id, {}), "Item added. Save draft to keep it.", "[data-sg-add]", false)) { const n = st.snap.items.find(x => !before.has(x.id)); if (n) st.open = n.id; paint(n ? `[data-sg-open="${CSS.escape(n.id)}"]` : "[data-sg-add]"); }
    }
    else if (d.sgImg !== undefined) { const key = d.sgImg; close(); try { c.selectContent("image", key || undefined); } catch { /* picker unavailable */ } }
    else if (d.sgAct) {
      const cell = d.cell, act = d.sgAct, fs = `[data-sg-act="${act}"]${cid(cell)}`;
      if (act === "up" || act === "down") run(() => c.moveSectionCell(page, id, cell, act === "up" ? -1 : 1), `Moved ${act === "up" ? "earlier" : "later"}. Save draft to keep it.`, fs);
      else if (act === "dup") { const before = new Set(s.items.map(x => x.id)); if (run(() => c.duplicateSectionCell(page, id, cell), "Item duplicated. Save draft to keep it.", fs, false)) { const n = st.snap.items.find(x => !before.has(x.id)); if (n) st.open = n.id; paint(n ? `[data-sg-open="${CSS.escape(n.id)}"]` : fs); } }
      else if (act === "del") { const i = s.items.findIndex(x => x.id === cell), near = s.items[i + 1] || s.items[i - 1]; if (st.open === cell) st.open = null; run(() => c.removeSectionCell(page, id, cell), "Item removed. Use Undo to bring it back.", near ? `[data-sg-open="${CSS.escape(near.id)}"]` : "[data-sg-add]"); }
    }
  });
  root.addEventListener("change", e => {
    const n = e.target, s = st.snap; if (!s) return;
    if (n.dataset.sgSet) {
      const k = n.dataset.sgSet; let v = n.value;
      if (NUM[k]) { v = Math.round(Number(v)); if (!Number.isFinite(v)) v = s.grid[k]; v = Math.max(NUM[k][0], Math.min(NUM[k][1], v)); n.value=String(v); }
      if (k === "source" && v === "automatic" && s.grid.source === "manual" && !confirm("Switch back to automatic? Manual selections and custom cell text or photos will be reset to the current catalogue records.")) { n.value = s.grid.source; return; }
      run(() => c.setSectionGrid(page, id, { [k]: v }), "Settings updated. Save draft to keep it.", `[data-sg-set="${k}"]`, k === "source" || k === "limit");
    } else if (n.dataset.sgCell) {
      const f = n.dataset.sgCell, cell = n.dataset.cell;
      if(run(() => c.updateSectionCell(page, id, cell, { [f]: n.value }), "Item updated. Save draft to keep it.", `[data-sg-cell="${f}"]${cid(cell)}`, f === "recordId")&&f==="title"){
        const label=dlg.querySelector(`[data-sg-open="${CSS.escape(cell)}"] span`);
        if(label)label.textContent=n.value||"Item";
      }
    }
  });
  const drag = attachSectionDrag({
    root: dlg, scroller: () => dlg,
    getOrder: () => (st.snap?.items || []).map(x => x.id),
    locked: () => false,
    label: cell => { const x = st.snap?.items.find(i => i.id === cell); return x?.title || "Item"; },
    announce: m => say(m),
    canDrag: can,
    onDrop: (order, moved) => run(() => c.reorderSectionCells(page, id, order), "Order changed. Save draft to keep it.", `[data-ws-grip="${CSS.escape(moved)}"]`),
  });
  document.addEventListener("keydown", onKey, true);
  read(); paint("[data-sg-close]");
  return { close, element: root };
}
