import { escapeHtml } from "../ui/layout.js";
import { safeBlogHref } from "./input.js";

const esc = escapeHtml;
const list = v => Array.isArray(v) ? v : [];
const day = v => { const d = new Date(v); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }); };
const safeImg = v => { try { const s = String(v || ""); if (s.startsWith("/") && !s.startsWith("//")) return s; const u = new URL(s); return u.protocol === "https:" ? u.href : ""; } catch { return ""; } };
const localPath = v => typeof v === "string" && /^\/(?!\/)[^\s\\]*$/.test(v) ? v : "";
const paras = t => String(t || "").split(/\n{2,}/).map(p => p.trim()).filter(Boolean).map(p => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");

function section(s, media, products, origin) {
  const h = s.heading ? `<h2>${esc(s.heading)}</h2>` : "";
  const m = s.media_id ? media.get(String(s.media_id)) : null;
  const u = m ? safeImg(m.url) : "";
  const alt = s.alt || m?.alt || "";
  const img = u ? `<figure class="sa-fig"><img src="${esc(u)}" alt="${esc(alt)}" loading="lazy"${m.width ? ` width="${Number(m.width)}"` : ""}${m.height ? ` height="${Number(m.height)}"` : ""}></figure>` : s.media_id ? `<p class="sa-missing">This image is no longer available.</p>` : "";
  switch (s.type) {
    case "image": return `<section class="sa-sec">${h}${img}${paras(s.body)}</section>`;
    case "image_text": return `<section class="sa-sec sa-split">${img}<div>${h}${paras(s.body)}</div></section>`;
    case "quote": return `<section class="sa-sec"><blockquote>${paras(s.body)}${s.heading ? `<cite>${esc(s.heading)}</cite>` : ""}</blockquote></section>`;
    case "product": {
      const p = products.get(String(s.product_id || ""));
      const href = p ? localPath(p.href) : "";
      const pi = p ? safeImg(p.image?.url ?? p.image) : "";
      const inner = p ? `${pi ? `<img src="${esc(pi)}" alt="" loading="lazy">` : ""}<strong>${esc(p.name)}</strong>` : `<strong class="sa-missing">This product is no longer available.</strong>`;
      return `<section class="sa-sec">${h}${paras(s.body)}<div class="sa-product">${href ? `<a href="${esc(href)}">${inner}</a>` : inner}</div></section>`;
    }
    case "faq": {
      const blocks = String(s.body || "").split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
      return `<section class="sa-sec">${h}<dl class="sa-faq">${blocks.map(b => { const [q, ...a] = b.split("\n"); return `<div><dt>${esc(q)}</dt><dd>${esc(a.join(" ").trim())}</dd></div>`; }).join("")}</dl></section>`;
    }
    case "cta": {
      const safe = safeBlogHref(s.href);
      const href = safe.startsWith("/") ? safe : safe;
      const ext = /^https:/i.test(href);
      void origin;
      return `<section class="sa-sec sa-cta">${h}${paras(s.body)}${href ? `<a class="sa-btn" href="${esc(href)}"${ext ? ' target="_blank" rel="noopener noreferrer nofollow"' : ""}>${esc(s.heading || "Learn more")}</a>` : `<p class="sa-missing">This link is unavailable.</p>`}</section>`;
    }
    default: return `<section class="sa-sec">${h}${paras(s.body)}</section>`;
  }
}

export function renderPublicBlog(data = {}, options = {}) {
  if (options.page === "blog-article") {
    const a = data.blog_article || {};
    const media = new Map(list(a.media).map(m => [String(m.id), m]));
    const products = new Map(list(a.products).map(p => [String(p.id), p]));
    const hero = a.hero_media_id ? media.get(String(a.hero_media_id)) : null;
    const hu = hero ? safeImg(hero.url) : "";
    const dates = [a.first_published_at ? day(a.first_published_at) : "", a.updated_at && a.updated_at !== a.first_published_at ? `Updated ${day(a.updated_at)}` : ""].filter(Boolean);
    return `<main class="store-articles"><article class="sa-article"><header>${a.category ? `<p class="sa-cat">${esc(a.category)}</p>` : ""}<h1>${esc(a.title || "")}</h1>${a.summary ? `<p class="sa-sum">${esc(a.summary)}</p>` : ""}<p class="sa-meta">${[a.author ? `By ${esc(a.author)}` : "", ...dates.map(esc)].filter(Boolean).join(" · ")}</p></header>${hu ? `<figure class="sa-hero"><img src="${esc(hu)}" alt="${esc(a.hero_alt || hero.alt || "")}"></figure>` : ""}${list(a.sections).map(s => section(s, media, products, options.canonicalOrigin)).join("")}<p><a href="/blog">Back to all articles</a></p></article></main>`;
  }
  const page = Math.max(1, Number.parseInt(options.blogPage, 10) || 1);
  const blogs = list(data.blogs);
  const cards = blogs.map(b => { const hi = b.hero_image ? safeImg(b.hero_image.url) : ""; return `<li><a class="sa-card" href="/blog/${encodeURIComponent(b.slug)}">${hi ? `<img src="${esc(hi)}" alt="${esc(b.hero_image.alt || "")}" loading="lazy"${b.hero_image.width ? ` width="${Number(b.hero_image.width)}"` : ""}${b.hero_image.height ? ` height="${Number(b.hero_image.height)}"` : ""}>` : ""}${b.category ? `<span class="sa-cat">${esc(b.category)}</span>` : ""}<h2>${esc(b.title)}</h2>${b.summary ? `<p>${esc(b.summary)}</p>` : ""}<span class="sa-meta">${[b.author ? esc(b.author) : "", esc(day(b.first_published_at))].filter(Boolean).join(" · ")}</span></a></li>`; }).join("");
  const more = data.has_more === true;
  const pager = page > 1 || more ? `<nav class="sa-pager" aria-label="Blog pages">${page > 1 ? `<a href="${page === 2 ? "/blog" : `/blog?page=${page - 1}`}" rel="prev">Newer articles</a>` : "<span></span>"}${more ? `<a href="/blog?page=${page + 1}" rel="next">Older articles</a>` : ""}</nav>` : "";
  return `<main class="store-articles"><h1>Blog</h1>${blogs.length ? `<ul class="sa-grid">${cards}</ul>${pager}` : `<div class="sa-empty"><p>No articles have been published yet.</p></div>`}</main>`;
}
