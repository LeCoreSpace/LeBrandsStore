import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {STYLE_IDS} from "../src/public/aura-styles.js";
import {buildMediaSizeGuide,MEDIA_GUIDE_LIMITS,MEDIA_GUIDE_CATEGORIES} from "../src/public/media-placement-guide.js";
import {renderMediaSizeGuide} from "../src/ui/media-size-guide.js";
import {renderMediaLibrary} from "../src/ui/media-library.js";
import {mediaLibraryPreview} from "../src/media-library-preview-fixture.js";
import worker from "../src/index.js";

const id="00000000-0000-4000-8000-000000000001",base=`/stores/${id}/media-library`;
const ann=style=>({version:1,style,copy:{title:"Private merchant words"},media:{hero:{url:"https://private.example.invalid/secret.webp"}}});
const guide=(settings={},extra={})=>buildMediaSizeGuide({storeId:id,settings,...extra});
const item=(g,id)=>g.items.find(i=>i.id===id);

test("all eight Ann themes use saved-design authority and stay separate from classic ratios",()=>{
  for(const style of STYLE_IDS){
    const settings={style_preset:"vintage",ann_design:ann(style)},before=JSON.stringify(settings);
    const g=guide(settings);
    assert.equal(g.theme.id,style);assert.equal(g.theme.source,"ann_design");
    assert.equal(item(g,"product-gallery").desktop.ratio,"4:5");
    assert.equal(item(g,"product-gallery").mobile.ratio,"4:5");
    assert.equal(item(g,"product-card").desktop.ratio,["editorial","creator-feed"].includes(style)?"4:5":"1:1");
    assert.equal(JSON.stringify(settings),before);
    assert(!JSON.stringify(g).includes("Private merchant words"));
    assert(!JSON.stringify(g).includes("private.example.invalid"));
  }
  assert.equal(item(guide({ann_design:ann("minimal")}),"home-hero-split").desktop.ratio,"1:1");
  assert.equal(item(guide({style_preset:"minimal"}),"home-hero-split").desktop.ratio,"4:5");
  assert.equal(item(guide({style_preset:"editorial"}),"product-card").desktop.ratio,"3:4");
  assert.equal(item(guide({style_preset:"boutique"}),"product-card").desktop.ratio,"1:1");
  assert.equal(guide({ann_design:{...ann("minimal"),media:[]},style_preset:"vintage"}).theme.source,"style_preset");
  assert.equal(guide().theme.id,"aura");
});

test("compare and category views are read-only, all categories have real placements and media recommendations are bounded",()=>{
  const saved={ann_design:ann("editorial")},before=JSON.stringify(saved);
  const g=guide(saved,{theme:"boutique"});
  assert.equal(g.theme.source,"compare");assert.equal(g.theme.id,"boutique");
  assert.equal(g.saved_theme.id,"editorial");assert.match(g.notice,/does not change/);
  assert.equal(JSON.stringify(saved),before);
  for(const category of MEDIA_GUIDE_CATEGORIES){
    const current=guide(saved,{category:category.id});
    assert(current.items.length>0);assert(current.items.every(i=>i.category===category.id));
  }
  for(const style of STYLE_IDS)for(const i of guide({ann_design:ann(style)}).items){
    for(const box of [i.desktop,i.mobile]){
      assert(box.width>0&&box.width<=MEDIA_GUIDE_LIMITS.max_axis);
      assert(box.height>=0&&box.height<=MEDIA_GUIDE_LIMITS.max_axis);
      assert(box.width*Math.max(box.height,1)<=MEDIA_GUIDE_LIMITS.max_pixels);
      if(/^\d+:\d+$/.test(box.ratio)){
        const [w,h]=box.ratio.split(":").map(Number);
        assert(Math.abs(box.height-box.width*h/w)<=1);
      }
    }
    assert(i.locations.every(l=>l.href.startsWith(`/stores/${id}/`)));
  }
});

test("gallery, natural and flexible frames describe real reuse without invented mobile upload fields",()=>{
  const g=guide({ann_design:ann("editorial")});
  assert.equal(item(g,"home-hero-split").mobile.ratio,"1:1");
  assert.equal(item(g,"gallery").desktop.ratio,"Flexible");
  assert.equal(item(g,"featured-product").desktop.ratio,"Flexible");
  assert.equal(item(g,"blog-list-card").desktop.ratio,"16:10");
  assert.equal(item(g,"blog-hero").desktop.ratio,"Natural");
  assert.equal(item(g,"blog-body").desktop.ratio,"Natural");
  assert.equal(item(g,"cart-thumb").desktop.ratio,"Flexible");
  assert.match(item(g,"cart-thumb").notes.join(" "),/no separate upload/);
  assert.match(item(g,"brand-logo").notes.join(" "),/text wordmark/);
  assert.match(g.items.filter(i=>i.id!=="brand-logo").map(i=>i.notes.join(" ")).join(" "),/same uploaded file/i);
  const classic=guide({}, {layouts:[{page_key:"about",layout:[{type:"founder"}]}]});
  assert(item(classic,"founder").active);
  assert.equal(item(classic,"craft").active,false);
  assert.equal(item(classic,"lookbook").desktop.ratio,"4:5");
});

test("upload advice matches actual media validation and live shared product/blog CSS",async()=>{
  const read=p=>readFile(new URL(`../${p}`,import.meta.url),"utf8");
  const validation=await read("src/store/media.js");
  assert.match(validation,/type === "logo" \? 5 \* 1024 \* 1024 : 10 \* 1024 \* 1024/);
  assert.equal(MEDIA_GUIDE_LIMITS.logo_bytes,5*1048576);
  assert.equal(MEDIA_GUIDE_LIMITS.image_bytes,10*1048576);
  assert.equal(MEDIA_GUIDE_LIMITS.video_bytes,10*1048576);
  const product=await read("src/public/commerce-signature.css"),blogs=await read("src/public/store-articles.css");
  assert.match(product,/\.cm-stage\{[^}]*aspect-ratio:4\/5/);
  assert.match(blogs,/\.sa-card img\{[^}]*aspect-ratio:16\/10/);
  const model=await read("src/public/media-placement-guide.js");
  assert.doesNotMatch(model,/window\.|document\.|fetch\(/);
});

test("SSR renders working view filters, keeps the selected tab and escapes untrusted fields",()=>{
  const g=guide({ann_design:ann("editorial")},{theme:"boutique",category:"blog"});
  const html=renderMediaLibrary({store:{store_id:id,name:"Example"},items:[],tab:"sizes",
    guide_theme:"boutique",guide_category:"blog",size_guide:g},{name:"Example"});
  assert.match(html,/name="tab" value="sizes"/);
  assert.match(html,/name="guide_theme"/);assert.match(html,/name="guide_category"/);
  assert.match(html,/value="boutique" selected/);assert.match(html,/value="blog" selected/);
  assert.match(html,/aria-selected="true"[^>]*data-tab="sizes"/);
  assert.match(html,/id="lml-panel-sizes"[^>]*data-panel="sizes">/);
  assert.match(html,/tab=sizes&amp;guide_theme=boutique&amp;guide_category=blog/);
  assert.match(html,/media-size-guide.css/);
  assert.doesNotMatch(html,/This guide is not live|name="ann_design"/);
  const unsafe=structuredClone(g);unsafe.theme.name="<script>alert(1)</script>";
  unsafe.items[0].locations=[{label:"<img>",href:"javascript:alert(1)"}];
  const rendered=renderMediaSizeGuide(unsafe,{base});
  assert.match(rendered,/&lt;script&gt;/);assert.doesNotMatch(rendered,/<script>|href="javascript:/);
});

test("the development guide remains usable with GET filters and real fixture assets",async()=>{
  const r=mediaLibraryPreview(new Request("https://lebrands.store/__media-library-preview?tab=sizes&guide_theme=boutique&guide_category=blog"),
    {store_id:id,name:"Example"},{ann_design:ann("editorial")});
  const html=await r.text();assert.equal(r.status,200);
  assert.match(html,/action="\/__media-library-preview"/);
  assert.match(html,/Comparing Modern Boutique/);
  assert.match(html,/Your store stays on Editorial/);
});

test("the actual Worker asset gate serves the guide stylesheet on the account hostname",async()=>{
  let seen;
  const r=await worker.fetch(new Request("https://app.lebrands.store/assets/media-size-guide.css"),{
    ASSETS:{async fetch(req){seen=new URL(req.url).pathname;return new Response(".msg{}",{headers:{"content-type":"text/css"}});}}
  },{});
  assert.equal(r.status,200);assert.equal(seen,"/media-size-guide.css");
});
