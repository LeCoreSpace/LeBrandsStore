// Development-only adapter. Production always uses src/index.js.
// No database binding, credential, simulated account, or persistent data.
import worker from "./index.js";

export default {
  async fetch(request, env, ctx) {
    const original = new URL(request.url);
    const account = ["/signup", "/login", "/forgot-password", "/account", "/logout", "/dashboard", "/stores/new", "/api/subdomain-check"]
      .includes(original.pathname);
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
