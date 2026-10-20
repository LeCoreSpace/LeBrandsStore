import {registerLeaveGuard} from "./catalogue-confirm.js";
import { confirmCatalogueAction } from "/assets/catalogue-confirm.js";
const app = document.querySelector(".lb-app");
const box = document.querySelector("[data-cogs-root]");
const MAX = 1000000000000, LIMIT = 50;
if (app && box) {
  const storeId = app.dataset.storeId || "";
  const api = app.dataset.apiRoot || `/api/stores/${encodeURIComponent(storeId)}`;
  const $ = (s) => box.querySelector(s);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const state = { q: { search: "", missing: false, offset: 0 }, data: null, edits: new Map(), busy: false, stale: false };
  const form = $("[data-cogs-filters]");
  const dirty = () => state.edits.size > 0;
  const keyOf = (r) => `${r.product_id}|${r.product_option_id || ""}`;
  const toast = (m, e) => { const t = document.querySelector("[data-toast]"); if (!t) return; t.textContent = m; t.dataset.kind = e ? "error" : "success"; t.hidden = false; setTimeout(() => { t.hidden = true; }, 5000); };
  const alertBox = (html) => { const a = $("[data-cogs-alert]"); a.innerHTML = html || ""; a.hidden = !html; };
  let asking = false;
  const ask = async (message, opts) => { if (asking) return false; asking = true; try { return (await confirmCatalogueAction(message, opts)) === true; } finally { asking = false; } };
  const confirmDiscard = async () => !dirty() || ask("You have unsaved cost edits. Discard them?", { title: "Discard cost edits?", confirmLabel: "Discard edits", cancelLabel: "Keep editing" });
  const currency = () => state.data?.store?.currency || state.data?.cogs?.currency || "INR";
  const SYM = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };
  const fmt = (minor) => {
    const n = Number(minor), w = Math.floor(n / 100), f = String(n % 100).padStart(2, "0");
    const c = currency();
    return `${SYM[c] || c + " "}${w.toLocaleString("en-IN")}.${f}`;
  };
  const plain = (minor) => `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;
  // Returns {ok, value:null|int} without float math.
  function parse(text) {
    const t = String(text).trim();
    if (t === "") return { ok: true, value: null };
    if (!/^\d+(?:\.\d{1,2})?$/.test(t)) return { ok: false, error: "Use numbers with up to two decimals. No negatives." };
    const [w, f = ""] = t.split(".");
    const v = Number(w + f.padEnd(2, "0"));
    if (!Number.isSafeInteger(v) || v > MAX) return { ok: false, error: "Cost is too large." };
    return { ok: true, value: v };
  }
  const current = (r) => r.cost_price_paise == null ? "" : plain(r.cost_price_paise);

  async function call(url, opts) {
    const res = await fetch(url, { credentials: "same-origin", headers: { Accept: "application/json", ...(opts?.body ? { "Content-Type": "application/json" } : {}) }, ...opts });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(body.error || `Request failed (${res.status}).`), { status: res.status });
    return body;
  }
  const qs = () => { const p = new URLSearchParams({ offset: String(state.q.offset), limit: String(LIMIT) }); if (state.q.search) p.set("search", state.q.search); if (state.q.missing) p.set("missing", "1"); return p.toString(); };

  async function load() {
    $("[data-cogs-table]").innerHTML = state.data ? $("[data-cogs-table]").innerHTML : `<div class="lb-skeleton"><i></i><i></i><i></i><i></i></div>`;
    try {
      state.data = await call(`${api}/cogs?${qs()}`);
      state.stale = false; state.edits.clear();
      alertBox(""); render();
    } catch (e) {
      $("[data-cogs-table]").innerHTML = "";
      $("[data-cogs-pager]").innerHTML = "";
      alertBox(`<span>${esc(e.message)}</span><button type="button" class="lb-button lb-button-small lb-button-outline" data-cogs-retry>Try again</button>`);
    }
  }

  function render() {
    const c = state.data.cogs || {};
    if (c.available === false) {
      $("[data-cogs-table]").innerHTML = `<section class="lb-empty"><h2>Costs are not ready yet.</h2><p>Product costs are being set up for this store. Nothing is lost. Check back shortly.</p><button type="button" class="lb-button" data-cogs-retry>Check again</button></section>`;
      $("[data-cogs-pager]").innerHTML = ""; renderBar(); return;
    }
    const rows = c.items || [], ce = c.can_edit === true;
    if (!rows.length) {
      $("[data-cogs-table]").innerHTML = `<section class="lb-empty"><h2>${state.q.search || state.q.missing ? "No products match." : "No products yet."}</h2><p>${state.q.search || state.q.missing ? "Adjust the search or show all costs." : "Add products to start recording what each unit costs you."}</p></section>`;
    } else {
      $("[data-cogs-table]").innerHTML = `<div class="lb-table-wrap"><table class="lb-table lbc-table"><thead><tr><th>Product</th><th>SKU</th><th>Cost per unit (${esc(currency())})</th><th>Effective cost</th><th>Source</th><th>Updated</th><th></th></tr></thead><tbody>${rows.map((r) => {
        const k = keyOf(r), v = state.edits.get(k), sku = !!r.product_option_id, p = v === undefined ? { ok: true } : parse(v);
        const srcLabel = { product: "Product cost", override: "SKU cost", inherited: "Inherited", missing: "Unknown" }[r.cost_source] || "Unknown";
        const eff = r.effective_cost_paise == null ? "Unknown" : fmt(r.effective_cost_paise);
        const ph = sku ? (r.effective_cost_paise == null ? "Inherit (unknown)" : "Inherit") : "Unknown";
        return `<tr data-key="${esc(k)}" class="${sku ? "is-sku" : ""} ${v !== undefined ? "is-dirty" : ""}">
        <td><strong>${esc(r.title)}</strong>${r.variant_label ? `<small>${esc(r.variant_label)}</small>` : ""}</td><td data-label="SKU">${esc(r.sku || "No SKU")}</td>
        <td data-label="Cost">${ce ? `<input class="lbc-input" data-cogs-input inputmode="decimal" autocomplete="off" value="${esc(v !== undefined ? v : current(r))}" placeholder="${ph}" aria-label="Cost for ${esc(r.title)} ${esc(r.variant_label || r.sku || "")}" aria-invalid="${!p.ok}"><span class="lbc-err" data-cogs-err>${p.ok ? "" : esc(p.error)}</span>` : (r.cost_price_paise == null ? "Not set" : fmt(r.cost_price_paise))}</td>
        <td data-label="Effective">${eff}</td><td data-label="Source"><span class="lbc-src" data-src="${esc(r.cost_source)}">${srcLabel}</span></td>
        <td data-label="Updated">${r.updated_at ? esc(new Date(r.updated_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })) : "Not set"}</td>
        <td>${sku ? "" : `<button type="button" class="lb-text-button" data-cogs-history-open="${esc(r.product_id)}" data-title="${esc(r.title)}">History</button>`}</td></tr>`;
      }).join("")}</tbody></table></div>`;
    }
    const total = Number(c.total || 0), off = Number(c.offset || 0), lim = Number(c.limit || LIMIT);
    $("[data-cogs-pager]").innerHTML = `<span>${total.toLocaleString("en-IN")} rows${ce ? "" : ", view only"}</span><span><button type="button" class="lb-button lb-button-small lb-button-outline" data-cogs-page="-1" ${off <= 0 ? "disabled" : ""}>Previous</button> ${total ? off + 1 : 0} to ${Math.min(off + lim, total)} <button type="button" class="lb-button lb-button-small lb-button-outline" data-cogs-page="1" ${off + lim >= total ? "disabled" : ""}>Next</button></span>`;
    renderBar();
  }
  function renderBar() {
    const b = $("[data-cogs-bar]"), n = state.edits.size;
    b.hidden = !n;
    if (!n) return;
    b.innerHTML = `<strong>${n} unsaved change${n === 1 ? "" : "s"}</strong><button type="button" class="lb-button lb-button-small" data-cogs-save>Save changes</button><button type="button" class="lb-button lb-button-small lb-button-quiet" data-cogs-discard>Discard</button>`;
  }

  box.addEventListener("input", (e) => {
    const inp = e.target.closest("[data-cogs-input]"); if (!inp) return;
    const tr = inp.closest("tr"), k = tr.dataset.key;
    const row = (state.data.cogs.items || []).find((r) => keyOf(r) === k);
    if (inp.value.trim() === current(row)) state.edits.delete(k); else state.edits.set(k, inp.value);
    const p = parse(inp.value);
    inp.setAttribute("aria-invalid", String(!p.ok));
    tr.querySelector("[data-cogs-err]").textContent = p.ok ? "" : p.error;
    tr.classList.toggle("is-dirty", state.edits.has(k));
    renderBar();
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault(); if (state.busy || asking || !(await confirmDiscard())) return;
    state.q = { search: form.elements.search.value.trim(), missing: form.elements.missing.checked, offset: 0 };
    state.edits.clear(); load();
  });
  async function save() {
    const items = state.data.cogs.items, byKey = new Map(items.map((r) => [keyOf(r), r])), changes = [];
    for (const [k, v] of state.edits) {
      const r = byKey.get(k), p = parse(v);
      if (!r) continue;
      if (!p.ok) { alertBox(`<span>Fix the highlighted costs before saving. ${esc(p.error)}</span>`); box.querySelector(`tr[data-key="${CSS.escape(k)}"] input`)?.focus(); return; }
      if (p.value === r.cost_price_paise) continue;
      changes.push({ product_id: r.product_id, product_option_id: r.product_option_id || null, cost_price_paise: p.value, expected_revision: r.revision });
    }
    if (!changes.length) { alertBox("<span>No cost differs from what is saved.</span>"); return; }
    if (changes.length > LIMIT) { alertBox(`<span>Save at most ${LIMIT} changes at a time.</span>`); return; }
    state.busy = true; alertBox("");
    const btn = $("[data-cogs-save]"); if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
    try {
      state.data = await call(`${api}/cogs?${qs()}`, { method: "POST", body: JSON.stringify({ changes }) });
      state.edits.clear(); state.stale = false; render();
      toast(`${changes.length} cost${changes.length === 1 ? "" : "s"} saved.`);
    } catch (err) {
      if (err.status === 409) alertBox(`<span>Costs changed elsewhere. Nothing was saved and your edits are kept.</span><button type="button" class="lb-button lb-button-small" data-cogs-stale-reload>Reload latest costs</button>`);
      else alertBox(`<span>${esc(err.message)}</span>`);
      renderBar();
    } finally { state.busy = false; }
  }
  const dlg = $("[data-cogs-dialog]");
  async function history(id, title) {
    $("#lbc-hist-title").textContent = `Cost history: ${title}`;
    $("[data-cogs-history]").innerHTML = "<p>Loading history…</p>";
    dlg.showModal();
    try {
      const body = await call(`${api}/cogs/${encodeURIComponent(id)}/history`);
      const h = body.history || [];
      $("[data-cogs-history]").innerHTML = h.length ? `<div class="lb-table-wrap"><table class="lbc-hist"><thead><tr><th>When</th><th>Applies to</th><th>Before</th><th>After</th><th>By</th></tr></thead><tbody>${h.map((x) => `<tr><td>${esc(new Date(x.effective_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }))}</td><td>${esc(x.variant_label || "Base cost")}</td><td>${x.previous_cost_paise == null ? (x.product_option_id ? "Inherit" : "Unknown") : fmt(x.previous_cost_paise)}</td><td>${x.cost_price_paise == null ? (x.product_option_id ? "Inherit" : "Unknown") : fmt(x.cost_price_paise)}</td><td>${esc(x.actor_name || "Team member")}</td></tr>`).join("")}</tbody></table></div><p class="lb-muted">Showing up to the latest 100 changes.</p>` : "<p>No cost changes recorded yet.</p>";
    } catch (e) { $("[data-cogs-history]").innerHTML = `<p role="alert">${esc(e.message)}</p>`; }
  }
  $("[data-cogs-history-close]").addEventListener("click", () => dlg.close());
  box.addEventListener("click", async (e) => {
    const t = e.target;
    if (t.closest("[data-cogs-save]")) { if (!state.busy) save(); return; }
    if (state.busy || asking) return;
    if (t.closest("[data-cogs-retry]")) { if (await confirmDiscard()) load(); return; }
    if (t.closest("[data-cogs-stale-reload]")) { if (await ask("Reload latest costs? Your unsaved edits will be discarded.", { title: "Reload latest costs?", confirmLabel: "Reload and discard", cancelLabel: "Keep editing" })) load(); return; }
    if (t.closest("[data-cogs-discard]")) { if (await ask("Discard all cost edits?", { title: "Discard cost edits?", confirmLabel: "Discard edits", cancelLabel: "Keep editing" })) { state.edits.clear(); render(); } return; }
    const pg = t.closest("[data-cogs-page]");
    if (pg) { if (!(await confirmDiscard())) return; state.q.offset = Math.max(0, state.q.offset + Number(pg.dataset.cogsPage) * LIMIT); load(); return; }
    const h = t.closest("[data-cogs-history-open]");
    if (h) history(h.dataset.cogsHistoryOpen, h.dataset.title);
  });
  registerLeaveGuard(()=>dirty());
  window.addEventListener("focus", () => { if (!dirty() && !state.busy && !asking && !dlg.open) load(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !dirty() && !state.busy && !asking && !dlg.open) load(); });
  load();
}
