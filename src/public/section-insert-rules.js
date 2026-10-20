/** Pure insertion rules for independent section instances (UI side). Mirrors the model contract; the server stays authoritative. */
import { INSTANCE_PAGES, SECTION_INSTANCE_LIMIT, INSTANCE_ID, sectionBindingKinds } from "./section-instance-model.js";
export { INSTANCE_PAGES, SECTION_INSTANCE_LIMIT, INSTANCE_ID };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const KIND_LABEL = { none: "No product or collection", all: "Everything in my store", "current-product": "The product being viewed", "current-collection": "The collection being viewed", product: "One of my products", collection: "One of my collections" };
export const isInstanceId = id => INSTANCE_ID.test(String(id || ""));
/** Binding kinds a family may use on a page (canonical model). Empty means it cannot be added there. */
export const bindingKinds = (family, page) => sectionBindingKinds(family, page);
/** Selectable store records: real UUIDs only, never archived or demo ids. */
export function selectableRecords(data = {}) {
  const pick = list => (Array.isArray(list) ? list : []).filter(x => x && UUID.test(String(x.id)) && x.status !== "archived").map(x => ({ id: String(x.id), name: String(x.name || x.title || "Untitled") }));
  return { products: pick(data.products), collections: pick(data.collections) };
}
export const needsRecord = kind => kind === "product" || kind === "collection";
/** Kinds usable right now, with a reason when none are. */
export function usableKinds(family, page, records) {
  const all = bindingKinds(family, page);
  if (!all.length) return { kinds: [], reason: "This section cannot be added to this page." };
  const kinds = all.filter(k => !needsRecord(k) || (k === "product" ? records.products : records.collections).length);
  if (kinds.length) return { kinds, reason: "" };
  const what = all.includes("product") ? "product" : "collection";
  return { kinds: [], reason: `Add at least one ${what} to your store first. This section needs a real ${what} to show.` };
}
export function bindingFor(kind, id) { return needsRecord(kind) ? { kind, id } : { kind }; }
export const instanceCount = ids => [...ids].filter(isInstanceId).length;
