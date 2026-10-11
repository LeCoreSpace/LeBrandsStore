// Development-only adapter. Production always uses src/index.js.
// No database binding, credential, simulated account, or persistent data.
import worker from "./index.js";
import { renderWizard } from "./ui/wizard.js";
import { renderAura } from "./public/aura.js";
import { DEFAULT_SETTINGS } from "./store/repository.js";
import { SECURITY_HEADERS } from "./auth/security.js";
import { renderDashboard } from "./ui/dashboard.js";
import { localDashboardFixture } from "./local-dashboard-fixture.js";
import { dateFilters } from "./public/dashboard-rules.js";
import { EXAMPLE_STORE_ID,EXAMPLE_PRODUCTS,exampleFixture,exampleInvoice,exampleMedia } from "./local-example-fixture.js";
import { renderInvoice } from "./ui/invoice.js";
import { quoteCart } from "./public/commerce-rules.js";

const LOCAL_STORE_ID = "00000000-0000-4000-8000-000000000000";
function filterDashboardFixture(data, filters) {
  data.filters=filters;
  data.orders=data.orders.filter(o=>
    (!filters.status || o.status===filters.status) &&
    (!filters.search || `${o.order_number} ${o.customer_name} ${o.phone}`.toLowerCase().includes(filters.search.toLowerCase())) &&
    (!filters.from || o.created_at.slice(0,10)>=filters.from) &&
    (!filters.to || o.created_at.slice(0,10)<=filters.to));
  if(filters.search)data.customers=data.customers.filter(c=>
    `${c.name} ${c.phone} ${c.email}`.toLowerCase().includes(filters.search.toLowerCase()));
  return data;
}
function dashboardPreviewLink(path) {
  const parts=path.split("/").filter(Boolean).slice(2);
  const section=parts[0] || "overview";
  const view=section==="orders" && parts[1] ? "order" :
    section==="products" && parts[1] ? (parts[1]==="new" ? "product-new" : "product") :
    ["orders","products","customers","invoices","settings"].includes(section) ? section : "overview";
  if(section==="setup") return "/__step2-preview";
  return `/__step4-preview?view=${view}`;
}

export default {
  async fetch(request, env, ctx) {
    const original = new URL(request.url);
    const exampleHeaders={...SECURITY_HEADERS,"x-frame-options":"SAMEORIGIN","cache-control":"no-store",
      "content-security-policy":SECURITY_HEADERS["content-security-policy"].replace("frame-ancestors 'none'","frame-ancestors *")};
    if(original.pathname.startsWith(`/api/stores/${EXAMPLE_STORE_ID}`)){
      if(!["GET","HEAD"].includes(request.method))return Response.json({error:"Example store is read-only. Nothing is saved."},{status:403});
      return new Response(request.method==="HEAD"?null:exampleMedia(JSON.stringify(exampleFixture())),{headers:{...exampleHeaders,"content-type":"application/json"}});
    }
    if(original.pathname==="/api/cart/validate" && request.headers.get("referer")?.includes("/__example-preview/")){
      if(request.method!=="POST")return new Response("Method not allowed",{status:405});
      try{
        const input=await request.json(),data=exampleFixture();
        return new Response(exampleMedia(JSON.stringify(quoteCart(data.products,data.products,input.items,data.checkout,input.state||""))),
          {headers:{...exampleHeaders,"content-type":"application/json"}});
      }catch{return Response.json({error:"Invalid example cart"},{status:400});}
    }
    if(original.pathname==="/api/checkout/order" && request.headers.get("referer")?.includes("/__example-preview/")){
      return Response.json({error:"Example store is read-only. Orders cannot be placed."},{status:403});
    }
    if(original.pathname.startsWith("/__example-media/")){
      if(!["GET","HEAD"].includes(request.method))return new Response("Read-only example assets",{status:405});
      const filename=original.pathname.slice("/__example-media/".length);
      if(![...EXAMPLE_PRODUCTS.map(p=>p[0]+".webp"),"store-desktop.png","store-mobile.png"].includes(filename))return new Response("Not found",{status:404});
      const asset=await env.ASSETS.fetch(new Request(new URL(`/img/local-example/${filename}`,original)));
      return new Response(request.method==="HEAD"?null:asset.body,{status:asset.status,headers:asset.headers});
    }
    if(["GET","HEAD"].includes(request.method) && original.pathname.startsWith("/__example-module/")){
      const name=original.pathname.split("/").pop();
      if(!["aura.js","wizard.js"].includes(name))return new Response("Not found",{status:404});
      const asset=await env.ASSETS.fetch(new Request(new URL("/"+name,original)));
      let source=await asset.text();
      if(name==="aura.js")source=source.replace('const safeImage = (url) =>',
        'const safeImage = (url) => /^\\/__example-media\\/[a-z0-9-]+\\.webp$/.test(String(url || "")) ? String(url) :')
        .replaceAll('from "./','from "/assets/');
      else source=source.replace('from "/assets/aura.js"','from "/__example-module/aura.js"');
      return new Response(request.method==="HEAD"?null:source,{headers:{...exampleHeaders,"content-type":"text/javascript; charset=utf-8"}});
    }
    if(original.pathname.startsWith("/__example-preview/")){
      if(!["GET","HEAD"].includes(request.method))return new Response("Example store is read-only",{status:405});
      const view=original.pathname.split("/").pop(),data=exampleFixture();
      const banner='<p role="status" style="margin:0;padding:7px 16px;text-align:center;font:12px system-ui;background:#f6f3ee;color:#214a3d">Example store. Fictional brand and customers. Generated demo product photography.</p>';
      let body;
      if(view==="store"){
        body=exampleMedia(renderAura(data,{preview:true,commerce:true,readOnly:true}));
      }else if(view==="checkout"){
        body=exampleMedia(renderAura(data,{page:"checkout",commerce:true,preview:true,readOnly:false,storeKey:EXAMPLE_STORE_ID}));
      }else if(view==="dashboard"){
        body=exampleMedia(renderDashboard("overview",data,{name:"Example owner"})).replace('class="lb-app"','class="lb-app" data-preview="true"');
      }else if(view==="invoice"){
        body=renderInvoice(exampleInvoice(data)).replace("</head>",'<style>main{position:relative}.tools,.addresses,.signature,main>p{display:none}main::after{content:"SAMPLE";position:absolute;inset:35% 0 auto;text-align:center;font-size:120px;letter-spacing:.1em;opacity:.075;transform:rotate(-24deg);pointer-events:none}body{padding:24px}</style></head>');
      }else if(view==="wizard"){
        data.settings={...data.settings,brand_name:"",description:"",tagline:"",category:""};
        body=exampleMedia(renderWizard(data,{})).replace('id="wizard"','data-visual-only="true" id="wizard"')
          .replace('src="/assets/wizard.js"','src="/__example-module/wizard.js"');
      }else if(view==="composite"){
        body='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}html,body{overflow:hidden}body{margin:0;background:#f6f3ee;width:1440px;height:550px;display:flex;align-items:center;justify-content:center;gap:60px}.laptop{width:800px;border:10px solid #292923;border-radius:10px;background:#292923;position:relative}.laptop:after{content:"";position:absolute;width:110%;height:9px;background:#b7b5ae;left:-5%;bottom:-18px;border-radius:0 0 12px 12px}.laptop img{display:block;width:100%;height:auto}.phone{height:466px;border:8px solid #292923;border-radius:28px;overflow:hidden;background:#292923}.phone img{display:block;height:100%;width:auto}img{object-fit:contain}</style></head><body><div class="laptop"><img src="/__example-media/store-desktop.png" alt="Example Studio fictional storefront desktop"></div><div class="phone"><img src="/__example-media/store-mobile.png" alt="Example Studio fictional storefront mobile"></div></body></html>';
      }else return new Response("Not found",{status:404});
      if(view!=="composite")body=body.replace(/<body([^>]*)>/,`<body$1>${banner}`);
      return new Response(request.method==="HEAD"?null:body,{headers:{...exampleHeaders,"content-type":"text/html; charset=utf-8"}});
    }
    // Only the local preview adapter serves display fixtures. Every mutation
    // targeting this synthetic store fails explicitly and never reaches a DB.
    if (original.pathname.startsWith(`/api/stores/${LOCAL_STORE_ID}`)) {
      if (!["GET","HEAD"].includes(request.method)) return Response.json(
        {error:"Read-only local preview. Changes cannot be saved."},{status:403});
      const data=localDashboardFixture(), filters=dateFilters(original.searchParams);
      const section=original.pathname.split("/")[4];
      filterDashboardFixture(data,filters);
      return new Response(request.method==="HEAD"?null:JSON.stringify(data),{headers:{
        ...SECURITY_HEADERS,"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
    }
    if (["GET","HEAD"].includes(request.method) && original.pathname === "/__step4-preview") {
      const requested = original.searchParams.get("view") || "overview";
      const view = ["overview","orders","order","products","product","product-new","customers","invoices","settings"].includes(requested) ? requested : "overview";
      const data = localDashboardFixture();
      filterDashboardFixture(data,dateFilters(original.searchParams));
      let body = renderDashboard(view,data,{name:"Demo owner"}).replace("<body>",'<body><p role="status" style="position:fixed;bottom:0;left:0;right:0;z-index:150;padding:7px;margin:0;text-align:center;font:12px system-ui;background:#fff4ce;color:#514111">Read-only local preview with synthetic sample data. No account or database is attached.</p>')
        .replace('class="lb-app"','class="lb-app" data-preview="true"');
      body=body.replace(/href="(\/stores\/[^"]*)"/g,(_,path)=>`href="${dashboardPreviewLink(path)}"`)
        .replace(/action="(\/stores\/[^"]*)"/g,(_,path)=>`action="${dashboardPreviewLink(path)}"`)
        // Read-only filters/navigation remain usable; mutation forms and actions
        // are blocked server-side even if a disabled control is forced open.
        .replace(/<button([^>]*\bdata-(?:order-status|payment-collected|export|archive-product|stock-adjust|publish-store|unpublish-store)\b[^>]*)>/g,"<button disabled$1>")
        .replace(/<input([^>]*\btype="file"[^>]*)>/g,"<input disabled$1>");
      body=body.replace(/(<form\b[^>]*data-filter-form[^>]*>)/g,
        `$1<input type="hidden" name="view" value="${view}">`);
      return new Response(request.method === "HEAD" ? null : body,{headers:{...SECURITY_HEADERS,
        "content-security-policy":SECURITY_HEADERS["content-security-policy"].replace("frame-ancestors 'none'","frame-ancestors *"),
        "content-type":"text/html; charset=utf-8","cache-control":"no-store","x-frame-options":"SAMEORIGIN"}});
    }
    if (["GET","HEAD"].includes(request.method) && original.pathname === "/__step3-preview") {
      const requested = original.searchParams.get("view") ?? "checkout";
      const page = ["home","cart","checkout","track"].includes(requested) ? requested : "checkout";
      const data = {store:{store_id:"00000000-0000-4000-8000-000000000000",name:"",subdomain:"",status:"draft"},
        settings:{...DEFAULT_SETTINGS},products:[],policies:[]};
      const html = renderAura(data,{page,commerce:true,readOnly:true,preview:true})
        .replace("<body>","<body><p role=\"status\" style=\"padding:14px;text-align:center\">Read-only visual preview. No database, real catalogue or order placement is attached.</p>");
      return new Response(request.method === "HEAD"?null:html,{headers:{...SECURITY_HEADERS,
        "content-security-policy":SECURITY_HEADERS["content-security-policy"].replace("frame-ancestors 'none'","frame-ancestors *"),
        "x-frame-options":"SAMEORIGIN","content-type":"text/html; charset=utf-8","cache-control":"no-store"}});
    }
    // Development-only visual previews. No users, fake saves, sessions or DB.
    if (["GET", "HEAD"].includes(request.method) && ["/__step2-preview", "/__aura-preview"].includes(original.pathname)) {
      const data = {
        store: { store_id: "00000000-0000-4000-8000-000000000000", name: "", subdomain: "", status: "draft" },
        settings: { ...DEFAULT_SETTINGS, brand_name: "", subdomain: "", logo_media_id: null, logo_url: "" },
        products: [], policies: [], progress: { step: 1, completed: [] },
      };
      const body = original.pathname === "/__aura-preview" ? renderAura(data, { preview: true }) :
        renderWizard(data, {}).replace('id="wizard"', 'data-visual-only="true" id="wizard"')
          .replace('<main class="wizard-main">', '<main class="wizard-main"><p role="status">Visual preview only. Sign in on the account website to save and publish. No database is attached here.</p>');
      return new Response(body, { headers: { ...SECURITY_HEADERS, "x-frame-options": "SAMEORIGIN",
        "content-security-policy": SECURITY_HEADERS["content-security-policy"].replace("frame-ancestors 'none'", "frame-ancestors *"),
        "content-type": "text/html; charset=utf-8" } });
    }
    const account = ["/signup", "/login", "/forgot-password", "/account", "/logout", "/dashboard", "/stores/new", "/api/subdomain-check"]
      .includes(original.pathname) || original.pathname.startsWith("/api/stores/") || /^\/stores\/[^/]+(?:\/|$)/.test(original.pathname);
    const target = new URL(original);
    target.protocol = "https:";
    target.hostname = account ? "app.lebrands.store" : "lebrands.store";
    target.port = "";
    if (target.pathname === "/dashboard") target.pathname = "/";
    const forwarded = new Request(target.href, request);
    const response = await worker.fetch(forwarded, env, ctx);
    const headers = new Headers(response.headers);
    // Allow only the development preview iframe to display the static pages.
    headers.delete("x-frame-options");
    headers.set("content-security-policy", headers.get("content-security-policy")?.replace("frame-ancestors 'none'", "frame-ancestors *") ?? "default-src 'self'");
    if (response.status === 303 && headers.get("location") === "/") headers.set("location", "/dashboard");
    if (!headers.get("content-type")?.includes("text/html")) return new Response(response.body, { status: response.status, headers });
    let body = await response.text();
    if (account) body = body.replaceAll('href="/"', 'href="/dashboard"');
    body = body.replaceAll('href="https://lebrands.store"', 'href="/"')
      .replaceAll("https://app.lebrands.store", "").replaceAll("https://lebrands.store", "");
    return new Response(body, { status: response.status, headers });
  },
};
