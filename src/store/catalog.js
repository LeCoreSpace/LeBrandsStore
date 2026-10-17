import { validateProductContent, validateCollectionPatch } from "../public/catalog-content.js";
import { badInput } from "./input.js";
import { skeletonEnabled } from "./pages.js";

export function productContent(settings, id) {
  return settings?.aura_content?.products?.[id] || {};
}
export function collectionContent(settings, id) {
  return settings?.aura_content?.collections?.[id] || {};
}
async function requireCatalogue(tx) {
  if (!await skeletonEnabled(tx)) throw Object.assign(new Error("Apply the Aura section catalogue update before editing this content."), { status: 409 });
}
// Preserve every other setting, including the locked invoice prefix. One
// entity is merged atomically so concurrent edits to different products survive.
export async function saveEntityContent(tx, storeId, kind, entityId, patch) {
  await requireCatalogue(tx);
  if (!["products", "collections"].includes(kind)) throw badInput("Invalid content type.");
  const [owned] = kind === "products"
    ? await tx`SELECT id FROM public.products WHERE store_id=${storeId} AND id=${entityId}`
    : await tx`SELECT id FROM public.collections WHERE store_id=${storeId} AND id=${entityId}`;
  if (!owned) throw Object.assign(new Error("Catalogue item not found."), { status: 404 });
  await tx`UPDATE public.store_setup SET settings=jsonb_set(settings,'{aura_content}',
    COALESCE(settings->'aura_content','{}'::jsonb) || jsonb_build_object(${kind}::text,
      COALESCE(settings->'aura_content'->${kind},'{}'::jsonb) || jsonb_build_object(${entityId}::text,
        COALESCE(settings->'aura_content'->${kind}->${entityId},'{}'::jsonb) || ${tx.json(patch)}::jsonb)),true)
    WHERE store_id=${storeId}`;
}
export async function saveProductContent(tx, storeId, id, value) {
  await saveEntityContent(tx, storeId, "products", id, validateProductContent(value));
}
export async function saveCollection(tx, storeId, id, value) {
  await requireCatalogue(tx);
  const patch = validateCollectionPatch(value, { storeId });
  await tx`INSERT INTO public.store_setup(store_id) VALUES(${storeId}) ON CONFLICT DO NOTHING`;
  await tx`SELECT store_id FROM public.stores WHERE store_id=${storeId} FOR UPDATE`;
  const [old] = id ? await tx`SELECT * FROM public.collections WHERE store_id=${storeId} AND id=${id}` : [];
  if (id && !old) throw Object.assign(new Error("Collection not found."), { status: 404 });
  const merged = { title: "", slug: "", description: "", ...old, ...patch };
  if (!merged.title || !merged.slug) throw badInput("Enter a title and collection address.");
  const entityId = id || crypto.randomUUID();
  const [duplicate] = await tx`SELECT id FROM public.collections WHERE store_id=${storeId} AND slug=${merged.slug} AND id<>${entityId}`;
  if (duplicate) throw badInput("That collection address is already in use.");
  for (const [kind, ids] of [["products", patch.product_ids], ["collections", patch.related_ids]]) {
    if (!ids) continue;
    if (kind === "collections" && ids.includes(entityId)) throw badInput("A collection cannot relate to itself.");
    const owned = kind === "products"
      ? await tx`SELECT id FROM public.products WHERE store_id=${storeId} AND status<>'archived' AND id IN(SELECT value::uuid FROM jsonb_array_elements_text(${tx.json(ids)}::jsonb) x(value))`
      : await tx`SELECT id FROM public.collections WHERE store_id=${storeId} AND id IN(SELECT value::uuid FROM jsonb_array_elements_text(${tx.json(ids)}::jsonb) x(value))`;
    if (owned.length !== ids.length) throw badInput("Choose catalogue items belonging to this store.");
  }
  if (old) await tx`UPDATE public.collections SET title=${merged.title},slug=${merged.slug},description=${merged.description},updated_at=now() WHERE store_id=${storeId} AND id=${entityId}`;
  else await tx`INSERT INTO public.collections(id,store_id,title,slug,description) VALUES(${entityId},${storeId},${merged.title},${merged.slug},${merged.description})`;
  if (patch.product_ids) {
    await tx`DELETE FROM public.collection_products WHERE store_id=${storeId} AND collection_id=${entityId}`;
    await tx`INSERT INTO public.collection_products(store_id,collection_id,product_id,sort_order)
      SELECT ${storeId}::uuid,${entityId}::uuid,value::uuid,(ordinality-1)::integer
      FROM jsonb_array_elements_text(${tx.json(patch.product_ids)}::jsonb) WITH ORDINALITY x(value,ordinality)`;
  }
  const extra = Object.fromEntries(["cover", "faq", "related_ids","seo_title","seo_description"].filter(key => key in patch).map(key => [key, patch[key]]));
  if (Object.keys(extra).length) {
    if (extra.cover) {
      const key = new URL(extra.cover.url).pathname.slice(1);
      const [media] = await tx`SELECT id FROM public.media WHERE store_id=${storeId} AND object_key=${key} AND upload_type='image'`;
      if (!media) throw badInput("Choose a collection image uploaded to this store.");
    }
    await saveEntityContent(tx, storeId, "collections", entityId, extra);
  }
  return entityId;
}
/** Append confirmed products without rewriting collection text or old members. */
export async function appendCollectionProducts(tx, storeId, id, productIds) {
  await requireCatalogue(tx);
  const { product_ids: ids } = validateCollectionPatch({ product_ids: productIds }, { storeId });
  await tx`SELECT store_id FROM public.stores WHERE store_id=${storeId} FOR UPDATE`;
  const [owned] = await tx`SELECT id FROM public.collections WHERE store_id=${storeId} AND id=${id}`;
  if (!owned) throw badInput("Choose a collection belonging to this store.");
  const products = await tx`SELECT id FROM public.products WHERE store_id=${storeId} AND status<>'archived'
    AND id IN(SELECT value::uuid FROM jsonb_array_elements_text(${tx.json(ids)}::jsonb) x(value))`;
  if (products.length !== ids.length) throw badInput("Choose products belonging to this store.");
  await tx`INSERT INTO public.collection_products(store_id,collection_id,product_id,sort_order)
    SELECT ${storeId}::uuid,${id}::uuid,x.value::uuid,
      COALESCE((SELECT max(sort_order)+1 FROM public.collection_products WHERE store_id=${storeId} AND collection_id=${id}),0)+x.ordinality::integer-1
    FROM jsonb_array_elements_text(${tx.json(ids)}::jsonb) WITH ORDINALITY x(value,ordinality)
    ON CONFLICT DO NOTHING`;
}
export async function deleteCollection(tx, storeId, id) {
  await requireCatalogue(tx);
  await tx`SELECT store_id FROM public.stores WHERE store_id=${storeId} FOR UPDATE`;
  const [owned] = await tx`SELECT id FROM public.collections WHERE store_id=${storeId} AND id=${id}`;
  if (!owned) throw Object.assign(new Error("Collection not found."), { status: 404 });
  const [pages] = await tx`SELECT to_regclass('public.store_pages') IS NOT NULL AS available`;
  if (pages?.available) {
    const [reference] = await tx`SELECT page_key FROM public.store_pages WHERE store_id=${storeId}
      AND draft_layout @> ${tx.json([{ settings: { collection: owned.id } }])}::jsonb LIMIT 1`;
    if (reference) throw Object.assign(new Error("Remove this collection from your saved page sections before deleting it."), { status: 409 });
  }
  await tx`DELETE FROM public.collection_products WHERE store_id=${storeId} AND collection_id=${id}`;
  await tx`DELETE FROM public.collections WHERE store_id=${storeId} AND id=${id}`;
  await tx`UPDATE public.store_setup SET settings=jsonb_set(settings,'{aura_content}',
    COALESCE(settings->'aura_content','{}'::jsonb) || jsonb_build_object('collections',
      COALESCE(settings->'aura_content'->'collections','{}'::jsonb) - ${id}::text),true) WHERE store_id=${storeId}`;
}
