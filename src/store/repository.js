import { mediaUrl } from "./media.js";
import { generatePolicies } from "./policies.js";
import { validateBasics, validateTheme, validateProduct, publishChecklist, POLICY_KINDS } from "../public/validation.js";
import { badInput } from "./input.js";
import { validateSubdomain } from "../auth/security.js";

export const DEFAULT_SETTINGS = {
  tagline: "", description: "", legal_name: "", address: "",
  support_email: "", support_phone: "", gstin: "", category: "",
  theme: "aura", accent_color: "#214a3d", font_preset: "serif", button_style: "rounded",
};
const missing = () => Object.assign(new Error("Store or product not found."), { status: 404 });
const conflict = (message) => Object.assign(new Error(message), { status: 409 });
const mediaRecord = (m) => ({
  id: m.id, key: m.object_key, url: mediaUrl(m.object_key), type: m.upload_type,
  size: Number(m.size_bytes), width: m.width, height: m.height, alt: m.alt_text,
});
export async function loadDraft(tx, storeId) {
  const [store] = await tx`SELECT store_id, name, subdomain, status, subdomain_changed_at
    FROM public.stores WHERE store_id = ${storeId}`;
  if (!store) throw missing();
  // fetch_types:false leaves native PG arrays as strings. JSON has a built-in
  // parser, so keep the Worker driver configuration and cross this boundary explicitly.
  const [setup] = await tx`SELECT *, to_json(completed) AS completed FROM public.store_setup WHERE store_id = ${storeId}`;
  const [logo] = setup?.logo_media_id ? await tx`SELECT * FROM public.media
    WHERE store_id = ${storeId} AND id = ${setup.logo_media_id} AND upload_type = 'logo'` : [];
  const products = await tx`SELECT *, to_json(tags) AS tags FROM public.products WHERE store_id = ${storeId}
    AND status <> 'archived' ORDER BY created_at, id`;
  const images = await tx`SELECT pm.product_id, m.* FROM public.product_media pm
    JOIN public.media m ON m.store_id = pm.store_id AND m.id = pm.media_id
    WHERE pm.store_id = ${storeId} ORDER BY pm.sort_order, pm.id`;
  const policies = await tx`SELECT slug, title, content, reviewed_at FROM public.policy_pages
    WHERE store_id = ${storeId} ORDER BY slug`;
  const data = {
    store,
    settings: { ...DEFAULT_SETTINGS, brand_name: store.name, subdomain: store.subdomain,
      ...setup?.settings, logo_media_id: logo?.id ?? null, logo_url: logo ? mediaUrl(logo.object_key) : "" },
    products: products.map((p) => ({
      id: p.id, title: p.title, description: p.description, price_paise: Number(p.price_paise),
      compare_at_paise: p.compare_at_price_paise == null ? null : Number(p.compare_at_price_paise),
      tags: p.tags, sku: p.sku ?? "", stock: p.track_inventory ? p.stock : null,
      hsn_code: p.hsn_code ?? "", gst_rate: p.gst_rate == null ? null : Number(p.gst_rate),
      images: images.filter((m) => m.product_id === p.id).map(mediaRecord),
    })),
    policies: policies.map((p) => ({ kind: p.slug, title: p.title, body: p.content, reviewed: p.reviewed_at != null })),
    progress: { step: setup?.step ?? 1, completed: setup?.completed ?? [] },
  };
  data.progress.completed = completion(data, data.progress);
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
export async function saveSetup(tx, id, settings, progress) {
  await ensureSetup(tx, id);
  const data = await loadDraft(tx, id);
  // An already-autosaved address still needs confirmation on Continue, even
  // when that request contains progress only and no dirty settings.
  const requestedAddress = settings?.subdomain ?? data.settings.subdomain;
  if (progress?.step > 1 && data.progress.step === 1 && requestedAddress !== data.store.subdomain) {
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
    if (logo_media_id != null) {
      const [logo] = await tx`SELECT id FROM public.media WHERE store_id = ${id}
        AND id = ${logo_media_id} AND upload_type = 'logo'`;
      if (!logo) throw badInput("Choose a logo uploaded to this store.", { logo_media_id: "Choose a logo uploaded to this store." });
    }
    if (brand_name !== undefined) await tx`UPDATE public.stores SET name = ${brand_name} WHERE store_id = ${id}`;
    await tx`UPDATE public.store_setup SET settings = settings || ${tx.json(values)}
      WHERE store_id = ${id}`;
    if (logo_media_id !== undefined) await tx`UPDATE public.store_setup SET logo_media_id = ${logo_media_id} WHERE store_id = ${id}`;
    // Preserve edited bodies; changing underlying details requires re-review.
    if (Object.keys(settings).some((key) => data.settings[key] !== settings[key])) await invalidatePolicies(tx, id);
  }
  if (progress) {
    const updated = await loadDraft(tx, id);
    await tx`UPDATE public.store_setup SET step = ${progress.step},
      completed = ARRAY(SELECT jsonb_array_elements_text(${tx.json(completion(updated, progress))})::integer)
      WHERE store_id = ${id}`;
  }
  return loadDraft(tx, id);
}
export async function saveProduct(tx, id, productId, patch) {
  await ensureSetup(tx, id);
  const [existing] = productId ? await tx`SELECT *, to_json(tags) AS tags FROM public.products
    WHERE store_id = ${id} AND id = ${productId}` : [];
  if (productId && !existing) throw missing();
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
  if (existing) await tx`UPDATE public.products SET title = ${p.title}, description = ${p.description},
    price_paise = ${p.price_paise}, compare_at_price_paise = ${p.compare_at_paise},
    tags = ARRAY(SELECT jsonb_array_elements_text(${tx.json(p.tags)})), sku = ${sku}, stock = ${p.stock ?? 0}, track_inventory = ${p.stock != null},
    hsn_code = ${p.hsn_code}, gst_rate = ${p.gst_rate ?? 0} WHERE store_id = ${id} AND id = ${uuid}`;
  else await tx`INSERT INTO public.products
    (id, store_id, title, slug, description, price_paise, compare_at_price_paise, tags, sku, stock, track_inventory, hsn_code, gst_rate)
    VALUES (${uuid}, ${id}, ${p.title}, ${uuid}, ${p.description}, ${p.price_paise}, ${p.compare_at_paise},
      ARRAY(SELECT jsonb_array_elements_text(${tx.json(p.tags)})), ${sku}, ${p.stock ?? 0}, ${p.stock != null}, ${p.hsn_code}, ${p.gst_rate ?? 0})`;
  if (patch.images) {
    for (const image of patch.images) {
      const [media] = await tx`SELECT id FROM public.media WHERE store_id = ${id}
        AND id = ${image.id} AND upload_type = 'image' AND kind = 'image'`;
      if (!media) throw badInput("Choose product images uploaded to this store.");
      await tx`UPDATE public.media SET alt_text = ${image.alt || p.title || "Product image"}
        WHERE store_id = ${id} AND id = ${image.id}`;
    }
    await tx`DELETE FROM public.product_media WHERE store_id = ${id} AND product_id = ${uuid}`;
    for (const [order, image] of patch.images.entries()) await tx`
      INSERT INTO public.product_media (store_id, product_id, media_id, sort_order)
      VALUES (${id}, ${uuid}, ${image.id}, ${order})`;
  }
  await invalidatePolicies(tx, id);
  return loadDraft(tx, id);
}
export async function deleteProduct(tx, id, productId) {
  const [product] = await tx`SELECT id FROM public.products WHERE store_id = ${id} AND id = ${productId}`;
  if (!product) throw missing();
  await tx`DELETE FROM public.product_media WHERE store_id = ${id} AND product_id = ${productId}`;
  await tx`DELETE FROM public.product_options WHERE store_id = ${id} AND product_id = ${productId}`;
  await tx`DELETE FROM public.collection_products WHERE store_id = ${id} AND product_id = ${productId}`;
  await tx`DELETE FROM public.products WHERE store_id = ${id} AND id = ${productId}`;
  await invalidatePolicies(tx, id);
  return loadDraft(tx, id);
}
export async function insertMedia(tx, id, key, type, size, metadata, alt) {
  const [row] = await tx`INSERT INTO public.media
    (store_id, object_key, kind, upload_type, content_type, size_bytes, width, height, alt_text)
    VALUES (${id}, ${key}, 'image', ${type}, ${metadata.contentType}, ${size},
      ${metadata.width}, ${metadata.height}, ${alt}) RETURNING *`;
  return mediaRecord(row);
}
export async function regeneratePolicies(tx, id) {
  const data = await loadDraft(tx, id), errors = validateBasics(data.settings);
  if (Object.keys(errors).length) throw badInput("Complete your brand basics before generating policy drafts.", errors);
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
  if (live) {
    const data = await loadDraft(tx, id), checklist = publishChecklist(data);
    if (!validateSubdomain(data.settings.subdomain) || data.settings.subdomain !== data.store.subdomain) {
      throw badInput("Confirm your store address in Brand basics before publishing.");
    }
    if (checklist.some((item) => !item.complete)) throw badInput("Complete every item in the publish checklist.", Object.fromEntries(checklist.filter((v) => !v.complete).map((v) => [v.label, "Not complete"])));
    data.store.status = "live";
    data.progress = { step: 4, completed: [1, 2, 3, 4] };
    await tx`INSERT INTO public.store_publications (store_id, snapshot)
      VALUES (${id}, ${tx.json(data)}) ON CONFLICT (store_id) DO UPDATE
      SET snapshot = EXCLUDED.snapshot, published_at = now()`;
    await tx`UPDATE public.products SET status = 'active' WHERE store_id = ${id} AND status = 'draft'`;
    await tx`UPDATE public.policy_pages SET published_at = now() WHERE store_id = ${id}`;
    await tx`UPDATE public.store_setup SET step = 4, completed = ARRAY[1,2,3,4] WHERE store_id = ${id}`;
  }
  await tx`UPDATE public.stores SET status = ${live ? "live" : "draft"} WHERE store_id = ${id}`;
  return loadDraft(tx, id);
}
