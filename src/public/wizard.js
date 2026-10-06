import { renderAura } from "/assets/aura.js";
import { CATEGORIES, validateBasics, validateTheme, validateProduct, publishChecklist, resumeStep } from "/assets/validation.js";

const root = document.getElementById("wizard");
const panel = document.getElementById("wizard-panel");
const previewPanel = document.getElementById("preview-panel");
const fullscreen = document.getElementById("preview-fullscreen");
const statusNode = document.getElementById("save-status");
const storeId = root?.dataset.storeId || "";
const visualOnly = root?.dataset.visualOnly === "true";
const initial = JSON.parse(document.getElementById("wizard-data")?.textContent || "{}");
const clone = (value) => JSON.parse(JSON.stringify(value ?? {}));
let serverSettings = clone(initial.settings||{});
const esc = (value) => String(value ?? "").replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const safeMediaUrl = (url) => /^https:\/\/media\.lebrands\.store\/stores\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpe?g|svg|webp)$/i.test(String(url||""))?url:"";
const MONEY_RATE = [0,0.25,3,5,12,18,28];
const POLICY_KINDS = ["privacy","terms","shipping","cancellation-refund","contact","pricing"];
const POLICY_NAMES = {privacy:"Privacy policy",terms:"Terms & Conditions",shipping:"Shipping policy","cancellation-refund":"Cancellation & Refunds",contact:"Contact",pricing:"Pricing"};
const API = `/api/stores/${encodeURIComponent(storeId)}`;
let data = initial;
let step = resumeStep(data);
let previewPage = step===3?"product":step===4?"collection":"home";
let device = "mobile";
let activeProductId = null;
let formErrors = {};
let saveTimer = 0;
let previewTimer = 0;
const policyTimers = new Map();
const pendingPolicies = new Set();
let policySequence = 0;
let saveInFlight = false;
let activeSavePromise = null;
let revision = 0;
let savedRevision = 0;
let busy = false;
let loadError = "";
let subdomainTimer = 0;
let subdomainSequence = 0;
let subdomainState = {value:"",message:"Enter a store address to check availability.",state:""};
let uploadBusy = false;
const fieldRevision = new Map();
const policyRevision = new Map();
const savedProductRevisions = new Map();
const savedProductSnapshots = new Map();
const policyRequests = new Map();
let policyQueue = Promise.resolve();
const SETTING_FIELDS = new Set([
  "brand_name", "subdomain", "description", "tagline", "logo_media_id",
  "legal_name", "address", "support_email", "support_phone", "gstin",
  "category", "theme", "accent_color", "font_preset", "button_style",
]);

function responseEnvelope(result) {
  if (result?.data?.store) return result.data;
  return result;
}

function hasPendingWork() {
  return revision > savedRevision || saveInFlight || uploadBusy ||
    pendingPolicies.size > 0 || policyTimers.size > 0 || policyRequests.size > 0;
}

function setStatus(state, text, retryAction="retry-save") {
  if(!statusNode)return;
  if(visualOnly&&["saved","saving"].includes(state)){state="readonly";text="Sign in to save";retryAction=null}
  if(state==="saved"&&hasPendingWork()){state="saving";text="Saving"}
  statusNode.dataset.state=state;
  statusNode.innerHTML=state==="error"?`${esc(text)} ${retryAction?`<button type="button" data-action="${esc(retryAction)}">Retry</button>`:""}`:esc(text);
  refreshPublishButton();
}
function showReadOnly(action="save changes"){
  const message=`Read-only preview. Sign in to ${action}.`;
  formErrors={_general:message};
  setStatus("readonly",message,null);
  renderPanel();
}
function refreshPublishButton(){
  const button=document.getElementById("publish-button");
  if(button)button.disabled=!publishReady()||busy||uploadBusy||data.store?.status==="live";
}
function currentSettings(){return data.settings||(data.settings={})}
function currentProduct(){return data.products?.find((p)=>String(p.id)===String(activeProductId))||null}
function changedSetting(field,value){
  delete formErrors[field];
  for(const error of document.querySelectorAll("[data-error]"))if(error.dataset.error===field)error.remove();
  currentSettings()[field]=value;revision++;fieldRevision.set(field,revision);queueSave();schedulePreview();
}
function changedProduct(field,value){const p=currentProduct();if(!p)return;p[field]=value;revision++;p._revision=revision;queueSave();schedulePreview()}
async function api(path,options={}){
  if(visualOnly)throw new Error("Read-only preview. Sign in to use store actions.");
  const response=await fetch(path,{credentials:"same-origin",...options,headers:{Accept:"application/json",...(options.body&&!(options.body instanceof FormData)?{"Content-Type":"application/json"}:{}),...(options.headers||{})}});
  let result={};try{result=await response.json()}catch{}
  if(!response.ok){const error=new Error(result.error||`Request failed (${response.status}).`);error.status=response.status;error.fields=result.errors||{};throw error}
  return result;
}
function queueSave(delay=1000){
  clearTimeout(saveTimer);
  if(visualOnly){setStatus("readonly","Sign in to save",null);return}
  setStatus("saving","Saving");
  saveTimer=window.setTimeout(()=>saveNow().catch(()=>{}),delay);
}
function setDataFromResponse(result, sentRevision, options={}){
  if(!result||typeof result!=="object")return;
  const incoming=responseEnvelope(result);
  if(incoming.settings){
    const settings=currentSettings();
    serverSettings={...serverSettings,...incoming.settings};
    for(const [key,value] of Object.entries(incoming.settings)){
      if(!fieldRevision.has(key)||fieldRevision.get(key)<=sentRevision)settings[key]=value;
    }
  }
  if(Array.isArray(incoming.products)){
    const local=data.products||[];
    for(const product of incoming.products)savedProductSnapshots.set(String(product.id),productForSave(product));
    const next=incoming.products.map((serverProduct)=>{
      const existing=local.find((p)=>String(p.id)===String(serverProduct.id));
      const lastSaved=savedProductRevisions.get(String(serverProduct.id))||0;
      return existing&&(existing._revision||0)>lastSaved?{...serverProduct,...existing}:serverProduct;
    });
    for(const existing of local){
      const id=String(existing.id);
      if(!next.some((p)=>String(p.id)===id)&&((existing._revision||0)>(savedProductRevisions.get(id)||0)||existing._pendingCreate)){
        next.push(existing);
      }
    }
    data.products=next;
  }
  if(incoming.store)data.store={...data.store,...incoming.store};
  if(Array.isArray(incoming.policies)){
    const local=data.policies||[];
    data.policies=incoming.policies.map((serverPolicy)=>{
      if(!pendingPolicies.has(serverPolicy.kind))return serverPolicy;
      const existing=local.find((policy)=>policy.kind===serverPolicy.kind);
      return existing
        ?{...serverPolicy,...existing,reviewed:options.invalidatePolicyReviews&&serverPolicy.reviewed===false?false:existing.reviewed}
        :serverPolicy;
    });
    for(const localPolicy of local){
      if(pendingPolicies.has(localPolicy.kind)&&!data.policies.some((policy)=>policy.kind===localPolicy.kind)){
        data.policies.push(localPolicy);
      }
    }
  }
  if(incoming.progress)data.progress=incoming.progress;
  updateHeading();
}
async function saveNow(){
  clearTimeout(saveTimer);
  if(visualOnly){setStatus("readonly","Sign in to save",null);return}
  if(activeSavePromise){
    await activeSavePromise;
    if(revision>savedRevision)return saveNow();
    return;
  }
  if(!storeId||revision===savedRevision)return;
  saveInFlight=true;
  const sentRevision=revision;
  const settings={};
  for(const [field,fieldRev] of fieldRevision){
    if(SETTING_FIELDS.has(field)&&fieldRev>savedRevision)settings[field]=currentSettings()[field];
  }
  const settingsChanged=Object.entries(settings).some(([field,value])=>JSON.stringify(serverSettings[field])!==JSON.stringify(value));
  const progress={step,completed:[...(data.progress?.completed||[])]};
  const product=currentProduct();
  const productRevision=product?._revision||0;
  activeSavePromise=(async()=>{
    const patch={progress};
    if(Object.keys(settings).length)patch.settings=settings;
    let result=await api(`${API}/setup`,{method:"PATCH",body:JSON.stringify(patch)});
    setDataFromResponse(result,sentRevision,{invalidatePolicyReviews:settingsChanged});
    const productIsDirty=product?.id&&productRevision>(savedProductRevisions.get(String(product.id))||0);
    if(productIsDirty){
      const productPayload=productForSave(product);
      const productChanged=JSON.stringify(savedProductSnapshots.get(String(product.id)))!==JSON.stringify(productPayload);
      result=await api(`${API}/products/${encodeURIComponent(product.id)}`,{method:"PATCH",body:JSON.stringify(productPayload)});
      savedProductRevisions.set(String(product.id),productRevision);
      setDataFromResponse(result,sentRevision,{invalidatePolicyReviews:productChanged});
    }
    savedRevision=Math.max(savedRevision,sentRevision);
    setStatus("saved",savedRevision<revision?"Saving":"Saved");
  })();
  try{await activeSavePromise}
  catch(error){
    if(error.fields&&Object.keys(error.fields).length){formErrors={...formErrors,...error.fields};renderPanel()}
    setStatus("error",error.message);loadError="";throw error
  }
  finally{activeSavePromise=null;saveInFlight=false}
  if(revision>savedRevision)return saveNow();
  setStatus("saved","Saved");
}
function productForSave(product){
  const {title,price_paise,compare_at_paise,description,images,tags,sku,stock,hsn_code,gst_rate}=product;
  return {title:title||"",price_paise:Number.isInteger(price_paise)?price_paise:Number(price_paise)||0,compare_at_paise:compare_at_paise===""||compare_at_paise==null?null:(Number.isInteger(compare_at_paise)?compare_at_paise:Number(compare_at_paise)||0),description:description||"",images:(images||[]).map(({id,alt})=>({id,alt:alt||""})),tags:Array.isArray(tags)?tags.slice(0,10):[],sku:sku||"",stock:stock===""||stock==null?null:Number(stock),hsn_code:hsn_code||"",gst_rate:Number(gst_rate)||0};
}
function updateHeading(){const h=document.querySelector(".wizard-heading p");if(h)h.textContent=`Setup for ${currentSettings().brand_name||data.store?.name||"your store"}`}
function schedulePreview(){clearTimeout(previewTimer);previewTimer=window.setTimeout(renderPreview,250)}
function fields(errors){return Object.entries(errors||{}).filter(([,v])=>v).map(([name,v])=>`<span class="field-error" data-error="${esc(name)}">${esc(Array.isArray(v)?v[0]:v)}</span>`).join("")}
function field(name,label,value="",opts={}){
  const type=opts.type||"text";
  let control;
  if(opts.select){
    control=`<select id="${esc(name)}" name="${esc(name)}" data-${opts.scope||"settings"}="${esc(name)}"><option value="">Choose a category</option>${opts.options.map(o=>`<option value="${esc(o.value)}" ${String(value)===String(o.value)?"selected":""}>${esc(o.label)}</option>`).join("")}</select>`;
  }else if(opts.textarea){
    control=`<textarea id="${esc(name)}" name="${esc(name)}" data-${opts.scope||"settings"}="${esc(name)}" maxlength="${opts.max||""}" rows="${opts.rows||4}" placeholder="${esc(opts.placeholder||"")}">${esc(value)}</textarea>`;
  }else{
    control=`<input id="${esc(name)}" name="${esc(name)}" type="${esc(type)}" data-${opts.scope||"settings"}="${esc(name)}" value="${esc(value)}" ${opts.max?`maxlength="${opts.max}"`:""} ${opts.min?`min="${opts.min}"`:""} ${opts.step?`step="${opts.step}"`:""} placeholder="${esc(opts.placeholder||"")}" ${opts.autocomplete?`autocomplete="${opts.autocomplete}"`:""}>`;
  }
  const errorKey=name==="price_rupees"?"price_paise":name==="compare_rupees"?"compare_at_paise":name;
  const error=Object.hasOwn(formErrors,errorKey)?{[errorKey]:formErrors[errorKey]}:null;
  if(error)control=control.replace(/^<(input|textarea|select)\b/, "<$1 aria-invalid=\"true\"");
  return `<div class="field"><label for="${esc(name)}">${esc(label)}</label>${control}${opts.help?`<span class="field-help">${opts.help}</span>`:""}${fields(error)}</div>`;
}
function progressBar(){return `<nav class="step-progress" aria-label="Setup steps">${["Brand basics","Choose a theme","Your products","Review & publish"].map((label,i)=>`<button type="button" data-step="${i+1}" aria-current="${step===i+1?"step":"false"}" data-complete="${(data.progress?.completed||[]).includes(i+1)}"><span class="step-number">0${i+1}</span>${label}</button>`).join("")}</nav>`}
function footerNav(){
  return `<div class="bottom-nav"><button class="btn btn-secondary" type="button" data-action="back" ${step===1?"disabled":""}>Back</button><span class="field-error-summary" id="step-error" role="status">${esc(formErrors._step||"")}</span>${step<4?`<button class="btn" type="button" data-action="next">Continue <span aria-hidden="true">→</span></button>`:`<button class="btn" id="publish-button" type="button" data-action="publish" ${!publishReady()||busy||uploadBusy||data.store?.status==="live"?"disabled":""}>${data.store?.status==="live"?"Published":busy?"Publishing…":"Publish store"}</button>`}</div>`;
}
function shellStep(kicker,title,intro,content){return `${progressBar()}<div class="step-card"><div class="step-kicker">${esc(kicker)}</div><h2>${esc(title)}</h2><p class="step-intro">${esc(intro)}</p>${formErrors._general?`<div class="form-error" role="alert">${esc(formErrors._general)}</div>`:""}${content}${footerNav()}</div>`}
function renderBasics(){
 const s=currentSettings();
 const cats=(CATEGORIES||[]).map(x=>typeof x==="string"?{value:x,label:x}:x);
 const logo=s.logo_url;
 return shellStep("Step 01 · Your foundation","Start with the essentials.","A few useful details help customers know who you are and how to find you.",`
   ${field("brand_name","Brand name",s.brand_name||data.store?.name||"",{max:40,placeholder:"Moru Studio",help:"2 to 40 characters."})}
    <div class="field"><label for="subdomain">Your store address</label><div class="field-row"><input id="subdomain" data-settings="subdomain" autocomplete="off" autocapitalize="none" spellcheck="false" value="${esc(s.subdomain||data.store?.subdomain||"")}" placeholder="your-brand" maxlength="30"><span class="suffix">.lebrands.store</span></div><span class="field-help">3 to 30 lowercase letters, numbers or hyphens.</span><span class="availability field-help" data-state="${esc(subdomainState.state)}" id="availability">${esc(subdomainState.message)} <button type="button" class="btn-quiet" data-action="check-subdomain">Check again</button></span>${fields(formErrors.subdomain?{subdomain:formErrors.subdomain}:null)}</div>
    <div class="field"><span class="field-label">Brand logo</span><div class="upload-zone">${safeMediaUrl(logo)?`<img class="upload-thumb" src="${esc(safeMediaUrl(logo))}" alt="Brand logo preview">`:`<span class="upload-thumb" aria-hidden="true"></span>`}<div class="upload-actions"><label for="logo-file">${logo?"Replace logo":"Upload a logo"}</label><small>PNG, JPG, SVG or WebP · up to 5 MB</small><input class="file-input" id="logo-file" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" data-upload="logo"></div></div>${fields(formErrors.logo_media_id?{logo_media_id:formErrors.logo_media_id}:null)}</div>
   ${field("description","A little about your brand",s.description||"",{textarea:true,max:500,rows:3,placeholder:"What do you make, and what makes it yours?",help:"50 to 500 characters."})}
   ${field("tagline","Short tagline (optional)",s.tagline||"",{max:60,placeholder:"Made for the everyday."})}
   <div class="field-grid">${field("legal_name","Legal business name",s.legal_name||"",{max:180})}${field("gstin","GSTIN (optional)",s.gstin||"",{max:15,placeholder:"15-character GSTIN"})}</div>
   ${field("address","Business address",s.address||"",{textarea:true,max:500,rows:2})}
   <div class="field-grid">${field("support_email","Support email",s.support_email||"",{type:"email",max:254,autocomplete:"email"})}${field("support_phone","Support phone / WhatsApp",s.support_phone||"",{type:"tel",max:20,autocomplete:"tel"})}</div>
   ${field("category","What best describes your brand?",s.category||"",{select:true,options:cats})}`);
}
function renderTheme(){
 const s=currentSettings();
 return shellStep("Step 02 · Your storefront","A quieter kind of storefront.","Aura gives your products room to speak. Your choices can change whenever your catalogue does.",`
  <div class="theme-grid"><button type="button" class="theme-card" data-theme="aura" aria-pressed="${(s.theme||"aura")==="aura"}"><span class="theme-swatch aura"><span>${esc(s.brand_name||data.store?.name||"Your brand")}</span></span><strong>Aura</strong><small>Minimal · premium · calm</small></button><button type="button" class="theme-card" disabled aria-disabled="true"><span class="coming-soon">Coming soon</span><span class="theme-swatch bazaar"><span>${esc(s.brand_name||"Your brand")}</span></span><strong>Bazaar</strong><small>Bold · colourful · energetic</small></button></div>
  <div class="field"><label for="accent-color">Accent colour</label><div class="color-row"><input id="accent-color" type="color" data-settings="accent_color" value="${/^#[0-9a-f]{6}$/i.test(s.accent_color||"")?esc(s.accent_color):"#526b53"}"><input aria-label="Accent colour hex value" data-settings="accent_color" value="${esc(s.accent_color||"#526b53")}" maxlength="7"></div><span class="field-help">Choose a shade that stays clear against light backgrounds.</span>${fields(formErrors.accent_color?{accent_color:formErrors.accent_color}:null)}</div>
   <div class="field"><label for="font-preset">Type pairing</label><select id="font-preset" data-settings="font_preset">${[["serif","Studio serif"],["modern","Contemporary sans"],["classic","Classic book"]].map(([v,l])=>`<option value="${v}" ${(s.font_preset||"serif")===v?"selected":""}>${l}</option>`).join("")}</select><span class="field-help">Three distinct voices, each tuned for comfortable reading.</span></div>
  <div class="field"><label for="button-style">Button shape</label><select id="button-style" data-settings="button_style">${[["rounded","Soft corners"],["square","Square"],["pill","Pill"]].map(([v,l])=>`<option value="${v}" ${(s.button_style||"rounded")===v?"selected":""}>${l}</option>`).join("")}</select></div>
  ${fields(formErrors.theme?{theme:formErrors.theme}:null)}`);
}
function productDisplayPrice(product){return Number(product.price_paise)>0?`₹${(Number(product.price_paise)/100).toLocaleString("en-IN",{maximumFractionDigits:2})}`:"Price not set"}
function renderProduct(){
 const list=data.products||[];
 if(!activeProductId&&list.length)activeProductId=list[0].id;
 const product=currentProduct();
 return shellStep("Step 03 · The catalogue","What would you like to launch with?","One complete product is enough to begin. You can add up to eight images to each listing.",`
   <div class="product-manager"><aside><div class="product-list" aria-label="Products">${list.map(p=>`<button type="button" class="product-item" data-product-select="${esc(p.id)}" aria-current="${String(p.id)===String(activeProductId)}"><strong>${esc(p.title||"Untitled product")}</strong><small>${esc(productDisplayPrice(p))}</small></button>`).join("")}</div><button class="btn btn-secondary" type="button" data-action="add-product" style="width:100%;margin-top:10px">Add a product</button></aside>
   <div class="product-editor">${!product?`<div class="product-empty">Your first product is waiting to be added.<br><button type="button" class="btn" data-action="add-product" style="margin-top:12px">Add your first product</button></div>`:`<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:14px"><span class="step-kicker">Product details</span><button class="btn-quiet" type="button" data-action="delete-product">Remove product</button></div>
    ${field("title","Product name",product.title||"",{scope:"product",max:80,placeholder:"Your signature face oil"})}
    <div class="field-grid">${field("price_rupees","Price (INR)",product.price_paise==null?"":(Number(product.price_paise)/100).toFixed(2).replace(/\.00$/,""),{scope:"product",type:"number",min:"0.01",step:"0.01",placeholder:"1290"})}${field("compare_rupees","Compare-at price (optional)",product.compare_at_paise==null?"":(Number(product.compare_at_paise)/100).toFixed(2).replace(/\.00$/,""),{scope:"product",type:"number",min:"0.01",step:"0.01",placeholder:"1490"})}</div>
    <div role="toolbar" aria-label="Product description formatting"><button type="button" class="btn-quiet" data-format="bold">Bold</button><button type="button" class="btn-quiet" data-format="italic">Italic</button><button type="button" class="btn-quiet" data-format="list">Bullet list</button></div>
    ${field("description","Product description",product.description||"",{scope:"product",textarea:true,max:2000,rows:4,placeholder:"Tell customers what makes this piece worth keeping.",help:"30 to 2,000 characters. Select text and use Bold, Italic or Bullet list. Formatting appears in the preview."})}
    <div class="field"><span class="field-label">Product images</span><div class="image-list">${(product.images||[]).map((img,i)=>`<div class="image-item">${safeMediaUrl(img.url)?`<img src="${esc(safeMediaUrl(img.url))}" alt="">`:`<span class="upload-thumb" aria-hidden="true"></span>`}<input type="text" maxlength="180" aria-label="Image ${i+1} alt text" placeholder="Describe this image" value="${esc(img.alt||"")}" data-image-alt="${i}"><span class="image-actions"><button type="button" data-image-move="${i}" data-direction="-1" aria-label="Move image up" ${i===0?"disabled":""}>↑</button><button type="button" data-image-move="${i}" data-direction="1" aria-label="Move image down" ${i===product.images.length-1?"disabled":""}>↓</button><button type="button" data-image-remove="${i}" aria-label="Remove image">×</button></span></div>`).join("")}</div><label class="btn btn-secondary" for="product-image-file" style="display:inline-flex;align-items:center;margin-top:9px">Upload image<input class="file-input" id="product-image-file" type="file" accept="image/png,image/jpeg,image/webp" data-upload="image" multiple></label><span class="field-help">${(product.images||[]).length}/8 images · JPG, PNG or WebP · up to 10 MB each</span>${fields(formErrors.images?{images:formErrors.images}:null)}</div>
    <div class="field"><label for="tags">Tags (optional)</label><div class="tag-input-row"><input id="tags" type="text" data-tag-input placeholder="Add a tag, then press Enter" maxlength="24"><button class="btn btn-secondary" type="button" data-action="add-tag">Add</button></div><div class="tag-chips">${(product.tags||[]).map((tag,i)=>`<span class="tag-chip">${esc(tag)}<button type="button" data-tag-remove="${i}" aria-label="Remove ${esc(tag)}">×</button></span>`).join("")}</div><span class="field-help">Up to 10 tags.</span>${fields(formErrors.tags?{tags:formErrors.tags}:null)}</div>
    <div class="field-grid">${field("sku","SKU (optional)",product.sku||"",{scope:"product",max:80,placeholder:"Assigned automatically if left blank"})}${field("stock","Stock (optional)",product.stock==null?"":product.stock,{scope:"product",type:"number",min:"0",step:"1",placeholder:"Leave blank for always in stock"})}</div>
    <div class="field-grid">${field("hsn_code","HSN code",product.hsn_code||"",{scope:"product",max:8,placeholder:"4, 6 or 8 digits"})}<div class="field"><label for="gst-rate">GST rate</label><select id="gst-rate" data-product="gst_rate">${MONEY_RATE.map(rate=>`<option value="${rate}" ${Number(product.gst_rate)===rate?"selected":""}>${rate}%</option>`).join("")}</select>${fields(formErrors.gst_rate?{gst_rate:formErrors.gst_rate}:null)}</div></div>
   `}</div></div>`);
}
function checklistItems(){
 try{return publishChecklist(data)||[]}catch{return []}
}
function publishReady(){
  const checks=checklistItems();
  return !visualOnly&&checks.length>0&&checks.every((item)=>item.complete===true)&&
    savedRevision>=revision&&!saveInFlight&&!uploadBusy&&pendingPolicies.size===0&&
    policyTimers.size===0&&policyRequests.size===0;
}
function renderReview(){
 const policies=data.policies||[];
 const checks=checklistItems();
 return shellStep("Step 04 · Nearly there","A final look before launch.","Review the essentials, read each policy draft, and publish when everything feels right.",`
  <div class="review-note">Policy drafts are starting points for your own review. LeBrands.Store does not provide legal advice.</div>
   <ul class="checklist">${checks.map(c=>`<li><span class="check-indicator ${c.complete?"complete":""}" aria-hidden="true">${c.complete?"✓":""}</span><span>${esc(c.label)}</span></li>`).join("")}</ul>
   <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin:19px 0 6px"><strong style="font:500 22px var(--serif)">Store policies</strong><button class="btn btn-secondary" type="button" data-action="generate-policies" ${busy||uploadBusy?"disabled":""}>Generate drafts</button></div>
  <p class="field-help">Generating again replaces the current drafts. You'll be asked first.</p>
  ${POLICY_KINDS.map(kind=>{const policy=policies.find(p=>p.kind===kind)||{kind,title:POLICY_NAMES[kind],body:"",reviewed:false};return `<details class="policy-card"><summary>${esc(policy.title||POLICY_NAMES[kind])}${policy.reviewed?" · reviewed":" · draft"}</summary><textarea data-policy="${esc(kind)}" aria-label="${esc(POLICY_NAMES[kind])} text">${esc(policy.body||"")}</textarea><div class="policy-actions"><label class="checkline"><input type="checkbox" data-policy-reviewed="${esc(kind)}" ${policy.reviewed?"checked":""}>I have reviewed this policy</label><span class="field-help">${(policy.body||"").length} characters</span></div></details>`}).join("")}
  ${data.store?.status==="live"?`<div class="publish-result" role="status"><strong>Your store is live.</strong><br><a href="https://${esc(data.store.subdomain||currentSettings().subdomain)}.lebrands.store/" target="_blank" rel="noopener">Visit ${esc(data.store.subdomain||currentSettings().subdomain)}.lebrands.store</a><br><button class="btn-quiet" type="button" data-action="unpublish">Unpublish store</button></div>`:""}
  ${formErrors._publish?`<div class="form-error" role="alert">${esc(formErrors._publish)}</div>`:""}`);
}
function renderPanel(){
 if(!panel)return;
 if(loadError){panel.innerHTML=`<div class="product-empty" role="alert"><h2>We couldn't load your setup.</h2><p>${esc(loadError)}</p><button type="button" class="btn" data-action="retry-load">Try again</button></div>`;return}
 const content=step===1?renderBasics():step===2?renderTheme():step===3?renderProduct():renderReview();
 panel.innerHTML=content;
 if(step===1)checkSubdomain(false);
}
function renderPreview(){
 if(!previewPanel)return;
 const draft=clone(data);
 draft.settings={...(draft.settings||{}),brand_name:draft.settings?.brand_name||draft.store?.name,subdomain:draft.settings?.subdomain||draft.store?.subdomain};
 const title=previewPage==="product"?currentProduct()?.id||data.products?.[0]?.id:null;
 const html=renderAura(draft,{page:previewPage,productId:title,preview:true});
 const body=`<div class="preview-bar"><div class="preview-label">Live preview<small>Preview · not yet live</small></div><div class="preview-controls"><div class="segmented" aria-label="Preview size"><button type="button" data-device="mobile" aria-pressed="${device==="mobile"}">Mobile</button><button type="button" data-device="desktop" aria-pressed="${device==="desktop"}">Desktop</button></div></div></div><nav class="preview-tabs" aria-label="Preview page">${[["home","Home"],["collection","Collection"],["product","Product"]].map(([p,l])=>`<button type="button" data-preview-page="${p}" aria-selected="${previewPage===p}">${l}</button>`).join("")}</nav><div class="preview-stage"><div class="preview-frame" data-device="${device}"><iframe title="Aura storefront preview" sandbox="allow-same-origin" srcdoc="${esc(html)}"></iframe></div></div>`;
 previewPanel.innerHTML=body;
 const frame=previewPanel.querySelector("iframe");
 frame?.addEventListener("load",()=>wirePreviewFrame(frame));
}
function wirePreviewFrame(frame){
 try{
   const doc=frame.contentDocument;if(!doc)return;
   doc.addEventListener("click",(event)=>{
     const anchor=event.target.closest("a");if(!anchor)return;
     event.preventDefault();const url=new URL(anchor.getAttribute("href")||"/","https://preview.invalid");
     const path=url.pathname;
     if(path.startsWith("/products/")){previewPage="product";activeProductId=decodeURIComponent(path.split("/").pop());renderPanel();schedulePreview()}
     else if(path.startsWith("/policies/")){const kind=path.split("/").pop();showPreviewPage("policy",kind)}
     else if(path==="/collections/all")showPreviewPage("collection");
     else if(path==="/pages/about")showPreviewPage("about");
     else if(path==="/pages/contact")showPreviewPage("contact");
     else if(path==="/")showPreviewPage("home");
     else showPreviewPage("404");
   });
   doc.addEventListener("click",(event)=>{
    const image=event.target.closest("[data-gallery-image]");if(!image)return;
    const images=[...doc.querySelectorAll("[data-gallery-image]")];
    const primary=images[0];
    if(primary&&primary!==image){primary.src=image.src;primary.alt=image.alt}
    images.forEach(x=>x.style.opacity=x===image?"1":".72");
   },true);
 }catch{}
}
function showPreviewPage(page,kind){const frame=previewPanel.querySelector("iframe");previewPage=page;const html=renderAura(data,{page,policyKind:kind,productId:activeProductId,preview:true});if(frame){frame.srcdoc=html;frame.addEventListener("load",()=>wirePreviewFrame(frame),{once:true})}}
function showPreviewPageForStep(){previewPage=step===3?"product":step===4?"collection":"home";schedulePreview()}
async function checkSubdomain(force){
 const input=document.getElementById("subdomain");if(!input)return;
 const value=input.value.trim().toLowerCase();
 if(value!==input.value)input.value=value;
 const node=document.getElementById("availability");if(!node)return;
  if(visualOnly){
    subdomainState={value,message:"Sign in to check address availability.",state:"readonly"};
    node.textContent=subdomainState.message;node.dataset.state="readonly";
    setStatus("readonly",subdomainState.message,null);
    return;
  }
 if(!/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(value)){subdomainState={value,message:value?"Use 3 to 30 lowercase letters, numbers or hyphens.":"Enter a store address to check availability.",state:value?"error":""};node.textContent=subdomainState.message;node.dataset.state=subdomainState.state;return}
 if(!force&&subdomainState.value===value&&["available","unavailable"].includes(subdomainState.state)){node.textContent=subdomainState.message;node.dataset.state=subdomainState.state;return}
 const seq=++subdomainSequence;subdomainState={value,message:"Checking availability…",state:""};node.textContent=subdomainState.message;node.dataset.state="";
 clearTimeout(subdomainTimer);subdomainTimer=window.setTimeout(async()=>{
  try{const result=await api(`/api/subdomain-check?name=${encodeURIComponent(value)}&store_id=${encodeURIComponent(storeId)}`);if(seq!==subdomainSequence)return;subdomainState={value,message:result.available?`${value}.lebrands.store is available.`:"That address is not available. Try another.",state:result.available?"available":"unavailable"}}
  catch(error){if(seq!==subdomainSequence)return;subdomainState={value,message:error.message||"Availability check failed. Try again.",state:"error"}}
  const live=document.getElementById("availability");if(live){live.textContent=subdomainState.message;live.dataset.state=subdomainState.state}
 },force?0:350);
}
function validateStep(){
 let errors={};
 if(step===1){
  errors=validateBasics(currentSettings())||{};
  const address=currentSettings().subdomain||data.store?.subdomain||"";
  if(subdomainState.state!=="available"||subdomainState.value!==address)errors.subdomain=errors.subdomain||"Confirm that this store address is available before continuing.";
 }
 if(step===2)errors=validateTheme(currentSettings())||{};
  if(step===3){
    const products=data.products||[];
    if(!products.length)errors={_step:"Add at least one product to continue."};
    else{
      const validationByProduct=products.map((product)=>({product,errors:validateProduct(product)||{}}));
      const firstIncomplete=validationByProduct.find((entry)=>Object.keys(entry.errors).length>0);
      if(firstIncomplete){
        activeProductId=firstIncomplete.product.id;
        errors={...firstIncomplete.errors};
        errors._step=`Complete “${firstIncomplete.product.title||"this product"}” before continuing.`;
      }
    }
  }
 formErrors=errors;renderPanel();
  if(Object.keys(errors).length){formErrors={...errors,_step:errors._step||"Check the highlighted fields before continuing."};renderPanel();return false}
 return true;
}
async function goStep(next){
  if(uploadBusy||busy){formErrors={_general:"Wait for the current operation to finish before changing steps."};renderPanel();return}
 if(next>step&&!validateStep())return;
  busy=true;renderPanel();
  try{
    if(!await flushPolicies())throw new Error("A policy draft could not be saved. Retry before changing steps.");
    await saveNow();
  }catch(error){busy=false;formErrors={_general:`Your changes were not saved. ${error.message}`};renderPanel();return}
 const previousStep=step;
 step=Math.max(1,Math.min(4,next));
 data.progress={...(data.progress||{}),step};
 if(step>1){const list=new Set(data.progress.completed||[]);for(let n=1;n<step;n++)list.add(n);data.progress.completed=[...list]}
 revision++;
 try{await saveNow()}
 catch(error){
  step=previousStep;data.progress={...(data.progress||{}),step};busy=false;
  formErrors={_general:`Your changes were not saved. ${error.message}`};
  showPreviewPageForStep();renderPanel();return;
 }
 formErrors={};busy=false;showPreviewPageForStep();renderPanel();
}
async function makeProduct(){
  if(visualOnly){showReadOnly("add products");return}
  if(busy||uploadBusy)return;busy=true;renderPanel();setStatus("saving","Adding product");
 try{
  await saveNow();
  const result=await api(`${API}/products`,{method:"POST",body:JSON.stringify({title:"",price_paise:0,compare_at_paise:null,description:"",images:[],tags:[],sku:"",stock:null,hsn_code:"",gst_rate:0})});
   const beforeIds=new Set((data.products||[]).map((product)=>String(product.id)));
   const envelope=responseEnvelope(result);
    setDataFromResponse(envelope,revision,{invalidatePolicyReviews:true});
   const created=(data.products||[]).find((product)=>!beforeIds.has(String(product.id)))||
     result.product||result.data?.product;
   if(!created?.id)throw new Error("The product was not created. Try again.");
   if(!data.products.some((product)=>String(product.id)===String(created.id)))data.products.push(created);
   savedProductRevisions.set(String(created.id),0);
   activeProductId=created.id;formErrors={};previewPage="product";renderPanel();schedulePreview();setStatus("saved","Saved");
  }catch(error){formErrors={_general:error.message};renderPanel();setStatus("error",error.message,null)}
  finally{busy=false}
}
async function deleteProduct(){
  if(visualOnly){showReadOnly("remove products");return}
  if(uploadBusy||busy)return;
 const product=currentProduct();if(!product)return;
 if(!window.confirm(`Remove "${product.title||"this product"}" from your catalogue? This cannot be undone.`))return;
  busy=true;renderPanel();setStatus("saving","Removing product");
  try{
    await saveNow();
    const result=await api(`${API}/products/${encodeURIComponent(product.id)}`,{method:"DELETE"});
    setDataFromResponse(result,revision,{invalidatePolicyReviews:true});
    data.products=data.products.filter((p)=>String(p.id)!==String(product.id));
    savedProductRevisions.delete(String(product.id));
    savedProductSnapshots.delete(String(product.id));
    activeProductId=data.products[0]?.id||null;renderPanel();schedulePreview();setStatus("saved","Saved");
  }
  catch(error){formErrors={_general:error.message};renderPanel();setStatus("error",error.message,null)}
  finally{busy=false;renderPanel()}
}
async function uploadFiles(input){
  if(visualOnly){showReadOnly("upload images");return}
 if(uploadBusy)return;
 const kind=input.dataset.upload;const files=[...input.files||[]];input.value="";
 if(!files.length)return;
 if(kind==="image"&&((currentProduct()?.images||[]).length+files.length)>8){formErrors={images:"Each product can have up to 8 images."};renderPanel();return}
  formErrors={};
  uploadBusy=true;input.disabled=true;setStatus("saving","Uploading");
 for(const file of files){
  const limit=kind==="logo"?5*1024*1024:10*1024*1024;
  const types=kind==="logo"?["image/png","image/jpeg","image/svg+xml","image/webp"]:["image/png","image/jpeg","image/webp"];
  if(file.size>limit||!types.includes(file.type)){formErrors={_general:kind==="logo"?"Choose a PNG, JPG, SVG or WebP logo under 5 MB.":"Choose JPG, PNG or WebP images under 10 MB each."};continue}
  const form=new FormData();form.append("file",file);form.append("type",kind);form.append("alt",file.name.replace(/\.[^.]+$/,""));
  try{
   const result=await api(`${API}/media`,{method:"POST",body:form});
   const media=result.media;if(!media?.id)throw new Error("Upload did not return media details.");
   if(kind==="logo"){
    changedSetting("logo_media_id",media.id);
    currentSettings().logo_url=media.url;
    fieldRevision.set("logo_url",revision);
   }else{
    const p=currentProduct();if(!p)continue;
    p.images=[...(p.images||[]),{id:media.id,key:media.key,url:media.url,alt:media.alt||"",width:media.width,height:media.height}];
    revision++;p._revision=revision;queueSave();schedulePreview();
   }
  }catch(error){formErrors={_general:error.message}}
 }
  try{await saveNow()}catch(error){formErrors._general=`Upload completed, but saving the change failed. ${error.message}`}
  uploadBusy=false;renderPanel();schedulePreview();
  if(formErrors._general)setStatus("error",formErrors._general,null);else setStatus("saved","Saved");
}
async function savePolicy(kind){
  if(visualOnly){setStatus("readonly","Sign in to save policy changes",null);return false}
  clearTimeout(policyTimers.get(kind));
  policyTimers.delete(kind);
  if(!pendingPolicies.has(kind))return true;
  const active=policyRequests.get(kind);
  if(active){
    await active.catch(()=>false);
    if(!pendingPolicies.has(kind))return true;
    return savePolicy(kind);
  }
  let sequence;
  const operation=policyQueue.catch(()=>false).then(async()=>{
    if(!pendingPolicies.has(kind))return true;
    setStatus("saving","Saving");
    sequence=policyRevision.get(kind);
    const policy=(data.policies||[]).find((item)=>item.kind===kind);
    if(!policy)return false;
    try{
      const result=await api(`${API}/policies/${encodeURIComponent(kind)}`,{
        method:"PUT",
        body:JSON.stringify({body:policy.body||"",reviewed:Boolean(policy.reviewed)}),
      });
      const envelope=responseEnvelope(result);
      setDataFromResponse(envelope,revision);
      const incoming=envelope.policies?.find((item)=>item.kind===kind);
      if(!incoming||policyRevision.get(kind)!==sequence)return false;
      data.policies=(data.policies||[]).filter((item)=>item.kind!==kind).concat(incoming);
      pendingPolicies.delete(kind);
      return true;
    }catch(error){
      setStatus("error",error.message);
      return false;
    }
  });
  let tracked;
  tracked=operation.finally(()=>{if(policyRequests.get(kind)===tracked)policyRequests.delete(kind)});
  policyRequests.set(kind,tracked);
  policyQueue=tracked.then(()=>undefined,()=>undefined);
  const succeeded=await tracked;
  if(policyRevision.get(kind)!==sequence&&pendingPolicies.has(kind))return savePolicy(kind);
  if(succeeded)setStatus("saved","Saved");
  return succeeded;
}
function schedulePolicySave(kind){
 clearTimeout(policyTimers.get(kind));
  if(visualOnly){setStatus("readonly","Sign in to save policy changes",null);return}
  policyTimers.set(kind,window.setTimeout(()=>{
    policyTimers.delete(kind);
    savePolicy(kind).catch(()=>{});
  },1000));
}
async function flushPolicies(){
  if(visualOnly){setStatus("readonly","Sign in to save policy changes",null);return true}
  while(pendingPolicies.size){
    for(const timer of policyTimers.values())clearTimeout(timer);
    policyTimers.clear();
    const results=await Promise.all([...pendingPolicies].map((kind)=>savePolicy(kind)));
    if(results.some((result)=>result!==true))return false;
 }
  await Promise.all([...policyRequests.values()].map((request)=>request.catch(()=>false)));
  return true;
}
async function submitPublish(){
  if(visualOnly){showReadOnly("publish a store");return}
  if(uploadBusy)return;
  if(!window.confirm("Publish your store? It will be available at your LeBrands.Store address."))return;
  busy=true;formErrors={};renderPanel();setStatus("saving","Publishing");
  try{
    if(!await flushPolicies())throw new Error("A policy draft could not be saved. Retry before publishing.");
    await saveNow();
    if(!publishReady())throw new Error("Finish the checklist and save your changes before publishing.");
    const result=await api(`${API}/publish`,{method:"POST",body:JSON.stringify({})});
    setDataFromResponse(result,revision);
    data.store={...data.store,...responseEnvelope(result).store,status:responseEnvelope(result).store?.status||"live"};
    setStatus("saved","Saved");renderPanel();schedulePreview();
  }
  catch(error){formErrors={_publish:error.message};renderPanel();setStatus("error",error.message,null)}
  finally{busy=false;renderPanel();if(!formErrors._publish)setStatus("saved","Saved")}
}
async function unpublish(){
  if(visualOnly){showReadOnly("unpublish a store");return}
  if(busy||uploadBusy)return;
 if(!window.confirm("Unpublish this store? Visitors will no longer see the live catalogue."))return;
  busy=true;renderPanel();setStatus("saving","Unpublishing");
  try{const result=await api(`${API}/unpublish`,{method:"POST",body:JSON.stringify({})});setDataFromResponse(result,revision);data.store={...data.store,...responseEnvelope(result).store,status:responseEnvelope(result).store?.status||"draft"}}
  catch(error){formErrors={_publish:error.message};setStatus("error",error.message,null)}
  finally{busy=false;renderPanel();if(!formErrors._publish)setStatus("saved","Saved")}
}
async function generatePolicies(){
  if(visualOnly){showReadOnly("generate policy drafts");return}
 if(!window.confirm("Generate policy drafts? This replaces every existing draft and its review state."))return;
  if(uploadBusy||busy)return;
  busy=true;renderPanel();setStatus("saving","Generating drafts");
  try{
    if(!await flushPolicies())throw new Error("A policy draft could not be saved. Retry before regenerating.");
    await saveNow();
    const result=await api(`${API}/policies/generate`,{method:"POST",body:JSON.stringify({})});
    setDataFromResponse(result,revision);
     formErrors={};renderPanel();setStatus("saved","Saved");
  }
  catch(error){formErrors={_general:error.message};renderPanel();setStatus("error",error.message,null)}
  finally{busy=false;renderPanel()}
}
function toPaise(value){if(value===""||value==null)return null;const amount=Number(value);return Number.isFinite(amount)?Math.round(amount*100):null}
function onInput(event){
 const el=event.target;
  if((busy||uploadBusy)&&(el.matches("[data-settings],[data-product],[data-image-alt],[data-policy],[data-policy-reviewed]")))return;
 if(el.matches("[data-settings]")){
   const name=el.dataset.settings;let value=el.value;
   if(name==="subdomain"){value=value.toLowerCase().trim();if(value!==el.value)el.value=value;checkSubdomain(false)}
   changedSetting(name,value);
   if(name==="accent_color"){const other=[...document.querySelectorAll('[data-settings="accent_color"]')].find(x=>x!==el);if(other)other.value=value}
 }else if(el.matches("[data-product]")){
   const name=el.dataset.product;let value=el.value;
   if(name==="gst_rate")value=Number(value);
   if(name==="price_rupees")changedProduct("price_paise",toPaise(value));
   else if(name==="compare_rupees")changedProduct("compare_at_paise",toPaise(value));
   else if(name==="stock")changedProduct("stock",value===""?null:Number(value));
   else changedProduct(name,value);
 }
 else if(el.matches("[data-image-alt]")){const p=currentProduct(),i=Number(el.dataset.imageAlt);if(p?.images?.[i]){p.images[i].alt=el.value;revision++;p._revision=revision;queueSave();schedulePreview()}}
  else if(el.matches("[data-policy]")){
    const kind=el.dataset.policy;
    const policy=(data.policies||[]).find((item)=>item.kind===kind);
    if(policy){policy.body=el.value;policy.reviewed=false}
    const checkbox=document.querySelector(`[data-policy-reviewed="${CSS.escape(kind)}"]`);
    if(checkbox)checkbox.checked=false;
    const summary=el.closest("details")?.querySelector("summary");
    if(summary)summary.textContent=`${POLICY_NAMES[kind]} · draft`;
    policyRevision.set(kind,++policySequence);pendingPolicies.add(kind);
    setStatus("saving","Saving");schedulePolicySave(kind)
  }
 else if(el.matches("[data-policy-reviewed]")){const kind=el.dataset.policyReviewed;policyRevision.set(kind,++policySequence);pendingPolicies.add(kind);const policy=(data.policies||[]).find(p=>p.kind===kind);if(policy)policy.reviewed=el.checked;setStatus("saving","Saving");schedulePolicySave(kind);renderPanel()}
}
function onChange(event){if(busy||uploadBusy)return;if(event.target.matches('[data-settings="accent_color"]')){changedSetting("accent_color",event.target.value);document.querySelectorAll('[data-settings="accent_color"]').forEach(el=>el.value=event.target.value)}}
function onClick(event){
 const button=event.target.closest("button");if(!button)return;
  const action=button.dataset.action||"";
  const mutating=Boolean(button.dataset.step||button.dataset.theme||button.dataset.productSelect||
    button.dataset.imageMove!==undefined||button.dataset.imageRemove!==undefined||
    button.dataset.tagRemove!==undefined||
    ["next","back","add-tag","add-product","delete-product","generate-policies","publish","unpublish","retry-save","retry-load"].includes(action));
  if((busy||uploadBusy)&&mutating){
    formErrors={_general:"Wait for the current operation to finish before making another change."};
    renderPanel();
    return;
  }
 if(button.dataset.format){
  const textarea=document.getElementById("description");
  if(!textarea||textarea.dataset.product!=="description")return;
  const start=textarea.selectionStart,end=textarea.selectionEnd;
  const selected=textarea.value.slice(start,end)||"Your text";
  const format=button.dataset.format;
  const wrapped=format==="bold"?`**${selected}**`:format==="italic"?`*${selected}*`:
    `${start&&textarea.value[start-1]!=="\n"?"\n":""}- ${selected.replace(/\n/g,"\n- ")}\n`;
  if(textarea.value.length-(end-start)+wrapped.length>2000){formErrors={description:"Keep the formatted description within 2,000 characters."};renderPanel();return}
  textarea.setRangeText(wrapped,start,end,"select");
  textarea.dispatchEvent(new Event("input",{bubbles:true}));textarea.focus();return;
 }
 if(button.dataset.step){goStep(Number(button.dataset.step));return}
 if(button.dataset.action==="next"){goStep(step+1);return}
 if(button.dataset.action==="back"){goStep(step-1);return}
 if(button.dataset.theme){changedSetting("theme",button.dataset.theme);formErrors={};renderPanel();return}
  if(button.dataset.productSelect){
   if(uploadBusy)return;
  const nextId=button.dataset.productSelect;
   busy=true;renderPanel();
   saveNow()
    .then(()=>{activeProductId=nextId;previewPage="product";formErrors={};schedulePreview()})
    .catch(error=>{formErrors={_general:`Your changes were not saved. ${error.message}`}})
    .finally(()=>{busy=false;renderPanel()});
  return
 }
 if(button.dataset.previewPage){previewPage=button.dataset.previewPage;renderPreview();return}
 if(button.dataset.device){device=button.dataset.device;renderPreview();return}
 if(button.dataset.imageMove!==undefined){const p=currentProduct(),i=Number(button.dataset.imageMove),n=i+Number(button.dataset.direction);if(p&&p.images[n]&&p.images[i]){[p.images[i],p.images[n]]=[p.images[n],p.images[i]];revision++;p._revision=revision;queueSave();renderPanel();schedulePreview()}return}
 if(button.dataset.imageRemove!==undefined){const p=currentProduct(),i=Number(button.dataset.imageRemove);if(p){p.images.splice(i,1);revision++;p._revision=revision;queueSave();renderPanel();schedulePreview()}return}
 if(button.dataset.tagRemove!==undefined){const p=currentProduct();p?.tags?.splice(Number(button.dataset.tagRemove),1);if(p){revision++;p._revision=revision;queueSave();renderPanel()}return}
 if(button.dataset.action==="add-tag"){const input=document.getElementById("tags"),value=input?.value.trim();const p=currentProduct();if(value&&p){p.tags=Array.isArray(p.tags)?p.tags:[];if(p.tags.length<10&&!p.tags.includes(value))p.tags.push(value);revision++;p._revision=revision;queueSave();renderPanel()}return}
 if(button.dataset.action==="add-product"){makeProduct();return}
 if(button.dataset.action==="delete-product"){deleteProduct();return}
  if(button.dataset.action==="check-subdomain"){checkSubdomain(true);return}
  if(button.dataset.action==="retry-save"){flushPolicies().then((ok)=>ok?saveNow():undefined).catch(()=>{});return}
 if(button.dataset.action==="retry-load"){loadSetup();return}
 if(button.dataset.action==="generate-policies"){generatePolicies();return}
 if(button.dataset.action==="publish"){submitPublish();return}
 if(button.dataset.action==="unpublish"){unpublish();return}
  if(button.id==="open-preview"){fullscreen.classList.add("is-open");fullscreen.append(previewPanel);renderPreview();return}
  if(button.id==="close-preview"){fullscreen.classList.remove("is-open");document.querySelector(".wizard-workspace")?.append(previewPanel);return}
}
function onKeydown(event){if(event.key==="Enter"&&event.target.id==="tags"){event.preventDefault();document.querySelector('[data-action="add-tag"]')?.click()}}
async function loadSetup(){
  if(visualOnly){
    setStatus("readonly","Sign in to load and save a store",null);
    renderPanel();renderPreview();
    return;
  }
 if(!storeId){loadError="The store address is missing.";renderPanel();return}
 try{
  setStatus("saving","Loading");
  const result=await api(`${API}/setup`);
  data=result.store?result:result.data||result;
   serverSettings=clone(data.settings||{});
  step=resumeStep(data);
   savedRevision=revision=0;
   savedProductRevisions.clear();
   savedProductSnapshots.clear();
   for(const product of data.products||[]){
     savedProductRevisions.set(String(product.id),0);
     savedProductSnapshots.set(String(product.id),productForSave(product));
   }
  activeProductId=data.products?.[0]?.id||null;
  subdomainState={value:"",message:"Enter a store address to check availability.",state:""};
  loadError="";showPreviewPageForStep();renderPanel();setStatus("saved","Saved");
  }catch(error){loadError=error.message;setStatus("error","Couldn't load","retry-load");renderPanel()}
}
panel?.addEventListener("input",onInput);
panel?.addEventListener("change",(event)=>{onInput(event);onChange(event);if(event.target.matches("[data-upload]"))uploadFiles(event.target)});
panel?.addEventListener("click",onClick);
panel?.addEventListener("keydown",onKeydown);
previewPanel?.addEventListener("click",onClick);
fullscreen?.addEventListener("click",onClick);
  window.addEventListener("beforeunload",(event)=>{if(hasPendingWork()){event.preventDefault();event.returnValue=""}});
renderPanel();renderPreview();loadSetup();
