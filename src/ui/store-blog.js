import { escapeHtml, layout } from "./layout.js";
import { documentPage } from "./dashboard.js";
import {safeBlogHref} from "../blog/input.js";

const esc = escapeHtml;
const list = v => Array.isArray(v) ? v : [];
const safeJson = v => JSON.stringify(v ?? {}).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
const head = '<link rel="stylesheet" href="/assets/store-blog.css"><script type="module" src="/assets/store-blog.js"></script>';
const when = v => { const d = new Date(v); return Number.isNaN(d.getTime()) ? "Not recorded" : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }); };
const safeMediaUrl = v => { try { const u = new URL(String(v || ""), "https://app.lebrands.store"); return u.protocol === "https:" || String(v).startsWith("/") ? String(v) : ""; } catch { return ""; } };

export function renderStoreBlog(data = {}, user) {
  const store = data.store || {};
  const sid = String(store.store_id || "");
  const base = `/stores/${encodeURIComponent(sid)}/blog`;
  const heading = (actions = "") => `<div class="lb-page-heading"><div><h1>Blog</h1><p>Write and refine drafts for your store. Drafts are private. Publishing arrives in a later release.</p></div>${actions}</div>`;
  if (data.available === false) {
    return documentPage("blog", data, user, `${heading()}<section class="lb-empty lbb-unavailable" role="alert"><h2>Blog drafts are not available yet</h2><p>The blog database update has not been applied to this store, so drafts cannot be saved. The rest of your dashboard is unaffected. Try again after the update is live.</p><a class="lb-button lb-button-outline" href="${base}">Check again</a></section>`, head);
  }
  const canEdit = ["owner", "admin", "editor"].includes(data.role);
  const articles = list(data.articles);
  const offset = Math.max(0, Number.parseInt(data.list_offset, 10) || 0);
  const boot = { storeId: sid, base, role: data.role || "", canEdit, article: data.article || null, media: list(data.media), products: list(data.products), articles };
  const rows = articles.length ? `<ul class="lbb-list">${articles.map(a => `<li><a class="lbb-row" href="${base}/${encodeURIComponent(a.id)}"><span class="lbb-row-main"><strong>${esc(a.title || "Untitled draft")}</strong><small>${esc(a.summary || "No summary yet")}</small></span><span class="lbb-row-meta"><span class="lbb-tag">Draft</span><small>Updated ${esc(when(a.updated_at))}</small></span></a></li>`).join("")}</ul>`
    : `<section class="lb-empty lbb-empty"><span class="lb-empty-mark" aria-hidden="true"></span><h2>No drafts yet</h2><p>Start an article about a launch, a care guide or the story behind your products. Nothing is public until you publish.</p>${canEdit ? `<a class="lb-button" href="${base}/new">Write your first draft</a>` : ""}</section>`;
  const body = `<div class="lbb" data-blog-root>
    <div data-blog-list ${data.article ? "hidden" : ""}>${heading(canEdit ? `<div class="lb-heading-actions"><a class="lb-button" href="${base}/new" data-blog-new>New draft</a></div>` : "")}${rows}${(offset > 0 || data.has_more === true) ? `<nav class="lbb-pager" aria-label="Draft pages"><span>Showing ${articles.length ? offset + 1 : 0} to ${offset + articles.length}. 200 articles per page.</span><span class="lbb-pager-links">${offset > 0 ? `<a class="lb-button lb-button-outline lb-button-small" href="${base}?offset=${Math.max(0, offset - 200)}" rel="prev">Previous</a>` : ""}${data.has_more === true ? `<a class="lb-button lb-button-outline lb-button-small" href="${base}?offset=${offset + 200}" rel="next">Next</a>` : ""}</span></nav>` : ""}</div>
    <div data-blog-editor ${data.article ? "" : "hidden"}><div class="lb-skeleton" aria-label="Loading editor"><i></i><i></i></div></div>
    <script type="application/json" id="blog-data">${safeJson(boot)}</script></div>`;
  return documentPage("blog", data, user, body, head);
}

function sectionHtml(s, media, products, storeOrigin) {
  const type = String(s.type || "text");
  const h = s.heading ? `<h2>${esc(s.heading)}</h2>` : "";
  const paras = t => String(t || "").split(/\n{2,}/).map(p => p.trim()).filter(Boolean).map(p => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  const m = s.media_id ? media.get(String(s.media_id)) : null;
  const img = m && safeMediaUrl(m.url) ? `<figure class="lbbp-fig"><img src="${esc(safeMediaUrl(m.url))}" alt="${esc(s.alt || m.alt || "")}" loading="lazy">${s.alt ? `<figcaption>${esc(s.alt)}</figcaption>` : ""}</figure>` : "";
  if (type === "image") return `<section class="lbbp-sec">${h}${img}${paras(s.body)}</section>`;
  if (type === "image_text") return `<section class="lbbp-sec lbbp-split">${img}<div>${h}${paras(s.body)}</div></section>`;
  if (type === "quote") return `<section class="lbbp-sec"><blockquote>${paras(s.body)}${s.heading ? `<cite>${esc(s.heading)}</cite>` : ""}</blockquote></section>`;
  if (type === "product") { const p = products.get(String(s.product_id || "")); return `<section class="lbbp-sec lbbp-product">${h}${paras(s.body)}<div class="lbbp-pcard"><small>Featured product</small><strong>${esc(p ? p.name : "Product no longer available")}</strong></div></section>`; }
  if (type === "faq") {
    const blocks = String(s.body || "").split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
    return `<section class="lbbp-sec">${h}<dl class="lbbp-faq">${blocks.map(b => { const [q, ...a] = b.split("\n"); return `<div><dt>${esc(q)}</dt><dd>${esc(a.join(" ")).trim()}</dd></div>`; }).join("")}</dl></section>`;
  }
  if (type === "cta") { const safe = safeBlogHref(s.href), href = safe.startsWith("/") ? (storeOrigin ? storeOrigin + safe : "") : safe; return `<section class="lbbp-sec lbbp-cta">${h}${paras(s.body)}${href ? `<a class="lbbp-btn" href="${esc(href)}" rel="noopener noreferrer nofollow" target="_blank">${esc(s.heading || "Learn more")}</a>` : ""}</section>`;
  }
  return `<section class="lbbp-sec">${h}${paras(s.body)}</section>`;
}

export function renderStoreBlogPreview(data = {}) {
  const store = data.store || {}, a = data.article || {};
  const sid = String(store.store_id || "");
  const storeOrigin=/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(store.subdomain || "")?`https://${store.subdomain}.lebrands.store`:"";
  const back = `/stores/${encodeURIComponent(sid)}/blog/${encodeURIComponent(a.id || "")}`;
  const media = new Map(list(data.media).map(m => [String(m.id), m]));
  const products = new Map(list(data.products).map(p => [String(p.id), p]));
  const hero = a.hero_media_id ? media.get(String(a.hero_media_id)) : null;
  const heroUrl = hero ? safeMediaUrl(hero.url) : "";
  const body = `<div class="lbbp"><div class="lbbp-bar" role="status"><strong>Private preview</strong><span>Saved draft, revision ${esc(a.revision ?? 0)}. Not visible to customers.</span><a href="${esc(back)}">Back to editor</a></div>
    <article class="lbbp-article"><header>${a.category ? `<p class="lbbp-cat">${esc(a.category)}</p>` : ""}<h1>${esc(a.title || "Untitled draft")}</h1>${a.summary ? `<p class="lbbp-sum">${esc(a.summary)}</p>` : ""}<p class="lbbp-by">${a.author ? `By ${esc(a.author)}` : ""}</p></header>
    ${heroUrl ? `<figure class="lbbp-hero"><img src="${esc(heroUrl)}" alt="${esc(a.hero_alt || hero.alt || "")}"></figure>` : ""}
    ${list(a.sections).map(s => sectionHtml(s, media, products, storeOrigin)).join("") || '<p class="lbbp-muted">This draft has no sections yet.</p>'}</article></div>`;
  return layout({
    title: `Preview: ${a.title || "Untitled draft"} | ${store.name || "Your store"} | LeBrands.Store`,
    description: "Private draft preview.",
    canonical: `https://app.lebrands.store${back}/preview`,
    noindex: true,
    extraHead: '<link rel="stylesheet" href="/assets/store-blog.css">',
    body,
  });
}
