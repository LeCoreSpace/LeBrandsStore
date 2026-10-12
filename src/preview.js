// Development-only adapter. Production always uses src/index.js.
// Optional explicitly enabled, restricted live-database bridge for real testing.
import worker from "./index.js";
import { renderWizard } from "./ui/wizard.js";
import {renderEditor} from "./ui/editor.js";
import {defaultPageLayouts} from "./public/aura-layout.js";
import {starterLayouts} from "./public/aura-skeleton.js";
import {publicStonescence} from "./local-stonescence-fixture.js";
import { renderAura } from "./public/aura.js";
import { DEFAULT_SETTINGS } from "./store/repository.js";
import { SECURITY_HEADERS } from "./auth/security.js";
import { renderDashboard } from "./ui/dashboard.js";
import { localDashboardFixture } from "./local-dashboard-fixture.js";
import { dateFilters } from "./public/dashboard-rules.js";
import { EXAMPLE_STORE_ID,EXAMPLE_PRODUCTS,EXAMPLE_IMAGE_WIDTHS,exampleFixture,exampleInvoice,exampleMedia } from "./local-example-fixture.js";
import { renderInvoice } from "./ui/invoice.js";
import { renderAccount } from "./ui/accounts.js";
import { quoteCart } from "./public/commerce-rules.js";
import { renderPremiumStore } from "./ui/premium-example.js";
import { previewShell, renderAppSample } from "./local-app-preview.js";
import { ACCOUNT_ROBOTS } from "./ui/platform-seo.js";
import { isLivePreview, livePreviewEnv, previewAccountRequest, livePreviewHeaders, previewDatabaseStatus } from "./preview-live.js";

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
    if (original.pathname === "/__account-preview" && request.method === "GET") {
      const html = renderAccount("dashboard", {
        user: { name: "Sample owner" },
        stores: [{ store_id: EXAMPLE_STORE_ID, name: "Example Studio", subdomain: "example-studio", status: "live", role: "owner" }],
      }).replace("<body>", '<body><p role="status" style="margin:0;padding:8px;text-align:center;background:#f1e5ea;color:#4d1026;font:12px system-ui">Read-only example. No account or database is attached.</p>');
      return new Response(html, { headers: { ...SECURITY_HEADERS, "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    }
    if (original.pathname === "/__database-status") {
      if (!isLivePreview(env)) return Response.json({ connected: false }, { status: 503 });
      if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
      return previewDatabaseStatus(env);
    }
    if (original.pathname === "/robots.txt") {
      const allowed = ["GET", "HEAD"].includes(request.method);
      return new Response(allowed && request.method !== "HEAD" ? ACCOUNT_ROBOTS : null, {
        status: allowed ? 200 : 405,
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow", allow: "GET, HEAD" },
      });
    }
    const exampleHeaders={...SECURITY_HEADERS,"x-frame-options":"SAMEORIGIN","cache-control":"no-store",
      "content-security-policy":SECURITY_HEADERS["content-security-policy"].replace("frame-ancestors 'none'","frame-ancestors *")};
    if (original.pathname === "/__app-preview" || original.pathname.startsWith("/__app-preview/")) {
      if (!["GET", "HEAD"].includes(request.method)) return Response.json({error:"Read-only application preview. Nothing is saved."},{status:403});
      const body = original.pathname === "/__app-preview"
        ? previewShell(original.searchParams.get("screen"))
        : original.pathname.startsWith("/__app-preview/page/") ? renderAppSample(original.pathname.slice("/__app-preview/page/".length), original.searchParams) : null;
      return new Response(request.method === "HEAD" ? null : body || "Preview screen not found", {status:body ? 200 : 404,headers:{...exampleHeaders,"content-type":"text/html; charset=utf-8"}});
    }
    if(original.pathname.startsWith(`/api/stores/${EXAMPLE_STORE_ID}`)){
      if(!["GET","HEAD"].includes(request.method))return Response.json({error:"Example store is read-only. Nothing is saved."},{status:403});
      return new Response(request.method==="HEAD"?null:exampleMedia(JSON.stringify(exampleFixture())),{headers:{...exampleHeaders,"content-type":"application/json"}});
    }
    if(original.pathname==="/api/cart/validate" && /\/__(?:example|app)-preview\//.test(request.headers.get("referer") || "")){
      if(request.method!=="POST")return new Response("Method not allowed",{status:405});
      try{
        const input=await request.json(),data=exampleFixture();
        return new Response(exampleMedia(JSON.stringify(quoteCart(data.products,data.products,input.items,data.checkout,input.state||""))),
          {headers:{...exampleHeaders,"content-type":"application/json"}});
      }catch{return Response.json({error:"Invalid example cart"},{status:400});}
    }
    if(original.pathname==="/api/checkout/order" && /\/__(?:example|app)-preview\//.test(request.headers.get("referer") || "")){
      return Response.json({error:"Example store is read-only. Orders cannot be placed."},{status:403});
    }
    if(original.pathname.startsWith("/__example-media/")){
      if(!["GET","HEAD"].includes(request.method))return new Response("Read-only example assets",{status:405});
      const filename=original.pathname.slice("/__example-media/".length);
      if(![...EXAMPLE_PRODUCTS.flatMap(p=>[p[0]+".webp",...EXAMPLE_IMAGE_WIDTHS.map(w=>`${p[0]}-${w}.webp`)]),"store-desktop.png","store-mobile.png"].includes(filename))return new Response("Not found",{status:404});
      let asset=await env.ASSETS.fetch(new Request(new URL(`/img/local-example/${filename}`,original)));
      // Fictional responsive previews may reference sizes not checked into Git.
      // Local-only fallback to the original, never a production media fallback.
      if (asset.status === 404 && /-\d+\.webp$/.test(filename)) {
        asset = await env.ASSETS.fetch(new Request(new URL(`/img/local-example/${filename.replace(/-\d+\.webp$/, ".webp")}`, original)));
      }
      return new Response(request.method==="HEAD"?null:asset.body,{status:asset.status,headers:asset.headers});
    }
    if(["GET","HEAD"].includes(request.method) && original.pathname.startsWith("/__example-module/")){
      const name=original.pathname.split("/").pop();
       if(!["aura.js","aura-sections.js","wizard.js","editor.js","premium-example-client.js"].includes(name))return new Response("Not found",{status:404});
      const asset=await env.ASSETS.fetch(new Request(new URL("/"+name,original)));
       if(name==="premium-example-client.js")return new Response(request.method==="HEAD"?null:await asset.text(),{headers:{...exampleHeaders,"content-type":"text/javascript; charset=utf-8"}});
      let source=await asset.text();
      if (name === "editor.js") {
        const pairs = [];
        const collect = value => {
          if (typeof value === "string") {
            const local = exampleMedia(value);
            if (local !== value) pairs.push([value, local]);
          } else if (value && typeof value === "object") Object.values(value).forEach(collect);
        };
        collect(exampleFixture());
        source = `const fictionalMediaPairs=${JSON.stringify(pairs)};\nconst fictionalMedia=html=>{for(const [remote,local] of fictionalMediaPairs)html=html.replaceAll(remote,local);return html;};\n` +
          source.replace("frame.srcdoc = html.replace", "frame.srcdoc = fictionalMedia(html).replace");
      } else if(name==="aura.js")source=source
        .replace('renderSection, safeImage, policyTitle','renderSection, safeImage as realSafeImage, policyTitle')
        .replace('const esc =','const safeImage = (url) => /^\\/__example-media\\/[a-z0-9-]+\\.webp$/.test(String(url || "")) ? String(url) : realSafeImage(url);\nconst esc =')
        .replace('from "./aura-sections.js"','from "/__example-module/aura-sections.js"')
        .replaceAll('from "./','from "/assets/');
      else if(name==="aura-sections.js")source=source
        .replace('export const safeImage = (u) =>','export const safeImage = (u) => /^\\/__example-media\\/[a-z0-9-]+\\.webp$/.test(String(u || "")) ? String(u) :')
        .replaceAll('from "./','from "/assets/');
      else source=source.replace('from "/assets/aura.js"','from "/__example-module/aura.js"');
      return new Response(request.method==="HEAD"?null:source,{headers:{...exampleHeaders,"content-type":"text/javascript; charset=utf-8"}});
    }
    if(original.pathname==="/__editor-preview"){
      if(!["GET","HEAD"].includes(request.method))return new Response("Preview route is read-only",{status:405});
      const data=exampleFixture();data.role="owner";data.aura_skeleton_enabled=true;
      data.layouts=defaultPageLayouts(data);
      data.page_versions=Object.fromEntries(Object.keys(data.layouts).map(key=>[key,{version:1}]));
      return new Response(request.method==="HEAD"?null:renderEditor(data,{name:"Example reviewer",email:"example@example.invalid"}).replace('src="/assets/editor.js"', 'src="/__example-module/editor.js"'),{
        headers:{...exampleHeaders,"content-type":"text/html; charset=utf-8"}
      });
    }
    if (original.pathname === "/__aura-skeleton-preview") {
      if (!["GET", "HEAD"].includes(request.method)) return new Response("Preview route is read-only", { status: 405 });
      const data = exampleFixture();
      const page = ["home", "collection", "product", "cart", "checkout"].includes(original.searchParams.get("page")) ? original.searchParams.get("page") : "home";
      data.layouts = starterLayouts(data);
      return new Response(request.method === "HEAD" ? null : exampleMedia(renderAura(data, {
        page, productId: data.products[0]?.id, preview: true, readOnly: true, commerce: true,
      })), { headers: { ...exampleHeaders, "content-type": "text/html; charset=utf-8" } });
    }
    if(original.pathname==="/__stonescence-aura-preview"){
      if(!["GET","HEAD"].includes(request.method))return new Response("Public-content preview is read-only",{status:405});
      const data=structuredClone(publicStonescence);data.layouts=defaultPageLayouts(data);
      return new Response(request.method==="HEAD"?null:renderAura(data,{page:"home",preview:true,readOnly:true}),{
        headers:{...exampleHeaders,"content-type":"text/html; charset=utf-8"}
      });
    }
    if(original.pathname.startsWith("/__example-preview/")){
      if(!["GET","HEAD"].includes(request.method))return new Response("Example store is read-only",{status:405});
      const view=original.pathname.split("/").pop(),data=exampleFixture();
      const preset=original.searchParams.get("preset"),font=original.searchParams.get("font");
      if(["ivory","stone","midnight","white"].includes(preset))data.settings.color_preset=preset;
      if(["serif","modern","classic"].includes(font))data.settings.font_preset=font;
      const banner='<p role="status" style="margin:0;padding:7px 16px;text-align:center;font:12px system-ui;background:#f6f3ee;color:#214a3d">Example store. Fictional brand and customers. Generated demo product photography.</p>';
      let body;
      if(view==="premium-store"){
        body=renderPremiumStore(data);
      }else if(view==="premium-checkout"){
        body=exampleMedia(renderAura(data,{page:"checkout",commerce:true,preview:true,readOnly:false,storeKey:EXAMPLE_STORE_ID}));
        body=body.replace("</head>",`<style>
          :root{--accent:#692b43;--accent-ink:#f6eee7;--accent-label:#692b43;--ink:#35282e;--muted:#776b6e;--paper:#f2eee7;--line:#d9cec6;--serif:"Playfair Display",Georgia,serif;--sans:"DM Sans",system-ui,sans-serif;--radius:0}
          body{background:#f2eee7;color:#35282e;font-family:"DM Sans",system-ui,sans-serif}
          .aura-header{height:76px;max-width:none;padding:0 max(24px,calc((100vw - 1180px)/2));border-bottom:1px solid #d9cec6}
          .aura-header nav,.aura-header-actions{display:none}
          .aura-brand{font:500 24px "Playfair Display",Georgia,serif;letter-spacing:-.04em}
          .aura-brand:after{content:"Fictional store concept";margin-left:14px;color:#8d706f;font:9px "DM Sans",sans-serif;letter-spacing:.12em;text-transform:uppercase}
          .aura-page,.commerce-main{max-width:1160px;margin:0 auto;padding:62px 28px 100px}
          .commerce-heading h1,.commerce-heading h2{color:#462834;font-family:"Playfair Display",Georgia,serif;font-weight:400;letter-spacing:-.055em}
          .commerce-heading h1{font-size:clamp(48px,7vw,78px)}
          .commerce-kicker{color:#9a514d;letter-spacing:.17em}
          .commerce-panel,.commerce-summary{border-color:#d9cec6;background:#faf7f1;box-shadow:0 12px 35px rgba(69,39,48,.045)}
          .commerce-button{border:0;border-radius:0;background:#692b43;color:#f6eee7;font-family:"DM Sans",sans-serif;letter-spacing:.1em;text-transform:uppercase}
          .commerce-button:disabled{background:#b4a4a1;color:#f6eee7;cursor:not-allowed}
          .commerce-field input,.commerce-field select{border-color:#d5c8c0;border-radius:0;background:#fffdfa}
          .commerce-footer,.aura-footer{display:none}
          .ps-checkout-bar{margin:0;padding:11px 18px;background:#692b43;color:#f6eee7;text-align:center;font:10px "DM Sans",sans-serif;letter-spacing:.08em}
          .ps-checkout-head{height:76px;padding:0 max(24px,calc((100vw - 1180px)/2));display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #d9cec6}
          .ps-checkout-head a{font:500 24px "Playfair Display",Georgia,serif;letter-spacing:-.04em;text-decoration:none}
          .ps-checkout-head i{color:#a45846;font-weight:400}
          .ps-checkout-head span{color:#8d706f;font:9px "DM Sans",sans-serif;letter-spacing:.12em;text-transform:uppercase}
          .ps-checkout-return{color:#692b43!important;font:10px "DM Sans",sans-serif!important;letter-spacing:.12em!important;text-transform:uppercase}
          @media(max-width:600px){.aura-header{height:65px;padding:0 20px}.aura-page,.commerce-main{padding:40px 20px 70px}.ps-checkout-head{height:65px;padding:0 20px}.ps-checkout-head a{font-size:21px}.ps-checkout-head span{font-size:8px}}
        </style></head>`)
          .replace(/<header class="aura-header">[\s\S]*?<\/header>/,`<p class="ps-checkout-bar">Example Studio checkout concept. Totals use the shared GST quote. Order placement is disabled.</p><header class="ps-checkout-head"><a href="/__example-preview/premium-store">Example <i>Studio</i></a><a class="ps-checkout-return" href="/__example-preview/premium-store#collection">Return to collection</a></header>`)
          .replace(/<footer class="aura-footer">[\s\S]*?<\/footer>/,"")
          .replace(/<button class="commerce-button commerce-submit" type="submit">[\s\S]*?<\/button>/,'<button class="commerce-button commerce-submit" type="button" disabled aria-disabled="true">Preview only. No orders</button>')
          .replace("</body>",`<script>
            const exampleSubmit=document.querySelector(".commerce-submit");
            if(exampleSubmit){
              const keepExampleSubmitDisabled=()=>{if(!exampleSubmit.disabled){exampleSubmit.disabled=true;exampleSubmit.setAttribute("aria-disabled","true");}};
              new MutationObserver(keepExampleSubmitDisabled).observe(exampleSubmit,{attributes:true,attributeFilter:["disabled"]});
            }
          </script></body>`);
      }else if(view==="store"){
        body=exampleMedia(renderAura(data,{preview:true,commerce:true,readOnly:true}));
      }else if(["collection","product","cart"].includes(view)){
        body=exampleMedia(renderAura(data,{page:view,productId:data.products[0]?.id,preview:true,commerce:true,readOnly:true}));
      }else if(view==="confirmation"){
        body=exampleMedia(renderAura(data,{page:"confirmation",commerce:true,readOnly:true,order:data.orders[0]}));
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
      if(!["composite","premium-store","premium-checkout"].includes(view))body=body.replace(/<body([^>]*)>/,`<body$1>${banner}`);
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
    const forwarded = account ? previewAccountRequest(request, target.href, env) : new Request(target.href, request);
    if (!forwarded) return Response.json({ error: "This request did not come from this preview website." }, { status: 403 });
    let workerEnv;
    try { workerEnv = livePreviewEnv(env); }
    catch { return Response.json({ error: "The live preview connection is not configured." }, { status: 503 }); }
    const response = await worker.fetch(forwarded, workerEnv, ctx);
    const headers = new Headers(response.headers);
    // Allow only the development preview iframe to display the static pages.
    headers.delete("x-frame-options");
    headers.set("content-security-policy", headers.get("content-security-policy")?.replace("frame-ancestors 'none'", "frame-ancestors *") ?? "default-src 'self'");
    livePreviewHeaders(headers, env);
    if (response.status === 303 && headers.get("location") === "/") headers.set("location", "/dashboard");
    headers.set("x-robots-tag", "noindex, nofollow");
    if (!headers.get("content-type")?.includes("text/html")) {
      headers.set("cache-control", "no-store");
      return new Response(response.body, { status: response.status, headers });
    }
    // Production marketing HTML is cached for five minutes. Local development
    // must not reuse old markup after edits or workflow restarts.
    headers.set("cache-control", "no-store");
    let body = await response.text();
    if (account && isLivePreview(env)) body = body.replace(/<body([^>]*)>/,
      '<body$1><aside role="status" style="padding:10px 16px;background:#f7e7cf;color:#452416;font:13px/1.5 sans-serif;text-align:center">Live database preview. Saves and publishing affect real stores. Media uploads are local and are not available on live storefronts.</aside>');
    if (account) body = body.replaceAll('href="/"', 'href="/dashboard"');
    body = body.replaceAll('href="https://lebrands.store"', 'href="/"')
      .replaceAll("https://app.lebrands.store", "").replaceAll("https://lebrands.store", "");
    return new Response(body, { status: response.status, headers });
  },
};
