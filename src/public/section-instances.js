import { sectionLibraryEntry } from "./section-library.js";
import { validSectionInstances } from "./section-instance-model.js";
import { productHref } from "./commerce-options.js";
import { safeImage } from "./aura-sections.js";
import {SECTION_LAYOUT_CSS} from "./section-layout-css.js";
import {SECTION_GRID_CSS,gridAttributes,renderSectionGrid} from "./section-grid-render.js";

const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=v=>`₹${(Math.max(0,Number(v)||0)/100).toLocaleString("en-IN",{maximumFractionDigits:2})}`;
const arr=v=>Array.isArray(v)?v:[];
const PIXEL="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
export const SECTION_INSTANCE_CSS=`
.lb-section{padding:clamp(24px,5vw,64px) clamp(18px,5vw,72px);color:inherit;font-family:inherit;border-bottom:1px solid color-mix(in srgb,currentColor 12%,transparent)}
.lb-section h2{font:inherit;font-size:clamp(23px,3.2vw,42px);font-weight:600;line-height:1.15;margin:0 0 20px;text-transform:none;letter-spacing:-.025em}
.lb-section h3{font:inherit;font-size:18px;font-weight:600;margin:8px 0}.lb-section p{font:inherit;font-size:15px;line-height:1.7;max-width:75ch;margin:10px 0}
.lb-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:24px}.lb-grid a{color:inherit;text-decoration:none}.lb-grid img{display:block;width:100%;height:280px;object-fit:cover}
.lb-split{display:grid;grid-template-columns:1fr 1fr;align-items:center;gap:32px}.lb-photo{position:relative;margin:0;background:color-mix(in srgb,currentColor 5%,transparent);min-height:240px;overflow:hidden}.lb-photo img{display:block;width:100%;height:clamp(240px,35vw,460px);object-fit:cover}.lb-photo figcaption{font:inherit;font-size:12px;padding:8px}
.lb-link{display:inline-block;padding:12px 18px;border:1px solid currentColor;color:inherit;text-decoration:none;font:inherit}.lb-section details{border-bottom:1px solid color-mix(in srgb,currentColor 15%,transparent);padding:16px 0}.lb-section summary{cursor:pointer;font-weight:600}
.lb-section dl{margin:0}.lb-section dl>div{display:grid;grid-template-columns:1fr 2fr;gap:20px;padding:12px 0;border-bottom:1px solid color-mix(in srgb,currentColor 12%,transparent)}.lb-section dd{margin:0}
.lb-message{text-align:center}.lb-message p{margin-inline:auto}.lb-empty{font-size:13px!important;opacity:.7}.lb-section blockquote{margin:0;padding:16px;border-left:2px solid currentColor}.lb-section blockquote footer{font-size:12px}
@media(max-width:640px){.lb-split{grid-template-columns:1fr}.lb-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.lb-grid img{height:190px}.lb-section dl>div{grid-template-columns:1fr;gap:4px}}
${SECTION_LAYOUT_CSS}
${SECTION_GRID_CSS}
`;
function collectionUrl(c){return `/collections/${encodeURIComponent(c.slug||c.id)}`;}
function selection(instance,data,options){
  const source=data.section_source||data;
  const products=arr(source.products).filter(p=>p.status!=="archived"),collections=arr(source.collections).filter(c=>c.status!=="archived");
  const binding=instance.binding;
  const productId=binding.kind==="current-product"?(options.productId||options.productSlug):binding.id;
  const collectionId=binding.kind==="current-collection"?(options.collectionId||options.collectionSlug):binding.id;
  const product=["product","current-product"].includes(binding.kind)?products.find(p=>p.id===productId||p.slug===productId):null;
  const collection=["collection","current-collection"].includes(binding.kind)?collections.find(c=>c.id===collectionId||c.slug===collectionId):null;
  let selected=products;
  if(["product","current-product"].includes(binding.kind))selected=product?[product]:[];
  else if(["collection","current-collection"].includes(binding.kind))selected=collection?
    products.filter(p=>arr(collection.product_ids).includes(p.id)||arr(p.collection_ids).includes(collection.id)):[];
  return {products,collections,product,collection,selected};
}
function photo(url="",alt="",editing=false){
  const safe=safeImage(url);
  return `<figure class="lb-photo"><img src="${esc(safe||PIXEL)}" alt="${esc(alt||"Section image")}" loading="lazy">${!safe&&editing?'<figcaption>Add an image using the image editor</figcaption>':""}</figure>`;
}
function paragraph(text){return `<p>${esc(text)}</p>`;}
function productCards(products){
  return `<div class="lb-grid">${products.slice(0,8).map(p=>`<a class="sc-card" href="${esc(productHref(p))}">${photo(p.images?.[0]?.url,p.title)}<h3>${esc(p.title||p.name)}</h3>${paragraph(money(p.price_paise))}</a>`).join("")}</div>`;
}
function details(product){
  const rows=arr(product?.content?.features).map(f=>[f.label||f.name,f.value]).filter(([k,v])=>k&&v);
  return rows.length?`<dl>${rows.slice(0,16).map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>`:"";
}
function contents(instance,data,options){
  const grid=renderSectionGrid(instance,data,options);
  if(grid!==null)return grid;
  const {family}=instance,editing=Boolean(options.designEdit),sel=selection(instance,data,options);
  const {product,collection,selected,collections}=sel;
  const brand=data.settings?.brand_name||data.store?.name||"Our brand";
  const heading=text=>`<h2>${esc(text)}</h2>`;
  const empty=text=>editing?`<p class="lb-empty">${esc(text)}</p>`:"";
  const guide=text=>paragraph(text);
  const title=sectionLibraryEntry(family).name;
  const textSection=text=>heading(title)+paragraph(text);
  // Reserved keys let formerly empty fields gain defaults without moving the
  // saved ordinal keys of later text in legacy sections.
  const fallback=(text,index=50)=>{
    const key=`section.${options.page||"home"}.${instance.id}.text${index}`,copy=data.settings?.ann_design?.copy||{};
    return `<p data-ann-copy-field="${key}"${editing?` data-design-copy="${key}"`:""}>${esc(Object.hasOwn(copy,key)?copy[key]:text)}</p>`;
  };
  const needsProduct=["featured-product","product-description","product-specifications","materials-care","size-guide","how-to-use","product-guide","routine-guide","related-products"].includes(family);
  if(needsProduct&&!product)return editing?heading(title)+empty("Select an available product for this section."):"";
  if(["collection-header","collection-description","related-collections"].includes(family)&&!collection)
    return editing?heading(title)+empty("Select an available collection for this section."):"";
  switch(family){
    case "announcement-bar":return paragraph(`Explore ${brand}`)+`<a href="/collections/all" class="lb-link">Shop the collection</a>`;
    case "hero-banner":return `<div class="lb-split">${photo(data.settings?.ann_design?.media?.hero?.url,"Brand image",editing)}<div>${heading(brand)}${paragraph("Explore our collection.")}<a class="lb-link" href="/collections/all">Shop now</a></div></div>`;
    case "intro-text":return textSection(`Welcome to ${brand}.`);
    case "brand-statement":return textSection(`Discover the details that make ${brand} our own.`);
    case "closing-message":return textSection("Find your next favourite in our collection.");
    case "product-grid":return heading(collection?.title||collection?.name||"Explore our products")+(selected.length?productCards(selected):empty("No products in this selection."));
    case "featured-product":return `<div class="lb-split sc-card">${photo(product.images?.[0]?.url,product.title,editing)}<div>${heading(product.title||product.name)}${paragraph(product.description||"Explore the product details.")}${paragraph(money(product.price_paise))}<a class="lb-link" href="${esc(productHref(product))}">View product</a></div></div>`;
    case "collection-cards":{
      const list=collection?[collection]:collections;
      return heading("Explore our collections")+`<div class="lb-grid">${list.slice(0,8).map(c=>`<a href="${esc(collectionUrl(c))}">${photo(c.image?.url,c.title||c.name)}<h3>${esc(c.title||c.name)}</h3></a>`).join("")}</div>`+(list.length?"":empty("Create a collection to display it here."));
    }
    case "collection-header":return heading(collection.title||collection.name)+(collection.description?paragraph(collection.description):fallback("Explore this collection."));
    case "collection-description":return heading("About this collection")+(collection.description?paragraph(collection.description):fallback("Explore this collection."));
    case "related-collections":return heading("More collections")+`<div class="lb-grid">${collections.filter(c=>c.id!==collection.id).slice(0,4).map((c,i)=>`<a href="${esc(collectionUrl(c))}"><h3>${esc(c.title||c.name)}</h3>${c.description?paragraph(c.description):fallback("Explore this collection.",50+i)}</a>`).join("")}</div>`;
    case "image-banner":return photo("","Brand image",editing);
    case "image-gallery":return heading("Gallery")+`<div class="lb-grid">${[0,1,2].map(()=>photo("","Gallery image",editing)).join("")}</div>`;
    case "before-after":return heading("Before & After")+`<div class="lb-grid">${photo("","Before image",editing)}${photo("","After image",editing)}</div>`;
    case "brand-story":return textSection(`The story behind ${brand}.`);
    case "about-brand":return heading(`About ${brand}`)+paragraph("Discover our brand and explore our collection.");
    case "craft-materials":return textSection("Explore the materials and details behind our collection.");
    case "store-highlights":return textSection(`Explore ${brand} and its collections.`);
    case "product-description":return heading(product.title||product.name)+(product.description?paragraph(product.description):fallback("Explore the product details."));
    case "product-specifications":return heading("Product specifications")+(details(product)||empty("Add product specifications in your catalogue."));
    case "materials-care":return heading("Materials & Care")+guide("Follow the product label for materials and care information.");
    case "size-guide":return heading("Size Guide")+guide("Check the product measurements to find your fit.");
    case "how-to-use":return heading("How to Use")+guide("Follow the instructions supplied with the product.");
    case "product-guide":return heading("Product Guide")+paragraph(product.description||"Product information and guidance.")+details(product);
    case "routine-guide":return heading("Routine Guide")+guide("Explore the steps and follow the instructions supplied with each product.");
    case "related-products":return heading("Explore more products")+productCards(sel.products.filter(p=>p.id!==product.id));
    case "customer-reviews":{
      const reviews=arr(data.reviews).filter(r=>typeof(r.body||r.text)==="string");
      return reviews.length?heading("Customer Reviews")+`<div class="lb-grid">${reviews.slice(0,6).map(r=>`<blockquote>${paragraph(r.body||r.text)}<footer>${esc(r.author_name||r.name||"Customer")}</footer></blockquote>`).join("")}</div>`:editing?heading("Customer Reviews")+empty("Genuine customer reviews will appear here when available."):"";
    }
    case "customer-photos":return heading("Customer Photos")+`<div class="lb-grid">${[0,1,2].map(()=>photo("","Customer photo supplied by the store",editing)).join("")}</div>`+empty("Use only photographs you have permission to share.");
    case "press-logos":return heading("Press & Logos")+`<div class="lb-grid">${[0,1,2].map(()=>photo("","Press logo",editing)).join("")}</div>`+empty("Add only press mentions and logos you can verify.");
    case "store-details":return heading(brand)+paragraph(data.settings?.business_name||data.store?.name||brand);
    case "shopping-information":return textSection("See our delivery, payment and returns information before ordering.");
    case "offer-cards":return textSection("Explore our store offers. Discount rules are managed in Offers & codes.");
    case "product-set":return heading("Explore the set")+(selected.length?productCards(selected.slice(0,3))+paragraph(`Product total: ${money(selected.slice(0,3).reduce((sum,p)=>sum+Number(p.price_paise||0),0))}. Products are purchased individually.`):empty("Choose products to display together. No bundle discount is configured here."));
    case "faq":return heading("Frequently Asked Questions")+`<details><summary>Where can I learn more about a product?</summary>${paragraph("Read the product description and contact us if you need more information.")}</details><details><summary>How can I contact the store?</summary>${paragraph("Visit our contact page for available contact details.")}</details>`;
    case "delivery-information":return heading("Delivery Information")+paragraph(arr(data.policies).find(p=>p.kind==="shipping")?.body||"See our shipping policy for delivery information.");
    case "contact-information":return heading("Contact Information")+paragraph(data.settings?.contact_email||data.settings?.support_email||brand)+`<a class="lb-link" href="/pages/contact">Contact us</a>`;
    case "policy-text":return heading("Store Policies")+(arr(data.policies).length?arr(data.policies).map((p,i)=>`<h3>${esc(p.title||p.kind)}</h3>${p.body||p.content?paragraph(p.body||p.content):fallback("See this store's policy for details.",50+i)}`).join(""):fallback("Read our store policies before placing an order."));
    default:return "";
  }
}
export function renderSectionInstance(instance,data={},options={}){
  if(!validSectionInstances([instance],options.page||"home"))return "";
  const content=contents(instance,data,options);
  return content?`<section class="lb-section" data-section-instance="${esc(instance.id)}" data-section-type="${esc(instance.family)}" data-section-family="${esc(instance.family)}" data-section-layout="${esc(instance.layout||"original")}" data-library-instances="true"${gridAttributes(instance)}>${content}</section>`:"";
}
export function injectSectionInstances(html,sections,data={},options={}){
  const page=options.page||"home",instances=sections?.[page]?.instances;
  if(!instances?.length||!validSectionInstances(instances,page)||!html.includes("</main>")||html.includes('data-library-instances="true"'))return html;
  const body=instances.map(instance=>renderSectionInstance(instance,data,options)).join("");
  return html.replace("</main>",body+"</main>");
}
