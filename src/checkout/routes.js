import { renderAura } from "../public/aura.js";
import { SECURITY_HEADERS, ipHash } from "../auth/security.js";
import { sha256 } from "../auth/passwords.js";
import { readJson } from "../store/input.js";
import { cartItems, commerceError, INDIAN_STATES } from "../public/commerce-rules.js";
import { indianPhone, orderInput, orderSource } from "./input.js";
import { verifyTurnstile } from "./turnstile.js";
import { checkoutQuote, consumeIpLimit, findReplay, placeCodOrder, receiptOrder } from "./repository.js";
import { renderInvoice } from "../ui/invoice.js";
import { invoiceDetail } from "../dashboard/repository.js";
import { checkoutPayment, verifyCheckout } from "../connections/payments.js";
import {offerCode} from "../offers/rules.js";
import {startCheckoutEmail,completeCheckoutEmail,requireCheckoutEmail} from "./email-auth.js";
import {pincodeLocation} from "./pincode.js";
import {checkoutSecurityEnvironment} from "../connections/checkout-security.js";

export const CHECKOUT_HEADERS = {...SECURITY_HEADERS,"cache-control":"no-store","referrer-policy":"no-referrer","x-robots-tag":"noindex, nofollow"};
const json = (data,status = 200) => new Response(JSON.stringify(data),{
  status,headers:{...CHECKOUT_HEADERS,"content-type":"application/json; charset=utf-8"},
});
export const isCheckoutPath = (path) => ["/api/cart/validate","/api/checkout/order","/api/checkout/verify","/api/checkout/email/start","/api/checkout/email/verify","/api/checkout/pincode","/api/orders/track","/cart","/checkout","/track"].includes(path) || /^\/orders\/[0-9a-f]{64}(?:\/invoice)?$/.test(path);
export async function handleCheckout(request,env,db,store,data,dependencies = {}) {
  const url = new URL(request.url), api = url.pathname.startsWith("/api/");
  try {
    if (!api) {
      if (!["GET","HEAD"].includes(request.method)) return json({error:"Method not allowed."},405);
      const securityEnv=url.pathname==="/checkout"?await checkoutSecurityEnvironment(db,store,request,env):env;
      const options = {commerce:true,siteKey:securityEnv.TURNSTILE_SITE_KEY ?? "",page:url.pathname.slice(1)};
      if (url.pathname.startsWith("/orders/")) {
        options.page = "confirmation";
        const token = url.pathname.split("/")[2];
        const receiptHash = await sha256(`${store.store_id}:${token}`);
        options.order = await db.withStore(store.store_id,(tx) => receiptOrder(tx,store.store_id,receiptHash));
        options.invoiceUrl = `/orders/${token}/invoice`;
        if (url.pathname.endsWith("/invoice")) {
          if (!options.order.invoice) throw commerceError("Your invoice will be available when the order is shipped.",undefined,404);
          const invoice = await db.withStore(store.store_id,(tx) => invoiceDetail(tx,store.store_id,options.order.invoice.id));
          return new Response(request.method === "HEAD" ? null : renderInvoice(invoice,`/orders/${token}`),
            {headers:{...CHECKOUT_HEADERS,"content-type":"text/html; charset=utf-8"}});
        }
      }
      const csp = CHECKOUT_HEADERS["content-security-policy"]
        .replace("script-src 'self' 'unsafe-inline'","script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://checkout.razorpay.com")
        .replace("connect-src 'self'","connect-src 'self' https://challenges.cloudflare.com https://api.razorpay.com https://lumberjack.razorpay.com")
        .replace("frame-src 'self'","frame-src 'self' https://challenges.cloudflare.com https://api.razorpay.com https://checkout.razorpay.com");
      return new Response(request.method === "HEAD" ? null : renderAura(data,options),{
        headers:{...CHECKOUT_HEADERS,"content-security-policy":csp,"content-type":"text/html; charset=utf-8"},
      });
    }
    if(url.pathname==="/api/checkout/pincode"){
      if(request.method!=="GET")return json({error:"Method not allowed."},405);
      return json(await pincodeLocation(url.searchParams.get("code"),dependencies.postalFetcher));
    }
    if (request.method !== "POST") return json({error:"Method not allowed."},405);
    if (request.headers.get("origin") !== url.origin) return json({error:"Reload this store and try again."},403);
    const body = await readJson(request);
    if(url.pathname==="/api/checkout/email/start"||url.pathname==="/api/checkout/email/verify"){
      const hash=await ipHash(request,env.SESSION_SECRET);
      if(!await db.withStore(store.store_id,tx=>consumeIpLimit(tx,store.store_id,hash,"checkout")))
        throw commerceError("Too many verification attempts. Please wait a minute.",undefined,429);
      if(url.pathname.endsWith("/start")){
      await (dependencies.verifyTurnstile??verifyTurnstile)(request,dependencies.verifyTurnstile?env:await checkoutSecurityEnvironment(db,store,request,env),body);
        return json(await startCheckoutEmail(db,store,env,body.email,{sendEmail:dependencies.sendCheckoutEmail}));
      }
      return json(await completeCheckoutEmail(db,store.store_id,env,body));
    }
    if (url.pathname === "/api/cart/validate") {
      const items = cartItems(body.items);
      if (body.state && !INDIAN_STATES.some((s) => s.code === body.state)) throw commerceError("Choose a valid state.",{state:"Choose your state."});
      let code="",codeError="";
      try{code=offerCode(body.code??"");}catch(error){
        if(error.status!==400)throw error;
        codeError=error.message;
      }
      if(code){
        const hash=await ipHash(request,env.SESSION_SECRET);
        if(!await db.withStore(store.store_id,tx=>consumeIpLimit(tx,store.store_id,hash,"checkout")))
          throw commerceError("Too many offer checks. Please wait a minute and try again.",undefined,429);
      }
      const result=await db.withStore(store.store_id,(tx) => checkoutQuote(tx,store.store_id,items,body.state ?? "",code,{allowCodeError:true}));
      return json(codeError?{...result,offer_error:codeError}:result);
    }
    const hash = await ipHash(request,env.SESSION_SECRET);
    const purpose = url.pathname === "/api/orders/track" ? "track" : "checkout";
    if (!await db.withStore(store.store_id,(tx) => consumeIpLimit(tx,store.store_id,hash,purpose))) throw commerceError("Too many attempts. Please wait and try again.",undefined,429);
    if (url.pathname==="/api/checkout/verify") {
      return json(await db.withStore(store.store_id,tx=>verifyCheckout(tx,store.store_id,body,env,dependencies.fetcher)));
    }
    if (purpose === "track") {
      const phone = indianPhone(body.phone);
      if (!phone || typeof body.order_number !== "string" || !/^[A-Z]{1,3}-[0-9]{4,18}$/.test(body.order_number)) throw commerceError("Enter your order number and mobile number.");
      const [order] = await db.withStore(store.store_id,(tx) => tx`SELECT o.order_number,o.status,o.payment_method,o.created_at,o.updated_at,
        s.courier,s.tracking_number,s.tracking_url FROM public.orders o
        LEFT JOIN LATERAL (SELECT courier,tracking_number,tracking_url FROM public.shipments
          WHERE store_id = o.store_id AND order_id = o.id ORDER BY created_at DESC,id DESC LIMIT 1) s ON true
        WHERE o.store_id = ${store.store_id} AND o.order_number = ${body.order_number} AND o.shipping_address->>'phone' = ${phone}`);
      if (!order) throw commerceError("No matching order was found. Check the order number and phone.",undefined,404);
      return json(order);
    }
    const input = orderInput(body), requestHash = await sha256(JSON.stringify(input));
    const replay = await db.withStore(store.store_id,(tx) => findReplay(tx,store.store_id,input,requestHash));
    if (replay) return json(input.payment_method==="online" ?
      await db.withStore(store.store_id,tx=>checkoutPayment(tx,store.store_id,input,env,dependencies.fetcher)):replay);
    await requireCheckoutEmail(env,store.store_id,input.contact.email,body.email_verification);
    // Tests inject a verification dependency; there is no URL/env production bypass.
    await (dependencies.verifyTurnstile ?? verifyTurnstile)(request,dependencies.verifyTurnstile?env:await checkoutSecurityEnvironment(db,store,request,env),body);
    const receiptHash = await sha256(`${store.store_id}:${input.receipt_token}`);
    const placed=await db.withStore(store.store_id,(tx) =>
      placeCodOrder(tx,store.store_id,input,requestHash,receiptHash,orderSource(body,request),env,dependencies.fetcher));
    return json(input.payment_method==="online" ?
      await db.withStore(store.store_id,tx=>checkoutPayment(tx,store.store_id,input,env,dependencies.fetcher)):placed,201);
  } catch (error) {
    console.error("Checkout request failed",{code:/^[0-9A-Z]{5}$/.test(error?.code ?? "")?error.code:error.status?"REQUEST_REJECTED":"CHECKOUT_SERVICE_ERROR"});
    return json({error:error.status?error.message:"Checkout is temporarily unavailable. Please try again.",
      ...(error.errors?{errors:error.errors}:{}),...(error.restart_checkout===true?{restart_checkout:true}:{})},error.status ?? 503);
  }
}
