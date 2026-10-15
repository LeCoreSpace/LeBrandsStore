// Trusted-parent enhancements for script-free demo iframes. No API requests.
const attached = new WeakSet();
const bounded = value => Math.max(0, Math.min(100, Number(value) || 0));

export function previewBundleIds(value, products = []) {
  const ids = [...new Set(String(value || "").trim().split(/\s+/).filter(Boolean))];
  if (!ids.length || ids.length > 8 || ids.some(id => !products.some(p => p.id === id && p.status !== "archived"))) return [];
  return ids;
}

export function attachShowcaseInteractions(doc, catalogue, bag, navigate) {
  if (!doc?.body?.dataset.showcase || attached.has(doc)) return;
  attached.add(doc);
  const win = doc.defaultView;
  const reduced = Boolean(win?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  const cleanup = [];
  const targets = [...doc.querySelectorAll("[data-showcase-reveal]")];
  if (!reduced && win?.IntersectionObserver && targets.length) {
    try {
      const observer = new win.IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
          // Fully clipping a target before observing it removes its intersection
          // area. Start the clip reveal only AFTER entry, never while waiting.
          if (entry.target.dataset.revealKind === "clip") {
            try {
              entry.target.animate?.(
                [{ clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0 0)" }],
                { duration: 900, easing: "cubic-bezier(.2,.7,.2,1)" },
              );
            } catch { /* The already-visible fallback remains readable. */ }
          }
        }
      }, { threshold: 0.08, rootMargin: "0px 0px -3% 0px" });
      for (const target of targets) observer.observe(target);
      doc.body.classList.add("sc-motion-ready");
      cleanup.push(() => observer.disconnect());
    } catch {
      // Failed enhancement must not hide content.
      doc.body.classList.remove("sc-motion-ready");
    }
  }

  for (const track of doc.querySelectorAll("[data-showcase-carousel]")) {
    const buttons = [...doc.querySelectorAll("[data-showcase-prev],[data-showcase-next]")]
      .filter(button => button.dataset.showcasePrev === track.id || button.dataset.showcaseNext === track.id);
    const update = () => {
      const max = Math.max(0, track.scrollWidth - track.clientWidth);
      for (const button of buttons) button.disabled = button.dataset.showcasePrev === track.id
        ? track.scrollLeft <= 2 : track.scrollLeft >= max - 2;
    };
    for (const button of buttons) {
      button.setAttribute("aria-controls", track.id);
      button.addEventListener("click", () => {
        const direction = button.dataset.showcasePrev === track.id ? -1 : 1;
        const left = direction * Math.max(200, track.clientWidth * 0.86);
        if (track.scrollBy) track.scrollBy({ left, behavior: reduced ? "auto" : "smooth" });
        else track.scrollLeft += left;
        update();
      });
    }
    track.addEventListener("scroll", update, { passive: true });
    track.addEventListener("load", update, true);
    if (win?.ResizeObserver) {
      const resize = new win.ResizeObserver(update);
      resize.observe(track); cleanup.push(() => resize.disconnect());
    }
    update();
  }

  for (const button of doc.querySelectorAll("[data-showcase-bundle]")) {
    const ids = previewBundleIds(button.dataset.productIds, catalogue.products);
    button.disabled = !ids.length;
    button.addEventListener("click", () => {
      if (!ids.length) return;
      for (const id of ids) bag.set(id, Math.min(99, (bag.get(id) || 0) + 1));
      navigate("cart");
    });
  }
  for (const slider of doc.querySelectorAll("[data-before-after-range]")) {
    const frame = slider.closest("[data-before-after]");
    if (!frame) continue;
    const update = () => {
      const value = bounded(slider.value);
      frame.style.setProperty("--compare", `${value}%`);
      slider.setAttribute("aria-valuetext", `${value}% before panel, ${100 - value}% after panel`);
    };
    slider.addEventListener("input", update);
    slider.addEventListener("change", update);
    update();
  }
  win?.addEventListener?.("pagehide", () => cleanup.forEach(dispose => dispose()), { once: true });
}
