import { renderDashboard } from "../ui/dashboard.js";
import { renderInvoice } from "../ui/invoice.js";
import { SECURITY_HEADERS } from "../auth/security.js";
import { UUID } from "../public/validation.js";
import { readJson } from "../store/input.js";
import {refreshVerification} from "../gstin/service.js";
import { loadDraft } from "../store/repository.js";
import { commerceError } from "../public/commerce-rules.js";
import { dateFilters, csv } from "../public/dashboard-rules.js";
import { dashboardAccess, overview, listOrders, orderDetail, listCustomers, customerDetail, listInvoices,
  invoiceDetail, changeOrderStatus, collectPayment, archiveProduct, adjustStock, exportRows, audit } from "./repository.js";

export function isDashboardPath(path,method = "GET") {
  if (/^\/(?:api\/)?stores\/new(?:\/|$)/.test(path)) return false;
  if (/^\/(?:api\/)?stores\/[^/]+$/.test(path)) return true;
  if (/^\/(?:api\/)?stores\/[^/]+\/(?:orders|customers|invoices)(?:\/[^/]+(?:\/(?:status|payment))?)?$/.test(path)) return true;
  if (/^\/stores\/[^/]+\/(?:products(?:\/[^/]+)?|settings)$/.test(path)) return true;
  if (/^\/api\/stores\/[^/]+\/products(?:\/[^/]+)?$/.test(path) && ["GET","HEAD"].includes(method)) return true;
  return /^\/api\/stores\/[^/]+\/(?:products\/[^/]+\/(?:archive|stock)|exports\/(?:customers|orders|products))$/.test(path);
}
export async function handleDashboard(request,db,user,tokenHash,env={}) {
  const url = new URL(request.url), api = url.pathname.startsWith("/api/");
  const match = url.pathname.match(/^\/(?:api\/)?stores\/([^/]+)(?:\/([^/]+)(?:\/([^/]+)(?:\/([^/]+))?)?)?$/);
  const headers = {...SECURITY_HEADERS,"cache-control":"no-store","referrer-policy":"no-referrer","x-robots-tag":"noindex, nofollow"};
  const json = (data,status = 200) => new Response(JSON.stringify(data),{status,headers:{...headers,"content-type":"application/json; charset=utf-8"}});
  try {
    if (!match || !UUID.test(match[1])) throw commerceError("Store not found.",undefined,404);
    if (!user || user.must_change_password) throw commerceError("Sign in to manage your store.",undefined,401);
    const [,id,section = "overview",child,action] = match;
    if (child && !UUID.test(child) && !(section === "products" && child === "new") &&
      !(section === "exports" && ["orders","products","customers"].includes(child))) throw commerceError("Record not found.",undefined,404);
    const read = ["GET","HEAD"].includes(request.method);
    const mutation = request.method === "POST" && api && ((section === "orders" && child && ["status","payment"].includes(action)) ||
      (section === "products" && child && ["stock","archive"].includes(action)) || (section === "exports" && child && !action));
    if ((!read && !mutation) || (read && (action || section === "exports"))) throw commerceError("Method not allowed.",undefined,405);
    const filters = dateFilters(url.searchParams);
    if(section==="settings"&&read || mutation&&section==="orders"&&action==="status"){
      const shipping=!read&&(await readJson(request.clone())).status==="shipped";
      if(section==="settings"||shipping){
        const verification=await db.withMemberStore(id,tokenHash,async tx=>{
          await dashboardAccess(tx,id,user.id,shipping);
          return refreshVerification(tx,env,id,{published:shipping});
        });
        if(shipping&&!verification.ready)throw commerceError("Verify and confirm the active Regular GSTIN in Settings, then republish, before issuing an invoice.",undefined,409);
      }
    }
    const result = await db.withMemberStore(id,tokenHash,async (tx) => {
      const role = await dashboardAccess(tx,id,user.id,!read && section === "orders",section === "exports");
      if (mutation) {
        const body = await readJson(request);
        if (section === "orders") return action === "status" ? changeOrderStatus(tx,id,child,user.id,body) : collectPayment(tx,id,child,user.id,body);
        if (section === "products") return action === "archive" ? archiveProduct(tx,id,child,user.id) : adjustStock(tx,id,child,user.id,body);
        const exported = await exportRows(tx,id,child,body);
        await audit(tx,id,user.id,"data.exported","store",id,{kind:child,row_count:exported.rows.length,filters:dateFilters(body)});
        return exported;
      }
      const draft = await loadDraft(tx,id,{includeArchived:section === "products"});
      const data = {store:draft.store,draft,role,filters};
      if (section === "settings") {
        const [saved] = await tx`SELECT settings FROM public.checkout_settings WHERE store_id = ${id}`;
        data.checkoutSettings = saved?.settings || {};
      }
      if (section === "overview") data.overview = await overview(tx,id,filters.period);
      else if (section === "orders") {
        if (child) data.order = await orderDetail(tx,id,child);
        else data.orders = await listOrders(tx,id,filters);
      } else if (section === "customers") {
        if (child) data.customer = await customerDetail(tx,id,child);
        else data.customers = await listCustomers(tx,id,filters.search);
      } else if (section === "invoices") {
        if (child) data.invoice = await invoiceDetail(tx,id,child);
        else data.invoices = await listInvoices(tx,id);
      } else if (section === "products") {
        data.product = child === "new" ? null : child ? draft.products.find((p) => p.id === child) : undefined;
        if (child && child !== "new" && !data.product) throw commerceError("Product not found.",undefined,404);
      }
      return data;
    });
    if (section === "exports") return new Response(csv(result.headers,result.rows),{headers:{...headers,
      "content-type":"text/csv; charset=utf-8","content-disposition":`attachment; filename="${section}-${child}.csv"`}});
    if (api) return json(result);
    const view = section === "products" && child ? child === "new" ? "product-new" : "product" : section === "orders" && child ? "order" : section === "customers" && child ? "customer" : section;
    return new Response(request.method === "HEAD" ? null : result.invoice ? renderInvoice(result.invoice,`/stores/${id}/orders`) : renderDashboard(view,result,user),
      {headers:{...headers,"content-type":"text/html; charset=utf-8"}});
  } catch (error) {
    console.error("Dashboard request failed",{code:/^[A-Z0-9]{5}$/.test(error.code || "") ? error.code : error.status ? "REQUEST_REJECTED" : "DASHBOARD_UNAVAILABLE"});
    const status = error.status || 503;
    return json({error:error.status ? error.message : "Store services are temporarily unavailable."},status);
  }
}
