/** Progressive enhancement. Content stays visible if animation is unsupported. */
export function attachAuraMotion(doc) {
  const win = doc?.defaultView;
  if (!win || !doc.body?.dataset.style || win.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
      !win.IntersectionObserver) return;
  const observer = new win.IntersectionObserver(entries => {
    entries.filter(entry => entry.isIntersecting).forEach(({ target }) => {
      target.animate?.([{ opacity: 0, transform: "translateY(18px)" }, { opacity: 1, transform: "translateY(0)" }],
        { duration: 550, easing: "cubic-bezier(.2,.7,.2,1)", fill: "none" });
      observer.unobserve(target);
    });
  }, { threshold: 0.08 });
  doc.querySelectorAll(".au-hero-copy,.au-hero-media,.au-card,.au-section h2,.commerce-heading").forEach(node => observer.observe(node));
  win.addEventListener("pagehide", () => observer.disconnect(), { once: true });
}
