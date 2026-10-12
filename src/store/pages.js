import { defaultPageLayouts, validateLayout, PAGE_KEYS } from "../public/aura-layout.js";
export async function pagesEnabled(tx) {
  const [row] = await tx`SELECT to_regclass('public.store_pages') IS NOT NULL AS pages_enabled`;
  return row?.pages_enabled === true;
}
export async function pageLayouts(tx, storeId, { published = false } = {}) {
  const rows = published
    ? await tx`SELECT page_key,published_layout AS layout,version,updated_at,updated_by FROM public.store_pages WHERE store_id=${storeId} AND published_layout IS NOT NULL ORDER BY page_key`
    : await tx`SELECT page_key,draft_layout AS layout,version,updated_at,updated_by FROM public.store_pages WHERE store_id=${storeId} ORDER BY page_key`;
  return {
    layouts: Object.fromEntries(rows.map(row => [row.page_key, row.layout])),
    page_versions: Object.fromEntries(rows.map(row => [row.page_key, { version: row.version, updated_at: row.updated_at, updated_by: row.updated_by }])),
  };
}
export function layoutContext(data) {
  return { storeId: data.store.store_id, productIds: new Set(data.products.map(product => product.id)),
    collectionIds: new Set((data.collections || []).map(collection => collection.id)) };
}
export async function savePage(tx, id, page, layout, expected, tokenHash, data) {
  if (!PAGE_KEYS.includes(page) || !Number.isInteger(expected) || expected < 0) throw Object.assign(new Error("Invalid page revision."), { status: 400 });
  const normalized = validateLayout(page, layout, layoutContext(data));
  const [row] = await tx`SELECT * FROM public.save_store_page(${id},${page},${tx.json(normalized)},${expected},${tokenHash})`;
  return row;
}
export async function restorePage(tx, id, page, version, expected, tokenHash) {
  if (!PAGE_KEYS.includes(page) || ![version, expected].every(value => Number.isInteger(value) && value >= 0)) throw Object.assign(new Error("Invalid page revision."), { status: 400 });
  const [row] = await tx`SELECT * FROM public.restore_store_page(${id},${page},${version},${expected},${tokenHash})`;
  return row;
}
export async function pageHistory(tx, id, page) {
  if (!PAGE_KEYS.includes(page)) throw Object.assign(new Error("Page not found."), { status: 404 });
  return tx`SELECT version,layout,created_at,updated_by FROM public.store_page_versions WHERE store_id=${id} AND page_key=${page} ORDER BY version DESC LIMIT 20`;
}
export function draftPageResponse(data) {
  const defaults = defaultPageLayouts(data);
  return { layouts: { ...defaults, ...data.layouts }, revisions: Object.fromEntries(PAGE_KEYS.map(key => [key, data.page_versions?.[key] || { version: 0 }])) };
}
