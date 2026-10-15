import { attachAuraMotion } from "./aura-motion.js";
import { demoCommerce } from "./style-preview.js";
import { attachShowcaseInteractions } from "./aura-showcase-interactions.js";

export function attachStyleInteractions(doc, catalogue, bag, page, productId, navigate) {
  attachAuraMotion(doc);
  attachShowcaseInteractions(doc, catalogue, bag, navigate);
  doc.querySelectorAll("img[data-gallery-image]").forEach(photo => photo.addEventListener("click", () => {
    const dialog = doc.createElement("dialog"), image = doc.createElement("img"), close = doc.createElement("button");
    dialog.className = "au-zoom"; dialog.setAttribute("aria-label", "Product photo");
    image.src = photo.currentSrc || photo.src; image.alt = photo.alt;
    close.textContent = "Close"; close.type = "button";
    close.addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    dialog.append(close, image); doc.body.append(dialog); dialog.showModal();
  }));
  const count = [...bag.values()].reduce((sum, quantity) => sum + quantity, 0);
  doc.querySelectorAll("[data-cart-count]").forEach(node => { node.textContent = String(count); });
  doc.querySelectorAll("[data-cart-open]").forEach(node => {
    node.disabled = false; node.removeAttribute("aria-disabled"); node.setAttribute("aria-label", "Open preview bag");
    node.addEventListener("click", () => navigate("cart"));
  });
  if (page === "product") {
    doc.querySelectorAll(".au-buy button,.au-sticky-buy button").forEach(node => {
      node.disabled = false; node.removeAttribute("aria-disabled"); node.textContent = "Add to bag (preview)";
      node.addEventListener("click", () => {
        if (!catalogue.products.some(p => p.id === productId)) return;
        bag.set(productId, Math.min(99, (bag.get(productId) || 0) + 1));
        navigate("cart");
      });
    });
  }
  const menu = doc.querySelector("[data-menu-open]"), navigation = doc.getElementById("au-menu");
  const setMenu = open => {
    if (!navigation) return;
    navigation.hidden = !open; menu?.setAttribute("aria-expanded", String(open));
  };
  menu?.addEventListener("click", () => setMenu(true));
  navigation?.querySelector("[data-menu-close]")?.addEventListener("click", () => setMenu(false));
  doc.addEventListener("keydown", event => { if (event.key === "Escape") setMenu(false); });
  if (!["cart", "checkout"].includes(page)) return;
  const demo = demoCommerce(catalogue, bag);
  const lines = doc.querySelector("[data-cart-page-lines]");
  if (lines) lines.innerHTML = demo.lines;
  doc.querySelectorAll("[data-cart-summary],[data-checkout-summary]").forEach(node => { node.innerHTML = demo.summary; });
  doc.querySelectorAll("[data-preview-remove]").forEach(node => node.addEventListener("click", () => {
    bag.delete(node.dataset.previewRemove); navigate("cart");
  }));
  doc.querySelectorAll("[data-preview-quantity]").forEach(node => node.addEventListener("change", () => {
    bag.set(node.dataset.previewQuantity, Math.max(1, Math.min(99, Math.trunc(Number(node.value) || 1))));
    navigate("cart");
  }));
  doc.querySelectorAll("[data-preview-checkout]").forEach(node => node.addEventListener("click", () => navigate("checkout")));
  if (page === "checkout") doc.querySelectorAll("[data-preview-checkout]").forEach(node => {
    node.disabled = true; node.textContent = "No orders in preview";
  });
  doc.querySelectorAll('button[type="submit"], [data-place-order]').forEach(node => { node.disabled = true; });
  doc.querySelectorAll(".commerce-loading,.commerce-readonly-note").forEach(node => {
    node.textContent = "Interactive preview only. This sample bag never creates an order or takes a payment.";
  });
}
