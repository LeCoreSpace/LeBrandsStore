// Reusable catalogue form fragments. Pure HTML renderers: all data arrives as arguments.
import { escapeHtml } from "./layout.js";

const arr = value => Array.isArray(value) ? value : [];
const obj = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const attrJson = value => escapeHtml(JSON.stringify(value).replace(/</g, "\\u003c"));

export function catalogueEnabled(data = {}) {
  return (data.catalogue_forms_enabled ?? data.draft?.catalogue_forms_enabled) === true;
}

export function cataloguePrerequisiteNotice() {
  return `<section class="lb-side-box lb-catalogue-prereq" role="status"><h2>Catalogue details</h2><p><strong>Database update needed.</strong> Vendor, category, collections and product options need the catalogue update to be applied to this workspace. Your products and existing details are unchanged and keep saving as before.</p></section>`;
}

// Vendor, category, subcategory and collection membership.
export function renderCatalogueOrganisation({ enabled, product = {}, collections = [] } = {}) {
  if (!enabled) return cataloguePrerequisiteNotice();
  const cat = obj(product.catalogue);
  const selected = new Set(arr(product.collection_ids).map(String));
  const cols = arr(collections);
  const picker = cols.length
    ? `<div class="lb-check-list" role="group" aria-labelledby="lb-cat-collections-label">${cols.map(c => `<label class="lb-check-input"><input type="checkbox" name="collection_ids" data-collection-pick value="${escapeHtml(c.id)}" ${selected.has(String(c.id)) ? "checked" : ""}>${escapeHtml(c.title || "Untitled collection")}</label>`).join("")}</div>`
    : `<p class="lb-muted">No collections yet. Create one from Collections, then add this product here.</p>`;
  const cls = product.classification && typeof product.classification === "object" ? product.classification : null;
  const rev = Number.isInteger(Number(product.catalogue_revision)) ? Number(product.catalogue_revision) : 0;
  const typeId = cls?.product_type_id ? String(cls.product_type_id) : "";
  return `<section class="lb-side-box lb-catalogue-org" data-catalogue-org data-revision="${rev}" data-classification="${attrJson(cls)}" data-classification-reference="${attrJson(product.classification_reference && typeof product.classification_reference === 'object' ? product.classification_reference : null)}">
    <h2>Organisation</h2>
    <label class="lb-field">Vendor or maker<input name="catalogue_vendor" maxlength="80" value="${escapeHtml(cat.vendor || "")}" placeholder="Your brand or the maker"></label>
    <label class="lb-field">Product category<select name="catalogue_category"><option value="${escapeHtml(cat.category || "")}">${escapeHtml(cat.category || "Choose a category")}</option></select></label>
    <label class="lb-field">Subcategory<select name="catalogue_subcategory"><option value="${escapeHtml(cat.subcategory || "")}">${escapeHtml(cat.subcategory || "Choose a subcategory")}</option></select></label>
    <label class="lb-field">Product type<select name="catalogue_product_type" data-initial-type="${escapeHtml(typeId)}" ${typeId ? "" : "disabled"}><option value="">Choose a product type</option>${typeId ? `<option value="${escapeHtml(typeId)}" selected>${escapeHtml(product.classification_reference?.product_type_name || "Product type")} (saved)</option>` : ""}</select></label>
    <p class="lb-classification-notice" data-classification-notice role="status" hidden></p>
    <p class="lb-muted" data-reference-status role="status">Loading product options…</p>
    <button type="button" class="lb-text-button" data-reference-retry hidden>Retry loading options</button>
    <small class="lb-field-note">Category is how you group products. It does not change tax. Tax comes from the HSN code and GST rate below.</small>
    <div class="lb-field"><span id="lb-cat-collections-label" class="lb-field-label">Collections</span>${picker}</div>
  </section>`;
}

// Optional product options (up to 3) and the variant table. Rendered by the controller in catalogue-form.js.
export function renderCatalogueOptions({ enabled, product = {}, maxAxes = 3, maxVariants = 200 } = {}) {
  if (!enabled) return "";
  const cat = obj(product.catalogue);
  const initial = { axes: arr(cat.axes), variants: arr(product.variants) };
  return `<section id="buying-options" class="lb-side-box lb-catalogue-options" data-catalogue-options data-max-axes="${maxAxes}" data-max-variants="${maxVariants}" data-initial="${attrJson(initial)}">
    <div class="lb-options-head"><div><h2>Variants</h2><p>Choose from your product type's options and values. Optional, up to ${maxAxes} options and ${maxVariants} variants.</p></div></div>
    <p class="lb-draft-note" role="note"><strong>Draft preparation.</strong> Variants are saved with the product as catalogue drafts. SKU-level checkout is not enabled yet, so products with product options cannot be published to the live store.</p>
    <p class="lb-legacy-note" data-legacy-note role="status" hidden>These saved variants do not match the saved options. They are kept as they are and shown read only. Generate variants to replace them.</p>
    <div class="lb-descriptors" data-descriptors-wrap hidden><h3>Product details</h3><p class="lb-field-note">Add the details that apply. These fields do not create variants or change stock. Use manufacturer information for ingredients, safety and warranty details.</p><div class="lb-descriptor-grid" data-descriptors></div></div>
    <p class="lb-muted" data-buying-status role="status">Loading product options…</p>
    <button type="button" class="lb-text-button" data-buying-retry hidden>Retry loading options</button>
    <h3 class="lb-options-subhead">Product options</h3>
    <div class="lb-options-actions" data-available-axes role="group" aria-label="Available product options"></div>
    <div class="lb-axes" data-axes></div>
    <div class="lb-options-actions">
      <button type="button" class="lb-button lb-button-outline lb-button-small" data-axis-add>Add option</button>
      <button type="button" class="lb-button lb-button-small" data-variants-generate>Generate variants</button>
      <span class="lb-combo-count" data-combo-count role="status" aria-live="polite"></span>
    </div>
    <p class="lb-options-error" data-options-error role="alert" hidden></p>
    <div class="lb-matrix-scroll" data-matrix-region role="region" tabindex="0" aria-label="Variant table, scrolls sideways" hidden>
      <table class="lb-table lb-matrix"><thead><tr><th scope="col">Variant</th><th scope="col">Variant (SKU)</th><th scope="col">Stock</th><th scope="col">Price override (₹)</th></tr></thead><tbody data-matrix-body></tbody></table>
    </div>
    <p class="lb-muted" data-matrix-empty>No variants yet. This product is sold as a single version.</p>
  </section>`;
}

const hostFor = subdomain => /^[a-z0-9-]{1,63}$/i.test(String(subdomain || "")) ? `${String(subdomain).toLowerCase()}.lebrands.store` : "";

// Search listing preview: web address handle, SEO title and SEO description. Shared by products and collections.
// storeSubdomain must come from the trusted store record (store.subdomain).
export function renderSearchPreview({ kind = "product", slug = "", seoTitle = "", seoDescription = "", storeSubdomain = "", fallbackTitle = "", fallbackDescription = "" } = {}) {
  const segment = kind === "collection" ? "collections" : "products";
  const host = hostFor(storeSubdomain);
  const id = `lb-seo-${kind}`;
  return `<section class="lb-side-box lb-search-preview" data-search-preview data-kind="${escapeHtml(kind)}" data-segment="${segment}" data-host="${escapeHtml(host)}" data-slug-auto="${slug ? "false" : "true"}">
    <h2>Search listing</h2>
    <p class="lb-muted">How this ${kind} can appear in search results. Leave the title or description empty to use the ${kind} ${kind === "collection" ? "title and description" : "title and description"}.</p>
    <div class="lb-serp" aria-label="Search result preview"><span class="lb-serp-url" data-serp-url>${escapeHtml(`${host || "your-store"}/${segment}/${slug}`)}</span><strong class="lb-serp-title" data-serp-title>${escapeHtml(seoTitle || fallbackTitle || "Untitled")}</strong><span class="lb-serp-desc" data-serp-desc>${escapeHtml((seoDescription || fallbackDescription || "").slice(0, 160))}</span></div>
    <label class="lb-field" for="${id}-title">Search title<input id="${id}-title" name="seo_title" maxlength="70" value="${escapeHtml(seoTitle)}" data-seo-title><small class="lb-counter" data-count-for="seo_title" aria-live="polite">0 of 70</small></label>
    <label class="lb-field" for="${id}-desc">Search description<textarea id="${id}-desc" name="seo_description" rows="3" maxlength="160" data-seo-description>${escapeHtml(seoDescription)}</textarea><small class="lb-counter" data-count-for="seo_description" aria-live="polite">0 of 160</small></label>
    <label class="lb-field" for="${id}-slug">Web address handle<span class="lb-slug-row"><span class="lb-slug-prefix" data-slug-prefix>/${segment}/</span><input id="${id}-slug" name="slug" maxlength="80" pattern="[a-z0-9]+(-[a-z0-9]+)*" value="${escapeHtml(slug)}" data-slug-input placeholder="${kind === "collection" ? "summer-kurtas" : "everyday-tote"}"></span><small>Lowercase letters, numbers and hyphens only. Full address: <span data-slug-full>${escapeHtml(`${host ? `https://${host}` : "Your store address"}/${segment}/${slug}`)}</span></small></label>
  </section>`;
}
