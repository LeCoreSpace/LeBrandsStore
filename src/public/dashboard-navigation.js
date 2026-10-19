export function initNavigation() {
  const nav = document.querySelector("[data-nav]");
  const app = document.querySelector(".lb-app");
  if (!nav || !app) return;
  const groups = [...nav.querySelectorAll("[data-nav-group]")];
  const setOpen = (group, open) => {
    group.querySelector("[data-nav-toggle]")?.setAttribute("aria-expanded", String(open));
    const list = group.querySelector(".lbn-list");
    if (list) list.hidden = !open;
  };
  // On every page load, only Settings starts expanded. A previous visit's
  // local preference must not silently reopen the other sections.
  groups.forEach(g => setOpen(g, g.dataset.navGroup === "settings"));
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
