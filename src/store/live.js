import { renderAura } from "../public/aura.js";
import {serveStoreIcon} from "./favicon.js";
import {liveAvailability} from "./availability.js";
import { productHref } from "../public/commerce-options.js";
import { POLICY_KINDS, UUID } from "../public/validation.js";
import { SECURITY_HEADERS } from "../auth/security.js";
import { handleCheckout, isCheckoutPath } from "../checkout/routes.js";
import { pagesEnabled, pageLayouts, skeletonEnabled } from "./pages.js";
import {withNavigation} from "../ui/navigation-loader.js";
import {isStoreDiscoveryPath, serveStoreDiscovery, storeCanonicalOrigin} from "./discovery.js";

export function storefrontPage(path, data) {
  if (path === "/") return { page: "home", status: 200 };
  if (path === "/collections/all") return { page: "collection", status: 200 };
  const collection = path.match(/^\/collections\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
  if (collection) {
    const found = data.collections?.find(item => item.slug === collection[1]);
    if (found) return { page: "collection", collectionId: found.id, status: 200 };
  }
  if (["/about", "/pages/about"].includes(path)) return { page: "about", status: 200 };
  if (["/contact", "/pages/contact"].includes(path)) return { page: "contact", status: 200 };
  if (["/faq", "/pages/faq"].includes(path)) return { page: "faq", status: 200 };
  const product = path.match(/^\/products\/([^/]+)$/);
  if(product){
    const found=data.products?.find(p=>p.slug===product[1]||(UUID.test(product[1])&&p.id===product[1]));
    if(found)return {page:"product",productId:found.id,status:200};
  }
  const policy = path.match(/^\/policies\/([^/]+)$/);
  if (policy && POLICY_KINDS.includes(policy[1]) && data.policies?.some((p) => p.kind === policy[1])) return { page: "policy", policyKind: policy[1], status: 200 };
  return { page: "404", status: 404 };
}
export async function serveStorefront(request, db, store, env = {},trackingContext={}) {
  const url = new URL(request.url);
  if (isStoreDiscoveryPath(url.pathname) && !["GET", "HEAD"].includes(request.method)) {
    return serveStoreDiscovery(request, null, "");
  }
  if (url.hostname.endsWith(".lebrands.store") && url.hostname !== `${store.subdomain}.lebrands.store`) {
    url.hostname = `${store.subdomain}.lebrands.store`;
    return new Response(null, { status: 307, headers: { ...SECURITY_HEADERS, location: url.href } });
  }
  const [publication] = await db.withStore(store.store_id, async tx => {
    const [row] = await tx`
    SELECT p.snapshot, (SELECT d.hostname FROM public.domains d
      WHERE d.store_id=p.store_id AND d.status='active' AND d.is_primary=true
      ORDER BY d.hostname LIMIT 1) AS canonical_hostname
    FROM public.store_publications p JOIN public.stores s ON s.store_id = p.store_id
    WHERE p.store_id = ${store.store_id} AND s.status = 'live'
    `;
    if (row?.snapshot && await pagesEnabled(tx)) {
      const pages = await pageLayouts(tx, store.store_id, { published: true });
      row.snapshot = { ...row.snapshot, layouts: pages.layouts, aura_skeleton_enabled: await skeletonEnabled(tx) };
    }
    return row ? [row] : [];
  });
  if (!publication?.snapshot) return isStoreDiscoveryPath(url.pathname) ? serveStoreDiscovery(request, null, "") : null;
  const data = { ...publication.snapshot,
    store: { ...publication.snapshot.store, ...store },
    settings: { ...publication.snapshot.settings, subdomain: store.subdomain } };
  const canonicalOrigin = storeCanonicalOrigin(data, publication.canonical_hostname);
  if (isStoreDiscoveryPath(url.pathname)) return serveStoreDiscovery(request, data, canonicalOrigin);
  if (["GET","HEAD"].includes(request.method) && ["/favicon.svg","/favicon.ico","/favicon.png","/apple-touch-icon.png"].includes(url.pathname)) {
    return serveStoreIcon(request,env,data.settings,store.store_id);
  }
  if (isCheckoutPath(url.pathname)) return handleCheckout(request,env,db,store,data);
  if (!["GET","HEAD"].includes(request.method)) return new Response("Method not allowed",{status:405,headers:SECURITY_HEADERS});
  const options = storefrontPage(url.pathname, data);
  if (options.page === "product") {
    const product = data.products.find(p => p.id === options.productId);
    if(product)trackingContext.product={item_id:product.id,item_name:product.title,quantity:1,
      ...(Number.isFinite(Number(product.price_paise))?{price:Number(product.price_paise)/100}:{})};
    const canonical = productHref(product);
    if (url.pathname !== canonical) return new Response(null, {
      status:308,headers:{...SECURITY_HEADERS,location:`${canonical}${url.search}`},
    });
  }
  if(["home","product","collection"].includes(options.page)){
    data.products=await db.withStore(store.store_id,tx=>liveAvailability(tx,store.store_id,data.products));
  }
  return new Response(request.method === "HEAD" ? null : withNavigation(renderAura(data, {...options,canonicalOrigin,commerce:true,siteKey:env.TURNSTILE_SITE_KEY ?? ""})), {
    status: options.status,
    headers: { ...SECURITY_HEADERS, "content-type": "text/html; charset=utf-8" },
  });
}
