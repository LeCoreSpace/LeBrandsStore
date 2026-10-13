// Pure catalogue filter, sort and pagination. Shared by the storefront script and tests.
export const PAGE_SIZES = [12, 24, 48];
export const normalisePageSize = (value) => PAGE_SIZES.includes(Number(value)) ? Number(value) : 24;
export function catalogPage(items, { sort = "", stockOnly = false, collection = "", q = "", page = 1, pageSize = 0 } = {}) {
  const term = String(q || "").trim().toLowerCase();
  const num = (v) => Number(v) || 0;
  const matched = (Array.isArray(items) ? items : []).filter((i) =>
    (!term || String(i.title || "").toLowerCase().includes(term)) &&
    (!stockOnly || i.available) &&
    (!collection || (i.collections || []).includes(collection)));
  const by = { "price-asc": (a, b) => num(a.price) - num(b.price), "price-desc": (a, b) => num(b.price) - num(a.price), available: (a, b) => (b.available ? 1 : 0) - (a.available ? 1 : 0) };
  const sorted = [...matched].sort((a, b) => (by[sort]?.(a, b) || 0) || num(a.index) - num(b.index));
  const size = pageSize > 0 ? normalisePageSize(pageSize) : 0;
  const pages = size ? Math.max(1, Math.ceil(sorted.length / size)) : 1;
  const current = Math.min(Math.max(1, Math.trunc(Number(page)) || 1), pages);
  return { total: sorted.length, pages, page: current, pageSize: size, ordered: sorted, visible: size ? sorted.slice((current - 1) * size, current * size) : sorted };
}
