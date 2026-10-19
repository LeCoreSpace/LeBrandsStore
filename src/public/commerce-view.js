import { INDIAN_STATES, formatPhone } from "./commerce-rules.js";
import { stateName, statusLabel, indianDate } from "./dashboard-rules.js";
import { productHref, productImageUrl } from "./commerce-options.js";

const esc = (value) => String(/^\+91[0-9]{10}$/.test(String(value)) ? formatPhone(value) : value ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const money = (value) => `₹${(Math.max(0, Number(value) || 0) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
function stateSelect() {
  return `<label class="commerce-field">State<select name="state" autocomplete="address-level1" required><option value="">Choose state or UT</option>${INDIAN_STATES.map(({code,name})=>`<option value="${esc(code)}">${esc(name)}</option>`).join("")}</select></label>`;
}
const trail = (now) => `<ol class="cm-trail" aria-label="Order steps">${["Bag", "Details", "Receipt"].map((t, i) => `<li class="${i < now ? "is-done" : i === now ? "is-now" : ""}"${i === now ? ' aria-current="step"' : ""}><i>${i + 1}</i>${t}</li>`).join("")}</ol>`;
function cartRecommendations(data) {
  if (data.aura_skeleton_enabled !== true) return "";
  const picks = (Array.isArray(data.products) ? data.products : []).filter((p) => p?.id && p.title && (p.stock == null || Number(p.stock) > 0)).slice(0, 4);
  if (!picks.length) return "";
  return `<section class="commerce-panel commerce-recs" data-cart-recs aria-label="You may also like"><h2>You may also like</h2><div class="commerce-rec-list">${picks.map((p) => `<article data-rec-id="${esc(p.id)}"><a href="${productHref(p)}">${esc(p.title)}</a><span>${money(p.price_paise)}</span><button type="button" class="commerce-button" data-add-product="${esc(p.id)}">Add to bag</button></article>`).join("")}</div></section>`;
}
function cartPage(data = {}) {
  return `<main class="commerce-main cm-main"><div class="commerce-heading"><span class="commerce-kicker">Review your selection</span><h1>Your bag</h1><p>Check quantities and prices, then continue to checkout.</p>${trail(0)}</div><div class="commerce-layout"><section class="commerce-panel cm-card"><div data-cart-page-lines><div class="commerce-loading" role="status">Checking your bag…</div></div></section><aside class="commerce-summary" data-cart-summary></aside></div>${cartRecommendations(data)}</main>`;
}
function checkoutPage() {
  return `<main class="commerce-main cm-main"><div class="commerce-heading"><span class="commerce-kicker">Delivery and payment</span><h1>Checkout</h1><p>No account needed. Your order is confirmed on the next page.</p>${trail(1)}</div><div class="commerce-layout checkout-layout"><form class="checkout-form" id="checkout-form" novalidate>
    <section class="checkout-section"><h2>Contact</h2><div class="commerce-fields"><label class="commerce-field">Mobile number <span class="required-mark">Required</span><span class="commerce-phone"><span aria-hidden="true">+91</span><input name="phone" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="10-digit mobile number" maxlength="14" required></span></label><label class="commerce-field">Name<input name="name" autocomplete="name" maxlength="120" required></label><label class="commerce-field full">Email <span class="optional-mark">Optional</span><input name="email" type="email" autocomplete="email" maxlength="254"></label></div></section>
    <section class="checkout-section"><h2>Delivery address</h2><div class="commerce-fields"><label class="commerce-field">Pincode<input name="pincode" inputmode="numeric" autocomplete="postal-code" maxlength="6" required></label><label class="commerce-field full">Address line 1<input name="line1" autocomplete="address-line1" maxlength="240" required></label><label class="commerce-field full">Address line 2 <span class="optional-mark">Optional</span><input name="line2" autocomplete="address-line2" maxlength="240"></label><label class="commerce-field full">Landmark <span class="optional-mark">Optional</span><input name="landmark" maxlength="160"></label><label class="commerce-field">City<input name="city" autocomplete="address-level2" maxlength="100" required></label>${stateSelect()}</div></section>
    <section class="checkout-section"><h2>Payment</h2><div class="payment-options" role="radiogroup" aria-label="Payment method"><label class="payment-choice is-selected" data-pay="cod"><input class="payment-input" type="radio" name="payment_method" value="cod" checked><span class="payment-radio" aria-hidden="true"></span><div><strong>Cash on Delivery</strong><small>Pay when your order arrives.</small></div></label><label class="payment-choice" data-pay="online" hidden><input class="payment-input" type="radio" name="payment_method" value="online"><span class="payment-radio" aria-hidden="true"></span><div><strong>Pay online</strong><small>UPI, cards and netbanking through Razorpay. Card details are entered only in Razorpay's window.</small></div></label></div><p class="commerce-muted" data-cod-notice role="status" hidden></p></section>
    <div class="checkout-actions"><div class="turnstile-slot" data-turnstile aria-label="Security verification"></div><p class="commerce-error" data-checkout-error role="alert" hidden></p><button class="commerce-button commerce-submit" type="submit">Place order</button><p class="commerce-privacy">By placing your order, you agree to the store’s policies.</p></div>
  </form><aside class="commerce-summary" data-checkout-summary><div class="commerce-loading" role="status">Checking prices and availability…</div></aside></div></main>`;
}
function trackPage() {
  return `<main class="commerce-main commerce-narrow"><div class="commerce-heading"><span class="commerce-kicker">Order status</span><h1>Track your order</h1><p>Enter the order number and mobile used at checkout.</p></div><form class="commerce-panel cm-card track-form" id="track-form"><label class="commerce-field">Order number<input name="order_number" autocomplete="off" required placeholder="For example, STN-1001"></label><label class="commerce-field">Mobile number<input name="phone" type="tel" inputmode="numeric" autocomplete="tel-national" required placeholder="10-digit mobile number"></label><p class="commerce-error" data-track-error role="alert" hidden></p><button class="commerce-button" type="submit">Find my order</button><div data-track-result aria-live="polite"></div></form></main>`;
}
const safeImg = productImageUrl;
const snapOf = (item) => (item && typeof item.product_snapshot === "object" && item.product_snapshot) || {};
function itemMeta(item) {
  const s = snapOf(item), parts = [];
  const attrs = s.attributes || s.options || s.variant_attributes || item.option_snapshot;
  if (attrs && typeof attrs === "object" && !Array.isArray(attrs)) Object.entries(attrs).forEach(([k, v]) => { if (v != null && typeof v !== "object" && String(v)) parts.push(`${k}: ${v}`); });
  else if (s.variant_title || s.variant) parts.push(String(s.variant_title || s.variant));
  const sku = s.sku || s.variant_sku || item.sku;
  if (sku) parts.push(`SKU ${sku}`);
  return parts;
}
function itemImage(item) {
  const s = snapOf(item), m = s.media || s.images || s.image || s.image_url;
  const first = Array.isArray(m) ? m[0] : m;
  return safeImg(typeof first === "string" ? first : first?.url || first?.src);
}
function confirmation(order = {}, invoiceUrl = "") {
  if (!order || !order.order_number || !Array.isArray(order.items)) return `<main class="commerce-main commerce-narrow"><section class="commerce-empty"><span class="commerce-kicker">Order details</span><h1>We can’t show this receipt</h1><p>This confirmation needs a valid receipt link. Nothing has been assumed or filled in.</p><a class="commerce-button" href="/track">Track an order</a></section></main>`;
  if (order.payment_status === "refunded") order = { ...order, status: "refunded" };
  const address = order.shipping_address || {};
  const firstName = String(order.customer_name || order.name || address.name || "").trim().split(/\s+/)[0];
  const st = String(order.status || ""), cod = order.payment_method === "cod" || st === "confirmed_cod";
  const pending = st === "pending_payment";
  const bad = ["failed", "cancelled", "payment_failed", "expired", "refunded"].includes(st);
  const tone = pending ? "pending" : bad ? "bad" : "ok";
  const thanks = pending ? "Payment pending." : bad ? (st === "refunded" ? "Your payment was refunded." : st === "cancelled" ? "This order was cancelled." : "Payment was not completed.") : (firstName ? `Thank you, ${esc(firstName)}. Your order is confirmed.` : "Thank you. Your order is confirmed.");
  const note = pending ? "Your order is not confirmed yet. We confirm it only after the payment provider verifies your payment, which can take a minute. Reload this page to check. If you were charged and it stays pending, keep your order number."
    : bad ? (st === "refunded" ? "Your payment provider has processed the refund. Bank processing times vary." : "If money was deducted, contact the store with your order number to check the payment or refund status.")
    : cod ? "Pay the delivery partner when your order arrives. No online payment has been taken." : "";
  const mark = tone === "ok" ? `<div class="receipt-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m7 12 3 3 7-7"/></svg></div>` : "";
  const paid = !cod && !pending && !bad && (order.payment_status === "paid" || ["paid", "confirmed", "processing", "packed", "shipped", "delivered"].includes(st));
  const payText = cod ? "Cash on Delivery" : pending ? "Awaiting payment" : st === "refunded" ? "Refunded" : bad ? "Not completed" : paid ? "Paid online" : "Online payment";
  const hasNum = (v) => v != null && v !== "" && Number.isFinite(Number(v));
  const rows = [["Subtotal", order.subtotal_paise], ["Shipping", order.shipping_paise]].filter(([, v]) => hasNum(v));
  const shipRow = (l, v) => `<div class="receipt-line receipt-sub"><span>${l}</span><strong>${l === "Shipping" && Number(v) === 0 ? "Free" : money(v)}</strong></div>`;
  const lines = order.items.map((item) => {
    const meta = itemMeta(item), img = itemImage(item), t = item.title || snapOf(item).title || "Item";
    return `<li class="receipt-item">${img ? `<img class="receipt-thumb" src="${esc(img)}" alt="" loading="lazy">` : `<span class="receipt-thumb receipt-thumb-empty" aria-hidden="true">${esc(String(t).slice(0, 1).toUpperCase())}</span>`}<div class="receipt-item-main"><strong>${esc(t)}</strong>${meta.length ? `<small>${meta.map(esc).join(" · ")}</small>` : ""}<small>Qty ${Number(item.quantity) || 0}${hasNum(item.unit_price_paise) ? ` × ${money(item.unit_price_paise)}` : ""}</small></div><strong class="receipt-amt">${money(item.line_total_paise ?? (Number(item.unit_price_paise) || 0) * (Number(item.quantity) || 0))}</strong></li>`;
  }).join("");
  const addr = [address.name, address.line1, address.line2, address.landmark, [address.city, stateName(address.state)].filter(Boolean).join(", "), address.pincode, address.phone].filter(Boolean).map(esc).join("<br>");
  const totalLabel = cod && !bad ? "Total due on delivery" : paid ? "Total paid" : "Order total";
  const mono = (v) => esc(v);
  return `<main class="commerce-main cm-main"><header class="receipt-head receipt-${tone}" aria-labelledby="receipt-title">${mark}<h1 id="receipt-title">${thanks}</h1>${note ? `<p class="receipt-lead">${note}</p>` : ""}</header><div class="receipt-grid"><section class="receipt-card receipt-${tone}-card" aria-label="Order summary"><div class="receipt-ref"><span>Order number</span><strong>${mono(order.order_number)}</strong></div><div class="cm-perf" aria-hidden="true"></div><div class="receipt-lines"><h2>Order summary</h2><ul class="receipt-items">${lines}</ul>${rows.map(([l, v]) => shipRow(l, v)).join("")}${hasNum(order.tax_paise) && Number(order.tax_paise) > 0 ? `<div class="receipt-line receipt-sub"><span>GST (included in total)</span><strong>${money(order.tax_paise)}</strong></div>` : ""}<div class="receipt-total"><span>${totalLabel}</span><strong>${money(order.total_paise)}</strong></div></div></section><aside class="receipt-side"><section class="cm-card"><h2>Order details</h2><dl class="receipt-meta"><div><dt>Placed</dt><dd>${esc(indianDate(order.created_at))}</dd></div><div><dt>Status</dt><dd>${esc(statusLabel(order.status || "confirmed_cod", order.payment_method || "cod"))}</dd></div><div><dt>Payment</dt><dd>${esc(payText)}</dd></div></dl></section>${addr ? `<section class="cm-card receipt-address"><h2>Delivery address</h2><p>${addr}</p></section>` : ""}<div class="receipt-actions"><a class="commerce-button" href="/track">Track this order</a>${order.invoice && invoiceUrl ? `<a class="commerce-text-link" href="${esc(invoiceUrl)}">Open ${order.invoice.status === "cancelled" ? "cancelled " : ""}invoice / receipt</a>` : ""}</div></aside></div></main>`;
}
export function renderCommerceBody(data = {}, options = {}) {
  const page = options.page;
  const body = page === "cart" ? cartPage(data) : page === "checkout" ? checkoutPage() : page === "track" ? trackPage() : confirmation(options.order,options.invoiceUrl);
  return `${options.readOnly ? `<p class="commerce-readonly-note" role="status">Read-only preview. Sign in to configure your store; cart and checkout are available on the live store.</p>` : ""}${body}<template data-commerce-config data-store-key="${esc(data.store?.store_id || options.storeId || "")}" data-site-key="${esc(options.siteKey || "")}" data-page="${esc(page)}" data-read-only="${options.readOnly === true ? "true" : "false"}"></template>`;
}
