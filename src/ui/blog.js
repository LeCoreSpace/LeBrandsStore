import { platformShell, platformNav, platformFooter } from "./marketing.js";
import { BLOG_POSTS, getBlogPost } from "../content/blog.js";

const ORIGIN = "https://lebrands.store";
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const jsonLd = obj => JSON.stringify(obj).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
const abs = p => (String(p).startsWith("http") ? p : `${ORIGIN}${p}`);
const dateLabel = iso => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function words(post) {
  const parts = [post.summary, ...post.takeaways];
  for (const s of post.sections) parts.push(s.heading, ...s.paragraphs, ...(s.bullets || []));
  for (const f of post.faqs) parts.push(f.question, f.answer);
  return parts.join(" ").split(/\s+/).filter(Boolean).length;
}
const minutes = post => Math.max(1, Math.ceil(words(post) / 220));
const meta = post => `<p class="b-meta"><span class="b-cat">${esc(post.category)}</span><span>${minutes(post)} min read</span><time datetime="${esc(post.published)}">${esc(dateLabel(post.published))}</time></p>`;

function card(post, featured, level=2) {
  return `<article class="b-card${featured ? " b-card-lead" : ""}">
  <a class="b-card-img" href="/blog/${esc(post.slug)}" tabindex="-1" aria-hidden="true"><img src="${esc(post.image)}" width="1200" height="800" alt="" loading="${featured ? "eager" : "lazy"}" decoding="async"></a>
  <div class="b-card-body">${meta(post)}<h${level}><a href="/blog/${esc(post.slug)}">${esc(post.title)}</a></h${level}><p>${esc(post.description)}</p><a class="b-more" href="/blog/${esc(post.slug)}" aria-label="Read ${esc(post.title)}">Read the guide <span aria-hidden="true">&rarr;</span></a></div>
</article>`;
}

const HEAD_BASE = `<link rel="stylesheet" href="/assets/blog.css">`;

export function renderBlogIndex() {
  const title = "Blog | LeBrands.Store guides for Indian D2C brands";
  const description = `${BLOG_POSTS.length} practical D2C guides on products, inventory, customer experience and running a store with Ann, catalogue tools, checkout, offers and business verification on LeBrands.Store.`;
  const canonical = `${ORIGIN}/blog`;
  const [lead, ...rest] = BLOG_POSTS;
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Blog", "@id": `${canonical}#blog`, url: canonical, name: "LeBrands.Store Blog", description, inLanguage: "en-IN", publisher: { "@type": "Organization", name: "LeBrands.Store", url: ORIGIN },
        blogPost: BLOG_POSTS.map(p => ({ "@type": "BlogPosting", headline: p.title, url: `${ORIGIN}/blog/${p.slug}`, datePublished: p.published, image: abs(p.image) })) },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "LeBrands.Store", item: ORIGIN },
        { "@type": "ListItem", position: 2, name: "Blog", item: canonical } ] },
    ],
  };
  const image = lead ? abs(lead.image.replace(/\.svg$/,".png")) : `${ORIGIN}/img/ann-skincare-boutique-desktop.jpg`;
  const head = `${HEAD_BASE}
  <meta property="og:locale" content="en_IN">
  <meta property="og:image" content="${esc(image)}"><meta property="og:image:alt" content="${esc(lead?.imageAlt || "LeBrands.Store blog")}">
  <meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${esc(image)}">
  <script type="application/ld+json">${jsonLd(schema)}</script>`;
  const body = `${platformNav({ pricing: true })}
<main id="top" class="b-main">
  <header class="b-hero b-wrap">
    <p class="m-kicker">The LeBrands.Store blog</p>
    <h1>Clear guides for Indian D2C brands.</h1>
    <p class="b-lede">${BLOG_POSTS.length} practical guides on running an online store in India: launch, product pages, COD, GST, margins and search.</p>
  </header>
  <section class="b-wrap b-list" aria-label="All articles">
    ${lead ? card(lead, true) : ""}
    <div class="b-grid">${rest.map(p => card(p, false)).join("")}</div>
  </section>
</main>
${platformFooter({ pricing: true })}`;
  return platformShell({ title: esc(title), description: esc(description), canonical, pageClass: "m-pricing-document m-pricing-page blog-page", body, head, seo: false });
}

export function renderBlogArticle(post) {
  const url = `${ORIGIN}/blog/${post.slug}`;
  const image = abs(post.image.replace(/\.svg$/,".png"));
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "BlogPosting", "@id": `${url}#article`, mainEntityOfPage: { "@type": "WebPage", "@id": url }, headline: post.title, description: post.description,
        image: [image], datePublished: post.published, dateModified: post.published, articleSection: post.category, inLanguage: "en-IN", wordCount: words(post),
        author: { "@type": "Organization", name: post.author, url: ORIGIN },
        publisher: { "@type": "Organization", name: "LeBrands.Store", url: ORIGIN, logo: { "@type": "ImageObject", url: `${ORIGIN}/img/REPLACE-lebrands-light-transparent.webp` } } },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "LeBrands.Store", item: ORIGIN },
        { "@type": "ListItem", position: 2, name: "Blog", item: `${ORIGIN}/blog` },
        { "@type": "ListItem", position: 3, name: post.title, item: url } ] },
    ],
  };
  if (post.faqs?.length) schema["@graph"].push({ "@type": "FAQPage", "@id": `${url}#faq`, mainEntity: post.faqs.map(f => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })) });
  const head = `${HEAD_BASE}
  <meta property="og:locale" content="en_IN">
  <meta property="og:site_name" content="LeBrands.Store">
  <meta property="og:image" content="${esc(image)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="800"><meta property="og:image:alt" content="${esc(post.imageAlt)}">
  <meta property="article:published_time" content="${esc(post.published)}"><meta property="article:section" content="${esc(post.category)}"><meta name="author" content="${esc(post.author)}">
  <meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(post.title)}"><meta name="twitter:description" content="${esc(post.description)}"><meta name="twitter:image" content="${esc(image)}"><meta name="twitter:image:alt" content="${esc(post.imageAlt)}">
  <script type="application/ld+json">${jsonLd(schema)}</script>`;
  const related = (post.related || []).map(getBlogPost).filter(Boolean);
  const body = `${platformNav({ pricing: true })}
<main id="top" class="b-main">
  <article class="b-article">
    <header class="b-wrap b-art-head">
      <nav class="b-crumbs" aria-label="Breadcrumb"><a href="/">LeBrands.Store</a><span aria-hidden="true">/</span><a href="/blog">Blog</a><span aria-hidden="true">/</span><span aria-current="page">${esc(post.category)}</span></nav>
      ${meta(post)}
      <h1>${esc(post.title)}</h1>
      <p class="b-lede">${esc(post.summary)}</p>
      <p class="b-by">By ${esc(post.author)}</p>
    </header>
    <figure class="b-wrap b-hero-fig"><img src="${esc(post.image)}" width="1200" height="800" alt="${esc(post.imageAlt)}" loading="eager" fetchpriority="high" decoding="async"></figure>
    <div class="b-wrap b-layout">
      <aside class="b-side">
        <nav class="b-toc" aria-label="Table of contents"><h2>In this article</h2><ol>${post.sections.map(s => `<li><a href="#${esc(s.id)}">${esc(s.heading)}</a></li>`).join("")}${post.faqs?.length ? '<li><a href="#faq">Frequently asked questions</a></li>' : ""}</ol></nav>
      </aside>
      <div class="b-body">
        <section class="b-take" aria-labelledby="takeaways"><h2 id="takeaways">Key takeaways</h2><ul>${post.takeaways.map(t => `<li>${esc(t)}</li>`).join("")}</ul></section>
        ${post.sections.map(s => `<section class="b-sec" id="${esc(s.id)}"><h2>${esc(s.heading)}</h2>${s.paragraphs.map(p => `<p>${esc(p)}</p>`).join("")}${s.bullets?.length ? `<ul>${s.bullets.map(b => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}</section>`).join("")}
        ${post.faqs?.length ? `<section class="b-sec b-faq" id="faq"><h2>Frequently asked questions</h2>${post.faqs.map(f => `<div class="b-q"><h3>${esc(f.question)}</h3><p>${esc(f.answer)}</p></div>`).join("")}</section>` : ""}
        <aside class="b-cta"><h2>Ready to open your flagship store?</h2><p>Set up your catalogue, COD orders and GST invoices on LeBrands.Store.</p><a class="m-cta" href="https://app.lebrands.store/signup">Open your store</a></aside>
      </div>
    </div>
    ${related.length ? `<section class="b-wrap b-related" aria-labelledby="related"><h2 id="related">Keep reading</h2><div class="b-grid">${related.map(p => card(p, false,3)).join("")}</div></section>` : ""}
  </article>
</main>
${platformFooter({ pricing: true })}`;
  return platformShell({ title: esc(`${post.title} | LeBrands.Store`), description: esc(post.description), canonical: url, pageClass: "m-pricing-document m-pricing-page blog-page", body, head, seo: false, image, ogType: "article" });
}
