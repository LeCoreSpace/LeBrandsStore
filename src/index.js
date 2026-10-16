import { RESERVED_SUBDOMAINS } from "./reserved.js";
import { isStarterImage } from "./public/aura-starter-assets.js";
import { isShowcaseImage } from "./public/aura-showcase-assets.js";
import { createDb } from "./db.js";
import { handleAccounts } from "./auth/routes.js";
import { SECURITY_HEADERS } from "./auth/security.js";
import { renderHome, renderLegal } from "./ui/home.js";
import { renderPricing } from "./ui/marketing.js";
import { FAVICON_SVG, FAVICON_CSP } from "./ui/favicon.js";
import { SECTION_SCHEMAS } from "./public/aura-layout.js";
import { LE_BRANDS_LOGO } from "./ui/brand.js";
import { serveMedia } from "./store/media.js";
import {processEmailMessage,schedulePendingEmails} from "./email/worker.js";
import {handleEmailWebhook} from "./email/webhook.js";
import { serveStorefront } from "./store/live.js";
import { CRAWLER_FILES, serveCrawlerFile } from "./crawler-files.js";
import { processAiMessage } from "./ai/worker.js";
import { scheduleCommerce } from "./connections/jobs.js";
import { razorpayWebhook } from "./connections/payments.js";

const ROOT_DOMAIN = ".lebrands.store";
const STORE_NAME_PATTERN = /^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])$/;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function page(title, heading, message, status = 200, showBrand = true) {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#f7f5f1">
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f7f5f1; color: #17211d; }
      * { box-sizing: border-box; }
      body { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 24px; }
      main { width: min(100%, 680px); padding: clamp(32px, 8vw, 72px); border: 1px solid #e4e0d8; border-radius: 20px; background: #fffefa; box-shadow: 0 24px 80px rgb(23 33 29 / 7%); }
      .brand { margin: 0 0 42px; color: #557064; font-size: 13px; font-weight: 700; letter-spacing: .13em; text-transform: uppercase; }
      .brand .lb-logo-img { display: block; width: 220px; max-width: 100%; height: auto; }
      h1 { margin: 0; font-size: clamp(34px, 8vw, 60px); line-height: 1.04; letter-spacing: -.045em; overflow-wrap: anywhere; }
      .message { margin: 20px 0 0; color: #5d6861; font-size: clamp(16px, 3vw, 20px); line-height: 1.6; }
      @media (max-width: 480px) { body { padding: 16px; } main { border-radius: 16px; } .brand { margin-bottom: 32px; } }
    </style>
  </head>
  <body>
    <main>
      ${showBrand ? `<p class="brand">${LE_BRANDS_LOGO.replace('src="/img/', 'src="https://lebrands.store/img/')}</p>` : ""}
      <h1>${escapeHtml(heading)}</h1>
      ${message ? `<p class="message">${escapeHtml(message)}</p>` : ""}
    </main>
  </body>
</html>`;

  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}

function notFound() {
  return page("Store not found | LeBrands.Store", "Store not found", "This address is not available.", 404);
}

export default {
  async queue(batch,env){
    for(const message of batch.messages){
      try{
        if(message.body?.type==="ai")await processAiMessage(message.body,env);
        else await processEmailMessage(message.body,env);
        message.ack();
      }catch{message.retry({delaySeconds:Math.min(900,10*2**Math.min(message.attempts||1,6))});}
    }
  },
  async scheduled(event,env,ctx){ctx.waitUntil(schedulePendingEmails(env));ctx.waitUntil(scheduleCommerce(env));},
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const hostname = url.hostname;
    if(hostname==="app.lebrands.store"&&url.pathname==="/webhooks/resend")return handleEmailWebhook(request,env);
    const paymentWebhook=hostname==="app.lebrands.store" && url.pathname.match(/^\/webhooks\/razorpay\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/);
    if(paymentWebhook){
      const webhookDb=createDb(env);
      try{return await razorpayWebhook(request,env,webhookDb,paymentWebhook[1]);}
      finally{ctx.waitUntil(webhookDb.close());}
    }
    if (hostname === "media.lebrands.store") return serveMedia(request, env);
    if (url.pathname.startsWith("/assets/")) {
      if (!["GET", "HEAD"].includes(request.method)) return new Response("Method not allowed", { status: 405 });
      const filename = url.pathname.slice("/assets/".length);
      const showcaseAsset = ["ann-reply-fields.js","ann-section-layout.js","ann-onboarding-ui.js","ann-theme-editor.js","ann-branding-ui.js","ann-browser-preview.js","aura-showcase-interactions.js","aura-showcase-profiles.js","aura-showcase-sections.js","aura-showcase-rich-css.js","aura-conversion-styles.js","ann-design-model.js","ann-design-ui.js","aura-design.js"].includes(filename);
      const starterAsset = isStarterImage(url.pathname) || isShowcaseImage(url.pathname) || showcaseAsset || ["aura-taxonomy.js","aura-taxonomy-data.js","aura-starters.js","aura-starter-data.js","aura-starter-assets.js"].includes(filename);
      const builderAsset = ["builder-choice.css","aura-styles.js","aura-styles.css","aura-extra-styles.css","aura-motion.js","aura-showcase-assets.js","aura-showcase.js","aura-showcase.css","ann-config.js","ann-builder.js","ann-builder.css","ann-projection.js","ann-category-copy.js","ann-application-ui.js","ann-readiness-ui.js","ann-launch-ui.js","ann-products-ui.js","ann-money.js","style-demo-copy.js","style-preview.js","style-preview-interactions.js","style-studio.js","style-studio.css"].includes(filename);
      const sectionAsset = ["sections/index.js", "sections/schema-helpers.js"].includes(filename) || Object.keys(SECTION_SCHEMAS).some(type => filename === `sections/${type}.schema.js`);
      if (!sectionAsset && !starterAsset && !builderAsset && !["ai-builder.js","ai-builder-prefill.js","ai-builder.css","catalog-page.js","content-form.js","catalog-content.js","account-home.css","editor.js","editor.css","editor-state.js","gstin-ui.js","aura.js", "aura.css", "aura-sections.js", "aura-layout.js", "aura-skeleton.js", "aura-ui.js", "aura-upload.js", "aura-editorial.ttf", "aura-classic.ttf", "validation.js", "wizard.js", "wizard.css", "commerce-rules.js", "commerce.js", "commerce.css", "commerce-view.js", "dashboard.js", "dashboard.css", "dashboard-rules.js", "dashboard-view-model.js", "marketing.css", "marketing.js", "legal.css", "instrument-sans-latin.woff2"].includes(filename)) return new Response("Not found", { status: 404 });
      if (!env.ASSETS) return new Response("Assets unavailable", { status: 503 });
      url.pathname = `/${filename}`;
      const asset = await env.ASSETS.fetch(new Request(url, request));
      const headers = new Headers(asset.headers);
      headers.set("cache-control", "no-cache");
      headers.set("x-content-type-options", "nosniff");
      return new Response(asset.body, { status: asset.status, headers });
    }
    if (["GET", "HEAD"].includes(request.method) && ["/favicon.svg", "/favicon.ico"].includes(url.pathname) && ["lebrands.store", "app.lebrands.store"].includes(hostname)) {
      if (url.pathname === "/favicon.svg") {
        return new Response(request.method === "HEAD" ? null : FAVICON_SVG, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400", "content-security-policy": FAVICON_CSP, "x-content-type-options": "nosniff" } });
      }
      if (!env.ASSETS) return new Response("Favicon asset unavailable", { status: 503 });
      const iconUrl = new URL(url);
      iconUrl.pathname = "/img/REPLACE-lebrands-favicon.ico";
      iconUrl.search = "";
      const icon = await env.ASSETS.fetch(new Request(iconUrl, { method: request.method }));
      const headers = new Headers(icon.headers);
      headers.set("content-type", "image/x-icon");
      headers.set("cache-control", icon.ok ? "public, max-age=86400" : "no-store");
      return new Response(request.method === "HEAD" ? null : icon.body, { status: icon.status, headers });
    }
    if (hostname === "www.lebrands.store") {
      url.hostname = "lebrands.store";
      url.protocol = "https:";
      url.port = "";
      return new Response(null, { status: 308, headers: { location: url.href } });
    }
    // Platform artwork is public on the account host as well as marketing.
    // Keep this narrow: it must not expose arbitrary files or merchant media.
    if (hostname === "app.lebrands.store" && /^\/img\/REPLACE-lebrands-(?:light-transparent\.(?:webp|png)|dark-transparent\.webp|hero-transparent\.png|mark\.png|apple-touch-icon\.png)$/.test(url.pathname)) {
      if (!["GET", "HEAD"].includes(request.method)) return new Response("Method not allowed", { status: 405 });
      if (!env.ASSETS) return new Response("Assets unavailable", { status: 503 });
      const asset = await env.ASSETS.fetch(request);
      const headers = new Headers(asset.headers);
      headers.set("cache-control", asset.ok ? "public, max-age=86400" : "no-store");
      headers.set("x-content-type-options", "nosniff");
      return new Response(request.method === "HEAD" ? null : asset.body, { status: asset.status, headers });
    }
    if (hostname === "app.lebrands.store" && url.pathname === "/robots.txt") return serveCrawlerFile(request, env, true);
    if (hostname === "app.lebrands.store"){
      const response=await handleAccounts(request,env,ctx);
      if(request.method==="POST"&&response.status<400&&env.AI_BUILD_QUEUE)ctx?.waitUntil(schedulePendingEmails(env));
      return response;
    }
    if (hostname === "lebrands.store") {
      if (Object.hasOwn(CRAWLER_FILES, url.pathname)) return serveCrawlerFile(request, env);
      if (!["GET", "HEAD"].includes(request.method)) return page("Method not allowed", "Method not allowed", "", 405);
      if (url.pathname.startsWith("/img/")) {
        if(!/^\/img\/(?:stonescence-(?:desktop-(?:640|1200)|mobile-(?:260|390))\.webp|REPLACE-[a-z0-9-]+\.(?:jpg|webp|avif|png|webm|mp4))$/.test(url.pathname))return notFound();
        if(!env.ASSETS)return new Response("Assets unavailable",{status:503});
        const asset=await env.ASSETS.fetch(request);
        const headers=new Headers(asset.headers);
        headers.set("cache-control","public, max-age=86400");
        headers.set("x-content-type-options","nosniff");
        return new Response(request.method==="HEAD"?null:asset.body,{status:asset.status,headers});
      }
      const legal = { "/terms": "terms", "/privacy": "privacy", "/contact": "contact", "/support": "support", "/refund-policy":"refund-policy" };
      if (url.pathname !== "/" && url.pathname!=="/pricing" && !legal[url.pathname]) return notFound();
      const marketing=url.pathname==="/" || url.pathname==="/pricing";
      const headers={ ...SECURITY_HEADERS, "cache-control": "public, max-age=300", "content-type": "text/html; charset=utf-8" };
      if(marketing)headers["content-security-policy"]=headers["content-security-policy"].replace("font-src https://fonts.gstatic.com","font-src 'self' https://fonts.gstatic.com")+"; media-src 'self'";
      return new Response(request.method==="HEAD"?null:url.pathname === "/" ? renderHome() : url.pathname==="/pricing"?renderPricing():renderLegal(legal[url.pathname]), {
        headers,
      });
    }

    if (hostname.endsWith(ROOT_DOMAIN)) {
      const subdomain = hostname.slice(0, -ROOT_DOMAIN.length);
      if (
        !STORE_NAME_PATTERN.test(subdomain) ||
        RESERVED_SUBDOMAINS.includes(subdomain)
      ) {
        return notFound();
      }
    }

    let db;
    try {
      db = createDb(env);
      const store = await db.resolveStore(hostname);
      if (!store || store.status !== "live") return notFound();
      const storefront = await serveStorefront(request, db, store, env);
      if (storefront) {
        if(request.method==="POST"&&storefront.status<400&&env.AI_BUILD_QUEUE)ctx?.waitUntil(schedulePendingEmails(env));
        return storefront;
      }
      // Legacy live stores without a wizard publication retain their landing.
      // Draft content is never used as a public fallback.
      return page(
        `${store.name} | LeBrands.Store`,
        store.name,
        "The store catalogue is not available.",
      );
    } catch (error) {
      // Log a diagnostic code, never raw errors (which may contain credentials).
      console.error("Store lookup failed", { hostname, code: error?.code ?? "UNKNOWN_DATABASE_ERROR" });
      return page(
        "Store temporarily unavailable | LeBrands.Store",
        "Store temporarily unavailable",
        "Please try again later.",
        503,
      );
    } finally {
      if (db) {
        const cleanup = db.close().catch(() => {
          console.error("Database connection cleanup failed");
        });
        if (ctx?.waitUntil) ctx.waitUntil(cleanup);
        else await cleanup;
      }
    }
  },
};