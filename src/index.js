import { RESERVED_SUBDOMAINS } from "./reserved.js";
import { createDb } from "./db.js";
import { handleAccounts } from "./auth/routes.js";
import { SECURITY_HEADERS } from "./auth/security.js";
import { renderHome, renderLegal } from "./ui/home.js";
import { FAVICON_SVG } from "./ui/favicon.js";
import { serveMedia } from "./store/media.js";
import { serveStorefront } from "./store/live.js";

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
      h1 { margin: 0; font-size: clamp(34px, 8vw, 60px); line-height: 1.04; letter-spacing: -.045em; overflow-wrap: anywhere; }
      .message { margin: 20px 0 0; color: #5d6861; font-size: clamp(16px, 3vw, 20px); line-height: 1.6; }
      @media (max-width: 480px) { body { padding: 16px; } main { border-radius: 16px; } .brand { margin-bottom: 32px; } }
    </style>
  </head>
  <body>
    <main>
      ${showBrand ? '<p class="brand">LeBrands.Store</p>' : ""}
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
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const hostname = url.hostname;
    if (hostname === "media.lebrands.store") return serveMedia(request, env);
    if (url.pathname.startsWith("/assets/")) {
      if (!["GET", "HEAD"].includes(request.method)) return new Response("Method not allowed", { status: 405 });
      const filename = url.pathname.slice("/assets/".length);
      if (!["aura.js", "validation.js", "wizard.js", "wizard.css", "commerce-rules.js", "commerce.js", "commerce.css", "commerce-view.js"].includes(filename)) return new Response("Not found", { status: 404 });
      if (!env.ASSETS) return new Response("Assets unavailable", { status: 503 });
      url.pathname = `/${filename}`;
      const asset = await env.ASSETS.fetch(new Request(url, request));
      const headers = new Headers(asset.headers);
      headers.set("cache-control", "no-cache");
      headers.set("x-content-type-options", "nosniff");
      return new Response(asset.body, { status: asset.status, headers });
    }
    if (["GET", "HEAD"].includes(request.method) && url.pathname === "/favicon.svg" && ["lebrands.store", "app.lebrands.store"].includes(hostname)) {
      return new Response(FAVICON_SVG, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" } });
    }
    if (hostname === "www.lebrands.store") {
      url.hostname = "lebrands.store";
      url.protocol = "https:";
      url.port = "";
      return new Response(null, { status: 308, headers: { location: url.href } });
    }
    if (hostname === "app.lebrands.store") return handleAccounts(request, env, ctx);
    if (hostname === "lebrands.store") {
      if (!["GET", "HEAD"].includes(request.method)) return page("Method not allowed", "Method not allowed", "", 405);
      const legal = { "/terms": "terms", "/privacy": "privacy", "/contact": "contact" };
      if (url.pathname !== "/" && !legal[url.pathname]) return notFound();
      return new Response(url.pathname === "/" ? renderHome() : renderLegal(legal[url.pathname]), {
        headers: { ...SECURITY_HEADERS, "cache-control": "public, max-age=300", "content-type": "text/html; charset=utf-8" },
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
      if (storefront) return storefront;
      // Legacy live stores without a wizard publication retain their landing.
      // Draft content is never used as a public fallback.
      return page(
        `${store.name} | LeBrands.Store`,
        store.name,
        "This store is coming soon.",
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