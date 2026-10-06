import { renderCheckoutSettings, renderOrders } from "../ui/checkout.js";
import { DEFAULT_CHECKOUT_SETTINGS, checkoutSettings, inferStoreState, commerceError } from "../public/commerce-rules.js";
import { readJson } from "../store/input.js";
import { SECURITY_HEADERS } from "../auth/security.js";
import { UUID } from "../public/validation.js";
import { storeFailureDetails } from "../store/diagnostics.js";
export const isMerchantCheckoutPath = (path) => /^\/(?:api\/)?stores\/[^/]+\/(?:settings\/checkout|checkout-settings|orders)$/.test(path);
export async function merchantCheckout(request,db,user,tokenHash) {
  const url = new URL(request.url), api = url.pathname.startsWith("/api/");
  const match = url.pathname.match(/^\/(?:api\/)?stores\/([^/]+)\/(settings\/checkout|checkout-settings|orders)$/);
  const headers = {...SECURITY_HEADERS,"cache-control":"no-store","content-type":api?"application/json; charset=utf-8":"text/html; charset=utf-8"};
  const respond = (value,status = 200) => new Response(api?JSON.stringify(value):value,{status,headers});
  try {
    if (!match || !UUID.test(match[1])) throw commerceError("Store not found.",undefined,404);
    if (!user || user.must_change_password) throw commerceError("Sign in to manage your store.",undefined,401);
    const [,id,action] = match;
    if ((api && (action !== "checkout-settings" || !["GET","PATCH"].includes(request.method))) ||
      (!api && !["GET","HEAD"].includes(request.method))) throw commerceError("Method not allowed.",undefined,405);
    const result = await db.withMemberStore(id,tokenHash,async (tx) => {
      const [member] = await tx`SELECT role FROM public.store_members WHERE store_id = ${id} AND user_id = ${user.id}`;
      if (member?.role !== "owner") throw commerceError("Only the store owner can view orders or change checkout settings.",undefined,403);
      const [store] = await tx`SELECT store_id,name,subdomain,status FROM public.stores WHERE store_id = ${id}`;
      if (action === "orders") {
        const orders = await tx`SELECT o.order_number,o.status,o.total_paise,o.created_at,c.name AS customer_name,c.phone
          FROM public.orders o JOIN public.customers c ON c.store_id = o.store_id AND c.id = o.customer_id
          WHERE o.store_id = ${id} ORDER BY o.created_at DESC,o.id DESC LIMIT 100`;
        return {store,orders:orders.map((o) => ({...o,total_paise:Number(o.total_paise)}))};
      }
      const [draft] = await tx`SELECT settings FROM public.store_setup WHERE store_id = ${id}`;
      const [published] = await tx`SELECT snapshot FROM public.store_publications WHERE store_id = ${id}`;
      const [saved] = await tx`SELECT settings FROM public.checkout_settings WHERE store_id = ${id}`;
      let settings = checkoutSettings({...DEFAULT_CHECKOUT_SETTINGS,store_state:inferStoreState(published?.snapshot?.settings ?? draft?.settings),...saved?.settings});
      if (request.method === "PATCH") {
        const body = await readJson(request);
        settings = checkoutSettings({...settings,...checkoutSettings(body,true)});
        await tx`INSERT INTO public.checkout_settings (store_id,settings) VALUES (${id},${tx.json(settings)})
          ON CONFLICT (store_id) DO UPDATE SET settings = EXCLUDED.settings`;
      }
      return {store,settings};
    });
    return respond(api?result:request.method === "HEAD"?"":match[2] === "orders"?renderOrders(result,user):renderCheckoutSettings(result,user));
  } catch (error) {
    console.error("Merchant checkout request failed",storeFailureDetails(error,request));
    const value = {error:error.status?error.message:"Store services are temporarily unavailable.",...(error.errors?{errors:error.errors}:{})};
    return respond(api?value:`<!doctype html><html><body><p>${value.error.replace(/[<>&"]/g,"")}</p><a href="/">Dashboard</a></body></html>`,error.status ?? 503);
  }
}
