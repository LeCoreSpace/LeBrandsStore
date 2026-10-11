import { escapeHtml, layout, brandMark, footer } from "./layout.js";
import { renderHome as renderMarketingHome } from "./marketing.js";

export function renderHome() {
  return renderMarketingHome();
}

export function renderLegal(kind) {
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
    body,
  });
}
