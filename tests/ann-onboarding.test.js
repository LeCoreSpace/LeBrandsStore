import test from "node:test";
import assert from "node:assert/strict";
import {setupAnnFixtureDatabase,annFixtureAdapter} from "../src/ann-preview-fixture.js";
import {handleAnnRoutes} from "../src/store/ann-routes.js";
import {renderAnnThemeEditor} from "../src/ui/ann-theme-editor.js";
import {designSections,validDesignSections,applyDesignSections} from "../src/public/ann-section-layout.js";
import {productSuggestions} from "../src/public/ann-product-suggestions.js";
import {publishChecklist} from "../src/public/validation.js";
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",user={id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"},hash="a".repeat(64);
const req=(method="GET",body)=>new Request(`https://app.lebrands.store/api/stores/${id}/ann/onboarding`,{method,headers:{origin:"https://app.lebrands.store","content-type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
test("Ann onboarding updates real draft brand/address with optimistic and ownership guards",async()=>{
  const pg=await setupAnnFixtureDatabase();try {
    const db=annFixtureAdapter(pg),call=r=>handleAnnRoutes(r,{},db,user,hash);
    const first=await call(req());assert.equal(first.status,200);let initial=await first.json();
    assert.match(initial.expected_draft,/^[a-f0-9]{64}$/);
    let r=await call(req("PATCH",{expected_draft:initial.expected_draft,confirm:true,brand_name:"New Studio"}));assert.equal(r.status,200);let next=await r.json();
    assert.equal(next.settings.brand_name,"New Studio");assert.equal(next.store.name,"New Studio");
    assert.equal((await call(req("PATCH",{expected_draft:initial.expected_draft,confirm:true,brand_name:"Old entry"}))).status,409);
    r=await call(req("PATCH",{expected_draft:next.expected_draft,confirm:true,subdomain:"new-studio"}));assert.equal(r.status,200);next=await r.json();
    assert.equal(next.store.subdomain,"new-studio");assert.equal(next.draft.progress.step,initial.draft.progress.step);
    assert.equal((await call(req("PATCH",{expected_draft:next.expected_draft,confirm:true,subdomain:"again-new-studio"}))).status,409);
    for(const body of [{confirm:false,brand_name:"Unsafe"},{confirm:true,brand_name:"X"},{confirm:true,brand_name:"Okay",seller_gstin:"unverified"}])
      assert.equal((await call(req("PATCH",{expected_draft:next.expected_draft,...body}))).status,400);
    assert.equal((await handleAnnRoutes(req("PATCH",{expected_draft:next.expected_draft,confirm:true,brand_name:"Paused"}),{ANN_BUILDER_ENABLED:"false"},db,user,hash)).status,503);
    const html=renderAnnThemeEditor({...next.draft,role:"owner"},user);
    assert.match(html,/Open browser preview/);assert.match(html,/sandbox="allow-same-origin"/);assert.doesNotMatch(html,/Standard Builder/);
  } finally {await pg.close();}
});
test("Shared section arrangement preserves protected forms and accepts only identifiers",()=>{
  const html='<main class="sc-main"><section><h1>Start</h1><img src="test.webp"></section><section><h2>Story</h2><p>Text</p></section><section><h2>FAQ</h2></section></main>';
  assert.equal(designSections(html).sections.length,3);
  const cfg={home:{order:["main-2","main-0","main-1"],hidden:["main-1"]}};
  const out=applyDesignSections(html,cfg);
  assert.ok(out.indexOf("FAQ")<out.indexOf("Start"));assert.doesNotMatch(out,/Story/);
  assert.equal(applyDesignSections(out,cfg),out);
  assert.equal(validDesignSections({home:{hidden:['<script>']}}),false);
  assert.equal(validDesignSections({checkout:{hidden:["main-0"]}}),false);
  assert.equal(validDesignSections({product:{hidden:["main-0"]}}),false);
  assert.equal(validDesignSections({contact:{order:["main-1","main-0"]}}),false);
  const first='<main><section class="ed-hero"><h1>Welcome</h1></section><section class="sc-sec sc-faq"><h2>Questions</h2></section></main>';
  const added=first.replace('<section class="sc-sec sc-faq">','<section class="sc-sec sc-bundle"><h2>A new bundle</h2></section><section class="sc-sec sc-faq">');
  const faq=designSections(first).sections[1].id;
  assert.equal(designSections(added).sections[2].id,faq,"adding a section cannot reassign the ID of another section");
  const changed=applyDesignSections(added,{home:{hidden:[faq]}});
  assert.match(changed,/A new bundle/);assert.doesNotMatch(changed,/Questions/);
  assert.equal(validDesignSections({product:{hidden:["slot-core-product-0"]}}),false);
});
test("Product suggestions explicitly separate candidate headings from verified HSN",()=>{
  const values=productSuggestions({name:"Men's Clothing"});assert.equal(values.length,5);
  assert.ok(values.every(p=>/^\d{4}$/.test(p.hsn_code)&&p.hsn_note.includes("not a verified tax code")));
  assert.deepEqual(productSuggestions({name:"Unknown niche"}),[]);
  assert.equal(productSuggestions({name:"Unknown"},[{name:"Skin type",values:[{value:"Dry"}]}]).length,0);
  const check=publishChecklist({settings:{ann_design:{catalogue_mode:"sample"}},store:{},products:[],policies:[]});
  assert.ok(check.some(c=>c.label.includes("real products")&&!c.complete));
});
test("Catalogue-only onboarding saves real draft items without changing design, palette or page layouts",async()=>{
  const pg=await setupAnnFixtureDatabase();try {
    const db=annFixtureAdapter(pg),call=async(action,method="GET",body)=>{
      const r=await handleAnnRoutes(new Request(`https://app.lebrands.store/api/stores/${id}/ann/${action}`,{method,headers:{origin:"https://app.lebrands.store","content-type":"application/json"},...(body?{body:JSON.stringify(body)}:{})}),{},db,user,hash);
      const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;
    };
    const before=await call("onboarding");
    const saved=await call("session","PATCH",{expected_revision:0,current_step:"products",answers:{category_id:1,subcategory_id:1,style_preset:"vintage",
      collections:[{key:"initial",name:"First collection",description:"Everyday pieces"}],
      product_ideas:[{key:"tee",collection_key:"initial",name:"Cotton tee",description:"An everyday cotton T-shirt",attributes:[]}]}});
    const prepared=await call("application");
    const payload={expected_revision:saved.session.revision,expected_draft:prepared.expected_draft,confirm:true,pages:[],
      products:[{key:"tee",target:"new",price_paise:49900,gst_rate:5,stock:2,hsn_code:"6109",media_id:null}],collections:[{key:"initial",target:"new"}]};
    const applied=await call("application","POST",payload);
    assert.equal(applied.draft.products.length,before.draft.products.length+1);
    assert.equal(applied.draft.collections.length,before.draft.collections.length+1);
    assert.equal(applied.draft.products.find(p=>p.title==="Cotton tee").hsn_code,"6109");
    assert.equal(applied.draft.settings.style_preset,before.settings.style_preset);
    assert.deepEqual(applied.draft.settings.ann_design,before.settings.ann_design);
    assert.deepEqual(applied.draft.layouts,before.draft.layouts);
    const replay=await call("application","POST",payload);
    assert.equal(replay.draft.products.length,applied.draft.products.length);
  } finally {await pg.close();}
});
