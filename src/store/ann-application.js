import { loadDraft, saveSetup, saveProduct } from "./repository.js";
import { saveCollection, appendCollectionProducts } from "./catalog.js";
import { savePage } from "./pages.js";
import { settingsPatch, productPatch, badInput } from "./input.js";
import { publishChecklist, UUID } from "../public/validation.js";
import { CURRENT_GST_RATES } from "../public/commerce-rules.js";
import { annPreviewConfiguration } from "../public/ann-config.js";
import { starterLayouts } from "../public/aura-skeleton.js";
import { projectAnnPreview } from "../public/ann-projection.js";
import { prefilledSection } from "../public/aura-starters.js";
import { defaultPageLayouts } from "../public/aura-layout.js";
import { audit } from "../dashboard/repository.js";

export const ANN_DRAFT_PAGES = ["home", "collection", "product", "cart", "checkout", "about", "contact"];
const fail = message => { throw badInput(message); };
const conflict = message => { throw Object.assign(new Error(message), { status: 409 }); };
function keys(value, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(k => !allowed.includes(k))) fail("Use Ann's confirmation form.");
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
async function digest(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(canonical(value))));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}
export const draftFingerprint = data => digest({
  settings: data.settings, products: data.products, collections: data.collections,
  layouts: data.layouts, versions: data.page_versions,
});
export function validateApplication(body, answers) {
  keys(body, ["expected_revision", "expected_draft", "confirm", "pages", "products", "collections"]);
  if (!Number.isInteger(body.expected_revision) || body.expected_revision < 1 ||
      !/^[a-f0-9]{64}$/.test(body.expected_draft || "") || body.confirm !== true) fail("Save your plan and confirm the draft changes first.");
  if (!Array.isArray(body.pages) || new Set(body.pages).size !== body.pages.length ||
      body.pages.some(p => !ANN_DRAFT_PAGES.includes(p))) fail("Choose editable store pages, not policy pages.");
  for (const [kind, source] of [["products", answers.product_ideas || []], ["collections", answers.collections || []]]) {
    const rows = body[kind];
    if (!Array.isArray(rows) || rows.length !== source.length || new Set(rows.map(r => r?.key)).size !== rows.length) fail("Confirm each planned product and collection.");
    for (const row of rows) {
      keys(row, kind === "products" ? ["key", "target", "price_paise", "gst_rate", "hsn_code", "stock", "media_id"] : ["key", "target"]);
      if (!source.some(item => item.key === row.key) ||
          !(kind === "products" && row.target === "skip") && row.target !== "new" && !UUID.test(row.target || "")) fail("Choose a valid catalogue destination.");
      if (kind === "collections" || row.target !== "new") {
        if (Object.keys(row).some(k => !["key", "target"].includes(k))) fail("Existing catalogue items cannot be edited through this confirmation.");
      } else {
        if (!Number.isSafeInteger(row.price_paise) || row.price_paise < 1 || row.price_paise > 10000000000 ||
            !CURRENT_GST_RATES.includes(row.gst_rate)) fail("Enter a real selling price and explicitly choose a current GST rate for each new product.");
        if (row.stock !== null && (!Number.isInteger(row.stock) || row.stock < 0 || row.stock > 10000000)) fail("Enter a valid stock quantity, or leave it untracked.");
        if (row.media_id !== null && !UUID.test(row.media_id || "")) fail("Choose a photo uploaded to your store.");
        productPatch({ title: "Confirmed product", price_paise: row.price_paise, gst_rate: row.gst_rate, hsn_code: row.hsn_code || "", stock: row.stock });
      }
    }
  }
  return body;
}
export function annDraftLayouts(data, config, productIds, collectionIds) {
  const seed = { ...data, layouts: { ...defaultPageLayouts(data), ...starterLayouts({ ...data, layouts: {} }) } };
  const projected = projectAnnPreview(seed, { ...config, collections: [], product_ideas: [] }, { prefilled: prefilledSection }).data;
  for (const sections of Object.values(projected.layouts)) for (const section of sections) {
    if (Object.hasOwn(section.settings || {}, "product")) section.settings.product = productIds[0] || "";
    if (Object.hasOwn(section.settings || {}, "collection")) section.settings.collection = collectionIds[0] || "";
    if (Array.isArray(section.settings?.products)) section.settings.products = productIds.slice(0, 8);
    // Testimonials are real review records, never imported starter assertions.
    if (section.type === "reviews") section.blocks = [];
  }
  return projected.layouts;
}
export async function prepareAnnApplication(tx, storeId, session) {
  if (!session) fail("Save your Ann plan before preparing a store draft.");
  const data = await loadDraft(tx, storeId);
  const images = await tx`SELECT id,alt_text,object_key FROM public.media m WHERE store_id=${storeId}
    AND upload_type='image' AND kind='image' AND COALESCE(to_jsonb(m)->>'approval_status','approved')='approved'
    ORDER BY created_at DESC,id LIMIT 500`;
  return {
    expected_revision: session.revision, expected_draft: await draftFingerprint(data),
    application: data.settings.ann_application || null,
    pages: ANN_DRAFT_PAGES.map(key => ({ key, version: data.page_versions?.[key]?.version || 0 })),
    products: data.products.map(p => ({ id: p.id, title: p.title, price_paise: p.price_paise, stock: p.stock })),
    collections: data.collections.map(c => ({ id: c.id, title: c.title })), images,
    checklist: publishChecklist(data),
  };
}
export async function applyAnnApplication(tx, storeId, tokenHash, userId, session, reference, raw) {
  const body = validateApplication(raw, session?.answers || {});
  // Same order as the existing catalogue/page writers. The surrounding
  // withMemberStore transaction commits all changes or none of them.
  await tx`SELECT store_id FROM public.stores WHERE store_id=${storeId} FOR UPDATE`;
  await tx`SELECT store_id FROM public.store_setup WHERE store_id=${storeId} FOR UPDATE`;
  // withMemberStore serializes every Ann/page/catalogue writer on stores.
  // These tables deliberately grant APP SELECT only; their existing
  // tenant-checked functions remain the only permitted write boundary.
  const [current] = await tx`SELECT revision FROM public.ann_builder_sessions WHERE store_id=${storeId}`;
  if (!current || current.revision !== body.expected_revision || session.revision !== current.revision)
    conflict("Your Ann plan changed. Save and prepare the latest plan before applying.");
  let data = await loadDraft(tx, storeId);
  const intent = await digest(body), previous = data.settings.ann_application;
  if (previous?.revision === body.expected_revision) {
    if (previous.intent !== intent) conflict("This saved plan has already been applied. Edit existing products in Products, or save a changed Ann plan before applying again.");
    return { application: previous, draft: data, checklist: publishChecklist(data), replayed: true };
  }
  if (await draftFingerprint(data) !== body.expected_draft) conflict("Your store draft changed in another window. Prepare it again before replacing any pages.");
  const answers = session.answers, config = annPreviewConfiguration(answers, data.settings);
  const category = reference.categories.find(c => Number(c.category_id) === answers.category_id);
  const subcategory = reference.subcategories.find(s => Number(s.subcategory_id) === answers.subcategory_id && Number(s.category_id) === answers.category_id);
  if (!category || !subcategory) fail("Choose a category and matching subcategory before applying.");
  const ownedProducts = new Set(data.products.map(p => p.id)), ownedCollections = new Set(data.collections.map(c => c.id));
  // Check every submitted existing destination before creating anything.
  for (const row of body.products) if (!["skip", "new"].includes(row.target) && !ownedProducts.has(row.target)) fail("Choose products belonging to this store.");
  for (const row of body.collections) if (row.target !== "new" && !ownedCollections.has(row.target)) fail("Choose collections belonging to this store.");
  const productMap = {}, collectionMap = {};
  for (const row of body.products) {
    if (row.target === "skip") continue;
    if (row.target !== "new") { productMap[row.key] = row.target; continue; }
    const idea = answers.product_ideas.find(p => p.key === row.key);
    const details = (idea.attributes || []).flatMap(selection => {
      const attribute = reference.attributes.find(a => Number(a.id) === selection.attribute_id);
      const values = attribute?.values.filter(v => selection.value_ids.includes(Number(v.id))).map(v => v.value) || [];
      return values.length ? [`${attribute.name}: ${values.join(", ")}`] : [];
    });
    const patch = productPatch({ title: idea.name, description: [idea.description, ...details].filter(Boolean).join("\n\n"),
      price_paise: row.price_paise, gst_rate: row.gst_rate, hsn_code: row.hsn_code || "", stock: row.stock,
      ...(row.media_id ? { images: [{ id: row.media_id, alt: idea.name }] } : {}) });
    productMap[row.key] = (await saveProduct(tx, storeId, null, patch, { returnDraft: false, preserveMediaAlt: true })).saved_product_id;
  }
  for (const row of body.collections) {
    const planned = answers.collections.find(c => c.key === row.key);
    const ids = (answers.product_ideas || []).filter(p => p.collection_key === row.key).map(p => productMap[p.key]).filter(Boolean);
    if (row.target === "new") {
      const suffix = crypto.randomUUID().slice(0, 8);
      const slug = `${planned.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "collection"}-${suffix}`;
      collectionMap[row.key] = await saveCollection(tx, storeId, null, { title: planned.name, description: planned.description || "", slug, product_ids: [...new Set(ids)] });
    } else {
      collectionMap[row.key] = row.target;
      // Add confirmed members only, preserving existing text, covers and members.
      await appendCollectionProducts(tx, storeId, row.target, [...new Set(ids)]);
    }
  }
  await saveSetup(tx, storeId, settingsPatch({ ...config.theme, category: category.slug, subcategory: subcategory.slug,
    ...(answers.store_name !== undefined ? { brand_name: answers.store_name } : {}),
    ...(answers.tagline !== undefined ? { tagline: answers.tagline } : {}),
    ...(answers.description !== undefined ? { description: answers.description } : {}),
  }, { storeId }));
  data = await loadDraft(tx, storeId);
  const layouts = annDraftLayouts(data, config, Object.values(productMap), Object.values(collectionMap));
  for (const page of body.pages) await savePage(tx, storeId, page, layouts[page], data.page_versions?.[page]?.version || 0, tokenHash, data);
  const application = { revision: session.revision, intent, products: productMap, collections: collectionMap, pages: body.pages };
  await tx`UPDATE public.store_setup SET settings=jsonb_set(settings,'{ann_application}',${tx.json(application)}::jsonb,true) WHERE store_id=${storeId}`;
  await audit(tx, storeId, userId, "ann.draft_applied", "store", storeId, { revision: session.revision, pages: body.pages, products: Object.keys(productMap).length });
  data = await loadDraft(tx, storeId);
  return { application, draft: data, checklist: publishChecklist(data), replayed: false };
}
