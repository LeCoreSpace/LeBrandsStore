import {registerLeaveGuard,confirmCatalogueAction as appConfirm} from "./catalogue-confirm.js";
const app = document.querySelector(".lb-app");
const box = document.querySelector("[data-inventory]");
const MAX = 2147483647;
if (app && box) {
  const storeId = app.dataset.storeId || "";
  const api = app.dataset.apiRoot || `/api/stores/${encodeURIComponent(storeId)}`;
  const storeRoot = app.dataset.storeRoot || `/stores/${encodeURIComponent(storeId)}`;
  const $ = (s) => box.querySelector(s);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  let boot = {};
  try { boot = JSON.parse(document.getElementById("inventory-data")?.textContent || "{}"); } catch { boot = {}; }
  const state = { q: { search: "", availability: "all", status: "all", page: 1 }, data: null, edits: new Map(), selected: new Set(), busy: false, stale: false };
  const params = new URLSearchParams(location.search);
  for (const k of ["search", "availability", "status"]) if (params.get(k)) state.q[k] = params.get(k);
  state.q.page = Math.max(1, Number(params.get("page")) || 1);
  const form = $("[data-inv-filters]");
  const syncForm = () => { for (const k of ["search", "availability", "status"]) form.elements[k].value = state.q[k]; };
  const dirty = () => state.edits.size > 0;
  const n = (v) => Number(v).toLocaleString("en-IN");
  const validQty = (v) => /^\d+$/.test(String(v).trim()) && Number(v) <= MAX;
  const editable = (r) => state.data?.can_edit && r.track_inventory && r.stock != null;
  const toast = (m, e) => { const t = document.querySelector("[data-toast]"); if (!t) return; t.textContent = m; t.dataset.kind = e ? "error" : "success"; t.hidden = false; setTimeout(() => { t.hidden = true; }, 5000); };
  const alertBox = (html) => { const a = $("[data-inv-alert]"); a.innerHTML = html || ""; a.hidden = !html; };
  const confirmDiscard = async () => !dirty() || await appConfirm("Your unsaved quantity edits will be discarded.",{title:"Discard stock edits?",confirmLabel:"Discard edits"});
  let loadSequence=0,editSequence=0;

  async function load(opts = {}) {
    const sequence=++loadSequence,startedEdit=editSequence;
    const qs = new URLSearchParams({ ...state.q, page: String(state.q.page) });
    if (!qs.get("search")) qs.delete("search");
    try {
      const res = await fetch(`${api}/inventory?${qs}`, { credentials: "same-origin", headers: { Accept: "application/json" } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Stock could not load (${res.status}).`);
      if(sequence!==loadSequence)return;
      if(editSequence!==startedEdit&&dirty())return;
      state.data = body; state.stale = false;
      if (!opts.keepEdits) { state.edits.clear(); state.selected.clear(); }
      alertBox("");
      render();
    } catch (e) {
      if(sequence!==loadSequence||dirty())return;
      $("[data-inv-table]").innerHTML = "";
      alertBox(`<span>${esc(e.message)}</span> <button type="button" class="lb-button lb-button-small lb-button-outline" data-inv-retry>Try again</button>`);
    }
  }
  const rowKey = (r) => r.key;
  function render() {
    const d = state.data, s = d.summary || {};
    $("[data-inv-summary]").innerHTML = [["Tracked SKUs", s.tracked_skus], ["In stock", s.in_stock_skus], ["Low stock (1 to " + d.low_stock_threshold + ")", s.low_stock_skus], ["Out of stock", s.out_of_stock_skus], ["Not tracked", s.untracked_skus]].map(([l, v]) => `<div><small>${esc(l)}</small><strong>${n(v || 0)}</strong></div>`).join("");
    const rows = d.rows || [];
    if (!rows.length) {
      $("[data-inv-table]").innerHTML = `<section class="lb-empty"><h2>No SKUs match.</h2><p>Adjust search or filters. Add products with stock tracking to see them here.</p><a class="lb-button" href="${esc(storeRoot)}/products">Open products</a></section>`;
    } else {
      const ce = d.can_edit;
      $("[data-inv-table]").innerHTML = `<div class="lb-table-wrap"><table class="lb-table lbi-table"><thead><tr>${ce ? '<th><input type="checkbox" data-inv-all aria-label="Select all editable rows on this page"></th>' : ""}<th>Product</th><th>SKU</th><th>Status</th><th>Current</th><th>New quantity</th></tr></thead><tbody>${rows.map((r) => {
        const ed = editable(r), v = state.edits.get(rowKey(r));
        const tag = r.stock == null ? "Not tracked" : r.stock === 0 ? "Out of stock" : r.stock <= d.low_stock_threshold ? "Low" : "";
        const bad = v !== undefined && !validQty(v);
        return `<tr data-key="${esc(r.key)}" class="${v !== undefined ? "is-dirty" : ""}">${ce ? `<td>${ed ? `<input type="checkbox" data-inv-pick ${state.selected.has(r.key) ? "checked" : ""} aria-label="Select ${esc(r.title)} ${esc(r.sku || "")}">` : ""}</td>` : ""}
        <td><a class="lb-row-link" href="${esc(r.product_url)}">${esc(r.title)}</a>${r.option_values?.length ? `<div class="lbi-opts">${r.option_values.map((o) => `<span>${esc(o.name)}: ${esc(o.value)}</span>`).join("")}</div>` : ""}</td>
        <td data-label="SKU">${esc(r.sku || "No SKU")}</td><td data-label="Status">${esc(r.status)}</td>
        <td data-label="Current">${r.stock == null ? "–" : n(r.stock)} ${tag ? `<span class="lbi-tag" data-t="${tag === "Low" ? "low" : tag === "Out of stock" ? "out" : ""}">${tag}</span>` : ""}</td>
        <td data-label="New">${ed ? `<input type="number" min="0" max="${MAX}" step="1" inputmode="numeric" data-inv-qty value="${v !== undefined ? esc(v) : ""}" placeholder="${r.stock}" aria-label="New quantity for ${esc(r.title)} ${esc(r.sku || "")}" aria-invalid="${bad}">` : `<small>${ce ? "Read only" : "View only"}</small>`}</td></tr>`;
      }).join("")}</tbody></table></div>`;
    }
    const pages = Math.max(1, Math.ceil(d.total / d.page_size));
    $("[data-inv-pager]").innerHTML = `<span>${n(d.total)} SKUs${dirty() ? ` · ${state.edits.size} edited` : ""}</span><span><button type="button" class="lb-button lb-button-small lb-button-outline" data-inv-page="-1" ${d.page <= 1 ? "disabled" : ""}>Previous</button> Page ${d.page} of ${pages} <button type="button" class="lb-button lb-button-small lb-button-outline" data-inv-page="1" ${d.page >= pages ? "disabled" : ""}>Next</button></span>`;
    renderBulk();
  }
  function renderBulk() {
    const b = $("[data-inv-bulk]"), c = state.edits.size, sel = state.selected.size;
    const show = state.data?.can_edit && (c || sel);
    b.hidden = !show;
    if (!show) return;
    const keep = b.querySelector("[name=mode]")?.value || "set", val = b.querySelector("[name=amount]")?.value || "";
    b.innerHTML = `<strong>${sel} selected</strong><label>Bulk action<select name="mode"><option value="set">Set to</option><option value="add">Add</option><option value="remove">Remove</option></select></label><label>Quantity<input name="amount" type="number" min="0" max="${MAX}" step="1" value="${esc(val)}"></label><button type="button" class="lb-button lb-button-small lb-button-outline" data-inv-bulk-apply ${sel ? "" : "disabled"}>Fill selected</button><button type="button" class="lb-button lb-button-small" data-inv-review-open ${c ? "" : "disabled"}>Review ${c} change${c === 1 ? "" : "s"}</button><button type="button" class="lb-button lb-button-small lb-button-quiet" data-inv-clear ${c ? "" : "disabled"}>Discard edits</button><span class="lbi-error" data-inv-bulk-error role="alert"></span>`;
    b.querySelector("[name=mode]").value = keep;
  }
  const byKey = () => new Map((state.data?.rows || []).map((r) => [r.key, r]));

  box.addEventListener("input", (e) => {
    const q = e.target.closest("[data-inv-qty]");
    if (!q) return;
    const key = q.closest("tr").dataset.key, v = q.value.trim();
    if (v === "") state.edits.delete(key); else state.edits.set(key, v);
    q.setAttribute("aria-invalid", String(v !== "" && !validQty(v)));
    q.closest("tr").classList.toggle("is-dirty", v !== "");
    $("[data-inv-pager] span").textContent = `${n(state.data.total)} SKUs${dirty() ? ` · ${state.edits.size} edited` : ""}`;
    renderBulk();
  });
  box.addEventListener("change", (e) => {
    if (e.target.matches("[data-inv-pick]")) { const k = e.target.closest("tr").dataset.key; e.target.checked ? state.selected.add(k) : state.selected.delete(k); renderBulk(); }
    if (e.target.matches("[data-inv-all]")) { for (const r of state.data.rows) if (editable(r)) e.target.checked ? state.selected.add(r.key) : state.selected.delete(r.key); render(); }
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if(state.busy)return;
    if (!await confirmDiscard()) return;
    state.edits.clear();state.selected.clear();
    state.q = { search: form.elements.search.value.trim(), availability: form.elements.availability.value, status: form.elements.status.value, page: 1 };
    load();
  });
  box.addEventListener("click", async (e) => {
    const t = e.target;
    if(state.busy)return;
    if (t.closest("[data-inv-retry]")) {if(await confirmDiscard()){state.edits.clear();state.selected.clear();load();}return;}
    if (t.closest("[data-inv-stale-reload]")) { if (await appConfirm("Your unsaved edits will be discarded.",{title:"Reload latest stock?",confirmLabel:"Discard edits and reload"})){state.edits.clear();state.selected.clear();load();} return; }
    const pg = t.closest("[data-inv-page]");
    if (pg) { if (!await confirmDiscard()) return; state.edits.clear();state.selected.clear();state.q.page = Math.max(1, state.q.page + Number(pg.dataset.invPage)); load(); return; }
    if (t.closest("[data-inv-clear]")) { if (await appConfirm("All unsaved quantity edits will be discarded.",{title:"Discard stock edits?",confirmLabel:"Discard edits"})) { state.edits.clear(); render(); } return; }
    if (t.closest("[data-inv-bulk-apply]")) return bulkFill();
    if (t.closest("[data-inv-review-open]")) return openReview();
  });
  function bulkFill() {
    const b = $("[data-inv-bulk]"), err = b.querySelector("[data-inv-bulk-error]");
    const mode = b.querySelector("[name=mode]").value, raw = b.querySelector("[name=amount]").value.trim();
    if (!validQty(raw)) { err.textContent = "Enter a whole quantity from 0 to 2,147,483,647."; return; }
    const amt = Number(raw), rows = byKey(), problems = [], next = new Map();
    for (const k of state.selected) {
      const r = rows.get(k); if (!r || !editable(r)) continue;
      const base = state.edits.has(k) && validQty(state.edits.get(k)) ? Number(state.edits.get(k)) : r.stock;
      const v = mode === "set" ? amt : mode === "add" ? base + amt : base - amt;
      if (v < 0) problems.push(r.sku || r.title); else if (v > MAX) problems.push(r.sku || r.title); else next.set(k, String(v));
    }
    if (problems.length) { err.textContent = `Result would be negative or too large for ${problems.slice(0, 3).join(", ")}${problems.length > 3 ? " and more" : ""}. No rows were changed.`; return; }
    for (const [k, v] of next) {if(Number(v)===rows.get(k).stock)state.edits.delete(k);else state.edits.set(k, v);}
    editSequence++;
    render();
  }
  const dlg = $("[data-inv-dialog]"), cform = $("[data-inv-confirm]"), dErr = $("[data-inv-dlg-error]");
  let opener = null, pending = [];
  function openReview() {
    const rows = byKey(), bad = [];
    pending = [];
    for (const [k, v] of state.edits) {
      const r = rows.get(k);
      if (!r) continue;
      if (!validQty(v)) bad.push(r); else if (Number(v) !== r.stock) pending.push({ r, v: Number(v) });
    }
    if (bad.length) { alertBox("Fix invalid quantities before review. Use whole numbers from 0 to 2,147,483,647."); box.querySelector(`tr[data-key="${CSS.escape(bad[0].key)}"] [data-inv-qty]`)?.focus(); return; }
    if (!pending.length) { alertBox("No quantity differs from current stock."); return; }
    if (pending.length > 100) { alertBox("A single update is limited to 100 SKUs. Reduce your edits."); return; }
    alertBox("");
    opener = document.activeElement;
    $("[data-inv-review]").innerHTML = `<div class="lbi-review"><table><thead><tr><th>SKU</th><th>Before</th><th>After</th></tr></thead><tbody>${pending.map(({ r, v }) => `<tr><td>${esc(r.title)}<br><small>${esc(r.sku || "No SKU")}</small></td><td>${n(r.stock)}</td><td><strong>${n(v)}</strong> (${v - r.stock > 0 ? "+" : ""}${n(v - r.stock)})</td></tr>`).join("")}</tbody></table></div>`;
    dErr.hidden = true;
    dlg.showModal();
    cform.elements.reason.focus();
  }
  $("[data-inv-cancel]").addEventListener("click", () => { if (!state.busy) dlg.close(); });
  dlg.addEventListener("cancel", (e) => { if (state.busy) e.preventDefault(); });
  dlg.addEventListener("close", () => opener?.focus?.());
  cform.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (state.busy) return;
    const reason = cform.elements.reason.value.trim();
    if (reason.length < 3 || reason.length > 200) { dErr.textContent = "Reason must be 3 to 200 characters."; dErr.hidden = false; return; }
    state.busy = true;
    const btn = $("[data-inv-submit]"); btn.disabled = true; btn.textContent = "Applying…";
    try {
      const items = pending.map(({ r, v }) => ({ product_id: r.product_id, ...(r.product_option_id ? { product_option_id: r.product_option_id } : {}), expected_stock: r.stock, expected_revision: r.revision, stock: v }));
      const res = await fetch(`${api}/inventory/bulk`, { method: "POST", credentials: "same-origin", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ reason, items }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { const err = new Error(body.error || `Update failed (${res.status}).`); err.status = res.status; throw err; }
      dlg.close();
      state.edits.clear(); state.selected.clear(); cform.elements.reason.value = "";
      const saved=new Map((body.rows||[]).map(row=>[row.key,row]));
      state.data={...state.data,rows:state.data.rows.map(row=>saved.get(row.key)||row)};
      render();
      toast(`${body.updated ?? items.length} SKU${items.length === 1 ? "" : "s"} updated.`);
      await load();
    } catch (err) {
      dErr.textContent = err.status === 409 ? "Stock changed since you loaded this page. Nothing was saved and your edits are kept." : err.message;
      dErr.hidden = false;
      if (err.status === 409) { state.stale = true; dlg.close(); alertBox(`<span>Stock changed elsewhere. Nothing was saved. Your edits are still here.</span> <button type="button" class="lb-button lb-button-small" data-inv-stale-reload>Reload latest stock</button>`); }
    } finally { state.busy = false; btn.disabled = false; btn.textContent = "Apply changes"; }
  });
  registerLeaveGuard(()=>dirty());

  syncForm();
  box.addEventListener("input",event=>{if(event.target.matches("[data-inv-qty]"))editSequence++;});
  window.addEventListener("focus",()=>{if(!dirty()&&!state.busy&&!dlg.open)load();});
  if (boot.inventory && boot.inventory.rows && state.q.page === (boot.inventory.page || 1) && !params.toString()) { state.data = boot.inventory; render(); } else load();
}
