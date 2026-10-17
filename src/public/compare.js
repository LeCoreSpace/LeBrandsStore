import { PLATFORMS } from "./compare-data.js";
import { estimateCosts, recommend } from "./compare-engine.js";

export const DEFAULTS = { sales: 200000, aov: 800, prepaid: 60, gateway: 2, delivered: 100, billing: "annual" };
export const QUIZ_KEY = "lebrands-compare-quiz-v1";
export const QUIZ_FIELDS = {
  marketing: ["managed", "self"],
  international: ["no", "yes"],
  zoho: ["no", "yes"],
  variants: ["no", "yes"],
  guided: ["no", "yes"],
  budget: ["fixed", "lowest"],
};
export const QUIZ_DEFAULT = { marketing: "self", international: "no", zoho: "no", variants: "no", guided: "no", budget: "fixed" };

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
  const priced = results.filter(isPriced).sort((a, b) => a.total - b.total);
  const unknown = results.filter((r) => !isPriced(r));
  const row = (r, i) => `<li class="c-res"><div class="c-res-head"><span class="c-res-rank" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span><h4>${esc(r.name)}</h4><span class="c-res-tag">${r.status === "from" ? "Entry price, from" : "Estimated"}</span></div>
    <p class="c-res-total"><b>${inr(r.total)}</b><span> a month${annual ? ", effective" : ""}</span></p>
    <dl class="c-res-lines">
      <div><dt>Plan</dt><dd>${esc(r.plan || "Not stated")}</dd></div>
      <div><dt>Subscription</dt><dd>${inr(r.subscription)}</dd></div>
      <div><dt>Platform fee</dt><dd>${inr(r.platformFee)}</dd></div>
      <div><dt>Gateway fee</dt><dd>${inr(r.gatewayFee)}</dd></div>
      ${annual && typeof r.annualUpfront === "number" ? `<div><dt>Annual subscription upfront</dt><dd>${inr(r.annualUpfront)}</dd></div>` : ""}
    </dl>${r.note ? `<p class="c-res-note">${esc(r.note)}</p>` : ""}</li>`;
  const unk = (r) => `<li class="c-unk"><h4>${esc(r.name)}</h4><p>${esc(r.note || "No verified INR price. Add a regional quote above, or check the official source.")}</p></li>`;
  return `<h3 class="c-sub">Priced options, lowest estimate first</h3>
  ${priced.length ? `<ol class="c-res-list">${priced.map(row).join("")}</ol>` : '<p class="c-empty">No platform has a fully priced result for these inputs yet.</p>'}
  ${unknown.length ? `<h3 class="c-sub">Not priced, so not ranked</h3><ul class="c-unk-list">${unknown.map(unk).join("")}</ul>` : ""}`;
}

export function quizHtml(rec, results) {
  if (!rec) return "";
  const list = (arr) => `<ul>${(arr || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
  const primary = PLATFORMS.find((p) => p.id === rec.primary);
  const cost = rec.estimate && isPriced(rec.estimate) ? rec.estimate : results && results.find((r) => r.id === rec.primary && isPriced(r));
  const link = !primary ? "" : primary.id === "lebrands" ? '<a class="m-pr-btn" href="https://app.lebrands.store/signup">Start free with Ann</a>' : `<a class="m-pr-btn" href="${esc(primary.sourceUrl)}" rel="noopener" target="_blank">Official ${esc(primary.name)} source<span class="c-sr"> (opens in a new tab)</span></a>`;
  if (!primary) return `<div class="c-quiz-card"><h3>No platform fits every answer</h3>${rec.note ? `<p>${esc(rec.note)}</p>` : ""}${(rec.excluded || []).length ? `<h4>Ruled out</h4><ul>${rec.excluded.map((e) => `<li>${esc(nameOf(e.id))}: ${esc(e.reason)}</li>`).join("")}</ul>` : ""}</div>`;
  return `<div class="c-quiz-card"><p class="c-kick">Best fit on your answers</p><h3>${esc(primary.name)}</h3>
  ${list((rec.reasons || {})[rec.primary])}
  ${cost ? `<p class="c-quiz-cost">At your calculator inputs: about <b>${inr(cost.total)}</b> a month${cost.plan ? ` on ${esc(cost.plan)}` : ""}.</p>` : '<p class="c-quiz-cost">No fully priced estimate for this platform yet. Use the calculator with a regional quote.</p>'}
  ${rec.plan ? `<p>Plan: ${esc(typeof rec.plan === "string" ? rec.plan : rec.plan.name || "")}</p>` : ""}
  ${(rec.alternatives || []).length ? `<h4>Also worth a look</h4><ul>${rec.alternatives.map((id) => `<li><b>${esc(nameOf(id))}</b>${((rec.reasons || {})[id] || [])[0] ? `: ${esc(rec.reasons[id][0])}` : ""}</li>`).join("")}</ul>` : ""}
  ${(rec.excluded || []).length ? `<h4>Ruled out by your answers</h4><ul>${rec.excluded.map((e) => `<li>${esc(nameOf(e.id))}: ${esc(e.reason)}</li>`).join("")}</ul>` : ""}
  ${rec.note ? `<p class="c-res-note">${esc(rec.note)}</p>` : ""}${link}</div>`;
}

function init() {
  const form = document.querySelector("[data-calc]");
  if (!form) return;
  const out = form.querySelector("[data-results]");
  const status = form.querySelector("[data-status]");
  const errBox = form.querySelector("[data-errors]");
  const q = document.querySelector("[data-quiz]");
  const qstat = document.querySelector("[data-quiz-status]");
  const qout = document.querySelector("[data-quiz-out]");
  let lastQuiz = null;
  let lastInputs = { ...DEFAULTS, quotes: {} };
  let lastResults = [];

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
      if (lastQuiz) {
        qout.setAttribute("data-stale", "true");
        qstat.textContent = "Recommendation uses the previous valid calculator inputs. Fix the calculator to update it.";
      }
      return;
    }
    errBox.hidden = true; errBox.textContent = "";
    out.removeAttribute("data-stale");
    lastInputs = p.inputs;
    lastResults = estimateCosts(p.inputs);
    out.innerHTML = resultsHtml(lastResults, p.inputs);
    const n = lastResults.filter(isPriced).length;
    status.textContent = `Estimate updated. ${n} priced, ${lastResults.length - n} not priced.`;
    if (lastQuiz) show(lastQuiz, false);
  }
  form.addEventListener("input", run);
  form.addEventListener("submit", (e) => { e.preventDefault(); run(); });
  form.querySelector("[data-calc-reset]")?.addEventListener("click", () => {
    setTimeout(() => { for (const [k, v] of Object.entries(DEFAULTS)) { const el = form.elements[k]; if (el && el.type !== "radio") el.value = v; } form.elements.billing.value = "annual"; run(); }, 0);
  });
  run();

  if (!q) return;
  function valid(o) {
    return o && typeof o === "object" && Object.entries(QUIZ_FIELDS).every(([k, set]) => set.includes(o[k]));
  }
  const toRec = (o) => ({ marketing: o.marketing, international: o.international === "yes", zoho: o.zoho === "yes", variants: o.variants === "yes", guided: o.guided === "yes", budget: o.budget, sales: lastInputs.sales, aov: lastInputs.aov });
  function readQuiz() { return Object.fromEntries(Object.keys(QUIZ_FIELDS).map((k) => [k, q.elements[k].value])); }
  function show(o, save) {
    lastQuiz = o;
    qout.removeAttribute("data-stale");
    let rec = null;
    try { rec = recommend(toRec(o), lastInputs); } catch { rec = null; }
    if (!rec) { qout.innerHTML = '<p class="c-empty">The recommendation could not be worked out. Try the calculator instead.</p>'; qstat.textContent = "Recommendation unavailable."; return; }
    qout.innerHTML = quizHtml(rec, lastResults);
    qstat.textContent = rec.primary ? `Best fit: ${nameOf(rec.primary)}.` : "No platform fits every answer.";
    if (save) { try { localStorage.setItem(QUIZ_KEY, JSON.stringify(o)); } catch { /* storage optional */ } }
  }
  try {
    const saved = JSON.parse(localStorage.getItem(QUIZ_KEY) || "null");
    if (valid(saved)) { for (const k of Object.keys(QUIZ_FIELDS)) q.elements[k].value = saved[k]; show(saved, false); }
  } catch { /* ignore bad storage */ }
  q.addEventListener("submit", (e) => { e.preventDefault(); show(readQuiz(), true); });
  q.querySelector("[data-quiz-reset]")?.addEventListener("click", () => {
    lastQuiz = null;
    setTimeout(() => { for (const [k, v] of Object.entries(QUIZ_DEFAULT)) q.elements[k].value = v; }, 0);
    try { localStorage.removeItem(QUIZ_KEY); } catch { /* ignore */ }
    qout.innerHTML = ""; qstat.textContent = "Quiz reset.";
  });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
}
