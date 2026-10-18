import { attachAnnPlanSelection } from "./ann-plan-ui.js";

function boot() {
  let cfg = {};
  try { cfg = JSON.parse(document.getElementById("plan-billing-data")?.textContent || "{}"); } catch { cfg = {}; }
  const status = document.querySelector("[data-billing-status]");
  const say = (t) => { if (status) status.textContent = t; };

  // Read-only refresh: a plain reload, never an acceptance.
  document.addEventListener("click", (e) => {
    const b = e.target.closest?.("[data-billing-reload]");
    if (!b || b.getAttribute("aria-busy") === "true") return;
    b.setAttribute("aria-busy", "true");
    b.textContent = "Refreshing...";
    say("Refreshing plan details.");
    location.reload();
  });

  const choose = document.querySelector("[data-billing-choose-free]");
  if (!choose || !cfg.endpoint) return;
  const ctl = attachAnnPlanSelection({
    endpoint: cfg.endpoint,
    role: cfg.role,
    getStoreName: () => cfg.storeName || "",
    onStateChange: () => { choose.disabled = !!ctl?.getState?.().busy; },
    onAccepted: () => { say("Your Free plan is active. Reloading."); location.reload(); },
  });
  choose.addEventListener("click", () => ctl.open());
  window.addEventListener("beforeunload", (e) => {
    if (ctl.hasUnsavedChanges()) { e.preventDefault(); e.returnValue = ""; }
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
