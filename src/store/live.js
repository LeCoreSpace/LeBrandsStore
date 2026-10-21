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
import {blogPublishingAvailable,blogPublications} from "../blog/publication.js";
import {renderPublicBlog} from "../blog/render.js";

export function storefrontPage(path, data) {
  if(path==="/blog")return {page:"blog",status:200};
  if(/^\/blog\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path) && data.blog_article)
    return {page:"blog-article",status:200};
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
    if(row?.snapshot){
      if(isStoreDiscoveryPath(url.pathname)||url.pathname==="/blog"||url.pathname.startsWith("/blog/"))
        Object.assign(row.snapshot,await blogPublications(tx,store.store_id,{slug:url.pathname.split("/")[2]||null}));
      else if(await blogPublishingAvailable(tx)){
        const [has]=await tx`SELECT EXISTS(SELECT 1 FROM public.store_blog_publications WHERE store_id=${store.store_id}) AS enabled`;
        row.snapshot.blog_enabled=has?.enabled===true;
      }
    }
    return row ? [row] : [];
  });
  if (!publication?.snapshot) return isStoreDiscoveryPath(url.pathname) ? serveStoreDiscovery(request, null, "") :
    /^\/blog(?:\/|$)/.test(url.pathname)?new Response(request.method==="HEAD"?null:"Published store unavailable",{status:404,headers:SECURITY_HEADERS}):null;
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
  let options = storefrontPage(url.pathname, data);
  if(options.page==="blog"){
    const raw=url.searchParams.get("page")||"1",page=/^[1-9][0-9]{0,6}$/.test(raw)?Number(raw):0;
    const all=data.blogs||[];
    if(!page || (page>1&&(page-1)*12>=all.length))options={page:"404",status:404};
    else {data.has_more=all.length>page*12;data.blogs=all.slice((page-1)*12,page*12);options.blogPage=page;}
  }
  data.blog_enabled=data.blog_enabled || Boolean(data.blogs?.length);
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
  const publicBlogHtml=["blog","blog-article"].includes(options.page)?renderPublicBlog(data,{...options,canonicalOrigin}):"";
  return new Response(request.method === "HEAD" ? null : withNavigation(renderAura(data, {...options,publicBlogHtml,canonicalOrigin,commerce:true,siteKey:env.TURNSTILE_SITE_KEY ?? ""})), {
    status: options.status,
    headers: { ...SECURITY_HEADERS, "content-type": "text/html; charset=utf-8" },
  });
}
