import { RESERVED_SUBDOMAINS } from "./reserved.js";

const ROOT_DOMAIN = ".lebrands.store";
const PLATFORM_HOSTS = new Set(["lebrands.store", "www.lebrands.store"]);
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
  fetch(request) {
    const hostname = new URL(request.url).hostname;

    if (PLATFORM_HOSTS.has(hostname)) {
      return page(
        "LeBrands.Store",
        "LeBrands.Store",
        "— Stores for India's D2C brands. Coming soon.",
        200,
        false,
      );
    }

    if (!hostname.endsWith(ROOT_DOMAIN)) {
      return notFound();
    }

    const subdomain = hostname.slice(0, -ROOT_DOMAIN.length);
    if (
      !STORE_NAME_PATTERN.test(subdomain) ||
      RESERVED_SUBDOMAINS.includes(subdomain)
    ) {
      return notFound();
    }

    return page(
      `${subdomain} | LeBrands.Store`,
      subdomain,
      "This store is coming soon.",
    );
  },
};