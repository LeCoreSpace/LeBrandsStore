import { escapeHtml, layout, brandMark, footer } from "./layout.js";
import { renderHome as renderMarketingHome } from "./marketing.js";
import { PLATFORM_INFO } from "./platform-info.js";

export function renderHome() {
  return renderMarketingHome();
}

export function renderLegal(kind) {
  if (PLATFORM_INFO[kind]) {
    const info = PLATFORM_INFO[kind];
    const links = Object.entries(PLATFORM_INFO).map(([key, page]) =>
      `<a href="/${key}"${key === kind ? ' aria-current="page"' : ""}>${escapeHtml(key === "privacy" ? "Privacy" : key === "terms" ? "Terms" : page.title)}</a>`
    ).join("");
    const sections = info.sections.map((section, index) => {
      const id = `info-section-${index + 1}`;
      return `<section class="info-section" aria-labelledby="${id}"><h2 id="${id}">${escapeHtml(section.title)}</h2>${section.paragraphs.map(paragraph => `<p>${paragraph}</p>`).join("")}${section.items ? `<ul>${section.items.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}</section>`;
    }).join("");
    return layout({
      title: `${info.title} | LeBrands.Store`,
      description: info.description,
      canonical: `https://lebrands.store/${kind}`,
      extraHead: '<link rel="stylesheet" href="/assets/legal.css">',
      body: `<header><div class="wrap site-header">${brandMark()}<nav class="nav" aria-label="Site navigation"><a href="https://lebrands.store">Home</a><a class="nav-login" href="https://app.lebrands.store/signup">Create your store</a></nav></div></header>
        <main class="wrap legal-page platform-info"><div class="info-heading"><span class="info-label">LeBrands.Store</span><h1>${escapeHtml(info.title)}</h1><p class="info-intro">${escapeHtml(info.description)}</p></div><div class="info-layout"><nav class="info-navigation" aria-label="Information pages">${links}</nav><article class="info-content">${sections}</article></div></main>${footer()}`,
    });
  }
  const key = ["terms", "privacy", "contact","refund-policy"].includes(kind) ? kind : "terms";
  const details = {
    terms: ["Terms", "A clear home for the terms that guide your use of LeBrands.Store."],
    privacy: ["Privacy", "A clear home for how LeBrands.Store handles your information."],
    contact: ["Contact", "The best place to reach the LeBrands.Store team."],
    "refund-policy":["Refund policy","A clear home for the LeBrands.Store refund policy."],
  };
  const [title, description] = details[key];
  const body = `<header><div class="wrap site-header">${brandMark()}<nav class="nav"><a href="https://lebrands.store">Home</a><a class="nav-login" href="https://app.lebrands.store/signup">Create your store</a></nav></div></header>
    <main class="wrap legal-page"><span class="draft-tag">Draft: to be reviewed</span><div class="eyebrow" style="margin-top:23px">LeBrands.Store / ${escapeHtml(key)}</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p>${key === "contact" ? '<p>For help with your account, write to <a href="mailto:support@lebrands.store">support@lebrands.store</a>.</p>' : "<p>This page is a draft and will be reviewed before publication.</p>"}</main>${footer()}`;
  return layout({
    title: `${title} | LeBrands.Store`,
    description,
    canonical: `https://lebrands.store/${key}`,
    noindex: true,
    body,
  });
}
