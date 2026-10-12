import { ACCOUNT_ROBOTS } from "./ui/platform-seo.js";

export const CRAWLER_FILES = {
  "/sitemap.xml": "application/xml; charset=utf-8",
  "/llms.txt": "text/plain; charset=utf-8",
  "/robots.txt": "text/plain; charset=utf-8",
};

export async function serveCrawlerFile(request, env, account = false) {
  if (!["GET", "HEAD"].includes(request.method)) {
    return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });
  }
  const url = new URL(request.url);
  const headers = new Headers({
    "content-type": CRAWLER_FILES[url.pathname],
    "cache-control": "public, max-age=3600",
    "x-content-type-options": "nosniff",
  });
  if (account) return new Response(request.method === "HEAD" ? null : ACCOUNT_ROBOTS, { headers });
  if (!env.ASSETS) return new Response("Crawler file unavailable", { status: 503, headers: { "cache-control": "no-store" } });
  url.search = "";
  const asset = await env.ASSETS.fetch(new Request(url, { method: request.method }));
  if (!asset.ok) return new Response("Crawler file unavailable", { status: asset.status, headers: { "cache-control": "no-store" } });
  return new Response(request.method === "HEAD" ? null : asset.body, { headers });
}
