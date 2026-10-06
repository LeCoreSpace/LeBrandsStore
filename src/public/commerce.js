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
let busy = false;
let lastFocus = null;
let turnstileWidget = null;
let turnstileToken = "";
let checkoutAttempt = null;
let allowReplayWithoutToken = false;
let validationSequence = 0;

function readCart() {
  if (readOnly) return [];
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(value) ? value.filter((item) => item && typeof item.product_id === "string" && Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 99) : [];
  } catch { return []; }
}
function saveCart() {
  if (readOnly) return;
  try { localStorage.setItem(storageKey, JSON.stringify(cart.map(({ product_id, quantity }) => ({ product_id, quantity })))); }
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
  const response = await fetch(path, { method: "POST", credentials: "same-origin", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  let result = {};
  try { result = await response.json(); } catch {}
  if (!response.ok) {
    const fieldMessages = Object.values(result.errors || {}).filter((value) => typeof value === "string");
    const error = new Error(fieldMessages.join(" ") || result.error || result.message || `We couldn’t complete that request (${response.status}).`);
    error.fields = result.errors || {};
    error.status = response.status;
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
    const result = await api("/api/cart/validate", { items: cart, ...(currentState() ? { state: currentState() } : {}) });
    if (seq !== validationSequence) return validated;
    validated = result;
    for (const item of result.items || []) {
      const local = cart.find((entry) => String(entry.product_id) === String(item.product_id));
      if (local) local.quantity = item.quantity;
    }
    saveCart();
    if (render) renderCommerce();
    return result;
  } catch (error) {
    if (seq !== validationSequence) return validated;
    validated = null;
    showValidationError(error.message);
    return null;
  }
}
function showValidationError(text) {
  for (const slot of document.querySelectorAll("[data-cart-page-lines], [data-checkout-summary]")) {
    slot.innerHTML = `<div class="commerce-error" role="alert">${esc(text)} <button class="commerce-text-link" type="button" data-retry-validation>Try again</button></div>`;
  }
  const drawer = document.querySelector("[data-drawer-lines]");
  if (drawer) drawer.innerHTML = `<div class="commerce-error" role="alert">${esc(text)} <button class="commerce-text-link" type="button" data-retry-validation>Try again</button></div>`;
  updatePlaceOrderAvailability();
}
function updatePlaceOrderAvailability() {
  const button = document.querySelector("#checkout-form [type='submit']");
  if (!button || readOnly) return;
  button.disabled = busy || !validated || !cart.length || Boolean(validated.issues?.length) || validated.cod_available !== true;
}
function productImage(url, title) {
  const safe = /^https:\/\/media\.lebrands\.store\/stores\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:png|jpe?g|svg|webp)$/i.test(String(url || ""));
  return safe ? `<img class="commerce-line-image" src="${esc(url)}" alt="">` : `<div class="commerce-line-image" role="img" aria-label="${esc(title)}"><span>${esc(String(title || "P").slice(0,1).toUpperCase())}</span></div>`;
}
function linesMarkup(items, interactive = true) {
  const issues = validated?.issues || [];
  if (!items?.length) return `${issues.map((entry)=>`<p class="commerce-error" role="alert">${esc(entry.message)}</p>`).join("")}<div class="commerce-empty"><span class="commerce-kicker">A considered start</span><h2>Your bag is empty.</h2><p>Find something made with care.</p><a class="commerce-button" href="/collections/all">Explore the collection</a></div>`;
  return `<div class="commerce-lines">${items.map((item) => {
    const issue = issues.find((entry) => String(entry.product_id) === String(item.product_id));
    const qty = Number(item.quantity) || 1;
    return `<article class="commerce-line" data-line="${esc(item.product_id)}">${productImage(item.image_url, item.title)}<div><div class="commerce-line-title">${esc(item.title || "Product")}</div><div class="commerce-line-price">${money(item.unit_price_paise)} each</div>${interactive ? `<div class="commerce-line-tools"><div class="commerce-qty" aria-label="Quantity"><button type="button" data-quantity="-1" data-id="${esc(item.product_id)}" aria-label="Decrease quantity" ${qty<=1?"disabled":""}>−</button><output>${qty}</output><button type="button" data-quantity="1" data-id="${esc(item.product_id)}" aria-label="Increase quantity" ${qty>=99?"disabled":""}>+</button></div><button class="commerce-remove" type="button" data-remove="${esc(item.product_id)}">Remove</button></div>` : `<div class="commerce-line-price">Quantity ${qty}</div>`}${issue ? `<p class="commerce-error" role="alert">${esc(issue.message)}</p>` : ""}</div><strong class="commerce-line-total">${money(item.line_total_paise)}</strong></article>`;
  }).join("")}</div>`;
}
function summaryMarkup(result, { checkout = false } = {}) {
  if (!result) return `<div class="commerce-summary"><h2>${checkout?"Order summary":"Your total"}</h2><div class="commerce-loading" role="status">Rechecking current prices…</div></div>`;
  if (!result.items?.length) return `<div class="commerce-summary"><h2>${checkout?"Order summary":"Your total"}</h2>${(result.issues||[]).map((entry)=>`<p class="commerce-error">${esc(entry.message)}</p>`).join("")}<p class="commerce-muted">Add a product to see your total.</p></div>`;
  const issues = result.issues || [];
  const unavailable = issues.length > 0 || result.cod_available === false;
  const codMessage = !result.settings?.cod_enabled ? "This store is not accepting Cash on Delivery right now." : result.total_paise > Number(result.settings?.cod_max_paise) ? `Cash on Delivery is available up to ${money(result.settings.cod_max_paise)}.` : "Cash on Delivery is not available for this order. Please contact the store.";
  return `<div class="commerce-summary"><h2>${checkout?"Order summary":"Your total"}</h2>${checkout?`<div class="checkout-summary-lines">${result.items.map((item)=>`<div class="checkout-summary-item"><span>${esc(item.title)}<small>Qty ${Number(item.quantity)||0}</small></span><strong>${money(item.line_total_paise)}</strong></div>`).join("")}</div>`:""}<div class="commerce-total-row"><span>Subtotal</span><strong>${money(result.subtotal_paise)}</strong></div><div class="commerce-total-row"><span>Delivery</span><strong>${Number(result.delivery_paise)===0?"Free":money(result.delivery_paise)}</strong></div>${Number(result.tax_paise)>0?`<div class="commerce-total-row"><span>Included taxes</span><strong>${money(result.tax_paise)}</strong></div>`:""}<div class="commerce-total-row grand"><span>Total</span><strong>${money(result.total_paise)}</strong></div>${issues.map((entry)=>`<p class="commerce-error">${esc(entry.message)}</p>`).join("")}${checkout&&!result.cod_available?`<p class="commerce-error">${esc(codMessage)}</p>`:""}${checkout?`<p class="online-note">Online payment coming soon.</p>`:`<a class="commerce-button" href="/checkout" ${unavailable?'aria-disabled="true"':''}>Continue to checkout <span aria-hidden="true">→</span></a>`}</div>`;
}
function renderCommerce() {
  const items = validated?.items || [];
  const cartLines = document.querySelector("[data-cart-page-lines]");
  if (cartLines) cartLines.innerHTML = linesMarkup(items, true);
  const cartSummary = document.querySelector("[data-cart-summary]");
  if (cartSummary) cartSummary.innerHTML = summaryMarkup(validated);
  const checkoutSummary = document.querySelector("[data-checkout-summary]");
  if (checkoutSummary) checkoutSummary.innerHTML = summaryMarkup(validated, { checkout: true });
  const codNotice = document.querySelector("[data-cod-notice]");
  if (codNotice && validated) {
    codNotice.textContent = validated.cod_available ? "Online payment coming soon." : (!validated.settings?.cod_enabled ? "This store is not accepting Cash on Delivery right now." : validated.total_paise > Number(validated.settings?.cod_max_paise) ? `Cash on Delivery is available up to ${money(validated.settings.cod_max_paise)}.` : "Cash on Delivery is not available for this order.");
    codNotice.classList.toggle("commerce-error", !validated.cod_available);
  }
  const drawerLines = document.querySelector("[data-drawer-lines]");
  if (drawerLines) drawerLines.innerHTML = linesMarkup(items, true);
  const drawerSummary = document.querySelector("[data-drawer-summary]");
  if (drawerSummary) drawerSummary.innerHTML = summaryMarkup(validated);
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
  mount.innerHTML = `<div class="commerce-overlay" data-drawer-close tabindex="-1"></div><aside class="commerce-drawer" id="commerce-cart-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" aria-hidden="true" inert><div class="commerce-drawer-head"><h2 id="drawer-title">Your bag <span data-cart-count>0</span></h2><button class="commerce-close" type="button" data-drawer-close aria-label="Close bag">×</button></div><div class="commerce-drawer-content" data-drawer-lines><div class="commerce-loading" role="status">Checking your bag…</div></div><div data-drawer-summary></div></aside>`;
}
async function openDrawer() {
  mountDrawer();
  const drawer = document.getElementById("commerce-cart-drawer");
  if (!drawer) return;
  lastFocus = document.activeElement;
  drawer.inert = false;
  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");
  document.querySelector(".commerce-overlay")?.classList.add("is-open");
  document.body.classList.add("commerce-lock");
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
  lastFocus?.focus?.();
}
function addProduct(id, quantity) {
  if (readOnly || busy) return;
  const productId = String(id || "");
  const qty = Math.max(1, Math.min(99, Number.parseInt(quantity, 10) || 1));
  const current = cart.find((item) => item.product_id === productId);
  if (current) current.quantity = Math.min(99, current.quantity + qty);
  else cart.push({ product_id: productId, quantity: qty });
  validated = null;
  saveCart();
  updatePlaceOrderAvailability();
  message("Added to your bag.");
  openDrawer();
}
async function changeQuantity(id, delta) {
  const entry = cart.find((item) => item.product_id === String(id));
  if (!entry || busy) return;
  entry.quantity = Math.max(1, Math.min(99, entry.quantity + Number(delta)));
  validated = null;
  saveCart();
  await validateCart();
}
async function removeProduct(id) {
  if (busy) return;
  cart = cart.filter((item) => item.product_id !== String(id));
  validated = null;
  saveCart();
  await validateCart();
}
function formValues(form) {
  const data = new FormData(form);
  const phoneRaw = String(data.get("phone") || "").replace(/[^\d]/g, "");
  const phone = phoneRaw.startsWith("91") && phoneRaw.length === 12 ? phoneRaw.slice(2) : phoneRaw;
  return {
    contact: { phone, name: String(data.get("name") || "").trim(), email: String(data.get("email") || "").trim() },
    address: { pincode: String(data.get("pincode") || "").trim(), line1: String(data.get("line1") || "").trim(), line2: String(data.get("line2") || "").trim(), landmark: String(data.get("landmark") || "").trim(), city: String(data.get("city") || "").trim(), state: String(data.get("state") || "") },
  };
}
function validateCheckout(form, values) {
  const errors = [];
  if (!/^[6-9]\d{9}$/.test(values.contact.phone)) errors.push("Enter a valid 10-digit Indian mobile number.");
  if (values.contact.name.length < 2 || values.contact.name.length > 120) errors.push("Enter your full name.");
  if (values.contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.contact.email)) errors.push("Enter a valid email address, or leave it blank.");
  if (!/^[1-9]\d{5}$/.test(values.address.pincode)) errors.push("Enter a valid 6-digit pincode.");
  if (values.address.line1.length < 5 || values.address.line1.length > 200) errors.push("Enter your house number and street.");
  if (values.address.city.length < 2 || values.address.city.length > 100 || !values.address.state) errors.push("Complete your city and state.");
  if (!cart.length) errors.push("Your bag is empty.");
  if (!validated) errors.push("We’re still checking your bag. Try again in a moment.");
  if (validated?.issues?.length) errors.push("Resolve the availability issues in your bag before placing the order.");
  if (validated?.cod_available === false) errors.push("Cash on Delivery is not available for this order.");
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
  const values = formValues(form);
  const errors = validateCheckout(form, values);
  if (errors.length) { showCheckoutError(errors[0]); form.querySelector('[name="phone"]')?.focus(); return; }
  busy = true;
  updatePlaceOrderAvailability();
  const button = form.querySelector('[type="submit"]');
  if (button) { button.disabled = true; button.textContent = "Preparing secure order…"; }
  let key;
  try {
    const canonical = JSON.stringify({ items: cart.map(({product_id,quantity})=>({product_id,quantity})), contact: values.contact, address: values.address });
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
          if (button) button.innerHTML = 'Place order <span aria-hidden="true">→</span>';
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
        if (button) button.innerHTML = 'Place order <span aria-hidden="true">→</span>';
        return;
      }
    }
    key = checkoutAttempt;
  } catch (error) {
    showCheckoutError(error.message);
    busy = false;
    updatePlaceOrderAvailability();
    if (button) button.innerHTML = 'Place order <span aria-hidden="true">→</span>';
    return;
  }
  if (button) { button.disabled = true; button.textContent = "Placing order…"; }
  try {
    const result = await api("/api/checkout/order", {
      items: cart.map(({product_id,quantity})=>({product_id,quantity})),
      contact: values.contact,
      address: values.address,
      idempotency_key: key.idempotencyKey,
      receipt_token: key.receiptToken,
      turnstile_token: turnstileToken || "",
      source: sourceInfo(),
    });
    if (!result.receipt_url || !result.order_number) throw new Error("Your order response was incomplete. Please try again using the same details.");
    const receiptUrl = new URL(result.receipt_url, location.origin);
    if (receiptUrl.origin !== location.origin) throw new Error("The receipt link was not a valid store link. Your order was placed. Keep your order number for tracking.");
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
    if (window.turnstile && turnstileWidget !== null) {
      try { window.turnstile.reset(turnstileWidget); turnstileToken = ""; } catch {}
    }
  } finally {
    busy = false;
    if (button) button.innerHTML = 'Place order <span aria-hidden="true">→</span>';
    updatePlaceOrderAvailability();
  }
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
      turnstileWidget = window.turnstile.render(slot, { sitekey: siteKey, action: "checkout", callback: (token) => { turnstileToken = token; clearCheckoutError(); }, "expired-callback": () => { turnstileToken = ""; }, "error-callback": () => { turnstileToken = ""; showCheckoutError("Security verification is temporarily unavailable. Please retry."); } });
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
    resultSlot.innerHTML = `<div class="track-result"><span class="commerce-kicker">Order ${esc(result.order_number)}</span><strong>${esc(String(result.status || "In progress").replace(/_/g," "))}</strong><p>Placed ${result.created_at ? esc(new Date(result.created_at).toLocaleString("en-IN")) : "recently"}</p></div>`;
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
    if (event.target.closest('a[aria-disabled="true"]')) { event.preventDefault(); return; }
    const add = event.target.closest("[data-add-product]");
    if (add) { event.preventDefault(); addProduct(add.dataset.addProduct, document.getElementById("aura-quantity")?.value || 1); return; }
    if (event.target.closest("[data-cart-open]")) { openDrawer(); return; }
    if (event.target.closest("[data-drawer-close]")) { closeDrawer(); return; }
    const quantity = event.target.closest("[data-quantity]");
    if (quantity) { changeQuantity(quantity.dataset.id, Number(quantity.dataset.quantity)); return; }
    const remove = event.target.closest("[data-remove]");
    if (remove) { removeProduct(remove.dataset.remove); return; }
    if (event.target.closest("[data-retry-validation]")) { validateCart(); return; }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.getElementById("commerce-cart-drawer")?.classList.contains("is-open")) closeDrawer();
    if (event.key === "Tab" && document.getElementById("commerce-cart-drawer")?.classList.contains("is-open")) {
      const drawer = document.getElementById("commerce-cart-drawer");
      const focusable = [...drawer.querySelectorAll('button:not(:disabled),a[href],input,select,[tabindex="0"]')];
      if (!focusable.length) return;
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
    }
  });
  document.querySelector("#checkout-form")?.addEventListener("submit", placeOrder);
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
  if (page === "cart" || page === "checkout") validateCart();
  initTurnstile();
}
