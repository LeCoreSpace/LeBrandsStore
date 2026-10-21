import { renderDashboard } from "../ui/dashboard.js";
import {isBlogDashboard,handleBlogDashboard} from "../blog/routes.js";
import {isContentLLMPath,handleContentLLM} from "../blog/discovery-dashboard.js";
import {isMediaLibraryPath,handleMediaLibrary} from "./media-library-routes.js";
import {isMediaImagePath,handleMediaImages} from "../media-images/routes.js";
import{isMarketingDashboard,handleMarketingDashboard}from"./marketing-routes.js";
import {businessEditorAccess,protectedEditorLinks} from "../store/business-access.js";
import { renderInvoice } from "../ui/invoice.js";
import { SECURITY_HEADERS } from "../auth/security.js";
import {catalogueFrameHeaders} from "./catalogue-frame-headers.js";
import { UUID } from "../public/validation.js";
import { readJson } from "../store/input.js";
import {refreshVerification} from "../gstin/service.js";
import { loadDraft,loadStoreContext } from "../store/repository.js";
import { commerceError } from "../public/commerce-rules.js";
import { dateFilters, csv } from "../public/dashboard-rules.js";
import {emailHistory} from "../email/worker.js";
import {loadAnnSession, annReference} from "../store/ann-repository.js";
import {onlineAvailable} from "../connections/payments.js";
import {CONNECTION_KINDS} from "../public/store-essentials.js";
import {listInventory,bulkInventory,inventoryFilters,inventoryCanEdit,inventoryAlerts} from "./inventory.js";
import {handleCogsDashboard} from "./cogs-routes.js";
import {handleOffersDashboard} from "./offers-routes.js";
import {handleAnalyticsDashboard} from "./analytics-routes.js";
import {cogsEnabled,cogsCanEdit,productCostFields} from "./cogs.js";
import { dashboardAccess, overview, listOrders, orderDetail, listCustomers, customerDetail, listInvoices,
  invoiceDetail, changeOrderStatus, collectPayment, archiveProduct, adjustStock, exportRows, audit } from "./repository.js";

export function isDashboardPath(path,method = "GET") {
  if(isMediaImagePath(path))return true;
  if(isMediaLibraryPath(path))return true;
  if(isContentLLMPath(path))return true;
  if(isBlogDashboard(path))return true;
  if(isMarketingDashboard(path))return true;
  if(/^\/stores\/[^/]+\/offers$/.test(path)||/^\/api\/stores\/[^/]+\/offers(?:\/[^/]+\/status)?$/.test(path))return true;
  if (/^\/(?:api\/)?stores\/new(?:\/|$)/.test(path)) return false;
  if (/^\/(?:api\/)?stores\/[^/]+$/.test(path)) return true;
  if(/^\/stores\/[^/]+\/analytics$/.test(path)||/^\/api\/stores\/[^/]+\/analytics(?:\/export)?$/.test(path))return true;
  if(/^\/stores\/[^/]+\/cogs$/.test(path)||/^\/api\/stores\/[^/]+\/cogs(?:\/[^/]+\/history)?$/.test(path))return true;
  if(/^\/stores\/[^/]+\/inventory$/.test(path)||/^\/api\/stores\/[^/]+\/inventory(?:\/(?:bulk|alerts))?$/.test(path))return true;
  if (/^\/(?:api\/)?stores\/[^/]+\/(?:orders|customers|invoices)(?:\/[^/]+(?:\/(?:status|payment))?)?$/.test(path)) return true;
  if (/^\/stores\/[^/]+\/(?:(?:products|collections)(?:\/[^/]+)?|settings)$/.test(path)) return true;
  if (/^\/api\/stores\/[^/]+\/products(?:\/[^/]+)?$/.test(path) && ["GET","HEAD"].includes(method)) return true;
  return /^\/api\/stores\/[^/]+\/(?:products\/[^/]+\/(?:archive|stock)|exports\/(?:customers|orders|products))$/.test(path);
}
export async function handleDashboard(request,db,user,tokenHash,env={}) {
  if(isMediaImagePath(new URL(request.url).pathname))return handleMediaImages(request,env,db,user,tokenHash);
  if(isMarketingDashboard(new URL(request.url).pathname))return handleMarketingDashboard(request,db,user,tokenHash,env);
  const url = new URL(request.url), api = url.pathname.startsWith("/api/");
  const match = url.pathname.match(/^\/(?:api\/)?stores\/([^/]+)(?:\/([^/]+)(?:\/([^/]+)(?:\/([^/]+))?)?)?$/);
  const headers = {...SECURITY_HEADERS,"cache-control":"no-store","referrer-policy":"no-referrer","x-robots-tag":"noindex, nofollow"};
  const json = (data,status = 200) => new Response(JSON.stringify(data),{status,headers:{...headers,"content-type":"application/json; charset=utf-8"}});
  try {
    if (!match || !UUID.test(match[1])) throw commerceError("Store not found.",undefined,404);
    if (!user || user.must_change_password) throw commerceError("Sign in to manage your store.",undefined,401);
    const [,id,section = "overview",child,action] = match;
    if(section==="media-library"&&!child&&!action)return await handleMediaLibrary(request,db,user,tokenHash,id);
    if(section==="content-llm")return await handleContentLLM(request,db,user,tokenHash,id);
    if(section==="blog")return await handleBlogDashboard(request,db,user,tokenHash,id,child,action);
    if(section==="offers")return await handleOffersDashboard(request,db,user,tokenHash,id,child,action);
    if(section==="analytics")return await handleAnalyticsDashboard(request,db,user,tokenHash,id,child,action);
    if(section==="cogs")return await handleCogsDashboard(request,db,user,tokenHash,id,child,action);
    const connectionKind=Object.hasOwn(CONNECTION_KINDS,url.searchParams.get("connection") || "") ? url.searchParams.get("connection") : null;
    if (child && !UUID.test(child) && !(["products", "collections"].includes(section) && child === "new") &&
      !(section === "exports" && ["orders","products","customers"].includes(child)) &&
      !(section==="inventory"&&["bulk","alerts"].includes(child)&&!action)) throw commerceError("Record not found.",undefined,404);
    const read = ["GET","HEAD"].includes(request.method);
    const mutation = request.method === "POST" && api && ((section === "orders" && child && ["status","payment"].includes(action)) ||
      (section === "products" && child && ["stock","archive"].includes(action)) || (section === "exports" && child && !action) ||
      (section==="inventory"&&child==="bulk"&&!action));
    if(section==="inventory"&&((read&&child&&child!=="alerts")||(!read&&(!api||child!=="bulk"))))throw commerceError("Method not allowed.",undefined,405);
    if(section==="inventory"&&mutation&&request.headers.get("origin")!==url.origin)throw commerceError("Open inventory in your store dashboard before saving.",undefined,403);
    if ((!read && !mutation) || (read && (action || section === "exports"))) throw commerceError("Method not allowed.",undefined,405);
    const filters = section==="inventory"?null:dateFilters(url.searchParams);
    if(section==="settings"&&read&&!connectionKind || mutation&&section==="orders"&&action==="status"){
      const shipping=!read&&(await readJson(request.clone())).status==="shipped";
      if(section==="settings"||shipping){
        const verification=await db.withMemberStore(id,tokenHash,async tx=>{
          await dashboardAccess(tx,id,user.id,shipping);
          return refreshVerification(tx,env,id,{published:shipping});
        });
        if(shipping&&!verification.ready)throw commerceError("Verify and confirm the active Regular GSTIN in Settings, then republish, before issuing an invoice.",undefined,409);
      }
    }
    let editorAccess;
    const result = await db.withMemberStore(id,tokenHash,async (tx) => {
      if(!api)editorAccess=await businessEditorAccess(tx,id,tokenHash);
      const role = await dashboardAccess(tx,id,user.id,!read && section === "orders",section === "exports");
      if(section==="inventory"){
        if(read&&child==="alerts")return inventoryAlerts(tx,id);
        if(mutation){
          if(!inventoryCanEdit(role))throw commerceError("You do not have permission to update inventory.",undefined,403);
          return bulkInventory(tx,id,user.id,await readJson(request));
        }
        const inventory=await listInventory(tx,id,inventoryFilters(url.searchParams),role);
        if(api)return inventory;
        const [store]=await tx`SELECT store_id,name,subdomain,status FROM public.stores WHERE store_id=${id}`;
        return{store,role,inventory};
      }
      if (mutation) {
        const body = await readJson(request);
        if (section === "orders") return action === "status" ? changeOrderStatus(tx,id,child,user.id,body) : collectPayment(tx,id,child,user.id,body);
        if (section === "products") return action === "archive" ? archiveProduct(tx,id,child,user.id) : adjustStock(tx,id,child,user.id,body);
        const exported = await exportRows(tx,id,child,body);
        await audit(tx,id,user.id,"data.exported","store",id,{kind:child,row_count:exported.rows.length,filters:dateFilters(body)});
        return exported;
      }
      // Preserve the existing API response contract. Operational HTML pages
      // need store identity and GST warnings, not the entire editable catalogue.
      const operational=!api&&["orders","customers","invoices"].includes(section);
      const draft = operational?null:await loadDraft(tx,id,{includeArchived:section === "products",includeDesign:!["overview","orders","customers","invoices"].includes(section),includeClassifications:api||section!=="overview"});
      const context=operational?await loadStoreContext(tx,id):{store:draft.store,draft};
      const data = {...context,role,filters};
      if (section === "settings" || section === "overview") {
        const [checkoutSchema]=await tx`SELECT to_regclass('public.checkout_settings') IS NOT NULL AS enabled`;
        const [saved] = checkoutSchema?.enabled ? await tx`SELECT settings FROM public.checkout_settings WHERE store_id = ${id}` : [];
        data.checkoutSettings = saved?.settings || {};
        data.checkoutSaved=!!saved;
      }
      if (section === "settings" && connectionKind) data.connectionKind=connectionKind;
      if (section === "overview") {
        data.stockAlerts=await inventoryAlerts(tx,id);
        data.overview = await overview(tx,id,filters.period);
        const [schema]=await tx`SELECT to_regclass('public.ann_builder_sessions') IS NOT NULL AS ready`;
        data.annProgressAvailable=schema?.ready===true;
        if(data.annProgressAvailable) {
          data.annSession=await loadAnnSession(tx,id);
          data.annReference=await annReference(tx);
        }
        data.onlineAvailable=await onlineAvailable(tx,id);
      }
      else if (section === "orders") {
        if (child) {data.order = await orderDetail(tx,id,child);data.order.email_history=await emailHistory(tx,id,child);}
        else data.orders = await listOrders(tx,id,filters);
      } else if (section === "customers") {
        if (child) data.customer = await customerDetail(tx,id,child);
        else data.customers = await listCustomers(tx,id,filters.search);
      } else if (section === "invoices") {
        if (child) data.invoice = await invoiceDetail(tx,id,child);
        else data.invoices = await listInvoices(tx,id);
      } else if (section === "collections") {
        if (!draft.aura_skeleton_enabled) throw commerceError("Apply the Aura section catalogue update first.", undefined, 409);
        data.collection_id = child === "new" ? undefined : child;
        data.collection = child === "new" ? null : child ? draft.collections?.find(c => c.id === child) : undefined;
        if (child && child !== "new" && !data.collection) throw commerceError("Collection not found.", undefined, 404);
      } else if (section === "products") {
        data.product = child === "new" ? null : child ? draft.products.find((p) => p.id === child) : undefined;
        if (child && child !== "new" && !data.product) throw commerceError("Product not found.",undefined,404);
        data.cogs_enabled=await cogsEnabled(tx);data.can_edit_cogs=cogsCanEdit(role);
        if(data.cogs_enabled&&data.can_edit_cogs){
          const [currency]=await tx`SELECT currency FROM public.stores WHERE store_id=${id}`;
          data.store={...data.store,currency:currency.currency};
          if(data.product)data.product={...data.product,...await productCostFields(tx,id,tokenHash,child)};
        }
      }
      return data;
    },{lockStore:!read});
    if (section === "exports") return new Response(csv(result.headers,result.rows),{headers:{...headers,
      "content-type":"text/csv; charset=utf-8","content-disposition":`attachment; filename="${section}-${child}.csv"`}});
    if (api) return json(result);
    const view = section === "collections" && child ? child === "new" ? "collection-new" : "collection" : section === "products" && child ? child === "new" ? "product-new" : "product" : section === "orders" && child ? "order" : section === "customers" && child ? "customer" : section;
    return new Response(request.method === "HEAD" ? null : result.invoice ? renderInvoice(result.invoice,`/stores/${id}/orders`) : protectedEditorLinks(renderDashboard(view,{...result,business_access:editorAccess},user),id,editorAccess),
      {headers:{...catalogueFrameHeaders(request,view,headers),"content-type":"text/html; charset=utf-8"}});
  } catch (error) {
    console.error("Dashboard request failed",{code:/^[A-Z0-9]{5}$/.test(error.code || "") ? error.code : error.status ? "REQUEST_REJECTED" : "DASHBOARD_UNAVAILABLE"});
    const status = error.status || 503;
    return json({error:error.status ? error.message : "Store services are temporarily unavailable."},status);
  }
}
