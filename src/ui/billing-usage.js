import {escapeHtml as esc} from "./layout.js";
import {SOCIAL_AD_FEATURE, SOCIAL_AD_LABEL} from "../billing/features.js";

const names = {
  published_products:"Published products", published_skus:"Published SKUs",
  public_media_bytes:"Public media storage", additional_staff_seats:"Staff seats",
  monthly_order_soft_band:"Orders created this month (UTC)",
  payment_partner_integration:"Payment integration", delivery_partner_integration:"Delivery integration",
  custom_domain:"Custom domain", [SOCIAL_AD_FEATURE]:SOCIAL_AD_LABEL,
  ann_and_theme_editor:"Ann and theme editor", branded_customisable_checkout:"Branded, customisable checkout",
  per_page_seo_metadata:"SEO titles and descriptions", transactional_emails:"Transactional emails",
  conversion_section_library:"Conversion sections", data_export:"Data export",
  lebrands_space_placement:"LeBrands.Space placement", live_days:"Live days",
};
const count = n => new Intl.NumberFormat("en-IN",{maximumFractionDigits:2}).format(n);
export function mediaSize(n) {
  if (n < 1024) return `${count(n)} bytes`;
  const unit = n >= 1073741824 ? [1073741824,"GB"] : n >= 1048576 ? [1048576,"MB"] : [1024,"KB"];
  return `${count(n/unit[0])} ${unit[1]}`;
}
function connectionText(kind, row) {
  if (row?.status === "error" || row?.status === "failed") return "Connection error";
  if (kind === "domain") return row?.status === "active" ? "Connected" : row ? "Connecting" : "Not connected";
  if (row?.status !== "connected") return "Not connected";
  if (row.enabled !== true) return kind === "payment" && row.mode === "test" ? "Connected · Test mode · Switched off" : "Connected · Switched off";
  if (kind === "payment" && row.mode === "test") return "Connected · Test mode";
  if (kind === "payment") return row.mode === "live" && row.verified === true ? "Connected · Live" : "Connected · Verification incomplete";
  return "Connected · Active";
}
function socialText(usage) {
  if (usage.social_available !== true) return "Status unavailable";
  const s = usage.social || {};
  if (s.meta && s.google) return "Meta + Google configured";
  if (s.meta) return "Meta configured";
  if (s.google) return "Google configured";
  return s.meta_saved || s.google_saved ? "Saved · Switched off" : "Not configured";
}
const numeric = new Set(["published_products","published_skus","public_media_bytes","additional_staff_seats","monthly_order_soft_band"]);
const connections = {payment_partner_integration:"payment",delivery_partner_integration:"delivery",custom_domain:"domain"};
export function renderPlanUsage(entitlements, usage) {
  const ents = {...entitlements};
  for (const key of [...numeric, ...Object.keys(connections)]) ents[key] ??= {};
  ents[SOCIAL_AD_FEATURE] = {included:true,value:true};
  const available = usage?.available === true;
  const rows = Object.entries(ents).map(([key,e])=>{
    e = e && typeof e === "object" ? e : {};
    const resource={published_products:"products",published_skus:"skus",public_media_bytes:"storage",additional_staff_seats:"staff"}[key];
    const capacity=resource&&usage?.capacity;
    const title = capacity&&key==="published_products"?"Catalogue products, including drafts":capacity&&key==="published_skus"?"Catalogue SKUs, including drafts":names[key] || key.replace(/_/g," ").replace(/^./,s=>s.toUpperCase());
    const allowance = e.included === false ? "Not included in this plan" : e.included !== true
      ? "Plan allowance not recorded" : e.value == null || e.value === true ? "Included" : String(e.value).replace(/_/g," ");
    let detail = allowance, extra = "", over = false;
    if (numeric.has(key)) {
      if (!available) detail = "Usage unavailable";
      else {
        const used = capacity?capacity.used[resource]:usage[key], format = key === "public_media_bytes" ? mediaSize : count;
        const limit = capacity?capacity.limits[resource]:e.included === true && e.value !== null && e.value !== undefined && e.value !== "" && typeof e.value !== "boolean" && Number.isFinite(Number(e.value)) ? Number(e.value) : null;
        over = limit !== null && used > limit;
        detail = limit !== null ? `${format(used)} of ${format(limit)} used` : `${format(used)} used`;
        extra = limit !== null
          ? `<progress class="pb-usage-meter" max="${Math.max(1,limit)}" value="${Math.min(used,Math.max(1,limit))}" aria-label="${esc(title)}: ${esc(detail)}"></progress>${over?'<small class="pb-usage-warning">Above your plan allowance</small>':""}`
          : `<small>${esc(e.included === true ? "No fixed limit recorded" : allowance)}</small>`;
        if(key === "public_media_bytes" && limit !== null) extra += `<small>${count(used)} of ${count(limit)} bytes</small>`;
        if(capacity&&key==="additional_staff_seats")extra+=`<small>${count(capacity.used.staff_active)} active · ${count(capacity.used.staff_pending)} pending invitations</small>`;
        if(capacity&&["published_products","published_skus"].includes(key))extra+=`<small>${count(usage[key])} currently published. Drafts also count toward your allowance.</small>`;
      }
    } else if (key in connections) {
      const kind=connections[key], row=usage?.[kind];
      detail = available ? connectionText(kind,row) : "Status unavailable";
      if (kind === "domain" && row?.hostname) extra = `<small>${esc(row.hostname)}</small>`;
      extra += `<small>${esc(allowance)}</small>`;
    } else if (key === SOCIAL_AD_FEATURE) {
      detail = available ? socialText(usage) : "Status unavailable";
      if(available && usage.social?.google) extra = `<small>${usage.social.google_ads ? "Google Ads conversion tags configured" : "Google Analytics configured"}</small>`;
    }
    return `<li data-feature="${esc(key)}" data-over-limit="${over}"${e.included===false?' data-on="no"':""}><span class="pb-usage-copy"><strong>${esc(title)}</strong><em>${esc(detail)}</em>${extra}</span></li>`;
  }).join("");
  return `${!available?'<p class="pb-callout" role="status">Current usage could not be loaded. Refresh to try again. No usage has been assumed.</p>':""}
    <ul class="pb-ents pb-usage">${rows}</ul>
    <p class="pb-muted">${usage?.capacity?"Drafts and items currently live count once per product and SKU. All uploaded store media uses storage, including unused files. Staff seats include pending invitations and exclude owners.":"Counts use your published catalogue and uploaded store media. Staff seats exclude the owner."} Connection status reflects saved settings, not a fresh provider test.</p>`;
}
