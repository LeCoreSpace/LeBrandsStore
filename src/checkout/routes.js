import { renderAura } from "../public/aura.js";
import { SECURITY_HEADERS, ipHash } from "../auth/security.js";
import { sha256 } from "../auth/passwords.js";
import { readJson } from "../store/input.js";
import { cartItems, commerceError, INDIAN_STATES } from "../public/commerce-rules.js";
import { indianPhone, orderInput, orderSource } from "./input.js";
import { verifyTurnstile } from "./turnstile.js";
import { checkoutQuote, consumeIpLimit, findReplay, placeCodOrder, receiptOrder } from "./repository.js";

export const CHECKOUT_HEADERS = {...SECURITY_HEADERS,"cache-control":"no-store","referrer-policy":"no-referrer","x-robots-tag":"noindex, nofollow"};
const json = (data,status = 200) => new Response(JSON.stringify(data),{
  status,headers:{...CHECKOUT_HEADERS,"content-type":"application/json; charset=utf-8"},
});
export const isCheckoutPath = (path) => ["/api/cart/validate","/api/checkout/order","/api/orders/track","/cart","/checkout","/track"].includes(path) || /^\/orders\/[0-9a-f]{64}$/.test(path);
export async function handleCheckout(request,env,db,store,data,dependencies = {}) {
  const url = new URL(request.url), api = url.pathname.startsWith("/api/");
  try {
    if (!api) {
      if (!["GET","HEAD"].includes(request.method)) return json({error:"Method not allowed."},405);
      const options = {commerce:true,siteKey:env.TURNSTILE_SITE_KEY ?? "",page:url.pathname.slice(1)};
      if (url.pathname.startsWith("/orders/")) {
        options.page = "confirmation";
        const receiptHash = await sha256(`${store.store_id}:${url.pathname.slice("/orders/".length)}`);
        options.order = await db.withStore(store.store_id,(tx) => receiptOrder(tx,store.store_id,receiptHash));
      }
      const csp = CHECKOUT_HEADERS["content-security-policy"]
        .replace("script-src 'self' 'unsafe-inline'","script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com")
        .replace("connect-src 'self'","connect-src 'self' https://challenges.cloudflare.com")
        .replace("frame-src 'self'","frame-src 'self' https://challenges.cloudflare.com");
      return new Response(request.method === "HEAD" ? null : renderAura(data,options),{
        headers:{...CHECKOUT_HEADERS,"content-security-policy":csp,"content-type":"text/html; charset=utf-8"},
      });
    }
    if (request.method !== "POST") return json({error:"Method not allowed."},405);
    if (request.headers.get("origin") !== url.origin) return json({error:"Reload this store and try again."},403);
    const body = await readJson(request);
    if (url.pathname === "/api/cart/validate") {
      const items = cartItems(body.items);
      if (body.state && !INDIAN_STATES.some((s) => s.code === body.state)) throw commerceError("Choose a valid state.",{state:"Choose your state."});
      return json(await db.withStore(store.store_id,(tx) => checkoutQuote(tx,store.store_id,items,body.state ?? "")));
    }
    const hash = await ipHash(request,env.SESSION_SECRET);
    const purpose = url.pathname === "/api/orders/track" ? "track" : "checkout";
    if (!await db.withStore(store.store_id,(tx) => consumeIpLimit(tx,store.store_id,hash,purpose))) throw commerceError("Too many attempts. Please wait and try again.",undefined,429);
    if (purpose === "track") {
      const phone = indianPhone(body.phone);
      if (!phone || typeof body.order_number !== "string" || !/^[A-Z]{1,3}-[0-9]{4,18}$/.test(body.order_number)) throw commerceError("Enter your order number and mobile number.");
      const [order] = await db.withStore(store.store_id,(tx) => tx`SELECT o.order_number,o.status,o.created_at FROM public.orders o
        WHERE o.store_id = ${store.store_id} AND o.order_number = ${body.order_number} AND o.shipping_address->>'phone' = ${phone}`);
      if (!order) throw commerceError("No matching order was found. Check the order number and phone.",undefined,404);
      return json(order);
    }
    const input = orderInput(body), requestHash = await sha256(JSON.stringify(input));
    const replay = await db.withStore(store.store_id,(tx) => findReplay(tx,store.store_id,input,requestHash));
    if (replay) return json(replay);
    // Tests inject a verification dependency; there is no URL/env production bypass.
    await (dependencies.verifyTurnstile ?? verifyTurnstile)(request,env,body);
    const receiptHash = await sha256(`${store.store_id}:${input.receipt_token}`);
    return json(await db.withStore(store.store_id,(tx) =>
      placeCodOrder(tx,store.store_id,input,requestHash,receiptHash,orderSource(body,request))),201);
  } catch (error) {
    console.error("Checkout request failed",{code:/^[0-9A-Z]{5}$/.test(error?.code ?? "")?error.code:error.status?"REQUEST_REJECTED":"CHECKOUT_SERVICE_ERROR"});
    return json({error:error.status?error.message:"Checkout is temporarily unavailable. Please try again.",
      ...(error.errors?{errors:error.errors}:{})},error.status ?? 503);
  }
}
