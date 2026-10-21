import { escapeHtml } from "./layout.js";
import { documentPage } from "./dashboard.js";

const esc = escapeHtml;
const list = v => Array.isArray(v) ? v : [];
const safeJson = v => JSON.stringify(v ?? {}).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
const head = '<link rel="stylesheet" href="/assets/store-discovery.css"><script type="module" src="/assets/store-discovery.js"></script>';
const safeHttps = v => { try { const u = new URL(String(v || "")); return u.protocol === "https:" ? u.href : ""; } catch { return ""; } };

export function discoveryFile(f, i) {
  const status = String(f.status || "generated");
  const redirect = status === "redirect" || !!f.location;
  const url = safeHttps(f.url);
  const content = String(f.content ?? "");
  return `<article class="lbd-file" data-file="${i}"><header><div><h2>${esc(f.name || f.path || "File")}</h2><code>${esc(f.path || "")}</code></div><span class="lbd-tag" data-kind="${redirect ? "redirect" : "ok"}">${redirect ? "Redirect" : "Generated"}</span></header>
    ${redirect ? `<p class="lbd-note">This path redirects${f.location ? ` to <code>${esc(f.location)}</code>` : ""}. Visitors and crawlers are sent there.</p>` : ""}
    ${f.content_type ? `<p class="lbd-meta">Content type: ${esc(f.content_type)}</p>` : ""}
    <pre class="lbd-pre" tabindex="0" aria-label="${esc(f.name || "File")} contents">${esc(content) || "This file is empty."}</pre>
    <div class="lbd-actions"><button type="button" class="lb-button lb-button-small lb-button-outline" data-copy="${i}">Copy contents</button>${url ? `<a class="lb-button lb-button-small lb-button-outline" href="${esc(url)}" target="_blank" rel="noopener">Open public file</a>` : ""}</div></article>`;
}

export function renderStoreDiscovery(data = {}, user) {
  const store = data.store || {};
  const sid = String(store.store_id || "");
  const files = list(data.files);
  const heading = `<div class="lb-page-heading"><div><h1>Content for LLM</h1><p>Review the discovery files generated for your storefront. They are read only and update from your published store.</p></div><div class="lb-heading-actions"><button type="button" class="lb-button lb-button-outline" data-refresh>Refresh</button></div></div>`;
  let inner;
  if (data.available === false) inner = `<section class="lb-empty" role="alert"><h2>Discovery files are not available yet</h2><p>This feature is not ready for your store. Your dashboard is unaffected.</p></section>`;
  else if (data.published === false) inner = `<section class="lb-empty"><span class="lb-empty-mark" aria-hidden="true"></span><h2>Your store is not published</h2><p>No public discovery files are served until the store is published. Publish your store, then refresh this page.</p></section>`;
  else inner = `<p class="lbd-disclaimer">These files describe your public pages. They do not guarantee search ranking or that any AI system will read or follow them. The llms.txt format is a community proposal, not an enforced standard.</p>
    <div data-files>${files.length ? files.map(discoveryFile).join("") : `<section class="lb-empty"><h2>No files returned</h2><p>Refresh to try again.</p></section>`}</div>
    ${data.has_more_sitemaps ? `<p class="lbd-note">Your store has more sitemap shard files than are shown here. Open the sitemap index to see them all.</p>` : ""}`;
  const body = `<div class="lbd" data-discovery-root>${heading}<p class="lbd-status" role="status" data-status hidden></p><div data-body>${inner}</div><script type="application/json" id="discovery-data">${safeJson({ storeId: sid, files: files.map(f => ({ content: String(f.content ?? "") })) })}</script></div>`;
  const shards=Number(data.sitemap_shards);
  const shardPicker=Number.isSafeInteger(shards)&&shards>1?`<section class="lbd"><form class="lbd-file" action="/stores/${encodeURIComponent(sid)}/content-llm" method="get"><h2>Sitemap files</h2><p>Your sitemap index links to ${shards} complete shard files. Choose a shard to inspect its contents here.</p><label>Sitemap shard <input type="number" name="shard" min="1" max="${shards}" value="1" required></label><button class="lb-button" type="submit">View shard</button></form></section>`:"";
  return documentPage("content-llm", data, user, body+shardPicker, head);
}
