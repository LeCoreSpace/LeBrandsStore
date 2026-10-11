import { validateProduct } from "/assets/validation.js";
import { statusLabel, stateName, indianDate, allowedTransitions } from "/assets/dashboard-rules.js";
import { registeredSupplierErrors, validInvoicePrefix, INDIAN_STATES } from "/assets/commerce-rules.js";
import { matchesOrderTab, loadedSalesSummary, paymentState } from "/assets/dashboard-view-model.js";

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
  if (!response.ok) throw Object.assign(new Error(result?.error || `Request failed (${response.status}).`),{errors:result?.errors || {}});
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
  if (button?.dataset.orderStatus === "shipped") {
    const message=document.querySelector("[data-shipping-error]");
    if(message){message.hidden=false;message.querySelector("span").textContent=error.message;}
  }
}
async function postJson(url, body, method = "POST") {
  return request(url, { method, body: JSON.stringify(body) });
}
document.querySelector("[data-signature-upload]")?.addEventListener("change",async event=>{
  if (!["owner","admin"].includes(role)) return;
  const file=event.target.files?.[0];if (!file) return;
  try {
    const body=new FormData();body.set("file",file);body.set("type","logo");body.set("alt","Authorised signature");
    const result=await request(`${api}/media`,{method:"POST",body});
    await postJson(`${api}/setup`,{settings:{signature_media_id:result.media.id}},"PATCH");
    const preview=document.querySelector("[data-signature-preview]");preview.replaceChildren();
    const image=document.createElement("img");image.src=result.media.url;image.alt="Authorised signature";image.style.maxWidth="180px";image.style.maxHeight="80px";preview.append(image);
    document.querySelector("[data-signature-remove]").hidden=false;notify("Signature saved for future invoices.");
  } catch(error) {notify(error.message,true);}
  finally {event.target.value="";}
});
document.querySelector("[data-signature-remove]")?.addEventListener("click",async()=>{
  if (!["owner","admin"].includes(role)) return;
  try {await postJson(`${api}/setup`,{settings:{signature_media_id:null}},"PATCH");document.querySelector("[data-signature-preview]").replaceChildren();document.querySelector("[data-signature-remove]").hidden=true;notify("Signature removed from future invoices.");}
  catch(error){notify(error.message,true);}
});
const taxForm = document.querySelector("[data-tax-settings-form]");
function taxPayload(form) {
  const values = Object.fromEntries(new FormData(form));
  for (const key of Object.keys(values)) values[key] = String(values[key]).trim();
  values.gstin = (values.gstin || "").toUpperCase();
  values.invoice_prefix = (values.invoice_prefix || "").toUpperCase();
  values.address=[values.business_line1,values.business_line2,`${values.business_city || ""}, ${INDIAN_STATES.find(s=>s.code===values.business_state)?.name || ""} ${values.business_pincode || ""}`].filter(Boolean).join("\n");
  return values;
}
function taxErrors(payload) {
  const errors=registeredSupplierErrors(payload);
  if (!validInvoicePrefix(payload.invoice_prefix)) errors.invoice_prefix="Use 1 to 4 uppercase letters or digits.";
  return errors;
}
function taxInlineErrors(form,errors) {
  for (const name of ["gstin","business_state","legal_name","business_line1","business_line2","business_city","business_pincode","invoice_prefix"]) {
    form.querySelector(`[data-tax-error="${name}"]`).textContent = errors[name] || "";
    form.querySelector(`[name="${name}"]`).setAttribute("aria-invalid",String(!!errors[name]));
  }
}
taxForm?.addEventListener("input",() => taxInlineErrors(taxForm,taxErrors(taxPayload(taxForm))));
taxForm?.addEventListener("submit",async event => {
  event.preventDefault();
  if (!["owner","admin"].includes(role)) return;
  const payload = taxPayload(taxForm), errors = taxErrors(payload);
  taxInlineErrors(taxForm,errors);
  const message = taxForm.querySelector("[data-tax-form-error]");
  message.textContent = "";
  if (Object.keys(errors).length) {taxForm.querySelector('[aria-invalid="true"]')?.focus();return;}
  const button = event.submitter || taxForm.querySelector('button[type="submit"]');
  busy(button,true);
  try {
    await postJson(`${api}/setup`,{settings:payload},"PATCH");
    taxForm.querySelector('[name="gstin"]').value = payload.gstin;
    notify("Business details saved. Review policies and publish changes from store setup.");
  } catch (error) {
    taxInlineErrors(taxForm,error.errors || {});
    message.textContent = error.message || "Business details could not be saved.";
  } finally {busy(button,false);}
});

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
    const destination=new URL(form.action);
    destination.search=query.toString();
    window.location.href=destination.pathname+destination.search;
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
  const headerSave=document.querySelector("[data-product-save]");
  if(headerSave)headerSave.disabled=pendingUploads>0||headerSave.dataset.busy==="true";
}
document.querySelector("[data-product-form]")?.addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = event.submitter || form.querySelector('button[type="submit"]');
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
  const secondarySave=form.querySelector('button[type="submit"]');
  const parallelSave=button===secondarySave?document.querySelector("[data-product-save]"):secondarySave;
  busy(button, true, "Saving…");
  if(parallelSave)busy(parallelSave,true,"Saving…");
  try {
    await request(target, { method: isNew ? "POST" : "PATCH", body: JSON.stringify(payload) });
    notify("Product saved.");
    window.location.href = `${location.origin}/stores/${encodeURIComponent(storeId)}/products`;
  } catch (error) { handleError(error, button);if(parallelSave)busy(parallelSave,false);updateSaveForUploads(form); }
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

document.querySelectorAll("button[data-order-status]").forEach(button => {
  button.addEventListener("click", async () => {
    if (!["owner", "admin"].includes(role)) { notify("Only a store owner or admin can update order status.", true); return; }
    const form = document.querySelector("[data-order-form]");
    const status = button.dataset.orderStatus;
    const selector=form?.querySelector("[data-next-order-action]");
    if (selector) {selector.value=status;selector.dispatchEvent(new Event("change"));}
    if (status === "cancelled" && !window.confirm("Cancel this order? Reserved stock will be restored.")) return;
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
document.querySelector("[data-next-order-action]")?.addEventListener("change",event=>{
  const form=event.target.closest("[data-order-form]"),status=event.target.value;
  const shipping=form.querySelector('[data-action-fields="shipping"]'),restock=form.querySelector('[data-action-fields="restock"]');
  if(shipping) shipping.hidden=status!=="shipped";
  if(restock) {
    restock.hidden=!["cancelled","returned","rto"].includes(status);
    const input=restock.querySelector("input");input.disabled=status==="cancelled";
    if(input.disabled) input.checked=true;
    else if(input.dataset.wasCancellation==="true") input.checked=false;
    input.dataset.wasCancellation=String(status==="cancelled");
  }
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

const sidebar = document.querySelector("[data-sidebar]");
const openBadge=document.querySelector("[data-open-order-count]");
if(openBadge)fetch(`${api}/orders`,{credentials:"same-origin",headers:{Accept:"application/json"}})
  .then(response=>{if(!response.ok)throw new Error("Open orders unavailable");return response.json();})
  .then(data=>{
    const orders=Array.isArray(data.orders)?data.orders:[];
    const count=orders.filter(order=>matchesOrderTab(order.status,paymentState(order),"open")).length;
    openBadge.textContent=`${count}${orders.length>=500?"+":""}`;
    openBadge.title=orders.length>=500?"Open orders among the 500 most recent orders; older orders may be omitted.":`${count} open orders`;
    openBadge.hidden=count===0;
  }).catch(()=>{openBadge.hidden=true;});
const drawerShade = document.querySelector("[data-drawer-close]");
const menuToggle = document.querySelector("[data-menu-toggle]");
const syncDrawerFocus=()=>{
  if(sidebar)sidebar.inert=matchMedia("(max-width: 767px)").matches && !sidebar.classList.contains("is-open");
};
syncDrawerFocus();
window.addEventListener("resize",syncDrawerFocus);
function closeDrawer() {
  const focusedInside=sidebar?.contains(document.activeElement);
  sidebar?.classList.remove("is-open");
  drawerShade?.classList.remove("is-visible");
  menuToggle?.setAttribute("aria-expanded","false");
  syncDrawerFocus();
  if(matchMedia("(max-width: 767px)").matches && focusedInside) menuToggle?.focus();
}
menuToggle?.addEventListener("click", () => {
  const open = !sidebar?.classList.contains("is-open");
  sidebar?.classList.toggle("is-open",open);
  drawerShade?.classList.toggle("is-visible",open);
  menuToggle.setAttribute("aria-expanded",String(open));
  syncDrawerFocus();
  if(open)sidebar?.querySelector("a")?.focus();
});
drawerShade?.addEventListener("click",closeDrawer);
document.querySelectorAll(".lb-nav a").forEach(link=>link.addEventListener("click",closeDrawer));
document.querySelector("[data-sidebar-collapse]")?.addEventListener("click",()=>{
  if (matchMedia("(max-width: 767px)").matches) { closeDrawer(); return; }
  document.querySelector(".lb-app")?.classList.toggle("lb-sidebar-collapsed");
  const collapsed=document.querySelector(".lb-app")?.classList.contains("lb-sidebar-collapsed");
  document.querySelector("[data-sidebar-collapse]")?.setAttribute("aria-label",collapsed?"Expand sidebar":"Collapse sidebar");
});
document.querySelector("[data-help-button]")?.addEventListener("click",()=>{
  const panel=document.querySelector("[data-help-popover]");
  if(panel) panel.hidden=!panel.hidden;
});
document.addEventListener("keydown",event=>{
  if(event.key==="Tab" && sidebar?.classList.contains("is-open") && matchMedia("(max-width: 767px)").matches){
    const nodes=[...sidebar.querySelectorAll('a[href],button:not([disabled])')].filter(node=>node.offsetParent!==null && node.getAttribute("aria-disabled")!=="true");
    const first=nodes[0],last=nodes.at(-1);
    if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
  }
  if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="k"){
    event.preventDefault();document.querySelector("[data-search-input]")?.focus();
  }
  if(event.key==="Escape"){closeDrawer();setSearchOpen(false);document.querySelector("[data-account-menu]")?.removeAttribute("open");const panel=document.querySelector("[data-help-popover]");if(panel)panel.hidden=true;}
});
document.querySelector("[data-setup-toggle]")?.addEventListener("click",event=>{
  const button=event.currentTarget, content=document.querySelector("[data-setup-content]");
  const expanded=button.getAttribute("aria-expanded")==="true";
  button.setAttribute("aria-expanded",String(!expanded));button.textContent=expanded?"Expand":"Collapse";if(content)content.hidden=expanded;
});

const globalSearch=document.querySelector("[data-global-search]");
const searchInput=document.querySelector("[data-search-input]");
const searchResults=document.querySelector("[data-search-results]");
let searchTimer=0,searchController=null;
function setSearchOpen(open){
  if(searchResults)searchResults.hidden=!open;
  searchInput?.setAttribute("aria-expanded",String(open));
}
function dashboardHref(kind,id=""){
  if(root?.dataset.preview==="true"){
    const view=kind==="Orders"?"order":kind==="Products"?"product":kind==="Settings"?"settings":kind==="Invoices"?"invoices":"customers";
    return `/__step4-preview?view=${view}`;
  }
  const base=`/stores/${encodeURIComponent(storeId)}`;
  if(kind==="Orders")return `${base}/orders/${encodeURIComponent(id)}`;
  if(kind==="Products")return `${base}/products/${encodeURIComponent(id)}`;
  if(kind==="Customers")return `${base}/customers/${encodeURIComponent(id)}`;
  if(kind==="Invoices")return `${base}/invoices`;
  if(kind==="Settings")return `${base}/settings`;
  return base;
}
function searchMessage(message){if(!searchResults)return;searchResults.innerHTML=`<div class="lb-search-message" role="status">${esc(message)}</div>`;setSearchOpen(true);}
function searchHref(kind,item){
  return dashboardHref(kind,item.id||"");
}
function renderSearchGroups(groups){
  if(!searchResults)return;
  const populated=groups.filter(group=>group.items.length);
  if(!populated.length){searchMessage("No matching orders, products or customers.");return;}
  searchResults.innerHTML=populated.map(group=>`<section class="lb-search-group"><h3>${esc(group.name)}</h3>${group.items.slice(0,5).map(item=>{
    const title=group.name==="Orders"?(item.order_number||"Order"):group.name==="Products"?(item.title||"Product"):(item.name||"Customer");
    const meta=group.name==="Orders"?`${item.customer_name||"Customer"} · ${item.status||"Status unavailable"}`:group.name==="Products"?`${item.sku||"No SKU"} · ${item.stock==null?"Stock untracked":`${Number(item.stock)} in stock`}`:`${item.phone||item.email||"Contact unavailable"}`;
    return `<a class="lb-search-result" href="${esc(searchHref(group.name,item))}"><span>${esc(title)}</span><small>${esc(meta)}</small></a>`;
  }).join("")}</section>`).join("");
  setSearchOpen(true);
}
globalSearch?.addEventListener("submit",event=>event.preventDefault());
searchInput?.addEventListener("input",()=>{
  clearTimeout(searchTimer);
  const term=searchInput.value.trim();
  if(term.length<2){setSearchOpen(false);return;}
  searchTimer=window.setTimeout(async()=>{
    searchController?.abort();searchController=new AbortController();
    searchMessage("Searching store records…");
    try{
      const q=encodeURIComponent(term);
      const responses=await Promise.all([
        fetch(`${api}/orders?search=${q}`,{credentials:"same-origin",headers:{Accept:"application/json"},signal:searchController.signal}),
        fetch(`${api}/products`,{credentials:"same-origin",headers:{Accept:"application/json"},signal:searchController.signal}),
        fetch(`${api}/customers?search=${q}`,{credentials:"same-origin",headers:{Accept:"application/json"},signal:searchController.signal}),
      ]);
      const payloads=await Promise.all(responses.map(async response=>{if(!response.ok)throw new Error("Search is temporarily unavailable.");return response.json();}));
      if(searchInput.value.trim()!==term)return;
      const products=payloads[1]?.draft?.products||payloads[1]?.products||[];
      const filteredProducts=products.filter(product=>`${product.title||""} ${product.sku||""}`.toLowerCase().includes(term.toLowerCase()));
      renderSearchGroups([
        {name:"Orders",items:payloads[0]?.orders||[]},
        {name:"Products",items:filteredProducts},
        {name:"Customers",items:payloads[2]?.customers||[]},
      ]);
    }catch(error){if(error.name!=="AbortError")searchMessage("Search could not load. Try again in a moment.");}
  },220);
});
searchInput?.addEventListener("focus",()=>{if(searchInput.value.trim().length>=2&&searchResults?.innerHTML)setSearchOpen(true);});
document.addEventListener("click",event=>{if(globalSearch&&!globalSearch.contains(event.target))setSearchOpen(false);});

const ordersResults=document.querySelector("[data-order-results]");
if(ordersResults){
  const rows=[...ordersResults.querySelectorAll("[data-order-row]")];
  document.querySelectorAll("[data-order-tab]").forEach(tab=>tab.addEventListener("click",()=>{
    const selected=tab.dataset.orderTab;
    document.querySelectorAll("[data-order-tab]").forEach(other=>other.setAttribute("aria-selected",String(other===tab)));
    rows.forEach(row=>{
      const status=row.dataset.orderStatus;
       const visible=matchesOrderTab(status,row.dataset.paymentStatus,selected);
      row.hidden=!visible;
    });
    const count=document.querySelector("[data-orders-count]");
    if(count)count.textContent=`Showing ${rows.filter(row=>!row.hidden).length} of ${rows.length} loaded orders. Lists are capped at 500 records.`;
  }));
  rows.forEach(row=>{
    const href=dashboardHref("Orders",row.dataset.orderId||"");
    row.addEventListener("click",event=>{if(event.target.closest("a,input,button"))return;location.href=href;});
    row.addEventListener("keydown",event=>{if((event.key==="Enter"||event.key===" ")&&event.target===row){event.preventDefault();location.href=href;}});
  });
  const selectAll=document.querySelector("[data-select-all]");
  const checks=[...ordersResults.querySelectorAll("[data-order-checkbox]")];
  selectAll?.addEventListener("change",()=>checks.forEach(check=>{if(!check.closest("tr").hidden)check.checked=selectAll.checked;}));
  checks.forEach(check=>check.addEventListener("change",()=>{
    if(selectAll)selectAll.checked=checks.length>0&&checks.every(item=>item.checked||item.closest("tr").hidden);
  }));
}

function indiaToday(){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function shiftIsoDate(iso,delta){
  const value=new Date(`${iso}T00:00:00Z`);value.setUTCDate(value.getUTCDate()+delta);
  return value.toISOString().slice(0,10);
}
function chartMoney(paise){return `₹${(Number(paise||0)/100).toLocaleString("en-IN",{maximumFractionDigits:0})}`;}
function chartLabel(iso,includeYear=false){
  const dateValue=new Date(`${iso}T12:00:00+05:30`);
  return new Intl.DateTimeFormat("en-IN",{timeZone:"Asia/Kolkata",day:"numeric",month:"short",...(includeYear?{year:"2-digit"}:{})}).format(dateValue);
}
function drawSalesChart(orders,from,to,hitLimit){
  const chart=document.querySelector("[data-sales-chart]"),table=document.querySelector("[data-chart-table]");
  const caption=document.querySelector("[data-chart-caption]"),scope=document.querySelector("[data-chart-scope]");
  if(!chart||!table)return;
  const count=Math.max(1,Math.floor((new Date(`${to}T12:00:00+05:30`)-new Date(`${from}T12:00:00+05:30`))/86400000)+1);
  const points=Array.from({length:count},(_,index)=>({date:shiftIsoDate(from,index),total:0,orders:0}));
  const indexByDate=new Map(points.map((point,index)=>[point.date,index]));
  for(const order of orders){
    const datePart=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(order.created_at));
    const index=indexByDate.get(datePart);
    if(index===undefined||["cancelled","returned","rto","refunded"].includes(order.status))continue;
    points[index].total+=Number(order.total_paise||0);points[index].orders+=1;
  }
  const max=Math.max(1,...points.map(point=>point.total));
  const width=920,height=180,pad={l:48,r:12,t:12,b:28},plotW=width-pad.l-pad.r,plotH=height-pad.t-pad.b;
  const coords=points.map((point,index)=>({x:pad.l+(points.length===1?plotW/2:index/(points.length-1)*plotW),y:pad.t+plotH-(point.total/max)*plotH,point}));
  const path=coords.map((point,index)=>`${index?"L":"M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const grid=[0,.5,1].map(fraction=>{const y=pad.t+plotH*(1-fraction);return `<line class="lb-chart-gridline" x1="${pad.l}" y1="${y}" x2="${width-pad.r}" y2="${y}"/><text class="lb-chart-axis" x="0" y="${y+3}">${esc(chartMoney(max*fraction))}</text>`;}).join("");
  const labelIndexes=new Set([0,Math.floor((points.length-1)/2),points.length-1]);
  const labels=coords.map((point,index)=>labelIndexes.has(index)?`<text class="lb-chart-axis" text-anchor="${index===0?"start":index===points.length-1?"end":"middle"}" x="${point.x}" y="${height-4}">${esc(chartLabel(point.point.date,points.length>20))}</text>`:"").join("");
  const dots=coords.map(point=>`<circle class="lb-chart-dot" cx="${point.x}" cy="${point.y}" r="3"><title>${esc(chartLabel(point.point.date,true))}: ${esc(chartMoney(point.point.total))}</title></circle>`).join("");
  chart.innerHTML=orders.length?`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Daily recorded order sales from ${esc(chartLabel(from,true))} to ${esc(chartLabel(to,true))}">${grid}<path class="lb-chart-line" d="${path}"/>${dots}${labels}</svg>`:`<div class="lb-chart-empty">No recorded orders in this date range.</div>`;
  table.innerHTML=`<table><caption class="lb-sr-only">Daily recorded sales and order counts</caption><thead><tr><th>Date</th><th>Sales</th><th>Orders</th></tr></thead><tbody>${points.map(point=>`<tr><th scope="row">${esc(chartLabel(point.date,true))}</th><td>${esc(chartMoney(point.total))}</td><td>${point.orders.toLocaleString("en-IN")}</td></tr>`).join("")}</tbody></table>`;
  if(caption)caption.textContent=`${chartLabel(from,true)} to ${chartLabel(to,true)} · ${orders.length.toLocaleString("en-IN")} orders loaded`;
  if(scope)scope.textContent=hitLimit?"The chart is based on the 500 most recent orders returned for this range. Older orders may be omitted; this is not a complete sales ledger.":"The chart is derived from orders returned by the dashboard list API; it is not an accounting ledger. Revenue omits cancelled, returned and refunded orders.";
}
const rangeSelect=document.querySelector("[data-chart-range]");
if(rangeSelect){
  let activeChartRequest=0;
  const customNodes=[...document.querySelectorAll("[data-custom-date]")],apply=document.querySelector("[data-chart-apply]");
  const showCustom=()=>{customNodes.forEach(node=>node.hidden=rangeSelect.value!=="custom");if(apply)apply.hidden=rangeSelect.value!=="custom";};
  rangeSelect.addEventListener("change",showCustom);
  const startInput=document.querySelector("[data-chart-from]"),endInput=document.querySelector("[data-chart-to]");
  const loadChart=async()=>{
    const requestId=++activeChartRequest;
    const today=indiaToday();let from,to;
    if(rangeSelect.value==="custom"){from=startInput?.value;to=endInput?.value;if(!from||!to||from>to){notify("Choose a valid custom date range.",true);return;}}
    else {to=today;const days=rangeSelect.value==="today"?1:Number(rangeSelect.value||7);from=shiftIsoDate(today,-(days-1));}
    const chart=document.querySelector("[data-sales-chart]");if(chart)chart.innerHTML='<div class="lb-chart-skeleton" aria-hidden="true"></div>';
    const daysInRange=Math.floor((new Date(`${to}T12:00:00+05:30`)-new Date(`${from}T12:00:00+05:30`))/86400000)+1;
    if(daysInRange>366){if(chart)chart.innerHTML='<div class="lb-chart-empty">Choose a custom range of 366 days or less.</div>';const table=document.querySelector("[data-chart-table]"),caption=document.querySelector("[data-chart-caption]"),scope=document.querySelector("[data-chart-scope]");if(table)table.replaceChildren();if(caption)caption.textContent="Daily chart unavailable for this range.";if(scope)scope.textContent="Choose a smaller date range to review daily order activity.";return;}
    try{
      const response=await fetch(`${api}/orders?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,{credentials:"same-origin",headers:{Accept:"application/json"}});
      if(!response.ok)throw new Error("Sales chart could not load.");
      const data=await response.json(),orders=Array.isArray(data.orders)?data.orders:[];
      if(requestId!==activeChartRequest)return;
      drawSalesChart(orders,from,to,orders.length>=500);
       if(["today","custom"].includes(rangeSelect.value)){
         const summary=loadedSalesSummary(orders);
         const currency=value=>`₹${(value/100).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
         const values=[currency(summary.revenue_paise),summary.orders.toLocaleString("en-IN"),summary.aov_paise===null?"–":currency(summary.aov_paise)];
         values.forEach((value,index)=>{
           const metric=document.querySelector(`[data-home-metric="${index}"]`);
           if(metric)metric.textContent=value;
           const note=document.querySelector(`[data-home-metric-note="${index}"]`);
           if(note)note.textContent=orders.length>=500?"500 most recent orders only":"Selected date range";
         });
         const scope=document.querySelector("[data-summary-scope]");
         if(scope)scope.textContent=orders.length>=500
           ?"Summary and chart cover only the 500 most recent orders in this range, not all sales."
           :"Summary covers the selected range from recorded orders. Sales exclude cancelled, refunded and returned orders.";
       }
    }catch(error){if(requestId!==activeChartRequest)return;if(chart)chart.innerHTML=`<div class="lb-chart-empty">${esc(error.message||"Sales chart could not load.")} <button type="button" data-chart-retry>Retry</button></div>`;}
  };
  rangeSelect.addEventListener("change",()=>{
    showCustom();
    if(["7","30"].includes(rangeSelect.value)&&Number(draftData.filters?.period)!==Number(rangeSelect.value)){
      const destination=new URL(location.href);
      destination.searchParams.set("period",rangeSelect.value);
      location.href=destination.pathname+destination.search;
      return;
    }
    if(rangeSelect.value!=="custom")loadChart();
  });
  apply?.addEventListener("click",loadChart);
  document.addEventListener("click",event=>{if(event.target.closest("[data-chart-retry]"))loadChart();});
  const today=indiaToday(),initialDays=Number(rangeSelect.value)||7;
  if(startInput)startInput.value=shiftIsoDate(today,-(initialDays-1));
  if(endInput)endInput.value=today;
  showCustom();loadChart();
}

const todayInvoices=document.querySelector("[data-today-invoices]");
if(todayInvoices){
  fetch(`${api}/invoices`,{credentials:"same-origin",headers:{Accept:"application/json"}})
    .then(response=>{if(!response.ok)throw new Error("Invoice records could not be loaded.");return response.json();})
    .then(data=>{
      const today=indiaToday();
      const issued=(Array.isArray(data.invoices)?data.invoices:[]).filter(invoice=>{
        if(!invoice.issued_at)return false;
        const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(invoice.issued_at));
        return parts===today&&["issued","active"].includes(String(invoice.status||"issued").toLowerCase());
      });
      const target=dashboardHref("Invoices");
      todayInvoices.innerHTML=`<p>Invoices issued today</p>${issued.length?issued.slice(0,5).map(invoice=>`<a href="${esc(target)}"><strong>${esc(invoice.invoice_number||"Invoice")}</strong><small>${esc(invoice.order_number||"Order")} · ${esc(chartMoney(invoice.total_paise))}</small></a>`).join(""):`<span>No invoices issued today</span>`}`;
    })
    .catch(()=>{todayInvoices.innerHTML="<p>Invoices issued today</p><span>Invoice activity is unavailable right now.</span>";});
}
