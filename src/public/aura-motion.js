/** Progressive enhancement. Content stays visible if animation is unsupported. */
const attached = new WeakSet();
export function attachAuraMotion(doc) {
  const win = doc?.defaultView;
  if (!win || attached.has(doc) || !doc.body?.dataset.style || win.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ||
      !win.IntersectionObserver) return;
  attached.add(doc);
  const animations = new Map();
  const observer = new win.IntersectionObserver(entries => {
    entries.forEach(({ target, isIntersecting }) => {
      if (!isIntersecting) {
        animations.get(target)?.cancel?.();
        animations.delete(target);
        return;
      }
      if (target.contains?.(doc.activeElement)) return;
      try {
        const animation = target.animate?.(
          [{ opacity: 0, transform: "translate3d(0,24px,0)" }, { opacity: 1, transform: "translate3d(0,0,0)" }],
          { duration: 850, easing: "cubic-bezier(.22,1,.36,1)", fill: "none" });
        if (animation) animations.set(target, animation);
      } catch { /* Animation failure must never block readable/editable content. */ }
    });
  }, { threshold: 0, rootMargin: "0px 0px -24px 0px" });
  doc.querySelectorAll(".au-hero-copy,.au-hero-media,.au-card,.au-section h2,.au-section > p,.commerce-heading").forEach(node => observer.observe(node));
  doc.addEventListener?.("focusin", event => {
    for (const [target, animation] of animations) if (target.contains?.(event.target)) {
      animation.cancel?.();
      animations.delete(target);
    }
  });
  win.addEventListener("pagehide", () => {
    observer.disconnect();
    for (const animation of animations.values()) animation.cancel?.();
    animations.clear();
  }, { once: true });
}
