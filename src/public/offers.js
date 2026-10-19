const root = document.querySelector("[data-offers-root]");
if (root) {
  const app = document.querySelector(".lb-app");
  const api = `${root.dataset.apiRoot || app?.dataset.apiRoot || ""}/api/stores/${encodeURIComponent(app?.dataset.storeId || "")}/offers`;
  let state = {};
  try { state = JSON.parse(document.getElementById("offers-data").textContent || "{}"); } catch { state = {}; }
  const $ = s => root.querySelector(s);
  const list = $("[data-offers-list]"), panel = $("[data-offer-panel]"), form = $("[data-offer-form]"), errBox = $("[data-offers-error]");
  let editing = null, selected = new Set(), saving = false;
  const inr = p => `Rs ${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const utc = v => v ? new Date(v).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "";
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const fmtValue = o => o.kind === "percentage" ? `${(o.value / 100).toString()}%` : inr(o.value);
  const label = { active: "Active", paused: "Paused", draft: "Draft", scheduled: "Scheduled", expired: "Expired" };
  function showError(m) { errBox.textContent = m || ""; errBox.hidden = !m; if (m) errBox.scrollIntoView({ block: "nearest" }); }
  function notify(m, bad) { const t = document.querySelector("[data-toast]"); if (!t) return; t.textContent = m; t.dataset.kind = bad ? "error" : "success"; t.hidden = false; setTimeout(() => { t.hidden = true; }, 5000); }
  async function call(url, body) {
    const r = await fetch(url, { method: "POST", credentials: "same-origin", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Request failed (${r.status}).`);
    return j;
  }
  function apply(data) {
    const o = data?.offers || data;
    if (!o || !Array.isArray(o.items)) throw new Error("The server reply was not understood. Reload to see current offers.");
    state = { ...state, available: o.available !== false, items: o.items, products: o.products || state.products, collections: o.collections || state.collections };
    renderList();
  }
  function ticket(v, o) {
    const t = el("article", "lbo-ticket"); t.dataset.offerStatus = v.status;
    const val = el("div", "lbo-t-value"); val.append(el("strong", "", v.value), el("small", "", v.kindLabel));
    const body = el("div", "lbo-t-body");
    body.append(el("h3", "", v.title || "Untitled offer"), el("span", "lbo-t-code", v.code), el("p", "", v.scope), el("p", "lbo-t-valid", v.valid));
    const side = el("div", "lbo-t-side"); side.append(Object.assign(el("span", "lb-status lbo-status", label[v.status] || v.status), { }));
    side.firstChild.dataset.offerStatus = v.status;
    if (o) { const e = el("button", "lb-button lb-button-small lb-button-outline", "Edit"); e.type = "button"; e.onclick = () => open(o); side.append(e); }
    t.append(val, body, side); return t;
  }
  const scopeText = (scope, n) => scope === "order" ? "Whole order" : `${n} ${scope}${n === 1 ? "" : "s"} selected`;
  const validText = (s, e) => s || e ? `${s ? utc(s) : "From activation"} to ${e ? utc(e) : "no end date"}` : "No schedule, runs while active";
  const cardView = o => ({ title: o.title, status: o.display_status, value: fmtValue(o), kindLabel: o.kind === "percentage" ? "off" : "off, fixed", code: o.method === "code" ? o.code : "Automatic", scope: scopeText(o.scope, o.target_ids.length), valid: validText(o.starts_at, o.ends_at) });
  function preview() {
    const box = $("[data-offer-preview]"); if (!box) return;
    const pct = f("kind").value === "percentage", raw = f("value").value.trim(), ok = /^\d+(\.\d{1,2})?$/.test(raw) && Number(raw) > 0;
    const value = ok ? (pct ? `${Number(raw)}%` : `Rs ${Number(raw).toLocaleString("en-IN")}`) : "Value";
    const code = f("code").value.trim().toUpperCase(), isCode = f("method").value === "code";
    const iso = v => v ? utc(new Date(`${v}:00Z`)) : "";
    const st = f("status").value;
    box.replaceChildren(ticket({ title: f("title").value.trim(), status: st, value, kindLabel: pct ? "off" : "off, fixed", code: isCode ? (code || "CODE") : "Automatic", scope: scopeText(f("scope").value, selected.size), valid: validText(iso(f("starts_at").value), iso(f("ends_at").value)) }));
  }
  function renderList() {
    const tk = $("[data-offers-tickets]"); tk.replaceChildren(...state.items.map(o => ticket(cardView(o), state.available ? o : null)));
    list.replaceChildren();
    if (!state.items.length) {
      const e = el("div", "lbo-empty");
      e.append(el("strong", "", "No offers yet."), el("p", "", state.available ? "Create an automatic discount or a code. Nothing applies at checkout until an offer is active." : "Offers can be created once the update is available."));
      list.append(e); return;
    }
    const wrap = el("div", "lb-table-wrap"), t = el("table", "lb-table lbo-table");
    const head = t.createTHead().insertRow();
    for (const h of ["Offer", "Discount", "Rules", "Schedule (UTC)", "Used", "Status", ""]) head.append(Object.assign(document.createElement("th"), { textContent: h }));
    const body = t.createTBody();
    for (const o of state.items) {
      const r = body.insertRow();
      const c1 = r.insertCell(); c1.append(el("strong", "", o.title), el("small", "", o.method === "code" ? `Code ${o.code}` : "Automatic"));
      const c2 = r.insertCell(); c2.append(el("strong", "", fmtValue(o)), el("small", "", { order: "Whole order", product: `${o.target_ids.length} product(s)`, collection: `${o.target_ids.length} collection(s)` }[o.scope] || ""));
      const rules = [o.min_spend_paise ? `Min spend ${inr(o.min_spend_paise)}` : "", o.min_quantity > 1 ? `Min qty ${o.min_quantity}` : "", o.max_discount_paise != null ? `Saves up to ${inr(o.max_discount_paise)}` : ""].filter(Boolean);
      r.insertCell().textContent = rules.join(", ") || "None";
      const c4 = r.insertCell(); c4.textContent = o.starts_at || o.ends_at ? `${o.starts_at ? utc(o.starts_at) : "Now"} to ${o.ends_at ? utc(o.ends_at) : "No end"}` : "Always";
      r.insertCell().textContent = o.usage_limit != null ? `${o.used_count} of ${o.usage_limit}` : String(o.used_count);
      const c6 = r.insertCell(); c6.append(Object.assign(el("span", "lb-status lbo-status", label[o.display_status] || o.display_status), { }));
      c6.firstChild.dataset.offerStatus = o.display_status;
      const c7 = r.insertCell(); c7.className = "lbo-actions";
      const edit = el("button", "lb-text-button", "Edit"); edit.type = "button"; edit.onclick = () => open(o); c7.append(edit);
      const next = o.status === "active" ? ["paused", "Pause"] : ["active", o.status === "draft" ? "Activate" : "Resume"];
      const tog = el("button", "lb-text-button", next[1]); tog.type = "button";
      tog.onclick = async () => { tog.disabled = true; showError(""); try { apply(await call(`${api}/${encodeURIComponent(o.id)}/status`, { status: next[0], expected_revision: o.revision })); notify(`Offer ${next[0] === "paused" ? "paused" : "active"}.`); } catch (e) { showError(e.message); tog.disabled = false; } };
      if (state.available) c7.append(tog);
    }
    wrap.append(t); list.append(wrap);
  }
  const f = n => form.elements[n];
  function sync() {
    queueMicrotask(preview);
    const code = f("method").value === "code", pct = f("kind").value === "percentage", scope = f("scope").value;
    $("[data-code-field]").hidden = !code;
    $("[data-max-field]").hidden = !pct;
    $("[data-value-label]").textContent = pct ? "Percentage off (%)" : "Amount off (Rs)";
    $("[data-targets]").hidden = scope === "order";
    $("[data-targets-label]").textContent = scope === "collection" ? "Collections" : "Products";
    renderTargets();
  }
  function renderTargets() {
    const scope = f("scope").value, box = $("[data-target-list]"), q = $("[data-target-search]").value.trim().toLowerCase();
    box.replaceChildren();
    if (scope === "order") return;
    const src = scope === "collection" ? state.collections : state.products;
    const shown = src.filter(x => !q || String(x.title).toLowerCase().includes(q));
    if (!shown.length) box.append(el("small", "", src.length ? "No matches." : `No ${scope === "collection" ? "collections" : "products"} to choose from.`));
    for (const x of shown) {
      const l = el("label", "lbo-target"), c = document.createElement("input"); c.type = "checkbox"; c.checked = selected.has(x.id);
      c.onchange = () => { c.checked ? selected.add(x.id) : selected.delete(x.id); count(); };
      l.append(c, el("span", "", x.title)); box.append(l);
    }
    count();
  }
  const count = () => { preview(); $("[data-target-count]").textContent = `${selected.size} selected`; };
  const rupees = p => p == null ? "" : (p / 100).toFixed(2).replace(/\.00$/, "");
  const isoLocal = v => v ? new Date(v).toISOString().slice(0, 16) : "";
  function open(o) {
    editing = o || null; showError("");
    form.reset(); selected = new Set(o?.target_ids || []);
    $("[data-offer-form-title]").textContent = o ? "Edit offer" : "New offer";
    if (o) {
      f("title").value = o.title; f("method").value = o.method; f("code").value = o.code || ""; f("scope").value = o.scope; f("kind").value = o.kind;
      f("value").value = o.kind === "percentage" ? String(o.value / 100) : rupees(o.value);
      f("max_discount").value = rupees(o.max_discount_paise); f("min_spend").value = o.min_spend_paise ? rupees(o.min_spend_paise) : "";
      f("min_quantity").value = o.min_quantity > 1 ? o.min_quantity : ""; f("usage_limit").value = o.usage_limit ?? "";
      f("starts_at").value = isoLocal(o.starts_at); f("ends_at").value = isoLocal(o.ends_at); f("status").value = o.status;
    }
    $("[data-target-search]").value = "";
    panel.hidden = false; sync(); panel.scrollIntoView({ behavior: "smooth", block: "start" }); f("title").focus();
  }
  const money = (v, name) => { const t = String(v).trim(); if (!t) return 0; if (!/^\d+(\.\d{1,2})?$/.test(t)) throw new Error(`${name} must be a rupee amount with up to two decimals.`); return Math.round(Number(t) * 100); };
  const whole = (v, name) => { const t = String(v).trim(); if (!t) return 0; if (!/^\d+$/.test(t)) throw new Error(`${name} must be a whole number.`); return Number(t); };
  function payload() {
    const title = f("title").value.trim(); if (!title) throw new Error("Give the offer a name.");
    if (title.length > 120) throw new Error("Offer name can be at most 120 characters.");
    const method = f("method").value, kind = f("kind").value, scope = f("scope").value;
    const code = method === "code" ? f("code").value.trim().toUpperCase() : null;
    if (method === "code" && !/^[A-Z0-9][A-Z0-9-]{2,31}$/.test(code)) throw new Error("Code must be 3 to 32 characters, starting with a letter or digit, then letters, digits or hyphens.");
    let value;
    if (kind === "percentage") {
      const t = f("value").value.trim(); if (!/^\d+(\.\d{1,2})?$/.test(t)) throw new Error("Enter a percentage with up to two decimals.");
      value = Math.round(Number(t) * 100); if (value < 1 || value > 10000) throw new Error("Percentage must be above 0 and at most 100.");
    } else { value = money(f("value").value, "Amount off"); if (value < 1) throw new Error("Enter an amount off above zero."); }
    const target_ids = scope === "order" ? [] : [...selected];
    if (scope !== "order" && !target_ids.length) throw new Error(`Choose at least one ${scope}.`);
    const maxText = f("max_discount").value.trim();
    const max = kind === "percentage" && maxText ? money(maxText, "Maximum saving") : null;
    if (max === 0) throw new Error("Maximum saving must be above zero, or leave it empty.");
    const lim = f("usage_limit").value.trim(); const usage_limit = lim ? whole(lim, "Total uses") : null;
    if (usage_limit === 0) throw new Error("Total uses must be at least 1, or leave it empty.");
    const iso = v => v ? new Date(`${v}:00Z`).toISOString() : null;
    const starts_at = iso(f("starts_at").value), ends_at = iso(f("ends_at").value);
    if (starts_at && ends_at && ends_at <= starts_at) throw new Error("The end time must be after the start time.");
    const body = { title, method, code, scope, kind, value, min_spend_paise: money(f("min_spend").value, "Minimum spend"), min_quantity: Math.max(1, whole(f("min_quantity").value, "Minimum quantity")), max_discount_paise: max, starts_at, ends_at, usage_limit, status: f("status").value, target_ids };
    if (editing) { body.id = editing.id; body.expected_revision = editing.revision; }
    return body;
  }
  form.addEventListener("input", e => { queueMicrotask(preview); if (e.target.name === "code") e.target.value = e.target.value.toUpperCase(); });
  form.addEventListener("change", e => { if (["method", "scope", "kind"].includes(e.target.name)) { if (e.target.name === "scope") selected = new Set(); sync(); } });
  $("[data-target-search]").addEventListener("input", renderTargets);
  $("[data-offer-cancel]").onclick = () => { panel.hidden = true; showError(""); };
  root.addEventListener("click", () => {});
  document.querySelector("[data-offer-new]")?.addEventListener("click", () => open(null));
  document.querySelector("[data-offers-retry]")?.addEventListener("click", () => location.reload());
  form.addEventListener("submit", async e => {
    e.preventDefault(); if (saving || state.available !== true) return;
    showError(""); let body;
    try { body = payload(); } catch (err) { showError(err.message); return; }
    saving = true; const b = $("[data-offer-save]"); b.disabled = true; b.textContent = "Saving...";
    try { apply(await call(api, body)); panel.hidden = true; notify("Offer saved."); }
    catch (err) { showError(err.message); }
    finally { saving = false; b.disabled = state.available !== true; b.textContent = "Save offer"; }
  });
  renderList();
}
