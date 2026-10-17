import { PLATFORMS } from "./compare-data.js";
import { estimateCosts } from "./compare-engine.js";

export const DEFAULTS = { sales: 200000, aov: 800, prepaid: 60, gateway: 2, delivered: 100, billing: "annual" };

export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const inr = (n) => (typeof n === "number" && Number.isFinite(n) ? `\u20B9${Math.round(n).toLocaleString("en-IN")}` : "Not verified");
const nameOf = (id) => (PLATFORMS.find((p) => p.id === id) || { name: id }).name;

// Returns { ok, inputs, errors }. Never coerces bad text to 0.
export function parseInputs(raw) {
  const errors = {};
  const num = (key, label, min, max, { minExclusive = false } = {}) => {
    const t = String(raw[key] ?? "").trim();
    if (t === "") { errors[key] = `${label} is required.`; return null; }
    const n = Number(t.replace(/,/g, ""));
    if (!Number.isFinite(n)) { errors[key] = `${label} must be a number.`; return null; }
    if (n < min || (minExclusive && n === min) || n > max) { errors[key] = `${label} must be ${minExclusive ? "above" : "between"} ${min}${max === Infinity ? "" : ` and ${max}`}.`; return null; }
    return n;
  };
  const inputs = {
    sales: num("sales", "Monthly sales", 0, 1e9),
    aov: num("aov", "Average order value", 0.01, 1e7),
    prepaid: num("prepaid", "Prepaid share", 0, 100),
    gateway: num("gateway", "Gateway fee", 0, 100),
    delivered: num("delivered", "Delivered share", 0, 100),
    billing: raw.billing === "monthly" ? "monthly" : "annual",
    quotes: {},
  };
  for (const id of ["shopify", "zoho"]) {
    const m = String(raw[`${id}Monthly`] ?? "").trim();
    const r = String(raw[`${id}Rate`] ?? "").trim();
    if (!m && !r) continue;
    const mn = Number(m.replace(/,/g, ""));
    const rn = Number(r);
    if (!m || !Number.isFinite(mn) || mn < 0 || mn > 1e9) errors[`${id}Monthly`] = `${nameOf(id)} monthly quote must be between 0 and 1,000,000,000 rupees.`;
    if (!r || !Number.isFinite(rn) || rn < 0 || rn > 100) errors[`${id}Rate`] = `${nameOf(id)} transaction rate must be a percent from 0 to 100. Enter both quote fields or leave both blank.`;
    if (!errors[`${id}Monthly`] && !errors[`${id}Rate`]) inputs.quotes[id] = { monthly: mn, rate: rn };
  }
  return { ok: Object.keys(errors).length === 0, inputs, errors };
}

const isPriced = (r) => (r.status === "estimated" || r.status === "from") && typeof r.total === "number" && Number.isFinite(r.total);

export function resultsHtml(results, inputs) {
  const annual = inputs.billing === "annual";
  const q = '<span class="c-quote">Quote only</span>';
  const money = (r, v) => (isPriced(r) && typeof v === "number" ? inr(v) : q);
  const rows = results.map((r) => `<tr${r.id === "lebrands" ? ' class="is-own"' : ""}><th scope="row">${esc(r.name)}</th><td>${r.plan ? esc(r.plan) : q}</td><td class="c-num">${money(r, r.subscription)}</td><td class="c-num">${money(r, r.platformFee)}</td><td class="c-num">${money(r, r.gatewayFee)}</td><td class="c-num c-strong">${money(r, r.total)}</td><td class="c-num">${annual && isPriced(r) && typeof r.annualUpfront === "number" ? inr(r.annualUpfront) : annual ? q : "Not applicable"}</td></tr>`).join("");
  const notes = results.filter((r) => r.note).map((r) => `<details class="c-note"><summary>${esc(r.name)} note</summary><p>${esc(r.note)}</p></details>`).join("");
  return `<div class="c-scroll" role="region" tabindex="0" aria-label="Estimated monthly cost by platform, scrollable table"><table class="c-table c-cost"><caption class="c-sr">Estimated monthly cost, ${annual ? "annual" : "monthly"} billing, lowest-cost eligible plan per platform</caption><thead><tr><th scope="col">Platform</th><th scope="col">Selected plan</th><th scope="col">Subscription / mo</th><th scope="col">Platform fee / mo</th><th scope="col">Gateway fee / mo</th><th scope="col">Monthly total</th><th scope="col">Annual subscription upfront</th></tr></thead><tbody>${rows}</tbody></table></div>${notes ? `<div class="c-notes">${notes}</div>` : ""}`;
}

function init() {
  const form = document.querySelector("[data-calc]");
  if (!form) return;
  const out = form.querySelector("[data-results]");
  const status = form.querySelector("[data-status]");
  const errBox = form.querySelector("[data-errors]");

  const raw = () => Object.fromEntries(new FormData(form).entries());
  function setInvalid(errors) {
    for (const el of form.querySelectorAll("input[name]")) {
      const bad = Boolean(errors[el.name]);
      el.setAttribute("aria-invalid", String(bad));
      if (bad) el.setAttribute("aria-describedby", "calc-errors"); else el.removeAttribute("aria-describedby");
    }
  }
  function run() {
    const p = parseInputs(raw());
    setInvalid(p.errors);
    if (!p.ok) {
      errBox.hidden = false;
      errBox.innerHTML = `<p><b>Results not updated.</b> Fix these inputs:</p><ul>${Object.values(p.errors).map((e) => `<li>${esc(e)}</li>`).join("")}</ul>`;
      status.textContent = `Results not updated. ${Object.keys(p.errors).length} input problem${Object.keys(p.errors).length === 1 ? "" : "s"}.`;
      out.setAttribute("data-stale", "true");
      return;
    }
    errBox.hidden = true; errBox.textContent = "";
    out.removeAttribute("data-stale");
    const results = estimateCosts(p.inputs);
    out.innerHTML = resultsHtml(results, p.inputs);
    const n = results.filter(isPriced).length;
    status.textContent = `Estimate updated. ${n} priced, ${results.length - n} quote only.`;
  }
  form.addEventListener("input", run);
  form.addEventListener("submit", (e) => { e.preventDefault(); run(); });
  form.querySelector("[data-calc-reset]")?.addEventListener("click", () => {
    setTimeout(() => { for (const [k, v] of Object.entries(DEFAULTS)) { const el = form.elements[k]; if (el && el.type !== "radio") el.value = v; } form.elements.billing.value = "annual"; run(); }, 0);
  });
  run();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
}
