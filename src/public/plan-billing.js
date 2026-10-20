import {registerLeaveGuard} from "./catalogue-confirm.js";
import { attachAnnPlanSelection } from "./ann-plan-ui.js";
import {attachTestCheckout} from "./billing-test.js";

function boot() {
  let cfg = {};
  try { cfg = JSON.parse(document.getElementById("plan-billing-data")?.textContent || "{}"); } catch { cfg = {}; }
  const status = document.querySelector("[data-billing-status]");
  const say = (t) => { if (status) status.textContent = t; };
  attachTestCheckout(cfg);

  // Read-only refresh: a plain reload, never an acceptance.
  document.addEventListener("click", (e) => {
    const b = e.target.closest?.("[data-billing-reload]");
    if (!b || b.getAttribute("aria-busy") === "true") return;
    b.setAttribute("aria-busy", "true");
    b.textContent = "Refreshing...";
    say("Refreshing plan details.");
    location.reload();
  });

  const tg = [...document.querySelectorAll("[data-billing-interval]")];
  const setInt = (iv, focus) => {
    tg.forEach((b) => { const on = b.dataset.billingInterval === iv; b.setAttribute("aria-pressed", String(on)); if (on && focus) b.focus(); });
    document.querySelectorAll("[data-plan-interval]").forEach((p) => { p.hidden = p.dataset.planInterval !== iv; });
    say(iv === "annual" ? "Showing yearly totals." : "Showing monthly totals.");
  };
  tg.forEach((b, i) => {
    b.addEventListener("click", () => setInt(b.dataset.billingInterval));
    b.addEventListener("keydown", (e) => {
      if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
      e.preventDefault(); const n = tg[(i + (e.key === "ArrowRight" ? 1 : tg.length - 1)) % tg.length]; setInt(n.dataset.billingInterval, true);
    });
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
  registerLeaveGuard(()=>ctl.hasUnsavedChanges());
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
