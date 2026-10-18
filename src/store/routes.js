import { renderWizard } from "../ui/wizard.js";
import { SECURITY_HEADERS } from "../auth/security.js";
import {requireBusinessEditorAccess} from "./business-access.js";
import {requireAnnPlan} from "../billing/build-access.js";
import { UUID, validateProduct } from "../public/validation.js";
import { settingsPatch, progressPatch, productPatch, readJson, readBody, badInput } from "./input.js";
import { validateUpload } from "./media.js";
import { pagesEnabled } from "./pages.js";
import {protectSupplier} from "../gstin/service.js";
import { setupFieldNames, storeFailureDetails } from "./diagnostics.js";
import {
  loadDraft, saveSetup, saveProduct, deleteProduct, insertMedia,
  regeneratePolicies, savePolicy, publish,
} from "./repository.js";
import { audit, syncPublishedProducts, dashboardAccess } from "../dashboard/repository.js";
import { saveCollection, deleteCollection } from "./catalog.js";
import {addStoreVariantValue} from "./catalogue-variant-values.js";
import {requireSkuCheckout} from "../checkout/sku-inventory.js";

export const isStoreRoute = (path) => /^\/(?:api\/)?stores\/(?!new(?:\/|$))[^/]+(?:\/|$)/.test(path);
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { ...SECURITY_HEADERS, "content-type": "application/json; charset=utf-8" },
});
const unavailable = () => Object.assign(new Error("Store services are temporarily unavailable. Please try again."), { status: 503 });
export async function handleStoreRoutes(request, env, db, user, tokenHash) {
  const url = new URL(request.url), api = url.pathname.startsWith("/api/");
  const match = url.pathname.match(/^\/(?:api\/)?stores\/([^/]+)\/(setup|products|collections|media|policies|publish|unpublish|catalogue)(?:\/([^/]+))?$/);
  if (!match || !UUID.test(match[1])) return json({ error: "Page not found." }, 404);
  if (!user || user.must_change_password) return json({ error: "Sign in and complete any required password change first." }, 401);
  const [, id, action, child] = match;
  let uploadedKey;
  let fieldNames = [];
  try {
    if (!api) {
      if (action !== "setup" || child || !["GET", "HEAD"].includes(request.method)) return json({ error: "Page not found." }, 404);
      if(url.searchParams.get("step")!=="4"){
        await db.withMemberStore(id,tokenHash,tx=>loadDraft(tx,id));
        return new Response(null,{status:303,headers:{...SECURITY_HEADERS,"cache-control":"no-store",location:`/stores/${id}/build/ann`}});
      }
      const data = await db.withMemberStore(id, tokenHash, (tx) => loadDraft(tx, id));
      return new Response(request.method === "HEAD" ? null : renderWizard(data, user,{reviewOnly:true}), {
        headers: { ...SECURITY_HEADERS, "content-type": "text/html; charset=utf-8" },
      });
    }
    const verb = request.method;
    const route = `${verb} ${action}${child ? "/child" : ""}`;
    const supported = [
      "GET setup", "PATCH setup", "POST products", "PATCH products/child", "DELETE products/child", "POST catalogue/child",
      "GET collections", "POST collections", "PATCH collections/child", "DELETE collections/child",
      "GET media", "POST media", "PATCH media/child", "PUT policies/child", "POST policies/child", "POST publish", "POST unpublish",
    ];
    if (!supported.includes(route) || (action==="catalogue"&&child!=="variant-values") || (["products", "collections"].includes(action) && child && !UUID.test(child)) ||
      (action === "policies" && verb === "POST" && child !== "generate")) return json({ error: "Method or page not available." }, 405);
    // Authorize before reading or storing an upload. No bytes reach R2 for outsiders.
    const result = await db.withMemberStore(id, tokenHash, async (tx) => {
      if(verb!=="GET"&&verb!=="HEAD")await requireAnnPlan(tx,id,tokenHash);
      if(action==="catalogue"){
        await dashboardAccess(tx,id,user.id,true);
        return addStoreVariantValue(tx,id,tokenHash,await readJson(request));
      }
      if (action === "collections") {
        await dashboardAccess(tx, id, user.id, verb !== "GET");
        if (route === "GET collections") return { collections: (await loadDraft(tx, id)).collections || [] };
        if (verb === "DELETE") {
          await deleteCollection(tx, id, child);
          await audit(tx, id, user.id, "collection.deleted", "collection", child);
          return loadDraft(tx, id);
        }
        const saved = await saveCollection(tx, id, child, await readJson(request));
        await audit(tx, id, user.id, child ? "collection.edited" : "collection.created", "collection", saved);
        return { ...await loadDraft(tx, id), saved_collection_id: saved };
      }
      if (route === "GET setup") return loadDraft(tx, id);
      if(route==="GET media"){
        const offset=Number(new URL(request.url).searchParams.get("offset")||0);
        if(!Number.isInteger(offset)||offset<0||offset>100000)throw badInput("Invalid media page.");
        const rows=await tx`SELECT id,object_key,upload_type,size_bytes,width,height,alt_text,to_jsonb(m)->'renditions' AS sources FROM public.media m WHERE store_id=${id} ORDER BY created_at DESC,id DESC LIMIT 201 OFFSET ${offset}`;
        return{media:rows.slice(0,200).map(m=>({id:m.id,url:`https://media.lebrands.store/${m.object_key}`,type:m.upload_type,size:Number(m.size_bytes),width:m.width,height:m.height,alt:m.alt_text,sources:m.sources||[]})),nextCursor:rows.length>200?offset+200:null};
      }
      if(route==="PATCH media/child"){
        if(!UUID.test(child)||!await pagesEnabled(tx))throw badInput("Image optimization is unavailable.");
        const body=await readJson(request),ids=body.rendition_ids;
        if(Object.keys(body).length!==1||!Array.isArray(ids)||ids.length>3||new Set(ids).size!==ids.length||ids.some(value=>!UUID.test(value)||value===child))throw badInput("Choose up to three different uploaded renditions.");
        const[parent]=await tx`SELECT * FROM public.media WHERE store_id=${id} AND id=${child} AND upload_type='image'`;
        if(!parent)throw Object.assign(new Error("Image not found."),{status:404});
        const rows=await tx`SELECT * FROM public.media WHERE store_id=${id} AND upload_type='image' AND id IN(SELECT value::uuid FROM jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb) x(value))`;
        if(rows.length!==ids.length)throw Object.assign(new Error("An image does not belong to this store."),{status:403});
        const sources=rows.map(m=>({url:`https://media.lebrands.store/${m.object_key}`,width:m.width,height:m.height})).sort((a,b)=>a.width-b.width);
        await tx`UPDATE public.media SET renditions=${JSON.stringify(sources)}::jsonb WHERE store_id=${id} AND id=${child}`;
        return{media:{id:parent.id,url:`https://media.lebrands.store/${parent.object_key}`,type:"image",alt:parent.alt_text,width:parent.width,height:parent.height,size:Number(parent.size_bytes),sources}};
      }
      if (route === "PATCH setup") {
        const body = await readJson(request);
        const businessFields=new Set(["brand_name","subdomain","legal_name","gstin","address","business_state","business_line1","business_line2","business_city","business_pincode","support_email","notification_email","support_phone","invoice_prefix","logo_media_id","signature_media_id"]);
        if(Object.keys(body?.settings||{}).some(key=>!businessFields.has(key)))
          await requireBusinessEditorAccess(tx,id,tokenHash);
        fieldNames = setupFieldNames(body);
        if (!Object.keys(body).length || Object.keys(body).some((k) => !["settings", "progress"].includes(k))) throw badInput("Use the setup form.");
        const parsedSettings=body.settings===undefined?undefined:settingsPatch(body.settings,{storeId:id});
        if(parsedSettings && "style_preset" in parsedSettings) await dashboardAccess(tx,id,user.id,true);
        const parsedProgress=body.progress===undefined?undefined:progressPatch(body.progress);
        if(parsedSettings &&["gstin","legal_name","trade_name","address","business_line1","business_line2","business_city","business_state","business_pincode"].some(k=>k in parsedSettings)){
          const current=await loadDraft(tx,id);
          if(current.store.approval_enabled)await protectSupplier(tx,id,parsedSettings,current.settings);
        }
        const saved = await saveSetup(tx,id,parsedSettings,parsedProgress);
        await audit(tx,id,user.id,"store.setup_changed","store",id,{fields:fieldNames});
        return saved;
      }
      if (route === "POST products" || route === "PATCH products/child") {
        const body = await readJson(request,262144), expected = body.expected_stock, catalogue = body.publish_catalogue;
        delete body.expected_stock;
        delete body.publish_catalogue;
        if (catalogue !== undefined && typeof catalogue !== "boolean") throw badInput("Invalid catalogue save request.");
        const patch = productPatch(body);
        if(patch.variants?.length&&child){
          const [record]=await tx`SELECT p.status AS product_status,s.status AS store_status FROM public.products p
            JOIN public.stores s ON s.store_id=p.store_id WHERE p.store_id=${id} AND p.id=${child}`;
          if(record?.product_status==="active"&&record?.store_status==="live")await requireSkuCheckout(tx);
        }
        if (child && expected !== undefined && patch.stock !== undefined) {
          if (expected !== null && (!Number.isInteger(expected) || expected < 0)) throw badInput("Invalid stock revision.");
          const [current] = await tx`SELECT stock,track_inventory FROM public.products WHERE store_id = ${id} AND id = ${child} FOR UPDATE`;
          const stock = current?.track_inventory ? current.stock : null;
          if (!current) throw Object.assign(new Error("Product not found."),{status:404});
          if (patch.stock === expected) delete patch.stock; // No intended stock edit: preserve current checkout-adjusted stock.
          else if (stock !== expected) throw Object.assign(new Error("Stock changed while you were editing. Reload before adjusting it."),{status:409});
        }
        const result = await saveProduct(tx, id, child, patch, {tokenHash});
        if (catalogue) {
          const product = result.products.find((p) => p.id === result.saved_product_id);
          const errors = product ? validateProduct(product) : {_general:"This archived product is not in the active catalogue."};
          // Archived edits remain archived; they cannot be used as an implicit restore.
          const [record] = await tx`SELECT status FROM public.products WHERE store_id = ${id} AND id = ${result.saved_product_id}`;
          if (record?.status !== "archived" && Object.keys(errors).length) throw badInput("Complete the product before adding it to your live catalogue.",errors);
          await syncPublishedProducts(tx,id,result.saved_product_id,true);
        }
        await audit(tx,id,user.id,child ? "product.edited" : "product.created","product",result.saved_product_id,{fields:Object.keys(patch)});
        return result;
      }
      if (route === "DELETE products/child") {
        const result = await deleteProduct(tx,id,child,{tokenHash});
        await syncPublishedProducts(tx,id,child);
        await audit(tx,id,user.id,"product.deleted","product",child);
        return result;
      }
      if (route === "POST media") {
        if (!env.MEDIA) throw unavailable();
        if (!/^multipart\/form-data;\s*boundary=/i.test(request.headers.get("content-type") ?? "")) throw badInput("Choose a file to upload.");
        const bytes = await readBody(request, 10 * 1024 * 1024 + 65536);
        let form;
        try { form = await new Response(bytes, { headers: { "content-type": request.headers.get("content-type") } }).formData(); }
        catch { throw badInput("Use a valid file upload."); }
        if ([...form.keys()].some((key) => !["file", "type", "alt"].includes(key)) ||
          ["file", "type", "alt"].some((key) => form.getAll(key).length > 1)) throw badInput("Upload one file at a time.");
        const file = form.get("file"), type = form.get("type"), alt = form.get("alt") ?? "";
        if(type==="video"&&!await pagesEnabled(tx))throw badInput("Video uploads require the store-page migration first.");
        if (!file || typeof file.arrayBuffer !== "function" || typeof alt !== "string" || alt.length > 200) throw badInput("Choose an image and keep its alt text within 200 characters.");
        const data = new Uint8Array(await file.arrayBuffer()), metadata = validateUpload(data, type);
        uploadedKey = `stores/${id}/${crypto.randomUUID()}.${metadata.ext}`;
        await env.MEDIA.put(uploadedKey, data, {
          httpMetadata: { contentType: metadata.contentType, cacheControl: "public, max-age=31536000, immutable" },
        });
        return { media: await insertMedia(tx, id, uploadedKey, type, data.length, metadata, alt.trim() || (type === "logo" ? `${user.name || "Brand"} logo` : "Product image")) };
      }
      if (route === "POST policies/child") {
        const result = await regeneratePolicies(tx,id);
        await audit(tx,id,user.id,"store.policies_generated","store",id);
        return result;
      }
      if (route === "PUT policies/child") {
        const result = await savePolicy(tx,id,child,await readJson(request));
        await audit(tx,id,user.id,"store.policy_edited","store",id,{kind:child});
        return result;
      }
      await dashboardAccess(tx,id,user.id,true);
      const result = await publish(tx,id,action === "publish");
      await audit(tx,id,user.id,action === "publish" ? "store.published" : "store.unpublished","store",id);
      return result;
    });
    return json(result);
  } catch (error) {
    // A failed DB insert/commit must not leave an untracked uploaded object.
    if (uploadedKey) {
      try { await env.MEDIA.delete(uploadedKey); }
      catch { console.error("Orphan media cleanup failed", { code: "R2_CLEANUP_FAILED" }); }
    }
    console.error("Store setup request failed", storeFailureDetails(error, request, fieldNames));
    let status = error.status ?? 503;
    let message = error.status ? error.message : "Store services are temporarily unavailable. Please try again.";
    if (error.code === "23505") { status = 409; message = "That store address or SKU is already in use."; }
    if (error.code === "23503") { status = 409; message = "That item is in use or is not part of this store."; }
    let fieldErrors = error.errors;
    if (["23502", "23514", "22P02", "22001", "22003"].includes(error.code)) {
      status = 400;
      message = "Check your input and try again.";
      fieldErrors = { _general: "A value could not be saved. Check the form and try again." };
    }
    return json({ error: message, ...(fieldErrors ? { errors: fieldErrors } : {}) }, status);
  }
}
