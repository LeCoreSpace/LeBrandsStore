import { productHref } from "../public/commerce-options.js";
import { POLICY_KINDS } from "../public/validation.js";
import { SECURITY_HEADERS } from "../auth/security.js";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FILES = new Set(["/robots.txt", "/sitemap.xml", "/llms.txt", "/llm.txt"]);
// Below both protocol ceilings: 50,000 entries and 50 MB of uncompressed XML.
const PAGE_SIZE = 20000;
const plain = value => String(value || "").replace(/<[^>]*>/g, " ").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
const xml = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
const markdown = value => plain(value).replace(/[\\`*_[\]{}()#+!<>|]/g, "\\$&");

export function isStoreDiscoveryPath(path) {
  return FILES.has(path) || /^\/sitemaps\/[1-9]\d*\.xml$/.test(path);
}

function hostname(value) {
  const host = String(value || "").trim().toLowerCase();
  if (host.length > 253 || !host.includes(".") || /^\d+(?:\.\d+){3}$/.test(host)) return "";
  return host.split(".").every(part => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part)) ? host : "";
}

export function storeCanonicalOrigin(data, primaryHostname) {
  const primary = hostname(primaryHostname);
  const subdomain = String(data.store?.subdomain || data.settings?.subdomain || "");
  const included = SLUG.test(subdomain) ? hostname(`${subdomain}.lebrands.store`) : "";
  return primary || included ? `https://${primary || included}` : "";
}

function visible(record) {
  return record && (!record.status || ["active", "published"].includes(record.status));
}

function sectionContent(data, page, fields) {
  return (Array.isArray(data.layouts?.[page]) ? data.layouts[page] : []).some(section =>
    section?.settings?.enabled !== false && fields.some(key => plain(section?.settings?.[key])));
}

export function storeDiscoveryPages(data) {
  const settings = data.settings || {};
  const pages = [{ path: "/", title: settings.brand_name || data.store?.name || "Store" },
    { path: "/collections/all", title: "Shop all" }];
  if (plain(settings.description) || sectionContent(data, "about", ["body", "text", "story"])) {
    pages.push({ path: "/pages/about", title: "Our story" });
  }
  if (["support_email", "support_phone", "address"].some(key => plain(settings[key]))
    || sectionContent(data, "contact", ["support_email", "support_phone", "address"])) {
    pages.push({ path: "/pages/contact", title: "Contact" });
  }
  for (const collection of Array.isArray(data.collections) ? data.collections : []) {
    if (visible(collection) && String(collection.slug || "").length <= 1687 && SLUG.test(String(collection.slug || ""))) {
      pages.push({ path: `/collections/${collection.slug}`, title: collection.title || collection.slug });
    }
  }
  for (const product of Array.isArray(data.products) ? data.products : []) {
    if (!visible(product) || !product.id) continue;
    const path = productHref(product);
    if (path.length <= 1700 && /^\/products\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path)) {
      pages.push({ path, title: product.title || "Product" });
    }
  }
  for (const policy of Array.isArray(data.policies) ? data.policies : []) {
    if (POLICY_KINDS.includes(policy?.kind) && plain(policy.body)) {
      pages.push({ path: `/policies/${policy.kind}`, title: policy.title || policy.kind });
    }
  }
  const articles=(Array.isArray(data.blogs)?data.blogs:[]).filter(b=>SLUG.test(String(b.slug||"")));
  if(articles.length)pages.push({path:"/blog",title:"Blog"});
  for(const article of articles)pages.push({path:`/blog/${article.slug}`,title:article.title||"Article",
    ...(article.updated_at && Number.isFinite(Date.parse(article.updated_at))?{lastmod:new Date(article.updated_at).toISOString()}:{} )});
  return [...new Map(pages.map(page => [page.path, page])).values()];
}

function sitemap(pages, origin) {
  // Do not fabricate lastmod dates from request time or mutable draft timestamps.
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map(page => `<url><loc>${xml(origin + page.path)}</loc>${page.lastmod?`<lastmod>${xml(page.lastmod)}</lastmod>`:""}</url>`).join("\n")}\n</urlset>\n`;
}

export function serveStoreDiscovery(request, data, origin) {
  const path = new URL(request.url).pathname;
  if (!isStoreDiscoveryPath(path)) return null;
  const headers = { ...SECURITY_HEADERS, "cache-control": "no-store", "x-content-type-options": "nosniff" };
  if (!["GET", "HEAD"].includes(request.method)) {
    return new Response("Method not allowed", { status: 405, headers: { ...headers, allow: "GET, HEAD" } });
  }
  if (!data || data.store?.status !== "live" || !origin) {
    return new Response(request.method === "HEAD" ? null : "Published store unavailable", { status: 404, headers });
  }
  if (path === "/llm.txt") return new Response(null, { status: 308, headers: { ...headers, location: `${origin}/llms.txt` } });
  const pages = storeDiscoveryPages(data);
  const xmlFile = path === "/sitemap.xml" || path.startsWith("/sitemaps/");
  headers["content-type"] = xmlFile ? "application/xml; charset=utf-8" : "text/plain; charset=utf-8";
  let body;
  if (path === "/robots.txt") {
    body = `User-agent: *\nAllow: /\nDisallow: /cart\nDisallow: /checkout\nDisallow: /orders\nDisallow: /track\nDisallow: /account\nDisallow: /api/\nDisallow: /__\n\nSitemap: ${origin}/sitemap.xml\n`;
  } else if (xmlFile) {
    const total = Math.ceil(pages.length / PAGE_SIZE);
    if (path === "/sitemap.xml" && total > 1) {
      body = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${Array.from({ length: total }, (_, i) => `<sitemap><loc>${xml(origin)}/sitemaps/${i + 1}.xml</loc></sitemap>`).join("\n")}\n</sitemapindex>\n`;
    } else {
      const shard = path === "/sitemap.xml" ? 1 : Number(path.match(/\/(\d+)\.xml$/)[1]);
      if (!Number.isSafeInteger(shard) || shard > total) {
        return new Response(request.method === "HEAD" ? null : "Sitemap not found", { status: 404, headers });
      }
      body = sitemap(pages.slice((shard - 1) * PAGE_SIZE, shard * PAGE_SIZE), origin);
    }
  } else {
    const brand = markdown(data.settings?.brand_name || data.store?.name || "Store");
    const description = markdown(plain(data.settings?.description).slice(0, 600));
    const overview = pages.filter(page => !page.path.startsWith("/products/") && !page.path.startsWith("/collections/") && !page.path.startsWith("/blog/"));
    const collections = pages.filter(page => page.path.startsWith("/collections/")).slice(0, 50);
    const products = pages.filter(page => page.path.startsWith("/products/")).slice(0, 20);
    const articles=pages.filter(page=>page.path.startsWith("/blog/")).slice(0,20);
    const links = list => list.map(page => `- [${markdown(page.title)}](${origin}${page.path})`).join("\n");
    body = `# ${brand}\n\n${description ? `> ${description}\n\n` : ""}Public information from this store's published content. Product availability and prices should be checked on the product pages.\n\n## Store\n${links(overview)}\n\n## Collections\n${links(collections)}\n${products.length ? `\n## Selected products\n${links(products)}\n` : ""}${articles.length?`\n## Articles\n${links(articles)}\n`:""}\n## Complete public URL list\n- [Sitemap](${origin}/sitemap.xml)\n\nThis file is a discovery aid, not a guarantee of search indexing or AI recommendations.\n`;
  }
  return new Response(request.method === "HEAD" ? null : body, { headers });
}
