const PREFIX = "lebrands.nav.v1.";
const readPrefs = key => { try { const v = JSON.parse(localStorage.getItem(key) || "null"); return v && typeof v === "object" && !Array.isArray(v) ? v : null; } catch { return null; } };
const writePrefs = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } };

export function initNavigation() {
  const nav = document.querySelector("[data-nav]");
  const app = document.querySelector(".lb-app");
  if (!nav || !app) return;
  const key = PREFIX + (nav.dataset.navStore || "");
  const groups = [...nav.querySelectorAll("[data-nav-group]")];
  const setOpen = (group, open) => {
    group.querySelector("[data-nav-toggle]")?.setAttribute("aria-expanded", String(open));
    const list = group.querySelector(".lbn-list");
    if (list) list.hidden = !open;
  };
  const snapshot = () => Object.fromEntries(groups.map(g => [g.dataset.navGroup, g.querySelector("[data-nav-toggle]")?.getAttribute("aria-expanded") === "true"]));
  const saved = readPrefs(key);
  if (saved) groups.forEach(g => { if (typeof saved[g.dataset.navGroup] === "boolean") setOpen(g, saved[g.dataset.navGroup] || g.hasAttribute("data-current")); });
  const mobile = () => matchMedia("(max-width: 767px)").matches;
  nav.addEventListener("click", event => {
    const toggle = event.target.closest("[data-nav-toggle]");
    if (!toggle) return;
    const group = toggle.closest("[data-nav-group]");
    const wasOpen = toggle.getAttribute("aria-expanded") === "true";
    if (app.classList.contains("lb-sidebar-collapsed") && !mobile()) {
      app.classList.remove("lb-sidebar-collapsed");
      document.querySelector("[data-sidebar-collapse]")?.setAttribute("aria-label", "Collapse sidebar");
      setOpen(group, true);
    } else setOpen(group, !wasOpen);
    writePrefs(key, snapshot());
  });
  nav.addEventListener("keydown", event => {
    if (!["ArrowDown", "ArrowUp"].includes(event.key) || !event.target.matches("[data-nav-toggle]")) return;
    const toggles = [...nav.querySelectorAll("[data-nav-toggle]")];
    const next = toggles[toggles.indexOf(event.target) + (event.key === "ArrowDown" ? 1 : -1)];
    if (next) { event.preventDefault(); next.focus(); }
  });
  document.querySelector("[data-sidebar-help]")?.addEventListener("click", () => {
    document.querySelector("[data-sidebar] [data-nav-toggle]") && document.querySelector("[data-drawer-close]")?.click();
    document.querySelector("[data-help-button]")?.click();
  });
}
initNavigation();
