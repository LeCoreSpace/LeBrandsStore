const root = document.querySelector("[data-discovery-root]");
let boot = {};
try { boot = JSON.parse(document.getElementById("discovery-data")?.textContent || "{}"); } catch { /* empty */ }
if (root) {
  const status = root.querySelector("[data-status]");
  const say = (t, err) => { status.hidden = !t; status.textContent = t; status.dataset.kind = err ? "error" : "ok"; status.setAttribute("role", err ? "alert" : "status"); };
  root.addEventListener("click", async e => {
    const c = e.target.closest("[data-copy]");
    if (c) {
      const text = boot.files?.[Number(c.dataset.copy)]?.content ?? "";
      try { await navigator.clipboard.writeText(text); say("Copied to clipboard."); } catch { say("Copy was blocked by your browser. Select the text and copy it manually.", true); }
      return;
    }
    const r = e.target.closest("[data-refresh]");
    if (!r) return;
    r.disabled = true; say("Refreshing");
    try {
      const res = await fetch(`/api/stores/${encodeURIComponent(boot.storeId)}/content-llm`, { credentials: "same-origin", headers: { Accept: "application/json" } });
      let j = {}; try { j = await res.json(); } catch { /* empty */ }
      if (!res.ok) throw new Error(j.error || `Request failed (${res.status}).`);
      sessionStorage.setItem("lbd-refreshed", "1");
      location.reload();
    } catch (x) { say(x.message || "Refresh failed.", true); r.disabled = false; }
  });
  if (sessionStorage.getItem("lbd-refreshed")) { sessionStorage.removeItem("lbd-refreshed"); say("Files refreshed."); }
}
