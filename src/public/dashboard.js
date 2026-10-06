import { validateProduct } from "/assets/validation.js";
import { statusLabel, stateName, indianDate, allowedTransitions } from "/assets/dashboard-rules.js";

const root = document.querySelector(".lb-app");
const storeId = root?.dataset.storeId || "";
const role = root?.dataset.role || "editor";
const api = `/api/stores/${encodeURIComponent(storeId)}`;
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
const moneyToPaise = value => {
  const text = String(value || "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return NaN;
  return Math.round(Number(text) * 100);
};
const getJson = () => {
  try { return JSON.parse(document.getElementById("dashboard-data")?.textContent || "{}"); } catch { return {}; }
};
const draftData = getJson();
if (root) root.dataset.storeStateName = stateName(draftData.checkoutSettings?.store_state || "");
const toastNode = document.querySelector("[data-toast]");
let toastTimer = 0;
let pendingUploads = 0;

function notify(message, error = false) {
  if (!toastNode) return;
  toastNode.textContent = message;
  toastNode.dataset.kind = error ? "error" : "success";
  toastNode.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toastNode.hidden = true; }, 5000);
}
async function request(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: { Accept: "application/json", ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) },
  });
  const type = response.headers.get("content-type") || "";
  const result = type.includes("json") ? await response.json().catch(() => ({})) : await response.text();
  if (!response.ok) throw new Error(result?.error || `Request failed (${response.status}).`);
  return result;
}
function busy(button, value, text) {
  if (!button) return;
  if (value) {
    button.dataset.originalText = button.textContent;
    button.dataset.busy = "true";
    button.textContent = text || "Working…";
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.dataset.busy = "false";
    button.disabled = Boolean(pendingUploads > 0 && button.closest("[data-product-form]"));
  }
}
function handleError(error, button) {
  busy(button, false);
  notify(error?.message || "Something went wrong. Please try again.", true);
}
async function postJson(url, body, method = "POST") {
  return request(url, { method, body: JSON.stringify(body) });
}

document.querySelector("[data-menu-toggle]")?.addEventListener("click", event => {
  const button = event.currentTarget;
  const nav = document.querySelector("[data-nav]");
  const open = button.getAttribute("aria-expanded") === "true";
  button.setAttribute("aria-expanded", String(!open));
  nav?.classList.toggle("is-open", !open);
});
document.querySelector("[data-retry]")?.addEventListener("click", () => window.location.reload());

document.querySelectorAll("[data-filter-form]").forEach(form => {
  form.addEventListener("submit", event => {
    event.preventDefault();
    const query = new URLSearchParams(new FormData(form));
    for (const [key, value] of [...query.entries()]) if (!value) query.delete(key);
    window.location.href = `${form.action}${query.size ? `?${query.toString()}` : ""}`;
  });
});

document.querySelectorAll("[data-export]").forEach(button => {
  button.addEventListener("click", async () => {
    if (role !== "owner") { notify("Only the store owner can download exports.", true); return; }
    const kind = button.dataset.export;
    busy(button, true, "Preparing CSV…");
    try {
      const response = await fetch(`${api}/exports/${encodeURIComponent(kind)}`, {
        method: "POST", credentials: "same-origin",
        headers: { Accept: "text/csv, application/json", "Content-Type": "application/json" },
        body: JSON.stringify(kind === "orders" ? {
          from: document.querySelector('[data-filter-form] [name="from"]')?.value || undefined,
          to: document.querySelector('[data-filter-form] [name="to"]')?.value || undefined,
        } : {}),
      });
      const type = response.headers.get("content-type") || "";
      if (!response.ok) {
        const error = type.includes("json") ? await response.json().catch(() => ({})) : {};
        throw new Error(error.error || `Export failed (${response.status}).`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = `lebrands-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
      notify("CSV download is ready.");
    } catch (error) { notify(error.message || "Export failed.", true); }
    finally { busy(button, false); }
  });
});

document.querySelectorAll("[data-unpublish]").forEach(button => {
  button.addEventListener("click", async () => {
    if (!window.confirm("Unpublish this store? The public store will stop accepting orders until it is published again.")) return;
    busy(button, true, "Unpublishing…");
    try { await postJson(`${api}/unpublish`, {}); notify("Store unpublished."); window.location.reload(); }
    catch (error) { handleError(error, button); }
  });
});

function productPayload(form) {
  const fd = new FormData(form);
  const price = moneyToPaise(fd.get("price"));
  const compare = String(fd.get("compare_at") || "").trim();
  const stockText = String(fd.get("stock") || "").trim();
  const images = [...form.querySelectorAll("[data-image-id]")].map(node => ({
    id: node.dataset.imageId,
    alt: node.querySelector("[data-image-alt]")?.value?.trim() || "",
  }));
  return {
    publish_catalogue:true,
    title: String(fd.get("title") || "").trim(),
    description: String(fd.get("description") || "").trim(),
    price_paise: price,
    compare_at_paise: compare ? moneyToPaise(compare) : null,
    stock: stockText === "" ? null : Number(stockText),
    images,
    tags: String(fd.get("tags") || "").split(",").map(tag => tag.trim()).filter(Boolean).slice(0, 10),
    sku: String(fd.get("sku") || "").trim(),
    hsn_code: String(fd.get("hsn_code") || "").trim(),
    gst_rate: Number(fd.get("gst_rate")),
    ...(!isNewForm(form) ? { expected_stock: form.dataset.expectedStock === "null" ? null : Number(form.dataset.expectedStock) } : {}),
  };
}
function isNewForm(form) { return form.dataset.new === "true"; }
function updateSaveForUploads(form) {
  const submit = form?.querySelector('button[type="submit"]');
  if (!submit) return;
  submit.disabled = pendingUploads > 0 || submit.dataset.busy === "true";
}
document.querySelector("[data-product-form]")?.addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  if (pendingUploads > 0) { notify("Wait for product images to finish uploading before saving.", true); return; }
  const payload = productPayload(form);
  const errorNode = form.querySelector("[data-form-error]");
  const errors = validateProduct(payload);
  if (!Number.isSafeInteger(payload.price_paise)) errors.price_paise = "Enter a valid price in rupees.";
  if (payload.compare_at_paise != null && !Number.isSafeInteger(payload.compare_at_paise)) errors.compare_at_paise = "Enter a valid compare-at price.";
  if (errorNode) {
    errorNode.textContent = Object.values(errors).join(" ");
    errorNode.hidden = !Object.keys(errors).length;
  }
  if (Object.keys(errors).length) { notify("Check the product details before saving.", true); return; }
  const isNew = isNewForm(form);
  const target = isNew ? `${api}/products` : `${api}/products/${encodeURIComponent(form.dataset.productId)}`;
  busy(button, true, "Saving…");
  try {
    await request(target, { method: isNew ? "POST" : "PATCH", body: JSON.stringify(payload) });
    notify("Product saved.");
    window.location.href = `${location.origin}/stores/${encodeURIComponent(storeId)}/products`;
  } catch (error) { handleError(error, button); }
});

document.querySelector("[data-image-upload]")?.addEventListener("change", async event => {
  const input = event.currentTarget;
  const files = [...(input.files || [])];
  const grid = document.querySelector("[data-images]");
  if (!grid || !files.length) return;
  const existing = grid.querySelectorAll("[data-image-id]").length;
  if (existing + files.length > 8) { notify("A product can have up to 8 images.", true); input.value = ""; return; }
  const label = input.closest("label");
  pendingUploads += 1;
  const productForm = document.querySelector("[data-product-form]");
  updateSaveForUploads(productForm);
  label?.classList.add("is-busy");
  try {
    for (const file of files) {
      const form = new FormData();
      form.append("file", file); form.append("type", "image"); form.append("alt", file.name.replace(/\.[^.]+$/, ""));
      const result = await request(`${api}/media`, { method: "POST", body: form });
      const image = result.media;
      if (!image?.id || !image?.url) throw new Error("The image upload did not return usable media.");
      const figure = document.createElement("figure");
      figure.className = "lb-image-card";
      figure.dataset.imageId = image.id;
      figure.innerHTML = `<img src="${esc(image.url)}" alt="${esc(image.alt || "")}"><figcaption><label>Alt text<input value="${esc(image.alt || "")}" maxlength="200" data-image-alt></label><button type="button" class="lb-text-button" data-image-remove>Remove</button></figcaption>`;
      grid.append(figure);
    }
    notify("Image upload complete.");
  } catch (error) { notify(error.message || "Image upload failed.", true); }
  finally {
    pendingUploads = Math.max(0, pendingUploads - 1);
    label?.classList.remove("is-busy");
    input.value = "";
    updateSaveForUploads(productForm);
  }
});
document.addEventListener("click", event => {
  const remove = event.target.closest("[data-image-remove]");
  if (remove) remove.closest("[data-image-id]")?.remove();
});

document.querySelector("[data-archive]")?.addEventListener("click", async event => {
  const button = event.currentTarget;
  const form = document.querySelector("[data-product-form]");
  if (!window.confirm("Archive this product? It will be hidden from the active catalogue. Existing order records will remain.")) return;
  busy(button, true, "Archiving…");
  try {
    await postJson(`${api}/products/${encodeURIComponent(form.dataset.productId)}/archive`, {});
    notify("Product archived.");
    window.location.href = `/stores/${encodeURIComponent(storeId)}/products`;
  } catch (error) { handleError(error, button); }
});
document.querySelector("[data-stock-adjust]")?.addEventListener("click", async event => {
  const button = event.currentTarget, form = document.querySelector("[data-product-form]");
  const delta = Number(form.elements.stock_delta.value), reason = form.elements.stock_reason.value.trim();
  if (!Number.isInteger(delta) || delta === 0 || !reason) { notify("Enter a non-zero whole quantity and a reason.", true); return; }
  busy(button, true, "Updating…");
  try {
    await postJson(`${api}/products/${encodeURIComponent(form.dataset.productId)}/stock`, { delta, reason });
    notify("Stock adjusted.");
    window.location.reload();
  } catch (error) { handleError(error, button); }
});

document.querySelectorAll("[data-order-status]").forEach(button => {
  button.addEventListener("click", async () => {
    if (!["owner", "admin"].includes(role)) { notify("Only a store owner or admin can update order status.", true); return; }
    const form = document.querySelector("[data-order-form]");
    const status = button.dataset.orderStatus;
    const transitions = allowedTransitions(document.querySelector(".lb-detail-head [data-status]")?.dataset.status || "");
    if (!transitions.includes(status)) { notify("That status change is not available for this order.", true); return; }
    const body = {
      status,
      courier: form?.querySelector('[name="courier"]')?.value.trim() || "",
      tracking_number: form?.querySelector('[name="tracking_number"]')?.value.trim() || "",
      tracking_url: form?.querySelector('[name="tracking_url"]')?.value.trim() || "",
      restock: Boolean(form?.querySelector('[name="restock"]')?.checked),
    };
    if (status === "shipped" && (!body.courier || !body.tracking_number || !/^https:\/\/.+/i.test(body.tracking_url))) {
      notify("For shipping, add the courier, tracking number and a secure tracking link.", true); return;
    }
    busy(button, true, "Updating…");
    try {
      const id = form?.dataset.orderId;
      await postJson(`${api}/orders/${encodeURIComponent(id)}/status`, body);
      notify(`${statusLabel(status)}. Order status updated.`);
      window.location.reload();
    } catch (error) { handleError(error, button); }
  });
});
document.querySelector("[data-payment-collected]")?.addEventListener("click", async event => {
  const button = event.currentTarget;
  if (!["owner", "admin"].includes(role)) { notify("Only a store owner or admin can record COD payment.", true); return; }
  const currentStatus = document.querySelector(".lb-detail-head [data-status]")?.dataset.status;
  if (!["shipped", "delivered"].includes(currentStatus)) { notify("COD payment can be recorded after shipment.", true); return; }
  const local = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second:"2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const parts = Object.fromEntries(local.map(p => [p.type, p.value]));
  const entered = window.prompt("When was the COD payment collected? Use India time (YYYY-MM-DDTHH:mm:ss).", `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`);
  if (!entered) return;
  const parsed = new Date(`${entered.length === 16 ? `${entered}:00` : entered}+05:30`);
  if (!Number.isFinite(parsed.getTime()) || parsed > new Date()) { notify("Enter a valid collection date and time that is not in the future.", true); return; }
  busy(button, true, "Recording…");
  try {
    await postJson(`${api}/orders/${encodeURIComponent(document.querySelector("[data-order-form]")?.dataset.orderId || location.pathname.split("/").pop())}/payment`, { collected_at: parsed.toISOString() });
    notify(`Payment recorded for ${indianDate(parsed)}.`); window.location.reload();
  } catch (error) { handleError(error, button); }
});

void draftData;
