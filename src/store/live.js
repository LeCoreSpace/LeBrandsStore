import { renderAura } from "../public/aura.js";
import { POLICY_KINDS, UUID } from "../public/validation.js";
import { SECURITY_HEADERS } from "../auth/security.js";

export function storefrontPage(path, data) {
  if (path === "/") return { page: "home", status: 200 };
  if (path === "/collections/all") return { page: "collection", status: 200 };
  if (["/about", "/pages/about"].includes(path)) return { page: "about", status: 200 };
  if (["/contact", "/pages/contact"].includes(path)) return { page: "contact", status: 200 };
  const product = path.match(/^\/products\/([^/]+)$/);
  if (product && UUID.test(product[1]) && data.products?.some((p) => p.id === product[1])) return { page: "product", productId: product[1], status: 200 };
  const policy = path.match(/^\/policies\/([^/]+)$/);
  if (policy && POLICY_KINDS.includes(policy[1]) && data.policies?.some((p) => p.kind === policy[1])) return { page: "policy", policyKind: policy[1], status: 200 };
  return { page: "404", status: 404 };
}
export async function serveStorefront(request, db, store) {
  const url = new URL(request.url);
  if (!["GET", "HEAD"].includes(request.method)) return new Response("Method not allowed", { status: 405, headers: SECURITY_HEADERS });
  if (url.hostname.endsWith(".lebrands.store") && url.hostname !== `${store.subdomain}.lebrands.store`) {
    url.hostname = `${store.subdomain}.lebrands.store`;
    return new Response(null, { status: 302, headers: { ...SECURITY_HEADERS, location: url.href } });
  }
  const [publication] = await db.withStore(store.store_id, (tx) => tx`
    SELECT p.snapshot FROM public.store_publications p JOIN public.stores s ON s.store_id = p.store_id
    WHERE p.store_id = ${store.store_id} AND s.status = 'live'
  `);
  if (!publication?.snapshot) return null;
  const data = { ...publication.snapshot,
    store: { ...publication.snapshot.store, ...store },
    settings: { ...publication.snapshot.settings, subdomain: store.subdomain } };
  const options = storefrontPage(url.pathname, data);
  return new Response(request.method === "HEAD" ? null : renderAura(data, options), {
    status: options.status,
    headers: { ...SECURITY_HEADERS, "content-type": "text/html; charset=utf-8" },
  });
}
