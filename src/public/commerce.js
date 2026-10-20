import { statusLabel, indianDate } from "./dashboard-rules.js";
import { cartKey, sameLine, cleanLine, normaliseCart, matchIssue, optionId, resolveSelection, valueStatus, variantTitleLines, productImageUrl } from "./commerce-options.js";
import {initializeCheckoutContact} from "./checkout-contact.js";
const configNode = document.querySelector("[data-commerce-config]");
const storeKey = configNode?.dataset.storeKey || "";
const page = configNode?.dataset.page || "";
const siteKey = configNode?.dataset.siteKey || "";
const readOnly = configNode?.dataset.readOnly === "true";
const storageKey = `lebrands:cart:${storeKey}`;
const attemptStorageKey = `lebrands:checkout-attempt:${storeKey}`;
const sourceStorageKey = `lebrands:checkout-source:${storeKey}`;
// Persist only the category, not referrer paths/queries or customer data.
// This keeps mall attribution across product -> cart -> checkout navigation.
function visitSource() {
  let stored = "";
  try { stored = sessionStorage.getItem(sourceStorageKey) || ""; } catch {}
  let source = ["mall","direct","unknown"].includes(stored) ? stored : "direct";
  const utm = new URLSearchParams(location.search).get("utm_source");
  if (utm === "mall") source = "mall";
  else if (document.referrer) {
    try {
      const ref = new URL(document.referrer);
      if (ref.hostname === "lebrands.space" || ref.hostname.endsWith(".lebrands.space")) source = "mall";
      else if (ref.origin !== location.origin) source = "unknown";
    } catch { source = "unknown"; }
  }
  try { sessionStorage.setItem(sourceStorageKey,source); } catch {}
  return source;
}
const attribution = storeKey && !readOnly ? visitSource() : "unknown";
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const money = (value) => `₹${(Math.max(0, Number(value) || 0) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
let cart = [];
let validated = null;
let pendingTrackingAdds=[];
function marketingEvent(name,data){
  if(typeof window.lebrandsTrack==="function")return window.lebrandsTrack(name,data);
  if(document.getElementById("store-marketing-config")){
    const queue=window.lebrandsTrackingQueue??=[];
    if(queue.length<20)queue.push([name,data]);
  }
}
function trackingQuote(quote){
  return{items:(quote.items||[]).map(i=>({item_id:i.product_option_id||i.product_id,item_name:i.title,quantity:Number(i.quantity),price:Number(i.taxable_paise)/Number(i.quantity)/100})),
    value:Number(quote.total_paise)/100,google_value:(Number(quote.total_paise)-Number(quote.tax_paise)-Number(quote.delivery_paise))/100};
}
let emailAuth=null;
const offerStorageKey=`${storageKey}:offer-code`;
let activeOfferCode="";
try{activeOfferCode=sessionStorage.getItem(offerStorageKey)||"";}catch{}
function offerControls(){
  if(readOnly||!cart.length||(validated?.offers_available===false&&!activeOfferCode))return "";
  return `<div class="commerce-offer"><label>Offer code<input data-offer-code maxlength="32" value="${esc(activeOfferCode)}" autocomplete="off" placeholder="Enter code" aria-invalid="${validated?.offer_error?"true":"false"}"></label><div><button type="button" class="commerce-text-link" data-offer-apply>Apply code</button>${activeOfferCode?'<button type="button" class="commerce-text-link" data-offer-remove>Remove code</button>':""}</div>${validated?.offer_error?`<p class="commerce-error" role="alert">${esc(validated.offer_error)} Remove this code or try another before placing your order.</p>`:""}<p role="status">${validated?.discount_paise>0?`${validated.offer?.code?"Code":"Automatic offer:"} ${esc(validated.offer?.code||validated.offer?.title||"Offer")} applied. You save ${money(validated.discount_paise)}.`:"The best eligible offer applies. Offers cannot be combined."}${validated?.offer_notice?` ${esc(validated.offer_notice)}`:""}</p></div>`;
}
function addOfferSummary(slot){
  if(!slot)return;
  const total=slot.querySelector(".commerce-total-row.grand");
  if(total&&Number(validated?.discount_paise)>0)total.insertAdjacentHTML("beforebegin",
    `<div class="commerce-total-row"><span>Offer saving</span><strong>−${money(validated.discount_paise)}</strong></div>`);
  slot.insertAdjacentHTML("beforeend",offerControls());
}
let busy = false;
let lastFocus = null;
let inertBackground = [];
let turnstileWidget = null;
let turnstileToken = "";
let checkoutAttempt = null;
let allowReplayWithoutToken = false;
let razorpayLoad = null;
const methodAvailable = (v, m) => m === "online" ? v?.online_available === true : v?.cod_available === true;
function selectedMethod(v = validated) {
  const r = document.querySelector('#checkout-form [name="payment_method"]:checked');
  return r?.value === "online" && v?.online_available === true ? "online" : "cod";
}
const submitLabel = () => selectedMethod() === "online" ? 'Pay online' : 'Place order';
function syncPayment() {
  const online = document.querySelector('#checkout-form [data-pay="online"]');
  if (!online || !validated) return;
  const can = validated.online_available === true;
  online.hidden = !can;
  const cod = document.querySelector('#checkout-form [name="payment_method"][value="cod"]');
  const onl = online.querySelector("input");
  if (!can) { if (cod) cod.checked = true; if (onl) onl.checked = false; }
  else if (validated.cod_available !== true && onl && !onl.checked && cod?.checked) { onl.checked = true; cod.checked = false; }
  document.querySelectorAll("#checkout-form [data-pay]").forEach((l) => l.classList.toggle("is-selected", !!l.querySelector("input")?.checked));
  const btn = document.querySelector("#checkout-form [type='submit']");
  if (btn && !busy) btn.innerHTML = submitLabel();
}
function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  if (razorpayLoad) return razorpayLoad;
  razorpayLoad = new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = "https://checkout.razorpay.com/v1/checkout.js"; el.async = true;
    el.onload = () => window.Razorpay ? resolve() : (razorpayLoad = null, reject(new Error("Online payment could not load. Please try again.")));
    el.onerror = () => { razorpayLoad = null; el.remove(); reject(new Error("Online payment could not load. Check your connection and try again.")); };
    document.head.append(el);
  });
  return razorpayLoad;
}
let validationSequence = 0;

function readCart() {
  if (readOnly) return [];
  try {
    return normaliseCart(JSON.parse(localStorage.getItem(storageKey) || "[]"));
  } catch { return []; }
}
function saveCart() {
  if (readOnly) return;
  try { localStorage.setItem(storageKey, JSON.stringify(cart.map(cleanLine))); }
  catch { message("Your browser could not save this bag. Please enable local storage and try again."); }
  updateCount();
}
function message(text) {
  let target = document.querySelector("[data-commerce-feedback]");
  if (!target) {
    target = document.getElementById("commerce-global-status");
    if (!target) {
      target = document.createElement("p");
      target.id = "commerce-global-status";
      target.className = "commerce-global-status";
      target.setAttribute("role", "status");
      document.querySelector(".aura-header")?.insertAdjacentElement("afterend", target);
    }
  }
  if (target) target.textContent = text;
}
async function api(path, payload) {
  if (readOnly) throw new Error("Read-only preview. Sign in to use store actions.");
  const response = await fetch(`${configNode?.dataset.apiRoot||""}${path}`, { method: "POST", credentials: "same-origin", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  let result = {};
  try { result = await response.json(); } catch {}
  if (!response.ok) {
    const fieldMessages = Object.values(result.errors || {}).filter((value) => typeof value === "string");
    const error = new Error(fieldMessages.join(" ") || result.error || result.message || `We couldn’t complete that request (${response.status}).`);
    error.fields = result.errors || {};
    error.status = response.status;
    error.restartCheckout = result.restart_checkout === true;
    throw error;
  }
  return result;
}
function currentState() { return document.querySelector('#checkout-form [name="state"]')?.value || ""; }
async function validateCart({ render = true } = {}) {
  const seq = ++validationSequence;
  if (!cart.length) {
    validated = { items: [], subtotal_paise: 0, delivery_paise: 0, total_paise: 0, tax_paise: 0, issues: [], cod_available: false };
    if (render) renderCommerce();
    return validated;
  }
  validated = null;
  if (render) {
    document.querySelectorAll("[data-cart-page-lines], [data-checkout-summary], [data-cart-summary], [data-drawer-lines], [data-drawer-summary]").forEach((el) => {
      el.innerHTML = '<div class="commerce-loading" role="status">Checking prices and availability…</div>';
    });
  }
  updatePlaceOrderAvailability();
  try {
    const result = await api("/api/cart/validate", { items: cart.map(cleanLine), code:activeOfferCode, ...(currentState() ? { state: currentState() } : {}) });
    if (seq !== validationSequence) return validated;
    validated = result;
    if(!result.issues?.length){
      marketingEvent("cart_ready",trackingQuote(result));
      for(const added of pendingTrackingAdds){
        const item=result.items?.find(i=>sameLine(i,added.line));
        if(item&&added.quantity>0)marketingEvent("add_to_cart",{
          items:[{item_id:item.product_option_id||item.product_id,item_name:item.title,quantity:added.quantity,price:Number(item.taxable_paise)/Number(item.quantity)/100}],
          value:Number(item.unit_price_paise)*added.quantity/100,
          google_value:Number(item.taxable_paise)/Number(item.quantity)*added.quantity/100});
      }
    }
    pendingTrackingAdds=[];
    for (const item of result.items || []) {
      const local = cart.find((entry) => cartKey(entry) === cartKey(item));
      if (local) local.quantity = item.quantity;
    }
    saveCart();
    if (render) renderCommerce();
    return result;
  } catch (error) {
    if (seq !== validationSequence) return validated;
    pendingTrackingAdds=[];
    validated = null;
    showValidationError(error.message);
    return null;
  }
}
function showValidationError(text) {
  for (const slot of document.querySelectorAll("[data-cart-page-lines], [data-checkout-summary], [data-cart-summary], [data-drawer-lines], [data-drawer-summary]")) {
    slot.innerHTML = `<div class="commerce-error" role="alert">${esc(text)} <button class="commerce-text-link" type="button" data-retry-validation>Try again</button></div>${slot.matches("[data-checkout-summary], [data-cart-summary], [data-drawer-summary]")?offerControls():""}`;
  }
  const drawer = document.querySelector("[data-drawer-lines]");
  if (drawer) drawer.innerHTML = `<div class="commerce-error" role="alert">${esc(text)} <button class="commerce-text-link" type="button" data-retry-validation>Try again</button></div>`;
  updatePlaceOrderAvailability();
}
function updatePlaceOrderAvailability() {
  const button = document.querySelector("#checkout-form [type='submit']");
  if (!button || readOnly) return;
    button.disabled = busy || !validated || Boolean(validated.offer_error) || !emailAuth?.verified() || !turnstileToken || !cart.length || Boolean(validated.issues?.length) || !methodAvailable(validated, selectedMethod());
    const note=document.querySelector("[data-place-order-status]");
    if(note)note.textContent=busy?"Preparing your order…":!validated?"Checking your bag…":
      validated.offer_error?"Remove the rejected code or apply a valid code to continue.":
      validated.issues?.length?"Review the unavailable items in your bag.":
      !emailAuth?.verified()?"Verify your email above to enable Place order.":
      !turnstileToken?"Complete the security check to continue.":
      !methodAvailable(validated,selectedMethod())?"Choose an available payment method.":"Ready to place your order.";
}
function productImage(url, title) {
  const safe = productImageUrl(url);
  return safe ? `<img class="commerce-line-image" src="${esc(url)}" alt="">` : `<div class="commerce-line-image" role="img" aria-label="${esc(title)}"><span>${esc(String(title || "P").slice(0,1).toUpperCase())}</span></div>`;
}
function linesMarkup(items, interactive = true) {
  const issues = validated?.issues || [];
  if (!items?.length) return `${issues.map((entry)=>`<p class="commerce-error" role="alert">${esc(entry.message)}</p>`).join("")}<div class="commerce-empty"><span class="cm-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg></span><h2>Your bag is empty</h2><p>Products you add will appear here with live prices and availability.</p><a class="commerce-button" href="/collections/all">Browse products</a></div>`;
  return `<div class="commerce-lines">${items.map((item) => {
    const issue = matchIssue(issues, item);
    const key = esc(cartKey(item)), opts = variantTitleLines(item);
    const qty = Number(item.quantity) || 1;
    return `<article class="commerce-line" data-line="${key}">${productImage(item.image_url, item.title)}<div><div class="commerce-line-title">${esc(item.title || "Product")}</div>${opts.length ? `<span class="au-line-opts">${esc(opts.join(" · "))}</span>` : ""}${item.sku ? `<span class="au-line-opts">SKU ${esc(item.sku)}</span>` : ""}<div class="commerce-line-price">${money(item.unit_price_paise)} each</div>${interactive ? `<div class="commerce-line-tools"><div class="commerce-qty" aria-label="Quantity"><button type="button" data-quantity="-1" data-id="${esc(item.product_id)}" data-option="${esc(optionId(item.product_option_id))}" aria-label="Decrease quantity" ${qty<=1?"disabled":""}>−</button><output>${qty}</output><button type="button" data-quantity="1" data-id="${esc(item.product_id)}" data-option="${esc(optionId(item.product_option_id))}" aria-label="Increase quantity" ${qty>=Math.min(99,item.stock==null?99:Math.max(1,Number(item.stock)))?"disabled":""}>+</button></div><button class="commerce-remove" type="button" data-remove="${esc(item.product_id)}" data-option="${esc(optionId(item.product_option_id))}">Remove</button></div>` : `<div class="commerce-line-price">Quantity ${qty}</div>`}${issue ? `<p class="commerce-error" role="alert">${esc(issue.message)}</p>` : ""}</div><strong class="commerce-line-total">${money(item.line_total_paise)}</strong></article>`;
  }).join("")}</div>`;
}
function summaryMarkup(result, { checkout = false } = {}) {
  if (!result) return `<div class="commerce-summary"><h2>${checkout?"Order summary":"Your total"}</h2><div class="commerce-loading" role="status">Rechecking current prices…</div></div>`;
  if (!result.items?.length) return `<div class="commerce-summary"><h2>${checkout?"Order summary":"Your total"}</h2>${(result.issues||[]).map((entry)=>`<p class="commerce-error">${esc(entry.message)}</p>`).join("")}<p class="commerce-muted">Add a product to see your total.</p></div>`;
  const issues = result.issues || [];
  const method = selectedMethod(result);
  const unavailable = issues.length > 0 || (checkout ? !methodAvailable(result, method) : (result.cod_available === false && result.online_available !== true));
  const codMessage = !result.settings?.cod_enabled ? "This store is not accepting Cash on Delivery right now." : result.total_paise > Number(result.settings?.cod_max_paise) ? `Cash on Delivery is available up to ${money(result.settings.cod_max_paise)}.` : "Cash on Delivery is not available for this order. Please contact the store.";
  return `<div class="commerce-summary"><h2>${checkout?"Order summary":"Your total"}</h2>${checkout?`<div class="checkout-summary-lines">${result.items.map((item)=>`<div class="checkout-summary-item"><span>${esc(item.title)}${variantTitleLines(item).length?`<small>${esc(variantTitleLines(item).join(" · "))}</small>`:""}${item.sku?`<small>SKU ${esc(item.sku)}</small>`:""}<small>Qty ${Number(item.quantity)||0}</small></span><strong>${money(item.line_total_paise)}</strong></div>`).join("")}</div>`:""}<div class="cm-perf" aria-hidden="true"></div><div class="commerce-total-row"><span>Subtotal</span><strong>${money(result.subtotal_paise)}</strong></div><div class="commerce-total-row"><span>Delivery</span><strong>${Number(result.delivery_paise)===0?"Free":money(result.delivery_paise)}</strong></div>${Number(result.tax_paise)>0?`<div class="commerce-total-row"><span>Included taxes</span><strong>${money(result.tax_paise)}</strong></div>`:""}<div class="commerce-total-row grand"><span>Total</span><strong>${money(result.total_paise)}</strong></div>${issues.map((entry)=>`<p class="commerce-error">${esc(entry.message)}</p>`).join("")}${checkout&&!methodAvailable(result,method)?`<p class="commerce-error">${esc(codMessage)}</p>`:""}${checkout?"":`<a class="commerce-button" href="${esc(configNode?.dataset.apiRoot||"")}/checkout" ${unavailable?'aria-disabled="true"':''}>Continue to checkout</a>`}</div>`;
}
function renderCommerce() {
  const items = validated?.items || [];
  const cartLines = document.querySelector("[data-cart-page-lines]");
  if (cartLines) cartLines.innerHTML = linesMarkup(items, true);
  const inBag = new Set(items.filter((item) => !optionId(item.product_option_id)).map((item) => String(item.product_id)));
  document.querySelectorAll("[data-rec-id]").forEach((node) => { node.hidden = inBag.has(node.dataset.recId); });
  const recs = document.querySelector("[data-cart-recs]");
  if (recs) recs.hidden = ![...recs.querySelectorAll("[data-rec-id]")].some((node) => !node.hidden);
  const cartSummary = document.querySelector("[data-cart-summary]");
  if (cartSummary) {cartSummary.innerHTML = summaryMarkup(validated);addOfferSummary(cartSummary);}
  const checkoutSummary = document.querySelector("[data-checkout-summary]");
  if (checkoutSummary) {checkoutSummary.innerHTML = summaryMarkup(validated, { checkout: true });addOfferSummary(checkoutSummary);}
  syncPayment();
  const codNotice = document.querySelector("[data-cod-notice]");
  if (codNotice && validated) {
    const okMethod = methodAvailable(validated, selectedMethod());
    codNotice.textContent = okMethod ? "" : (!validated.settings?.cod_enabled ? "This store is not accepting Cash on Delivery right now." : validated.total_paise > Number(validated.settings?.cod_max_paise) ? `Cash on Delivery is available up to ${money(validated.settings.cod_max_paise)}.` : "Cash on Delivery is not available for this order.");
    codNotice.hidden = okMethod;
    codNotice.classList.toggle("commerce-error", !okMethod);
  }
  const drawerLines = document.querySelector("[data-drawer-lines]");
  if (drawerLines) drawerLines.innerHTML = linesMarkup(items, true);
  const drawerSummary = document.querySelector("[data-drawer-summary]");
  if (drawerSummary) {drawerSummary.innerHTML = summaryMarkup(validated);addOfferSummary(drawerSummary);}
  updatePlaceOrderAvailability();
}
function updateCount() {
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  document.querySelectorAll("[data-cart-count]").forEach((node) => { node.textContent = String(count); });
}
function mountDrawer() {
  if (document.getElementById("commerce-cart-drawer")) return;
  const mount = document.getElementById("commerce-mount");
  if (!mount) return;
  // Saved themes can create transformed/isolated stacking contexts. A modal
  // must be a direct body child to cover their headers, galleries and buy bars.
  document.body.append(mount);
  mount.innerHTML = `<div class="commerce-overlay" data-drawer-close tabindex="-1"></div><aside class="commerce-drawer" id="commerce-cart-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" aria-hidden="true" inert><div class="commerce-drawer-head"><h2 id="drawer-title">Your bag <span data-cart-count>0</span></h2><button class="commerce-close" type="button" data-drawer-close aria-label="Close bag">×</button></div><div class="commerce-drawer-content" data-drawer-lines><div class="commerce-loading" role="status">Checking your bag…</div></div><div data-drawer-summary></div></aside>`;
}
async function openDrawer() {
  mountDrawer();
  const drawer = document.getElementById("commerce-cart-drawer");
  if (!drawer) return;
  if (drawer.classList.contains("is-open")) { await validateCart(); return; }
  lastFocus = document.activeElement;
  drawer.inert = false;
  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");
  document.querySelector(".commerce-overlay")?.classList.add("is-open");
  document.body.classList.add("commerce-lock");
  inertBackground = [...document.body.children].filter(el => el !== document.getElementById("commerce-mount") && !["SCRIPT","STYLE","LINK"].includes(el.tagName)).map(el => [el, el.inert]);
  for (const [el] of inertBackground) el.inert = true;
  drawer.querySelector("[data-drawer-close]")?.focus();
  await validateCart();
}
function closeDrawer() {
  const drawer = document.getElementById("commerce-cart-drawer");
  drawer?.classList.remove("is-open");
  drawer?.setAttribute("aria-hidden", "true");
  if (drawer) drawer.inert = true;
  document.querySelector(".commerce-overlay")?.classList.remove("is-open");
  document.body.classList.remove("commerce-lock");
  for (const [el, wasInert] of inertBackground) el.inert = wasInert;
  inertBackground = [];
  lastFocus?.focus?.();
}
function addProduct(id, quantity, option = "") {
  if (readOnly || busy) return;
  const productId = String(id || "");
  const qty = Math.max(1, Math.min(99, Number.parseInt(quantity, 10) || 1));
  const line = cleanLine({ product_id: productId, product_option_id: option, quantity: qty });
  const current = cart.find((item) => sameLine(item, line));
  const previousQuantity=current?.quantity||0;
  if (current) current.quantity = Math.min(99, current.quantity + qty);
  else cart.push(line);
  const updatedQuantity=cart.find(item=>sameLine(item,line))?.quantity||0;
  if(updatedQuantity>previousQuantity)pendingTrackingAdds.push({line,quantity:updatedQuantity-previousQuantity});
  validated = null;
  saveCart();
  updatePlaceOrderAvailability();
  message("Added to your bag.");
  openDrawer();
}
async function changeQuantity(id, delta, option = "") {
  const target = { product_id: String(id), product_option_id: option };
  const entry = cart.find((item) => sameLine(item, target));
  if (!entry || busy) return;
  entry.quantity = Math.max(1, Math.min(99, entry.quantity + Number(delta)));
  validated = null;
  saveCart();
  await validateCart();
}
async function removeProduct(id, option = "") {
  if (busy) return;
  const target = { product_id: String(id), product_option_id: option };
  cart = cart.filter((item) => !sameLine(item, target));
  validated = null;
  saveCart();
  await validateCart();
}
/* ---- SKU option selector: explicit choice on every axis, no auto-select ---- */
function initOptions(box) {
  let data;
  try { data = JSON.parse(box.dataset.optionJson || ""); } catch { return; }
  const product = { id: data.id, price_paise: data.price, catalogue: { axes: data.axes }, variants: data.variants };
  const qty = document.getElementById("aura-quantity");
  const buttons = () => [...document.querySelectorAll(`[data-add-product][data-needs-option]`)].filter((b) => b.dataset.addProduct === String(data.id));
  const update = () => {
    const sel = {};
    box.querySelectorAll("input[data-opt-name]:checked").forEach((i) => { sel[i.dataset.optName] = i.value; });
    box.querySelectorAll("input[data-opt-name]").forEach((i) => {
      const others = { ...sel }; delete others[i.dataset.optName];
      const st = valueStatus(product, others, i.dataset.optName, i.value);
      const note = i.nextElementSibling?.querySelector("[data-opt-note]");
      if (note) note.textContent = st === "soldout" ? "Sold out" : st === "unavailable" ? "Unavailable" : "";
    });
    const r = resolveSelection(product, sel), ok = r.state === "ok";
    const status = box.querySelector("[data-opt-status]"); if (status) status.textContent = r.label;
    const sku = box.querySelector("[data-opt-sku]");
    if (sku) { sku.hidden = !r.variant; sku.textContent = r.variant ? `SKU ${r.variant.sku} · ${(r.price_paise / 100).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 })}` : ""; }
    document.querySelectorAll("[data-opt-price]").forEach((n) => { if (r.variant) n.textContent = money(r.price_paise); else n.textContent = money(data.price); });
    if (qty) { qty.disabled = !ok; qty.max = String(ok ? r.max : 1); if (!ok) qty.value = "1"; else if (Number(qty.value) > r.max) qty.value = String(r.max); }
    for (const b of buttons()) {
      b.disabled = !ok; b.setAttribute("aria-disabled", String(!ok));
      b.dataset.option = ok ? r.variant.id : "";
      b.textContent = ok ? (b.closest(".au-sticky-buy") ? "Add to cart" : (box.dataset.word || "Add to cart")) : r.state === "soldout" ? "Sold out" : r.state === "missing" ? "Unavailable" : "Choose options";
    }
  };
  box.addEventListener("change", update);
  update();
}
function formValues(form) {
  const data = new FormData(form);
  const phoneRaw = String(data.get("phone") || "").replace(/[^\d]/g, "");
  const phone = phoneRaw.startsWith("91") && phoneRaw.length === 12 ? phoneRaw.slice(2) : phoneRaw;
  return {
    contact: { phone, name: [data.get("first_name"),data.get("last_name")].map(v=>String(v||"").trim()).filter(Boolean).join(" "), email: String(data.get("email") || "").trim().toLowerCase() },
    address: { pincode: String(data.get("pincode") || "").trim(), line1: String(data.get("line1") || "").trim(), line2: String(data.get("line2") || "").trim(), landmark: String(data.get("landmark") || "").trim(), city: String(data.get("city") || "").trim(), state: String(data.get("state") || "") },
  };
}
function validateCheckout(form, values) {
  const errors = [];
  if (!/^[6-9]\d{9}$/.test(values.contact.phone)) errors.push("Enter a valid 10-digit Indian mobile number.");
  if (values.contact.name.length < 2 || values.contact.name.length > 120) errors.push("Enter your full name.");
  if (!values.contact.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.contact.email)) errors.push("Enter your email for order confirmation.");
  if (!/^[1-9]\d{5}$/.test(values.address.pincode)) errors.push("Enter a valid 6-digit pincode.");
  if (values.address.line1.length < 5 || values.address.line1.length > 200) errors.push("Enter your house number and street.");
  if (values.address.city.length < 2 || values.address.city.length > 100 || !values.address.state) errors.push("Complete your city and state.");
  if (!cart.length) errors.push("Your bag is empty.");
  if (!validated) errors.push("We’re still checking your bag. Try again in a moment.");
  if (validated?.issues?.length) errors.push("Resolve the availability issues in your bag before placing the order.");
  if (validated && !methodAvailable(validated, selectedMethod(validated))) errors.push(selectedMethod(validated) === "online" ? "Online payment is not available for this order." : "Cash on Delivery is not available for this order.");
  return errors;
}
function randomHex(bytes) {
  if (!globalThis.crypto?.getRandomValues) throw new Error("Secure order verification is unavailable in this browser. Please use a modern browser over a secure connection.");
  const data = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(data);
  return [...data].map((value) => value.toString(16).padStart(2,"0")).join("");
}
function makeUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const hex = randomHex(16).split("");
  hex[12] = "4"; hex[16] = ((parseInt(hex[16],16)&3)|8).toString(16);
  const text = hex.join("");
  return `${text.slice(0,8)}-${text.slice(8,12)}-${text.slice(12,16)}-${text.slice(16,20)}-${text.slice(20)}`;
}
async function fingerprint(value) {
  if (!globalThis.crypto?.subtle || !globalThis.TextEncoder) throw new Error("Secure order verification is unavailable in this browser. Please use a modern browser over a secure connection.");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte)=>byte.toString(16).padStart(2,"0")).join("");
}
function sourceInfo() {
  return {utm_source:attribution === "mall" ? "mall" : "",
    referrer:attribution === "direct" ? location.origin : attribution === "unknown" ? "https://unknown.invalid/" : "https://lebrands.space/"};
}
function showCheckoutError(text) {
  const slot = document.querySelector("[data-checkout-error]");
  if (slot) { slot.hidden = false; slot.textContent = text; }
}
function clearCheckoutError() {
  const slot = document.querySelector("[data-checkout-error]");
  if (slot) { slot.hidden = true; slot.textContent = ""; }
}
async function placeOrder(event) {
  event.preventDefault();
  if (busy) return;
  const form = event.currentTarget;
  clearCheckoutError();
  if(!emailAuth?.verified()){showCheckoutError("Verify your email before placing your order.");form.elements.email?.focus();return;}
  if(validated?.offer_error){showCheckoutError("Remove the rejected offer code or apply a valid one before placing your order.");return;}
  const values = formValues(form);
  const errors = validateCheckout(form, values);
  if (errors.length) { showCheckoutError(errors[0]); form.querySelector('[name="phone"]')?.focus(); return; }
  busy = true;
  updatePlaceOrderAvailability();
  const button = form.querySelector('[type="submit"]');
  if (button) { button.disabled = true; button.textContent = "Preparing secure order…"; }
  let key;
  try {
    const canonical = JSON.stringify({ items: cart.map(cleanLine), payment_method: selectedMethod(), contact: values.contact, address: values.address,
      code:activeOfferCode,expected_discount_paise:Number(validated?.discount_paise||0) });
    const fingerprintValue = await fingerprint(canonical);
    if (!checkoutAttempt || checkoutAttempt.fingerprint !== fingerprintValue) {
      let previous = null;
      try { previous = JSON.parse(sessionStorage.getItem(attemptStorageKey) || "null"); } catch {}
      const validPrevious = previous?.fingerprint === fingerprintValue && /^[0-9a-f-]{36}$/i.test(previous.idempotencyKey || "") && /^[0-9a-f]{64}$/.test(previous.receiptToken || "");
      if (validPrevious) {
        checkoutAttempt = previous;
        allowReplayWithoutToken = true;
      } else {
        if (!siteKey || !window.turnstile || !turnstileToken) {
          showCheckoutError(!siteKey ? "Secure order verification is not configured. Please contact the store." : "Complete the security check before placing your order.");
          busy = false;
          updatePlaceOrderAvailability();
          if (button) button.innerHTML = submitLabel();
          return;
        }
        checkoutAttempt = { fingerprint: fingerprintValue, idempotencyKey: makeUuid(), receiptToken: randomHex(32) };
        allowReplayWithoutToken = false;
        try {
          sessionStorage.setItem(attemptStorageKey, JSON.stringify(checkoutAttempt));
          if (sessionStorage.getItem(attemptStorageKey) !== JSON.stringify(checkoutAttempt)) throw new Error("The secure retry details could not be saved.");
        } catch {
          checkoutAttempt = null;
          throw new Error("Secure retry protection is unavailable in this browser. Enable session storage before placing your order.");
        }
      }
    } else if (!siteKey || !window.turnstile || !turnstileToken) {
      if (!allowReplayWithoutToken) {
        showCheckoutError(!siteKey ? "Secure order verification is not configured. Please contact the store." : "Complete the security check before placing your order.");
        busy = false;
        updatePlaceOrderAvailability();
        if (button) button.innerHTML = submitLabel();
        return;
      }
    }
    key = checkoutAttempt;
  } catch (error) {
    showCheckoutError(error.message);
    busy = false;
    updatePlaceOrderAvailability();
    if (button) button.innerHTML = submitLabel();
    return;
  }
  if (button) { button.disabled = true; button.textContent = "Placing order…"; }
  const method = selectedMethod();
  try {
    const result = await api("/api/checkout/order", {
      items: cart.map(cleanLine),
      code:activeOfferCode,
      email_verification:emailAuth.token(),
      expected_discount_paise:Number(validated?.discount_paise||0),
      contact: values.contact,
      address: values.address,
      idempotency_key: key.idempotencyKey,
      receipt_token: key.receiptToken,
      turnstile_token: turnstileToken || "",
      payment_method: method,
      source: sourceInfo(),
    });
    if (!result.receipt_url || !result.order_number) throw new Error("Your order response was incomplete. Please try again using the same details.");
    const receiptUrl = new URL(result.receipt_url, location.origin);
    if (receiptUrl.origin !== location.origin) throw new Error("The receipt link was not a valid store link. Your order was placed. Keep your order number for tracking.");
    if (method === "online" || result.payment) {
      if (!result.payment) { if(result.paid===true) finishPaid(receiptUrl.href); else location.assign(receiptUrl.href); return; }
      allowReplayWithoutToken = true;
      if (window.turnstile && turnstileWidget !== null) { try { window.turnstile.reset(turnstileWidget); } catch {} }
      turnstileToken = "";
      await payOnline(result, values, key);
      return;
    }
    try { localStorage.removeItem(storageKey); } catch {}
    try { sessionStorage.removeItem(attemptStorageKey); } catch {}
    cart = [];
    validated = null;
    checkoutAttempt = null;
    allowReplayWithoutToken = false;
    updateCount();
    location.assign(receiptUrl.href);
  } catch (error) {
    showCheckoutError(error.message || "We couldn’t place your order. Please try again.");
    // A transport loss or server failure may hide a committed order. Keep the
    // stable fingerprint/key/token so the server can replay before checking
    // Turnstile. Explicit client/server rejections still require fresh proof.
    allowReplayWithoutToken = !error.status || error.status >= 500;
    if (error.restartCheckout) {
      checkoutAttempt=null;allowReplayWithoutToken=false;
      try { sessionStorage.removeItem(attemptStorageKey); } catch {}
    }
    if (window.turnstile && turnstileWidget !== null) {
      try { window.turnstile.reset(turnstileWidget); turnstileToken = ""; } catch {}
    }
  } finally {
    busy = false;
    if (button) button.innerHTML = submitLabel();
    updatePlaceOrderAvailability();
  }
}
function finishPaid(receiptUrl) {
  try { localStorage.removeItem(storageKey); } catch {}
  try { sessionStorage.removeItem(attemptStorageKey); } catch {}
  cart = []; validated = null; checkoutAttempt = null; allowReplayWithoutToken = false;
  updateCount();
  location.assign(receiptUrl);
}
async function payOnline(order, values, key) {
  const pay = order.payment || {};
  if (!pay.key_id || !pay.order_id || !Number.isInteger(Number(pay.amount)) || pay.currency !== "INR" || !/^\/api\/checkout\/verify$/.test(String(pay.verification_url || ""))) throw new Error("Online payment details were incomplete. Your bag is kept. Please try again.");
  await loadRazorpay();
  await new Promise((resolve) => {
    let settled = false, verifying = false;
    const done = () => { if (!settled) { settled = true; resolve(); } };
    const options = {
      key: pay.key_id, amount: Number(pay.amount), currency: "INR", name: pay.name || "", order_id: pay.order_id,
      prefill: { contact: `+91${values.contact.phone}`, name: values.contact.name, ...(values.contact.email ? { email: values.contact.email } : {}) },
      handler: async (resp) => {
        verifying = true;
        showCheckoutError("Verifying your payment…");
        try {
          const out = await api(pay.verification_url, { receipt_token: key.receiptToken, razorpay_order_id: resp.razorpay_order_id, razorpay_payment_id: resp.razorpay_payment_id, razorpay_signature: resp.razorpay_signature });
          const url = new URL(out.receipt_url || order.receipt_url, location.origin);
          if (url.origin !== location.origin) throw new Error("The receipt link was not a valid store link.");
          if (out.paid === true && out.pending !== true) finishPaid(url.href); else location.assign(url.href);
        } catch (error) {
          verifying = false;
          showCheckoutError(`${error.message || "We could not verify your payment."} Your bag is kept. If money was deducted, keep order number ${order.order_number} and check it on the track page.`);
        }
        done();
      },
       modal: { ondismiss: () => { if (verifying) return; showCheckoutError("No payment is confirmed yet. Your bag is kept. If money was deducted, check your order before paying again."); done(); } },
    };
    try {
      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (e) => { showCheckoutError(`Payment failed${e?.error?.description ? `: ${String(e.error.description).slice(0, 160)}` : ""}. You can try again.`); });
      rzp.open();
    } catch { showCheckoutError("Online payment could not open. Your bag is kept. Please try again."); done(); }
  });
}
function initTurnstile() {
  if (page !== "checkout") return;
  if (!siteKey) { showCheckoutError("Secure order verification is not configured. The store owner needs to add a Turnstile site key."); return; }
  const script = document.createElement("script");
  script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  script.async = true; script.defer = true;
  script.onload = () => {
    const slot = document.querySelector("[data-turnstile]");
    if (!slot || !window.turnstile) { showCheckoutError("Security verification could not load. Check your connection and retry."); return; }
    try {
      turnstileWidget = window.turnstile.render(slot, { sitekey: siteKey, action: "checkout", theme: "auto", callback: (token) => { turnstileToken = token; clearCheckoutError();updatePlaceOrderAvailability(); }, "expired-callback": () => { turnstileToken = "";updatePlaceOrderAvailability(); }, "error-callback": () => { turnstileToken = ""; showCheckoutError("Security verification is temporarily unavailable. Please retry.");updatePlaceOrderAvailability(); } });
    } catch { showCheckoutError("Security verification could not start. Please reload and try again."); }
  };
  script.onerror = () => showCheckoutError("Security verification could not load. Check your connection and retry.");
  document.head.append(script);
}
async function trackOrder(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const errorSlot = form.querySelector("[data-track-error]");
  const resultSlot = form.querySelector("[data-track-result]");
  errorSlot.hidden = true; resultSlot.innerHTML = "";
  const data = new FormData(form);
  const order_number = String(data.get("order_number") || "").trim();
  const phoneRaw = String(data.get("phone") || "").replace(/[^\d]/g, "");
  const phone = phoneRaw.startsWith("91") && phoneRaw.length === 12 ? phoneRaw.slice(2) : phoneRaw;
  if (!order_number || !/^[6-9]\d{9}$/.test(phone)) { errorSlot.hidden = false; errorSlot.textContent = "Enter an order number and a valid 10-digit Indian mobile number."; return; }
  const button = form.querySelector('[type="submit"]');
  button.disabled = true; button.textContent = "Looking up…";
  try {
    const result = await api("/api/orders/track", { order_number, phone });
    const tracking = typeof result.tracking_url === "string" && /^https:\/\//i.test(result.tracking_url) ? `<p>${esc(result.courier)} · ${esc(result.tracking_number)}<br><a href="${esc(result.tracking_url)}" target="_blank" rel="noopener noreferrer">Track shipment</a></p>` : "";
    resultSlot.innerHTML = `<div class="track-result"><span class="commerce-kicker">Order ${esc(result.order_number)}</span><strong>${esc(statusLabel(result.status,result.payment_method))}</strong><p>Placed ${esc(indianDate(result.created_at))}</p>${tracking}</div>`;
  } catch {
    errorSlot.hidden = false; errorSlot.textContent = "We couldn’t find an order with those details. Check the order number and mobile, then try again.";
  } finally { button.disabled = false; button.textContent = "Find my order"; }
}
function wireMerchantSettings() {
  const form = document.querySelector("[data-checkout-settings]");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = form.querySelector("[data-settings-status]");
    const button = form.querySelector('[type="submit"]');
    const error = form.querySelector("[data-settings-error]");
    error.hidden = true; status.textContent = "Saving…"; button.disabled = true;
    const fd = new FormData(form);
    const rupeesToPaise = (raw, label) => {
      const value = String(raw || "").trim();
      if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error(`${label} must be an amount with no more than two decimal places.`);
      const paise = Math.round(Number(value) * 100);
      if (!Number.isSafeInteger(paise)) throw new Error(`${label} is too large.`);
      return paise;
    };
    try {
      const delivery = fd.get("delivery_mode");
      const settings = {
        delivery_mode: delivery,
        flat_paise: delivery === "flat" ? rupeesToPaise(fd.get("flat_rupees"), "Flat delivery") : delivery === "free_above" ? rupeesToPaise(fd.get("free_above_flat_rupees"), "Delivery below threshold") : 0,
        free_above_paise: delivery === "free_above" ? rupeesToPaise(fd.get("free_above_rupees"), "Free delivery threshold") : 0,
        cod_enabled: fd.get("cod_enabled") === "on",
        cod_max_paise: rupeesToPaise(fd.get("cod_max_rupees"), "Maximum COD order value"),
        store_state: String(fd.get("store_state") || ""),
      };
      const storeId = form.dataset.storeId;
      const response = await fetch(`/api/stores/${encodeURIComponent(storeId)}/checkout-settings`, { method:"PATCH", credentials:"same-origin", headers:{Accept:"application/json","Content-Type":"application/json"}, body:JSON.stringify(settings) });
      let result = {}; try { result = await response.json(); } catch {}
      if (!response.ok) throw new Error(result.error || result.message || "Settings could not be saved.");
      status.textContent = "Saved";
    } catch (err) { error.hidden = false; error.textContent = err.message || "Settings could not be saved."; status.textContent = "Not saved"; }
    finally { button.disabled = false; }
  });
  form.querySelectorAll('[name="delivery_mode"]').forEach((select) => select.addEventListener("change", () => {
    form.querySelectorAll("[data-delivery-field]").forEach((field) => { field.hidden = field.dataset.deliveryField !== select.value; });
  }));
}
function initializeReadOnlyPreview() {
  const previewText = "Read-only preview. Sign in to configure your store; cart, tracking and checkout are available on the live store.";
  document.querySelectorAll("[data-cart-open], [data-add-product]").forEach((control) => {
    control.disabled = true;
    control.setAttribute("aria-disabled", "true");
  });
  document.querySelectorAll("[data-cart-page-lines]").forEach((slot) => { slot.innerHTML = `<div class="commerce-empty"><span class="commerce-kicker">Preview only</span><h2>Your bag is empty.</h2><p>${esc(previewText)}</p></div>`; });
  document.querySelectorAll("[data-cart-summary], [data-checkout-summary]").forEach((slot) => { slot.innerHTML = `<div class="commerce-summary"><h2>${slot.hasAttribute("data-checkout-summary") ? "Order summary" : "Your total"}</h2><p class="commerce-muted">${esc(previewText)}</p></div>`; });
  document.querySelectorAll("[data-cod-notice]").forEach((slot) => { slot.textContent = previewText; });
  const checkout = document.getElementById("checkout-form");
  if (checkout) {
    checkout.querySelectorAll("input, select, button").forEach((control) => { control.disabled = true; });
    const error = checkout.querySelector("[data-checkout-error]");
    if (error) { error.hidden = false; error.textContent = previewText; error.classList.add("commerce-notice"); }
  }
  const track = document.getElementById("track-form");
  if (track) {
    track.querySelectorAll("input, button").forEach((control) => { control.disabled = true; });
    const error = track.querySelector("[data-track-error]");
    if (error) { error.hidden = false; error.textContent = previewText; error.classList.add("commerce-notice"); }
  }
  document.querySelectorAll("[data-commerce-feedback]").forEach((slot) => { slot.textContent = previewText; });
}
function bind() {
  if (readOnly) return;
  document.addEventListener("click", (event) => {
    const thumb = event.target.closest("[data-cm-thumb]");
    if (thumb) {
      const stage = document.querySelector("[data-cm-stage] img"), pic = thumb.querySelector("img");
      if (stage && pic) { stage.src = thumb.dataset.cmThumb; stage.removeAttribute("srcset"); stage.alt = pic.alt || ""; }
      document.querySelectorAll("[data-cm-thumb]").forEach((t) => t.setAttribute("aria-current", String(t === thumb)));
      return;
    }
    if (event.target.closest('a[aria-disabled="true"]')) { event.preventDefault(); return; }
    const add = event.target.closest("[data-add-product]");
    if (add) { event.preventDefault(); if (add.disabled) return; addProduct(add.dataset.addProduct, document.getElementById("aura-quantity")?.value || 1, add.dataset.option || ""); return; }
    if (event.target.closest("[data-cart-open]")) { openDrawer(); return; }
    if (event.target.closest("[data-drawer-close]")) { closeDrawer(); return; }
    const quantity = event.target.closest("[data-quantity]");
    if (quantity) { changeQuantity(quantity.dataset.id, Number(quantity.dataset.quantity), quantity.dataset.option || ""); return; }
    const remove = event.target.closest("[data-remove]");
    if (remove) { removeProduct(remove.dataset.remove, remove.dataset.option || ""); return; }
    if(event.target.closest("[data-offer-apply], [data-offer-remove]")){
      const control=event.target.closest("[data-offer-apply], [data-offer-remove]");
      activeOfferCode=control.hasAttribute("data-offer-remove")?"":(control.closest(".commerce-offer")?.querySelector("[data-offer-code]")?.value||"").trim().toUpperCase();
      try{sessionStorage.setItem(offerStorageKey,activeOfferCode);}catch{}
      checkoutAttempt=null;allowReplayWithoutToken=false;
      validateCart();return;
    }
    if (event.target.closest("[data-retry-validation]")) { validateCart(); return; }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.getElementById("commerce-cart-drawer")?.classList.contains("is-open")) closeDrawer();
    if (event.key === "Tab" && document.getElementById("commerce-cart-drawer")?.classList.contains("is-open")) {
      const drawer = document.getElementById("commerce-cart-drawer");
      const focusable = [...drawer.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(el => el.getClientRects().length && !el.closest("[inert]"));
      if (!focusable.length) return;
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
    }
  });
  document.querySelector("#checkout-form")?.addEventListener("submit", placeOrder);
  document.querySelector("#checkout-form")?.addEventListener("change", (e) => { if (e.target.name === "payment_method") { clearCheckoutError(); renderCommerce(); } });
  document.querySelector('#checkout-form [name="state"]')?.addEventListener("change", () => validateCart());
  document.querySelector("#track-form")?.addEventListener("submit", trackOrder);
  wireMerchantSettings();
}

if (readOnly) {
  cart = [];
  updateCount();
  initializeReadOnlyPreview();
} else {
  cart = readCart();
  mountDrawer();
  updateCount();
  bind();
  emailAuth=initializeCheckoutContact({api,apiRoot:configNode?.dataset.apiRoot||"",storageKey,
    onUpdate:updatePlaceOrderAvailability,onStateChange:()=>validateCart(),
    security:{token:()=>turnstileToken,
      focus:()=>document.querySelector("[data-turnstile]")?.scrollIntoView({block:"center",behavior:"smooth"}),
      reset:()=>{turnstileToken="";try{if(turnstileWidget!=null)window.turnstile?.reset(turnstileWidget);}catch{}updatePlaceOrderAvailability();}}});
  document.querySelectorAll("[data-product-options]").forEach(initOptions);
  if (page === "cart" || page === "checkout") validateCart();
  initTurnstile();
}
