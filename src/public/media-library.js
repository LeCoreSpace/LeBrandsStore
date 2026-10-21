const root = document.querySelector("[data-ml-root]");
if (root) {
  const tabs = [...root.querySelectorAll("[role=tab]")];
  const show = (t, focus) => {
    tabs.forEach(b => { const on = b === t; b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1; root.querySelector(`[data-panel=${b.dataset.tab}]`).hidden = !on; });
    const url=new URL(location.href);url.searchParams.set("tab",t.dataset.tab);history.replaceState(null,"",url);
    if (focus) t.focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => show(t));
    t.addEventListener("keydown", e => {
      const k = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (k === undefined) return;
      e.preventDefault(); show(tabs[(k + tabs.length) % tabs.length], true);
    });
  });
  let items = [];
  try { items = JSON.parse(document.getElementById("media-library-data").textContent).items || []; } catch {}
  const dlg = root.querySelector("[data-dialog]");
  let opener = null;
  const el = (tag, text, attrs = {}) => { const n = document.createElement(tag); if (text != null) n.textContent = text; Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v)); return n; };
  const open = (btn) => {
    const i = items[Number(btn.dataset.open)]; if (!i) return;
    opener = btn;
    dlg.querySelector("[data-d-title]").textContent = i.filename || "Untitled file";
    const pv = dlg.querySelector("[data-d-preview]"); pv.replaceChildren();
    if (i.url) {
      if (i.kind === "video") { const v = el("video", null, { src: i.url, controls: "", preload: "metadata", "aria-label": "Preview of " + (i.filename || "video") }); pv.append(v); }
      else pv.append(el("img", null, { src: i.url, alt: i.alt || i.filename || "" }));
    } else pv.append(el("p", "No preview available."));
    const f = dlg.querySelector("[data-d-facts]"); f.replaceChildren();
    [["Type", i.kind === "video" ? "Video" : "Image"], ["Format", i.content_type || "Not recorded"], ["Dimensions", i.dims], ["File size", i.size], ["Source", i.upload_type || "Not recorded"], ["Description", i.alt || "None"], ["Added", i.created]].forEach(([a, b]) => { f.append(el("dt", a), el("dd", b)); });
    const u = dlg.querySelector("[data-d-usage]"); u.replaceChildren();
    if (i.usage.length) { const ul = el("ul", null, { class: "lml-usage" }); i.usage.forEach(x => { const li = el("li"); if (x.href) li.append(el("a", x.label || "Open", { href: x.href })); else li.textContent = x.label || ""; ul.append(li); }); u.append(ul); }
    else u.append(el("p", "No saved references found."));
    dlg.showModal(); dlg.querySelector("[data-d-title]").focus();
  };
  root.addEventListener("click", e => { const b = e.target.closest("[data-open]"); if (b) open(b); });
  dlg.querySelector("[data-close]").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener("close", () => { dlg.querySelectorAll("video").forEach(v => v.pause()); if (opener && opener.isConnected) opener.focus(); });
}
