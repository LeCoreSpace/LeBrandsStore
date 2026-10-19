import { mediaUrl } from "./media.js";
import { generatePolicies } from "./policies.js";
import { validateBasics, validatePolicyDetails, validateTheme, validateProduct, publishChecklist, POLICY_KINDS } from "../public/validation.js";
import { badInput } from "./input.js";
import { validateSubdomain } from "../auth/security.js";
import { CURRENT_GST_RATES, businessGSTINErrors } from "../public/commerce-rules.js";
import { pagesEnabled, pageLayouts, skeletonEnabled } from "./pages.js";
import { mergeSettingsToLayouts, validateLayout, defaultPageLayouts } from "../public/aura-layout.js";
import {verificationState} from "../gstin/service.js";
import { productContent, collectionContent, saveProductContent } from "./catalog.js";
import { validCategoryPair } from "../public/aura-taxonomy.js";
import {catalogueFormsEnabled,saveProductCatalogue} from "./catalogue-products.js";
import {cogsEnabled,setCost} from "../dashboard/cogs.js";
import {loadClassifications,writeClassification} from "./catalogue-classification.js";
import { storefrontProduct } from "../public/product-details.js";
import {requireSkuCheckout} from "../checkout/sku-inventory.js";
import {validateVariants} from "../public/catalogue-model.js";
import {requireBusinessPublication} from "./business-publication-access.js";

export const DEFAULT_SETTINGS = {
  tagline: "", description: "", legal_name: "", address: "",
  support_email: "", support_phone: "", gstin: "", business_state: "", category: "", subcategory: "",
  business_line1:"",business_line2:"",business_city:"",business_pincode:"",signature_media_id:null,
  theme: "aura", accent_color: "#214a3d", font_preset: "modern", color_preset: "white", button_style: "rounded",
};
const missing = () => Object.assign(new Error("Store or product not found."), { status: 404 });
const conflict = (message) => Object.assign(new Error(message), { status: 409 });
const mediaRecord = (m) => ({
  id: m.id, key: m.object_key, url: mediaUrl(m.object_key), type: m.upload_type,
  size: Number(m.size_bytes), width: m.width, height: m.height, alt: m.alt_text,
  ...(m.upload_type==="image"&&m.renditions?.length?{sources:m.renditions}:{}),
  ...(m.ai_generated?{ai_generated:true,approval_status:m.approval_status,source_media_id:m.source_media_id}:{}),
});
async function loadStoreHeader(tx,storeId){
  // to_jsonb is compatible both before and after the staged approval migration.
  const [store] = await tx`SELECT store_id, name, subdomain, status, subdomain_changed_at,
    to_jsonb(s) ? 'approved_at' AS approval_enabled,
    to_regprocedure('public.business_publication_access(uuid)') IS NOT NULL AS business_review_enabled,
    to_jsonb(s)->>'approved_at' AS approved_at,
    to_jsonb(s)->>'approved_by' AS approved_by,
    to_jsonb(s)->>'approval_revoked_at' AS approval_revoked_at,
    to_jsonb(s)->>'approval_revocation_note' AS approval_revocation_note
    FROM public.stores s WHERE store_id = ${storeId}`;
  if (!store) throw missing();
  return store;
}
// Read-model only: never return a partial draft that an edit form could save.
export async function loadStoreContext(tx,storeId){
  const store=await loadStoreHeader(tx,storeId);
  const [setup]=await tx`SELECT settings FROM public.store_setup WHERE store_id=${storeId}`;
  const settings={...DEFAULT_SETTINGS,brand_name:store.name,subdomain:store.subdomain,...setup?.settings};
  return {store,gstinVerification:store.approval_enabled?await verificationState(tx,storeId,settings):undefined};
}
export async function loadDraft(tx, storeId, { includeArchived = false, includeDesign = true, includeClassifications = true } = {}) {
  const store=await loadStoreHeader(tx,storeId);
  // fetch_types:false leaves native PG arrays as strings. JSON has a built-in
  // parser, so keep the Worker driver configuration and cross this boundary explicitly.
  const [setup] = await tx`SELECT *, to_json(completed) AS completed FROM public.store_setup WHERE store_id = ${storeId}`;
  const [logo] = setup?.logo_media_id ? await tx`SELECT * FROM public.media
    WHERE store_id = ${storeId} AND id = ${setup.logo_media_id} AND upload_type = 'logo'` : [];
  const [signature] = setup?.settings?.signature_media_id ? await tx`SELECT * FROM public.media
    WHERE store_id = ${storeId} AND id = ${setup.settings.signature_media_id} AND upload_type = 'logo'` : [];
  const [prefixLock] = await tx`SELECT EXISTS(SELECT 1 FROM public.invoices i WHERE i.store_id = ${storeId}
    AND ((i.issued_at AT TIME ZONE 'Asia/Kolkata')::date >=
      make_date(extract(year FROM now() AT TIME ZONE 'Asia/Kolkata')::integer -
        CASE WHEN extract(month FROM now() AT TIME ZONE 'Asia/Kolkata') < 4 THEN 1 ELSE 0 END,4,1)
      OR (i.credit_note_number IS NOT NULL AND (i.cancelled_at AT TIME ZONE 'Asia/Kolkata')::date >=
      make_date(extract(year FROM now() AT TIME ZONE 'Asia/Kolkata')::integer -
        CASE WHEN extract(month FROM now() AT TIME ZONE 'Asia/Kolkata') < 4 THEN 1 ELSE 0 END,4,1)))) AS locked`;
  // Independent reads share the already-authorized transaction. Queue them
  // together instead of paying a separate client/server wait for each read.
  const [products,images,policies,variants,classifications,formsEnabled]=await Promise.all([
    tx`SELECT *, to_json(tags) AS tags FROM public.products WHERE store_id = ${storeId}
      AND (${includeArchived} OR status <> 'archived') ORDER BY created_at, id`,
    tx`SELECT pm.product_id, m.* FROM public.product_media pm
      JOIN public.media m ON m.store_id = pm.store_id AND m.id = pm.media_id
      WHERE pm.store_id = ${storeId} ORDER BY pm.sort_order, pm.id`,
    tx`SELECT slug, title, content, reviewed_at FROM public.policy_pages
      WHERE store_id = ${storeId} ORDER BY slug`,
    tx`SELECT * FROM public.product_options WHERE store_id=${storeId} ORDER BY sort_order,id`,
    includeClassifications?loadClassifications(tx,storeId):Promise.resolve(new Map()),catalogueFormsEnabled(tx),
  ]);
  const data = {
    store,
    catalogue_forms_enabled:formsEnabled,
    invoice_prefix_locked:!!prefixLock?.locked,
    settings: { ...DEFAULT_SETTINGS, brand_name: store.name, subdomain: store.subdomain,
      ...setup?.settings, logo_media_id: logo?.id ?? null, logo_url: logo ? mediaUrl(logo.object_key) : "",
      signature_url:signature ? mediaUrl(signature.object_key) : "" },
    products: products.map((p) => ({
      id: p.id, slug:p.slug, status: p.status, title: p.title, description: p.description, price_paise: Number(p.price_paise),
      catalogue:p.catalogue||{},
      ...(classifications.get(p.id)||{classification:null,catalogue_revision:0}),
      variants:variants.filter(v=>v.product_id===p.id).map(v=>({id:v.id,values:v.attributes?.length?v.attributes:[v.value],sku:v.sku||"",stock:v.stock,expected_stock:v.stock,price_paise:v.price_paise==null?null:Number(v.price_paise)})),
      options:variants.filter(v=>v.product_id===p.id).map(v=>({...v,price_paise:v.price_paise==null?null:Number(v.price_paise)})),
      compare_at_paise: p.compare_at_price_paise == null ? null : Number(p.compare_at_price_paise),
      tags: p.tags, sku: p.sku ?? "", stock: p.track_inventory ? p.stock : null,
      hsn_code: p.hsn_code ?? "", gst_rate: p.gst_rate == null ? null : Number(p.gst_rate),
      images: images.filter((m) => m.product_id === p.id).map(mediaRecord),
      content: productContent(setup?.settings, p.id),
    })),
    policies: policies.map((p) => ({ kind: p.slug, title: p.title, body: p.content, reviewed: p.reviewed_at != null })),
    progress: { step: setup?.step ?? 1, completed: setup?.completed ?? [] },
  };
  if(store.business_review_enabled){
    const [review]=await tx`SELECT public.business_publication_access(${storeId}) AS approved`;
    data.business_review={enforced:true,approved:review?.approved===true};
  }
  data.progress.completed = completion(data, data.progress);
  if (await pagesEnabled(tx)) {
    if(includeDesign){
      const[publication]=await tx`SELECT snapshot->'settings' AS settings FROM public.store_publications WHERE store_id=${storeId}`;
      data.published_settings=publication?.settings||null;
    }
    const collections = await tx`SELECT id,title,slug,description FROM public.collections WHERE store_id=${storeId} ORDER BY created_at,id`;
    const memberships = await tx`SELECT collection_id,product_id FROM public.collection_products WHERE store_id=${storeId}`;
    data.collections = collections.map(c => ({ ...c, ...collectionContent(setup?.settings, c.id), product_ids: memberships.filter(m => m.collection_id === c.id).map(m => m.product_id) }));
    for (const product of data.products) product.collection_ids = memberships.filter(m => m.product_id === product.id).map(m => m.collection_id);
    if(includeDesign){
    const pages = await pageLayouts(tx, storeId);
    data.aura_skeleton_enabled = pages.aura_skeleton_enabled;
    data.layouts = { ...defaultPageLayouts(data), ...pages.layouts };
    data.page_versions = pages.page_versions;
    const [library] = await tx`SELECT to_regclass('public.aura_library_packs') IS NOT NULL AS available`;
    data.aura_starter_enabled = false;
    if (library?.available) {
      const [pilot] = await tx`SELECT EXISTS(SELECT 1 FROM public.aura_library_packs
        WHERE pack_id='c0010001-0000-4000-8000-000000000001' AND status='published') AS available`;
      data.aura_starter_enabled = pilot?.available === true;
    }
    }else{
      data.aura_skeleton_enabled=await skeletonEnabled(tx);
    }
  }
  if(store.approval_enabled)data.gstinVerification=await verificationState(tx,storeId,data.settings);
  return data;
}
async function ensureSetup(tx, id) {
  await tx`INSERT INTO public.store_setup (store_id) VALUES (${id}) ON CONFLICT DO NOTHING`;
}
async function invalidatePolicies(tx, id) {
  await tx`UPDATE public.policy_pages SET reviewed_at = NULL WHERE store_id = ${id}`;
  await tx`UPDATE public.store_setup SET completed = array_remove(completed, 4) WHERE store_id = ${id}`;
}
function completion(data, progress) {
  // Completion is server-derived, never a client assertion of eligibility.
  const complete = [
    !Object.keys(validateBasics(data.settings)).length && data.settings.subdomain === data.store.subdomain,
    !Object.keys(validateTheme(data.settings)).length,
    data.products.length > 0 && data.products.every((p) => !Object.keys(validateProduct(p)).length),
    publishChecklist(data).every((item) => item.complete),
  ];
  return (progress.completed ?? []).filter((n) => complete[n - 1]);
}
export async function saveSetup(tx, id, settings, progress, options = {}) {
  await tx`SELECT store_id FROM public.stores WHERE store_id=${id} FOR UPDATE`;
  await ensureSetup(tx, id);
  await tx`SELECT store_id FROM public.store_setup WHERE store_id=${id} FOR UPDATE`;
  const data = await loadDraft(tx, id);
  if(data.settings.gstin_invoice_identity_locked===true&&settings){
    const identity=["gstin","legal_name","trade_name","business_line1","business_line2","business_city","business_pincode","business_state","address"];
    if(identity.some(k=>Object.hasOwn(settings,k)&&(settings[k]||"")!==(data.settings[k]||""))||
      Object.hasOwn(settings,"gstin_invoice_identity_locked")&&settings.gstin_invoice_identity_locked!==true)
      throw conflict("Your confirmed GST registration and invoice address are locked and cannot be changed.");
  }
  if (settings && !validCategoryPair(settings.category ?? data.settings.category, settings.subcategory ?? data.settings.subcategory)) {
    throw badInput("Choose a matching subcategory.", { subcategory: "Choose a subcategory belonging to this category." });
  }
  if (data.store.status === "live" && settings &&
      ["gstin","business_state","address"].some(key => Object.hasOwn(settings,key))) {
    const errors = businessGSTINErrors({...data.settings,...settings});
    if (Object.keys(errors).length) throw badInput("Check your registered business GST details.",errors);
  }
  // An already-autosaved address still needs confirmation on Continue, even
  // when that request contains progress only and no dirty settings.
  const requestedAddress = settings?.subdomain ?? data.settings.subdomain;
  if (((progress?.step > 1 && data.progress.step === 1) || options.confirmAddress === true) && requestedAddress !== data.store.subdomain) {
    if (!validateSubdomain(requestedAddress)) throw badInput("Choose a valid, non-reserved store address.");
    const [available] = await tx`SELECT public.store_address_available(${requestedAddress}, ${id}) AS available`;
    if (!available?.available) throw conflict("That store address is unavailable.");
    if (data.store.subdomain_changed_at && Date.now() - new Date(data.store.subdomain_changed_at).getTime() < 30 * 86400000) throw conflict("You can change your store address once every 30 days.");
    await tx`INSERT INTO public.store_address_history (store_id, subdomain)
      VALUES (${id}, ${data.store.subdomain})
      ON CONFLICT (subdomain) DO UPDATE SET store_id = EXCLUDED.store_id,
        expires_at = now() + interval '90 days' WHERE public.store_address_history.expires_at <= now()`;
    await tx`UPDATE public.stores SET subdomain = ${requestedAddress}, subdomain_changed_at = now() WHERE store_id = ${id}`;
  }
  if (settings) {
    const { logo_media_id, ...values } = settings;
    const { brand_name } = settings;
    if (settings.signature_media_id != null) {
      const [signature] = await tx`SELECT id FROM public.media WHERE store_id = ${id}
        AND id = ${settings.signature_media_id} AND upload_type = 'logo'`;
      if (!signature) throw badInput("Choose a signature uploaded to this store.",{signature_media_id:"Upload your signature to this store first."});
    }
    if (logo_media_id != null) {
      const [logo] = await tx`SELECT id FROM public.media WHERE store_id = ${id}
        AND id = ${logo_media_id} AND upload_type = 'logo'`;
      if (!logo) throw badInput("Choose a logo uploaded to this store.", { logo_media_id: "Choose a logo uploaded to this store." });
    }
    if (brand_name !== undefined) await tx`UPDATE public.stores SET name = ${brand_name} WHERE store_id = ${id}`;
    try {
      await tx`UPDATE public.store_setup SET settings = settings || ${tx.json(values)}
        WHERE store_id = ${id}`;
    } catch (error) {
      if (error.code === "42501" && settings.invoice_prefix !== undefined) throw Object.assign(
        badInput("Invoice prefix is locked until the next financial year.",{invoice_prefix:"An invoice or credit note has been issued this financial year. Prefix changes unlock on 1 April."}),{status:409});
      throw error;
    }
    if (logo_media_id !== undefined) await tx`UPDATE public.store_setup SET logo_media_id = ${logo_media_id} WHERE store_id = ${id}`;
    // Preserve edited bodies; changing underlying details requires re-review.
    const visualKeys = ["theme", "color_preset", "accent_color", "font_preset", "button_style", "style_preset", "ann_design"];
    if (Object.keys(settings).some((key) => !visualKeys.includes(key) && data.settings[key] !== settings[key])) await invalidatePolicies(tx, id);
  }
  if (progress) {
    const updated = await loadDraft(tx, id);
    await tx`UPDATE public.store_setup SET step = ${progress.step},
      completed = ARRAY(SELECT jsonb_array_elements_text(${tx.json(completion(updated, progress))})::integer)
      WHERE store_id = ${id}`;
  }
  return loadDraft(tx, id);
}
export async function saveProduct(tx, id, productId, patch, { returnDraft = true, preserveMediaAlt = false, tokenHash } = {}) {
  if (!productId && patch.gst_rate == null) {
    throw badInput("Choose a GST rate explicitly.", {gst_rate:"Choose a GST rate explicitly."});
  }
  await ensureSetup(tx, id);
  await tx`SELECT store_id FROM public.stores WHERE store_id=${id} FOR UPDATE`;
  if (patch.content && !await skeletonEnabled(tx)) throw Object.assign(new Error("Apply the Aura section catalogue update before editing product content."), { status: 409 });
  const [existing] = productId ? await tx`SELECT *, to_json(tags) AS tags FROM public.products
    WHERE store_id = ${id} AND id = ${productId}` : [];
  if (productId && !existing) throw missing();
  if(existing?.status==="archived"&&patch.status&&patch.status!=="archived")throw badInput("Archived products cannot be restored using this form.");
  if (patch.gst_rate != null && !CURRENT_GST_RATES.includes(patch.gst_rate) &&
    (!existing || Number(existing.gst_rate) !== patch.gst_rate)) {
    throw badInput("Choose a current GST rate.",{gst_rate:"Choose 0%, 5%, 18% or 40%. A previously saved rate can be retained, but should be confirmed."});
  }
  const p = {
    title: existing?.title ?? "", description: existing?.description ?? "",
    price_paise: Number(existing?.price_paise ?? 0),
    compare_at_paise: existing?.compare_at_price_paise == null ? null : Number(existing.compare_at_price_paise),
    tags: existing?.tags ?? [], sku: existing?.sku ?? "", stock: existing?.track_inventory ? existing.stock : null,
    hsn_code: existing?.hsn_code ?? "", gst_rate: existing?.gst_rate == null ? null : Number(existing.gst_rate),
    ...patch,
  };
  const uuid = productId ?? crypto.randomUUID();
  const sku = p.sku || `LB-${uuid.slice(0, 8).toUpperCase()}`;
  const slug=patch.slug||existing?.slug||p.title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,80).replace(/-$/,"")||uuid;
  const [duplicateSlug]=await tx`SELECT id FROM public.products WHERE store_id=${id} AND slug=${slug} AND id<>${uuid}`;
  if(duplicateSlug)throw badInput("That product address is already in use.");
  const [duplicateSKU]=await tx`SELECT id FROM public.products WHERE store_id=${id} AND lower(sku)=lower(${sku}) AND id<>${uuid}
    UNION ALL SELECT id FROM public.product_options WHERE store_id=${id} AND lower(sku)=lower(${sku}) LIMIT 1`;
  if(duplicateSKU)throw badInput("That SKU is already used in this store.");
  if (existing) await tx`UPDATE public.products SET title = ${p.title}, description = ${p.description},
    price_paise = ${p.price_paise}, compare_at_price_paise = ${p.compare_at_paise},
    tags = ARRAY(SELECT jsonb_array_elements_text(${tx.json(p.tags)})), sku = ${sku}, stock = ${p.stock ?? 0}, track_inventory = ${p.stock != null},
     hsn_code = ${p.hsn_code}, gst_rate = ${p.gst_rate ?? 0},status=${p.status ?? existing.status},slug=${slug},updated_at=now() WHERE store_id = ${id} AND id = ${uuid}`;
  else await tx`INSERT INTO public.products
    (id, store_id, title, slug, description, price_paise, compare_at_price_paise, tags, sku, stock, track_inventory, hsn_code, gst_rate,status)
     VALUES (${uuid}, ${id}, ${p.title}, ${slug}, ${p.description}, ${p.price_paise}, ${p.compare_at_paise},
      ARRAY(SELECT jsonb_array_elements_text(${tx.json(p.tags)})), ${sku}, ${p.stock ?? 0}, ${p.stock != null}, ${p.hsn_code}, ${p.gst_rate ?? 0},${p.status??"draft"})`;
  if (patch.images) {
    for (const [order,image] of patch.images.entries()) {
      const [media] = await tx`SELECT id,upload_type FROM public.media m WHERE store_id = ${id}
        AND id = ${image.id} AND ((upload_type = 'image' AND kind = 'image') OR (upload_type = 'video' AND kind = 'video'))
        AND COALESCE(to_jsonb(m)->>'approval_status','approved')='approved'`;
      if (!media) throw badInput("Choose approved product images or videos uploaded to this store.");
      if (order===0&&media.upload_type!=="image") throw badInput("Use an image as the first product media item. Videos can follow it.");
      if (!preserveMediaAlt) await tx`UPDATE public.media SET alt_text = ${image.alt || p.title || "Product media"}
        WHERE store_id = ${id} AND id = ${image.id}`;
    }
    await tx`DELETE FROM public.product_media WHERE store_id = ${id} AND product_id = ${uuid}`;
    for (const [order, image] of patch.images.entries()) await tx`
      INSERT INTO public.product_media (store_id, product_id, media_id, sort_order)
      VALUES (${id}, ${uuid}, ${image.id}, ${order})`;
  }
  if (patch.content) await saveProductContent(tx, id, uuid, patch.content);
  await saveProductCatalogue(tx,id,uuid,patch,existing,tokenHash);
  if(Object.hasOwn(patch,"cost_price_paise")){
    if(!await cogsEnabled(tx))throw Object.assign(new Error("Apply the catalogue COGS database update before saving costs."),{status:409});
    await setCost(tx,id,tokenHash,{product_id:uuid,product_option_id:null,cost_price_paise:patch.cost_price_paise,expected_revision:patch.cost_revision});
  }
  await invalidatePolicies(tx, id);
  return { ...(returnDraft ? await loadDraft(tx, id) : {}), saved_product_id: uuid };
}
export async function deleteProduct(tx, id, productId, {tokenHash}={}) {
  const [product] = await tx`SELECT id FROM public.products WHERE store_id = ${id} AND id = ${productId}`;
  if (!product) throw missing();
  const [used] = await tx`SELECT id FROM public.order_items WHERE store_id = ${id} AND product_id = ${productId} LIMIT 1`;
  if (used) throw badInput("This product has orders. Archive it instead of deleting it.");
  const [classified]=await tx`SELECT to_jsonb(p)->>'product_type_id' AS product_type_id,
    to_jsonb(p)->>'catalogue_revision' AS catalogue_revision FROM public.products p WHERE store_id=${id} AND id=${productId}`;
  const reset=classified?.product_type_id?{clear:true,expected_revision:Number(classified.catalogue_revision)}:null;
  if(reset)await writeClassification(tx,id,productId,tokenHash,reset,"prepare");
  await tx`DELETE FROM public.product_media WHERE store_id = ${id} AND product_id = ${productId}`;
  await tx`DELETE FROM public.product_options WHERE store_id = ${id} AND product_id = ${productId}`;
  if(reset)await writeClassification(tx,id,productId,tokenHash,reset,"clear");
  await tx`DELETE FROM public.collection_products WHERE store_id = ${id} AND product_id = ${productId}`;
  await tx`DELETE FROM public.products WHERE store_id = ${id} AND id = ${productId}`;
  await invalidatePolicies(tx, id);
  return loadDraft(tx, id);
}
export async function insertMedia(tx, id, key, type, size, metadata, alt) {
  const query=type==="video"?tx`INSERT INTO public.media
    (store_id, object_key, kind, upload_type, content_type, size_bytes, width, height, alt_text)
    VALUES (${id}, ${key}, 'video', ${type}, ${metadata.contentType}, ${size},
      ${metadata.width}, ${metadata.height}, ${alt}) RETURNING *`:tx`INSERT INTO public.media
    (store_id, object_key, kind, upload_type, content_type, size_bytes, width, height, alt_text)
    VALUES (${id}, ${key}, 'image', ${type}, ${metadata.contentType}, ${size},
      ${metadata.width}, ${metadata.height}, ${alt}) RETURNING *`;
  const [row]=await query;
  return mediaRecord(row);
}
export async function regeneratePolicies(tx, id) {
  const data = await loadDraft(tx, id), errors = validatePolicyDetails(data.settings);
  if (Object.keys(errors).length) throw badInput(`Complete these business details before generating policy drafts: ${Object.values(errors).join(" ")}`, errors);
  for (const p of generatePolicies(data)) await tx`INSERT INTO public.policy_pages
    (store_id, slug, title, content) VALUES (${id}, ${p.kind}, ${p.title}, ${p.body})
    ON CONFLICT (store_id, slug) DO UPDATE SET content = EXCLUDED.content, title = EXCLUDED.title,
      reviewed_at = NULL`;
  await tx`UPDATE public.store_setup SET completed = array_remove(completed, 4) WHERE store_id = ${id}`;
  return loadDraft(tx, id);
}
export async function savePolicy(tx, id, kind, value) {
  if (!POLICY_KINDS.includes(kind) || typeof value.body !== "string" || [...value.body].length > 20000 ||
    typeof value.reviewed !== "boolean" || (value.reviewed && value.body.trim().length < 30) ||
    Object.keys(value).some((k) => !["body", "reviewed"].includes(k))) throw badInput("Enter policy text and confirm you have reviewed it.");
  const rows = await tx`UPDATE public.policy_pages SET content = ${value.body},
    reviewed_at = ${value.reviewed ? new Date() : null} WHERE store_id = ${id} AND slug = ${kind} RETURNING id`;
  if (!rows.length) throw badInput("Generate the policy drafts first.");
  return loadDraft(tx, id);
}
export async function publish(tx, id, live) {
  await ensureSetup(tx, id);
  let status = "draft";
  if (live) {
    const review=await requireBusinessPublication(tx,id);
    const [aiSchema]=await tx`SELECT to_regclass('public.ai_generation_jobs') IS NOT NULL AS enabled`;
    if(aiSchema?.enabled){
      const[unseen]=await tx`SELECT id FROM public.ai_generation_jobs WHERE store_id=${id} AND status='completed' AND previewed_at IS NULL LIMIT 1`;
      if(unseen)throw badInput("Open the full AI draft in the theme editor before publishing.");
    }
    const data = await loadDraft(tx, id), checklist = publishChecklist(data);
    if(data.products.some(p=>p.variants?.length)){
      await requireSkuCheckout(tx);
      for(const product of data.products.filter(p=>p.variants?.length))validateVariants(product.variants,product.catalogue);
    }
    if(data.gstinVerification?.state==="blocked")throw badInput("An inactive or Composition GSTIN cannot publish.",{gstin:"Verify an active Regular registration."});
    if(data.gstinVerification?.state==="verified"&&!data.gstinVerification.confirmed)throw badInput("Confirm your verified registered supplier details before publishing.",{gstin:"Choose and confirm a registered address."});
    const gstErrors = businessGSTINErrors(data.settings);
    if (Object.keys(gstErrors).length) throw badInput("A valid GSTIN and registered business state are required to publish.",gstErrors);
    if (!validateSubdomain(data.settings.subdomain) || data.settings.subdomain !== data.store.subdomain) {
      throw badInput("Confirm your store address in Brand basics before publishing.");
    }
    if (checklist.some((item) => !item.complete)) throw badInput("Complete every item in the publish checklist.", Object.fromEntries(checklist.filter((v) => !v.complete).map((v) => [v.label, "Not complete"])));
    // Merge before INSERT: PostgreSQL's BEFORE INSERT guard also runs for an
    // ON CONFLICT republish. Retain the published prefix if an older draft
    // omitted it; an explicitly edited draft prefix still wins and is guarded.
    const [publication] = await tx`SELECT snapshot FROM public.store_publications WHERE store_id = ${id}`;
    data.settings = { ...publication?.snapshot?.settings, ...data.settings };
    // Keep the staged legacy workflow until business review is installed.
    // Its independent document gate then replaces the obsolete first-live flag.
    status = !review.enforced && data.store.approval_enabled && (!data.store.approved_at || data.store.approval_revoked_at)
      ? "awaiting_approval" : "live";
    data.store.status = status;
    data.progress = { step: 4, completed: [1, 2, 3, 4] };
    if (data.layouts) {
      for (const [page, layout] of Object.entries(data.layouts)) validateLayout(page, layout, { storeId: id,
        productIds: new Set(data.products.map(product => product.id)), collectionIds: new Set((data.collections || []).map(collection => collection.id)) });
      await tx`SELECT set_config('app.publish_pages','true',true)`;
    }
    const { layouts, page_versions, gstinVerification, published_settings, business_review, ...publicationData } = data;
    // Entity content is already resolved into public products/collections.
    // Do not copy archived/deleted draft entity maps into the public snapshot.
    const { aura_content, ...publicSettings } = publicationData.settings;
    publicationData.settings = publicSettings;
    publicationData.products = publicationData.products.map(product=>storefrontProduct(product));
    publicationData.store={store_id:data.store.store_id,name:data.store.name,subdomain:data.store.subdomain,status:data.store.status};
    await tx`INSERT INTO public.store_publications (store_id, snapshot)
      VALUES (${id}, ${tx.json(publicationData)}) ON CONFLICT (store_id) DO UPDATE
      SET snapshot = EXCLUDED.snapshot, published_at = now()`;
    await tx`UPDATE public.products SET status = 'active' WHERE store_id = ${id} AND status = 'draft'`;
    await tx`UPDATE public.policy_pages SET published_at = now() WHERE store_id = ${id}`;
    await tx`UPDATE public.store_setup SET step = 4, completed = ARRAY[1,2,3,4] WHERE store_id = ${id}`;
  }
  await tx`UPDATE public.stores SET status = ${status} WHERE store_id = ${id}`;
  return loadDraft(tx, id);
}
