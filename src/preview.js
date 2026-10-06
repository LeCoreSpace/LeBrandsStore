// Development-only adapter. Production always uses src/index.js.
// No database binding, credential, simulated account, or persistent data.
import worker from "./index.js";
import { renderWizard } from "./ui/wizard.js";
import { renderAura } from "./public/aura.js";
import { DEFAULT_SETTINGS } from "./store/repository.js";
import { SECURITY_HEADERS } from "./auth/security.js";

export default {
  async fetch(request, env, ctx) {
    const original = new URL(request.url);
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
      .includes(original.pathname) || original.pathname.startsWith("/api/stores/") || /^\/stores\/[^/]+\/setup$/.test(original.pathname);
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
