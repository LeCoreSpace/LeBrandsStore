import {renderAnalyticsCharts} from "./analytics-charts.js";
const app = document.querySelector(".lb-app");
const box = document.querySelector("[data-an-root]");
if (app && box) {
  const boot = (() => { try { return JSON.parse(document.getElementById("analytics-data")?.textContent || "{}"); } catch { return {}; } })();
  const storeId = app.dataset.storeId || boot.storeId || "";
  const api = app.dataset.apiRoot || `/api/stores/${encodeURIComponent(storeId)}`;
  const storeRoot = app.dataset.storeRoot || `/stores/${encodeURIComponent(storeId)}`;
  const pagePath = `${storeRoot.replace(/\/$/, "")}/analytics`;
  const INITIAL = boot.analytics?.filters;
  const LIMIT = INITIAL?.limit || 50, TZ = "Asia/Kolkata", PRESETS = ["this_month", "this_quarter", "financial_year", "last_30_days", "custom"], REPORTS = ["sales", "orders", "products"];
  const $ = (s) => box.querySelector(s);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const form = $("[data-an-form]"), bodyEl = $("[data-an-body]");
  const currencyDefault = boot.store?.currency || "INR";
  const SYM = { INR: "\u20B9", USD: "$", EUR: "\u20AC", GBP: "\u00A3" };
  let cur = currencyDefault;
  const iso = /^\d{4}-\d{2}-\d{2}$/;

  function validTz(z) { if (!z || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/.test(z)) return false; try { new Intl.DateTimeFormat("en", { timeZone: z }); return true; } catch { return false; } }
  const q = new URLSearchParams(location.search);
  const state = {
    preset: PRESETS.includes(q.get("preset")) ? q.get("preset") : "this_month",
    from: iso.test(q.get("from") || "") ? q.get("from") : "",
    to: iso.test(q.get("to") || "") ? q.get("to") : "",
    report: REPORTS.includes(q.get("report")) ? q.get("report") : "sales",
    offset: Math.max(0, parseInt(q.get("offset") || "0", 10) || 0),
    timezone: validTz(q.get("timezone")) ? q.get("timezone") : TZ,
    currency: /^[A-Z]{3}$/.test(q.get("currency") || "") ? q.get("currency") : currencyDefault,
    data: null, loading: false, loadedAt: 0, exporting: false,
    charts: {style:q.get("chart")||"line",metric:q.get("metric")||"net_merchandise_paise",ranking:q.get("ranking")||"item_value_paise"},
  };
  if ((state.from || state.to) && state.preset !== "custom") state.preset = "custom";
  if (INITIAL) Object.assign(state, {
    preset: INITIAL.preset, from: INITIAL.preset === "custom" ? INITIAL.from : "",
    to: INITIAL.preset === "custom" ? INITIAL.to : "", timezone: INITIAL.timezone,
    currency: INITIAL.currency, report: INITIAL.report, offset: INITIAL.offset,
  });
  cur = state.currency;

  const int = (v) => v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
  const money = (v) => {
    const n = int(v); if (n === null) return "Unknown";
    const neg = n < 0, a = Math.abs(n);
    return `${neg ? "-" : ""}${SYM[cur] || cur + " "}${Math.floor(a / 100).toLocaleString("en-IN")}.${String(a % 100).padStart(2, "0")}`;
  };
  const num = (v) => int(v) === null ? "Unknown" : int(v).toLocaleString("en-IN");
  const pct = (v) => v === null || v === undefined || !Number.isFinite(Number(v)) ? "Unknown" : `${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 1 })}%`;
  const day = (s) => { const m = iso.exec(String(s || "").slice(0, 10)); if (!m) return String(s || ""); return new Date(`${String(s).slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }); };
  const stamp = (s) => { const d = new Date(s); return isNaN(d) ? "Not recorded" : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: state.timezone }); };

  function validate(preset, from, to) {
    if (preset !== "custom") return "";
    if (!from || !to) return "Choose both a start and an end date.";
    if (!iso.test(from) || !iso.test(to) || isNaN(Date.parse(from)) || isNaN(Date.parse(to))
      || new Date(from).toISOString().slice(0, 10) !== from || new Date(to).toISOString().slice(0, 10) !== to
      || Number(from.slice(0, 4)) < 1900) return "Enter valid dates from 1900 onward.";
    const days = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
    if (days < 1) return "The start date must be on or before the end date.";
    if (days > 366) return "Custom ranges can cover at most 366 days.";
    return "";
  }
  function filterParams(extra) {
    const p = new URLSearchParams({ preset: state.preset, timezone: state.timezone, currency: state.currency, report: state.report });
    if (state.preset === "custom") { p.set("from", state.from); p.set("to", state.to); }
    for (const [k, v] of Object.entries(extra || {})) p.set(k, String(v));
    return p;
  }
  function syncUrl() {
    const p = new URLSearchParams({ preset: state.preset, report: state.report, timezone: state.timezone, currency: state.currency });
    if (state.preset === "custom") { p.set("from", state.from); p.set("to", state.to); }
    if (state.offset) p.set("offset", String(state.offset));
    history.replaceState(null, "", `${pagePath}?${p}`);
  }
  function syncControls() {
    const tzs = form.elements.timezone;
    if (![...tzs.options].some((o) => o.value === state.timezone)) tzs.add(new Option(state.timezone, state.timezone));
    tzs.value = state.timezone; form.elements.currency.value = state.currency;
    form.elements.preset.value = state.preset;
    form.elements.from.value = state.from; form.elements.to.value = state.to;
    const custom = state.preset === "custom";
    box.querySelectorAll("[data-an-custom]").forEach((e) => { e.hidden = !custom; });
    box.querySelectorAll("[data-an-report]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.anReport === state.report)));
  }
  const formErr = (m) => { const e = $("[data-an-formerr]"); e.textContent = m || ""; e.hidden = !m; };
  const alertBox = (html) => { const a = $("[data-an-alert]"); a.innerHTML = html || ""; a.hidden = !html; };
  const toast = (m, err) => { const t = document.querySelector("[data-toast]"); if (!t) return; t.textContent = m; t.dataset.kind = err ? "error" : "success"; t.hidden = false; setTimeout(() => { t.hidden = true; }, 6000); };

  let reqId = 0, ctl = null;
  async function load(silent) {
    const id = ++reqId;
    if (ctl) ctl.abort();
    ctl = new AbortController();
    state.loading = true;
    $("[data-an-actions]").hidden = true;
    $("[data-an-print]").hidden = true;
    $("[data-an-print]").innerHTML = "";
    if (!silent || !state.data) { bodyEl.setAttribute("aria-busy", "true"); if (!state.data) bodyEl.innerHTML = `<div class="lb-skeleton" aria-label="Loading analytics"><i></i><i></i><i></i><i></i></div>`; }
    try {
      const res = await fetch(`${api}/analytics?${filterParams({ limit: LIMIT, offset: state.offset })}`, { credentials: "same-origin", headers: { Accept: "application/json" }, cache: "no-store", signal: ctl.signal });
      const body = await res.json().catch(() => ({}));
      if (id !== reqId) return;
      if (!res.ok) throw Object.assign(new Error(body.error || (res.status === 403 ? "You do not have access to analytics for this store." : `Request failed (${res.status}).`)), { status: res.status });
      state.data = body; state.loadedAt = Date.now();
      alertBox(""); render();
    } catch (e) {
      if (e.name === "AbortError" || id !== reqId) return;
      if (!silent || !state.data || [401, 403].includes(e.status)) { state.data = null; bodyEl.innerHTML = ""; $("[data-an-actions]").hidden = true; }
      alertBox(`<span>${esc(e.message || "Could not load analytics.")}</span>${e.status === 403 ? "" : `<button type="button" class="lb-button lb-button-small lb-button-outline" data-an-retry>Try again</button>`}`);
    } finally { if (id === reqId) { state.loading = false; bodyEl.setAttribute("aria-busy", "false"); } }
  }

  const th = (l, n) => `<th${n ? ' class="n"' : ""}>${l}</th>`;
  const td = (v, n) => `<td${n ? ' class="n"' : ""}>${v}</td>`;
  function table(report, rows) {
    const defs = {
      sales: [["Date", 0], ["Orders", 1], ["All orders", 1], ["Gross", 1], ["Discounts", 1], ["Reversals", 1], ["Net merchandise", 1], ["Booked value", 1], ["Units", 1]],
      orders: [["Order", 0], ["Placed", 0], ["Status", 0], ["Payment", 0], ["Product", 0], ["SKU", 0], ["Qty", 1], ["Unit price", 1], ["Line total", 1], ["Taxable", 1], ["Order discount", 1], ["Order total", 1], ["Unit cost", 1], ["Cost status", 0], ["Est. margin", 1]],
      products: [["Product", 0], ["SKU", 0], ["Units", 1], ["Orders", 1], ["Item value", 1], ["Known cost units", 1], ["Comparable units", 1], ["Coverage", 1], ["Comparable revenue", 1], ["Captured cost", 1], ["Est. margin", 1]],
    }[report];
    const costLabel = { known: "Known", missing: "Missing", currency_mismatch: "Currency mismatch" };
    const line = (r) => {
      if (report === "sales") return td(esc(day(r.date))) + td(num(r.orders), 1) + td(num(r.all_orders), 1) + td(money(r.gross_merchandise_paise), 1) + td(money(r.discounts_paise), 1) + td(money(r.reversals_paise), 1) + td(money(r.net_merchandise_paise), 1) + td(money(r.booked_order_value_paise), 1) + td(num(r.units), 1);
      if (report === "orders") return td(esc(r.order_number || "")) + td(esc(stamp(r.created_at))) + td(esc(String(r.status || "").replace(/_/g, " "))) + td(esc(String(r.payment_method || "").replace(/_/g, " ") || "Not recorded")) + `<td>${esc(r.title || "")}${r.variant_label ? ` <small>${esc(r.variant_label)}</small>` : ""}</td>` + td(esc(r.sku || "No SKU")) + td(num(r.quantity), 1) + td(money(r.unit_price_paise), 1) + td(money(r.line_total_paise), 1) + td(money(r.taxable_paise), 1) + td(money(r.order_discount_paise), 1) + td(money(r.order_total_paise), 1) + td(int(r.unit_cost_paise) === null ? "Unknown" : money(r.unit_cost_paise), 1) + td(esc(costLabel[r.cost_status] || "Unknown")) + td(int(r.estimated_margin_paise) === null ? "Unknown" : money(r.estimated_margin_paise), 1);
      return `<td>${esc(r.title || "")}${r.variant_label ? ` <small>${esc(r.variant_label)}</small>` : ""}</td>` + td(esc(r.sku || "No SKU")) + td(num(r.units), 1) + td(num(r.orders), 1) + td(money(r.item_value_paise), 1) + td(num(r.known_units), 1) + td(num(r.comparable_units), 1) + td(pct(r.coverage_percent), 1) + td(money(r.comparable_revenue_paise), 1) + td(money(r.captured_cost_paise), 1) + td(int(r.estimated_margin_paise) === null ? "Unknown" : money(r.estimated_margin_paise), 1);
    };
    return `<div class="lb-table-wrap"><table class="lb-table lba-table"><thead><tr>${defs.map(([l, n]) => th(l, n)).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${line(r)}</tr>`).join("")}</tbody></table></div>`;
  }

  function render() {
    const a = state.data?.analytics || {};
    const actions = $("[data-an-actions]"), print = $("[data-an-print]");
    if (state.data?.store?.currency) cur = state.data.store.currency;
    if (a.available === false) {
      actions.hidden = true; print.hidden = true;
      bodyEl.innerHTML = `<section class="lb-empty"><h2>Analytics are not ready yet.</h2><p>The reporting tables this page needs have not been set up for this store. No figures are shown until they are. Nothing is lost.</p><button type="button" class="lb-button" data-an-retry>Check again</button></section>`;
      return;
    }
    const f = a.filters || {}, s = a.summary || {}, c = a.costs || {}, t = a.table || { rows: [], total: 0, limit: LIMIT, offset: 0 };
    if (f.currency) cur = f.currency;
    const firstSale = s.first_sale_at ? ` First accepted sale in this period: ${stamp(s.first_sale_at)}.` : "";
    const rows = Array.isArray(t.rows) ? t.rows : [], daily = Array.isArray(a.daily) ? a.daily : [];
    const total = Number(t.total || 0), off = Number(t.offset || 0), lim = Number(t.limit || LIMIT);
    const scope = `${day(f.from)} to ${day(f.to)}, ${f.timezone || state.timezone}, ${f.currency || cur}`;
    const cards = [
      ["Accepted orders", num(s.orders), `${num(s.all_orders)} in all statuses`],
      ["Units sold", num(s.units), "Accepted orders"],
      ["Booked order value", money(s.booked_order_value_paise), "Includes tax and shipping"],
      ["Average order value", int(s.orders) ? money(s.aov_paise) : "Unknown", "Booked value per accepted order"],
    ].map(([l, v, n]) => `<div class="lba-card"><span>${l}</span><strong>${v}</strong><small class="lb-muted">${n}</small></div>`).join("");
    const wf = [["Gross merchandise", s.gross_merchandise_paise], ["Discounts", s.discounts_paise], ["Reversals (status estimate)", s.reversals_paise], ["Net merchandise", s.net_merchandise_paise]].map(([l, v]) => `<div><span>${l}</span><b>${money(v)}</b></div>`).join("");
    const costs = `<div class="lba-grid">
      <div class="lba-card"><span>Cost coverage</span><strong>${pct(c.coverage_percent)}</strong><small class="lb-muted">${num(c.known_units)} of ${num(c.total_units)} units have a captured cost</small></div>
      <div class="lba-card"><span>Comparable units</span><strong>${num(c.comparable_units)}</strong><small class="lb-muted">Known cost, verified ex-tax value, no unallocated discount</small></div>
      <div class="lba-card"><span>Estimated product margin</span><strong>${int(c.estimated_margin_paise) === null ? "Unknown" : money(c.estimated_margin_paise)}</strong><small class="lb-muted">${c.margin_percent == null ? "Not enough comparable data" : `${pct(c.margin_percent)} of ${money(c.comparable_revenue_paise)} comparable revenue, captured cost ${money(c.captured_cost_paise)}`}. Not net profit.</small></div></div>`;
    const dailyHtml = daily.length ? `<div class="lb-table-wrap"><table class="lb-table lba-table"><caption class="lb-sr-only">Daily totals</caption><thead><tr>${th("Date")}${th("Orders", 1)}${th("Units", 1)}${th("Net merchandise", 1)}${th("Booked value", 1)}</tr></thead><tbody>${daily.map((d) => `<tr>${td(esc(day(d.date)))}${td(num(d.orders), 1)}${td(num(d.units), 1)}${td(money(d.net_merchandise_paise), 1)}${td(money(d.booked_order_value_paise), 1)}</tr>`).join("")}</tbody></table></div>` : `<p class="lb-muted">No accepted orders on any day in this period.</p>`;
    const names = { sales: "Daily sales", orders: "Order lines, all statuses", products: "Products, accepted orders" };
    const tbl = rows.length ? table(f.report || state.report, rows) : `<section class="lb-empty"><h2>No rows in this period.</h2><p>Try a wider period or another report.</p></section>`;
    const pager = `<div class="lba-pager"><span>${total.toLocaleString("en-IN")} rows</span><span><button type="button" class="lb-button lb-button-small lb-button-outline" data-an-page="-1" ${off <= 0 ? "disabled" : ""}>Previous</button> ${total ? off + 1 : 0} to ${Math.min(off + lim, total)} <button type="button" class="lb-button lb-button-small lb-button-outline" data-an-page="1" ${off + lim >= total ? "disabled" : ""}>Next</button></span></div>`;
    const other = int(a.other_currency_orders) > 0 ? `<p class="lba-note">${num(a.other_currency_orders)} orders in other currencies are excluded from these figures.</p>` : "";
    bodyEl.innerHTML = `<p class="lba-meta">${esc(scope)}. Updated ${esc(stamp(a.generated_at))}.${esc(firstSale)}</p>${other}
      <div class="lba-grid">${cards}</div>
      <h2>Merchandise waterfall</h2><div class="lba-wf">${wf}</div>
      <h2>Product cost coverage</h2>${costs}
      ${renderAnalyticsCharts(a,state.charts,cur)}
      <section class="lba-detail" id="an-report"><h2>${esc(names[f.report || state.report] || "Report")}</h2>${tbl}${pager}
      ${(f.report || state.report) === "sales" ? "" : `<details><summary>Daily totals</summary>${dailyHtml}</details>`}</section>`;
    print.hidden = false;
    print.innerHTML = `<strong>${esc(boot.store?.name || "")} | LeBrands.Store Analytics: ${esc(names[f.report || state.report] || "")}</strong><br>Period: ${esc(day(f.from))} to ${esc(day(f.to))}. Timezone: ${esc(f.timezone || state.timezone)}. Currency: ${esc(f.currency || cur)}.<br>Booked order value is the stored total including tax and shipping, not cash or profit. Merchandise amounts include tax and are order based; returned and refunded statuses are estimated reversals. Estimated margin covers only the comparable subset and is not net profit.<br>Summary only. Use CSV or XLSX for complete report rows.`;
    actions.hidden = false;
  }

  function apply(offset) {
    state.offset = offset || 0; syncControls(); syncUrl(); load();
  }
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const preset = form.elements.preset.value, from = form.elements.from.value, to = form.elements.to.value;
    const tz = form.elements.timezone.value, ccy = form.elements.currency.value.trim().toUpperCase();
    let err = validate(preset, from, to);
    if (!err && !/^[A-Z]{3}$/.test(ccy)) err = "Currency must be a three-letter code such as INR.";
    formErr(err); if (err) return;
    state.timezone = tz; state.currency = ccy; cur = ccy;
    state.preset = preset; state.from = preset === "custom" ? from : ""; state.to = preset === "custom" ? to : "";
    apply(0);
  });
  form.elements.preset.addEventListener("change", () => {
    const preset = form.elements.preset.value;
    formErr("");
    if (preset === "custom") {
      state.preset = "custom";
      if (!form.elements.from.value || !form.elements.to.value) { const t = new Date(), f = new Date(t.getTime() - 29 * 86400000); form.elements.to.value = state.to || t.toISOString().slice(0, 10); form.elements.from.value = state.from || f.toISOString().slice(0, 10); }
      box.querySelectorAll("[data-an-custom]").forEach((x) => { x.hidden = false; });
    } else { state.preset = preset; state.from = ""; state.to = ""; apply(0); }
  });
  const dl = async (format) => {
    if (state.exporting || state.loading || !state.data?.analytics?.available) return;
    const err = validate(state.preset, state.from, state.to); if (err) { formErr(err); return; }
    state.exporting = true;
    const btns = box.querySelectorAll("[data-an-export]"); btns.forEach((b) => { b.disabled = true; });
    try {
      const res = await fetch(`${api}/analytics/export?${filterParams({ format })}`, { credentials: "same-origin", cache: "no-store", headers: { Accept: format === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } });
      if (!res.ok) {
        let m = `Export failed (${res.status}).`;
        try { const j = await res.json(); if (j.error) m = j.error; } catch { /* keep default */ }
        throw new Error(m);
      }
      const cd = res.headers.get("content-disposition") || "";
      const mm = /filename\*=UTF-8''([^;]+)/i.exec(cd) || /filename="?([^";]+)"?/i.exec(cd);
      let name = `analytics-${state.report}.${format}`;
      if (mm) { try { name = decodeURIComponent(mm[1]); } catch { name = mm[1]; } }
      const blob = await res.blob(), url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast(`Downloaded ${name}.`);
    } catch (e) { alertBox(`<span>${esc(e.message)}</span>`); toast(e.message, true); }
    finally { state.exporting = false; btns.forEach((b) => { b.disabled = false; }); }
  };
  box.addEventListener("change", (e) => {
    const control=e.target.closest("[data-an-chart-control]");
    if(!control||!["style","metric","ranking"].includes(control.dataset.anChartControl))return;
    const key=control.dataset.anChartControl;
    state.charts[key]=control.value;
    render();
    box.querySelector(`[data-an-chart-control="${key}"]`)?.focus();
  });
  box.addEventListener("click", (e) => {
    const t = e.target;
    const r = t.closest("[data-an-report]");
    if (r) { if (state.report !== r.dataset.anReport) { state.report = r.dataset.anReport; apply(0); } return; }
    if (t.closest("[data-an-retry]")) { load(); return; }
    const pg = t.closest("[data-an-page]");
    if (pg) { apply(Math.max(0, state.offset + Number(pg.dataset.anPage) * LIMIT)); return; }
    const ex = t.closest("[data-an-export]"); if (ex) { dl(ex.dataset.anExport); return; }
    if (t.closest("[data-an-printbtn]") && !state.loading && state.data?.analytics?.available) window.print();
  });
  const refresh = () => { if (!document.hidden && !state.loading && !state.exporting && state.data && Date.now() - state.loadedAt > 60000 && !validate(state.preset, state.from, state.to)) load(true); };
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", refresh);
  syncControls();
  const initErr = validate(state.preset, state.from, state.to);
  if (initErr) { formErr(initErr); bodyEl.innerHTML = ""; bodyEl.setAttribute("aria-busy", "false"); }
  else if (boot.analytics) {
    state.data = {store: boot.store, role: boot.role, analytics: boot.analytics};
    state.loadedAt = Date.now(); render(); bodyEl.setAttribute("aria-busy", "false");
  } else load();
}
