(() => {
  const storageKey = "lebrands:cart:00000000-0000-4000-8000-000000000010";
  const products = new Map([...document.querySelectorAll("[data-open-product]")].map((button) => {
    const card = button.closest(".ps-product");
    return [button.dataset.openProduct, {
      title: card.querySelector(".ps-product-title").textContent,
      price: card.querySelector(".ps-product-price").textContent,
      image: card.querySelector("img").src,
      alt: card.querySelector("img").alt,
    }];
  }));
  const dialog = document.querySelector("[data-product-dialog]");
  const toast = document.querySelector("[data-toast]");
  const menu = document.querySelector("[data-menu-toggle]");
  const navLinks = document.querySelector("#ps-links");
  let activeId = "";
  let toastTimer = 0;
  const readBag = () => {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) || "[]");
      return Array.isArray(value) ? value.filter((item) => item && typeof item.product_id === "string" && Number.isInteger(item.quantity)) : [];
    } catch { return []; }
  };
  const updateCount = () => {
    const count = readBag().reduce((total, item) => total + item.quantity, 0);
    document.querySelectorAll("[data-bag-count]").forEach((node) => { node.textContent = String(count); });
  };
  const notify = (text) => {
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 3200);
  };
  const addToBag = (id, size) => {
    if (!id || !products.has(id)) return;
    const bag = readBag();
    const existing = bag.find((item) => item.product_id === id);
    if (existing) existing.quantity = Math.min(99, existing.quantity + 1);
    else bag.push({ product_id: id, quantity: 1 });
    try {
      localStorage.setItem(storageKey, JSON.stringify(bag));
      updateCount();
      notify(`${products.get(id).title} · ${size || "M"} added to your preview bag. No order can be placed.`);
    } catch {
      notify("Your browser could not save this local preview bag.");
    }
  };
  document.querySelectorAll("[data-open-product]").forEach((button) => button.addEventListener("click", () => {
    activeId = button.dataset.openProduct;
    const product = products.get(activeId);
    if (!product || !dialog) return;
    dialog.querySelector("#ps-dialog-title").textContent = product.title;
    dialog.querySelector("[data-dialog-price]").textContent = product.price;
    const image = dialog.querySelector("[data-dialog-image]");
    image.src = product.image;
    image.alt = product.alt;
    dialog.querySelector("[data-size-select]").value = "M";
    dialog.showModal();
  }));
  document.querySelectorAll("[data-add-product]").forEach((button) => button.addEventListener("click", () => addToBag(button.dataset.addProduct, "M")));
  dialog?.querySelector("[data-dialog-add]")?.addEventListener("click", () => {
    addToBag(activeId, dialog.querySelector("[data-size-select]").value);
    dialog.close();
  });
  dialog?.querySelector("[data-dialog-close]")?.addEventListener("click", () => dialog.close());
  dialog?.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  document.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => {
    const filter = button.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((filterButton) => {
      const selected = filterButton === button;
      filterButton.classList.toggle("is-active", selected);
      filterButton.setAttribute("aria-pressed", String(selected));
    });
    document.querySelectorAll(".ps-product").forEach((card) => {
      card.hidden = filter !== "all" && card.dataset.category !== filter;
    });
  }));
  menu?.addEventListener("click", () => {
    const expanded = menu.getAttribute("aria-expanded") === "true";
    menu.setAttribute("aria-expanded", String(!expanded));
    navLinks?.classList.toggle("is-open", !expanded);
  });
  navLinks?.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
    navLinks.classList.remove("is-open");
    menu?.setAttribute("aria-expanded", "false");
  }));
  updateCount();
  const motionOff = new URLSearchParams(location.search).get("motion") === "off";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (!motionOff && !reduced.matches && "IntersectionObserver" in window) {
    document.documentElement.classList.add("ps-motion");
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.12, rootMargin: "0px 0px -28px 0px" });
    document.querySelectorAll(".ps-reveal").forEach((node) => observer.observe(node));
    reduced.addEventListener?.("change", (event) => {
      if (event.matches) {
        observer.disconnect();
        document.documentElement.classList.remove("ps-motion");
        document.querySelectorAll(".ps-reveal").forEach((node) => node.classList.add("is-visible"));
      }
    });
  } else {
    document.querySelectorAll(".ps-reveal").forEach((node) => node.classList.add("is-visible"));
  }
})();
