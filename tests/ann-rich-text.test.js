import test from "node:test";
import assert from "node:assert/strict";
import {validRichTextDocument,richTextPlain,renderRichText,applyRichDesignText} from "../src/public/ann-rich-text.js";
import {validateDesignRequest,seedAnnDesign} from "../src/store/ann-design.js";
import {applyDesignContent} from "../src/public/ann-section-content.js";
import {renderAura} from "../src/public/aura.js";
import {renderStylePreview,designPreviewData} from "../src/public/style-preview.js";
import {SHOWCASE_STYLES} from "../src/public/aura-showcase.js";
import {setupAnnFixtureDatabase,annFixtureAdapter} from "../src/ann-preview-fixture.js";
import {handleAnnRoutes} from "../src/store/ann-routes.js";

const doc=(text="Our chapter")=>({version:1,runs:[{text,bold:true,color:"#802647",highlight:"#fff1cc"}],
  style:{font:"georgia",size:40,align:"center",lineHeight:1.4,letterSpacing:.5,preset:"title"}});
const request={expected_draft:"a".repeat(64),confirm:true};
test("rich-text contract bounds JSON, controls, styles, links and character limits",()=>{
  assert.ok(validRichTextDocument(doc(),240));
  assert.equal(richTextPlain(doc()),"Our chapter");
  const variants=[
    {...doc(),html:"<script>"},
    {...doc(),style:{color:"red;background:url(javascript:alert(1))"}},
    {...doc(),style:{font:"url(https://other.invalid)"}},
    {...doc(),style:{size:121}},
    {...doc(),style:{lineHeight:Infinity}},
    {...doc(),runs:[{text:"<img src=x onerror=alert(1)>"}]},
    {...doc(),runs:[{text:"safe",link:"javascript:alert(1)"}]},
    {...doc(),runs:[{text:"safe",link:"//external.invalid"}]},
    {...doc(),runs:[{text:"safe",link:"https://safe.invalid/' onmouseover='x"}]},
    {...doc(),runs:[{text:"safe",color:"red"}]},
    {...doc(),runs:Array.from({length:121},()=>({text:"a"}))},
  ];
  for(const v of variants)assert.equal(validRichTextDocument(v),false,JSON.stringify(v));
  assert.equal(validRichTextDocument(doc("a".repeat(241)),240),false);
  assert.equal(validRichTextDocument(doc("a\u0000")),false);
  for(const link of ["https://example.invalid/path?x=1&y=2","http://example.invalid","mailto:hello@example.invalid","tel:+123456789"])
    assert.ok(validRichTextDocument({...doc(),runs:[{text:"safe",link}]}));
});
test("request validation accepts safe formatting but never dynamic commerce settings or mismatched text",()=>{
  assert.doesNotThrow(()=>validateDesignRequest({...request,copy:{title:"Our chapter"},formatting:{title:doc()}}));
  assert.doesNotThrow(()=>validateDesignRequest({...request,formatting:{title:null}}));
  for(const formatting of [{price:doc()},{title:{...doc(),style:{position:"fixed"}}},{title:doc("different")}])
    assert.throws(()=>validateDesignRequest({...request,copy:{title:"Our chapter"},formatting}),e=>e.status===400);
});
test("rendering preserves semantics and never nests a link/list in a heading, button or link",()=>{
  const body={version:1,runs:[{text:"One\nTwo",link:"https://example.invalid"}],style:{list:"number"}};
  assert.match(renderRichText(body),/role="listitem"/);
  for(const tag of ["h1","button","a"]){
    const input=`<${tag} data-ann-copy-field="title">Before</${tag}>`;
    const output=applyRichDesignText(input,{copy:{title:"One\nTwo"},formatting:{title:body}});
    assert.equal((output.match(/<a\b/g)||[]).length,tag==="a"?1:0);
    assert.doesNotMatch(output,/role="list"/);
    assert.match(output,new RegExp(`^<${tag}\\b`));
  }
  const output=applyRichDesignText('<p style="--i:1" data-ann-copy-field="description">Before</p>',
    {copy:{description:"Our chapter"},formatting:{description:doc()}});
  assert.match(output,/--i:1/);assert.match(output,/font-family:Georgia/);
  assert.match(output,/color:#802647/);assert.match(output,/font-size:clamp/);
  assert.match(output,/font-weight:700/);
  assert.equal(applyRichDesignText('<p data-ann-copy-field="title">Original</p>',{copy:{title:"mismatch"},formatting:{title:doc()}}),
    '<p data-ann-copy-field="title">Original</p>');
});
test("section typography is applied after stable field numbering, never to stock/prices/forms",()=>{
  const base='<main><section><h2>Our story</h2><p>First paragraph</p><p>Second paragraph</p><p class="sc-price">999</p><form><p>Protected</p></form></section></main>';
  const annotated=applyDesignContent(base,{copy:{},media:{}},"home",true);
  const fields=[...annotated.matchAll(/data-design-copy="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(fields.length,3);
  const key=fields[1],design={copy:{[key]:"New paragraph"},media:{},formatting:{[key]:doc("New paragraph")}};
  const html=applyRichDesignText(applyDesignContent(base,design,"home",true),design);
  assert.match(html,/font-family:Georgia/);assert.match(html,/>Second paragraph</);
  assert.match(html,/<p class="sc-price">999<\/p>/);assert.match(html,/<form><p>Protected<\/p><\/form>/);
  assert.deepEqual([...html.matchAll(/data-design-copy="([^"]+)"/g)].map(m=>m[1]),fields);
});
test("all themes render identical saved formatting in live and sample previews without changing old designs",()=>{
  const source={store:{id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",name:"Example Studio"},
    settings:{brand_name:"Example Studio"},products:[],collections:[],layouts:{},menus:[],policies:[]};
  for(const style of SHOWCASE_STYLES){
    const design=seedAnnDesign(source,{store_name:"Example Studio",category_id:1,subcategory_id:1,style_preset:style},"sample");
    design.copy.title="Our chapter";design.formatting={title:doc()};
    const draft={...source,settings:{...source.settings,ann_design:design}};
    const live=renderAura(draft,{page:"home",preview:true,commerce:true});
    assert.match(live,/color:#802647/,style);assert.match(live,/font-family:Georgia/,style);
    const data=designPreviewData(source,design);
    const sample=renderStylePreview(data,{...data.settings,style_preset:style},{page:"home",designEdit:true});
    assert.match(sample,/color:#802647/,`${style} sample`);
    delete design.formatting;
    assert.doesNotMatch(renderAura({...source,settings:{...source.settings,ann_design:design}},{page:"home"}),/color:#802647/);
  }
});
test("real restricted-role draft save/reload retains typography, rejects stale saves and supports clearing",async()=>{
  const pg=await setupAnnFixtureDatabase({sampleCatalogue:true}),db=annFixtureAdapter(pg);
  const store="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",owner={id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"},token="a".repeat(64);
  const call=async(method,body,user=owner,hash=token)=>{
    const response=await handleAnnRoutes(new Request(`https://app.lebrands.store/api/stores/${store}/ann/design`,{
      method,headers:{origin:"https://app.lebrands.store","content-type":"application/json"},
      ...(body?{body:JSON.stringify(body)}:{})}),{},db,user,hash);
    return {status:response.status,body:await response.json()};
  };
  try{
    const start=await call("GET");
    let state=await call("POST",{...request,expected_draft:start.body.expected_draft,catalogue_mode:"sample",
      answers:{store_name:"Example Studio",category_id:1,subcategory_id:1,style_preset:"boutique"}});
    assert.equal(state.status,200,JSON.stringify(state.body));
    const originalProducts=JSON.stringify(state.body.draft.products);
    const prior=state.body.expected_draft;
    state=await call("PATCH",{...request,expected_draft:prior,copy:{title:"Our chapter"},formatting:{title:doc()}});
    assert.equal(state.status,200,JSON.stringify(state.body));
    assert.deepEqual(state.body.design.formatting.title,doc());
    const loaded=await call("GET");
    assert.deepEqual(loaded.body.design.formatting,state.body.design.formatting);
    const stored=(await pg.query("SELECT settings FROM store_setup WHERE store_id=$1",[store])).rows[0].settings;
    assert.deepEqual(stored.ann_design.formatting.title,doc());
    assert.equal(JSON.stringify(loaded.body.draft.products),originalProducts,"formatting never changes catalogue records");
    assert.equal((await call("PATCH",{...request,expected_draft:prior,copy:{title:"Stale"}})).status,409);
    assert.equal((await call("PATCH",{...request,expected_draft:loaded.body.expected_draft,formatting:{title:doc()}},
      {id:"cccccccc-cccc-4ccc-8ccc-cccccccccccc"},"b".repeat(64))).status,403);
    const unchanged=await call("PATCH",{...request,expected_draft:loaded.body.expected_draft,copy:{title:"Our chapter"}});
    assert.equal(unchanged.status,200,JSON.stringify(unchanged.body));
    assert.deepEqual(unchanged.body.design.formatting.title,doc(),"older unchanged plain-text payloads retain formatting");
    const reset=await call("PATCH",{...request,expected_draft:unchanged.body.expected_draft,formatting:{title:null}});
    assert.equal(reset.status,200,JSON.stringify(reset.body));
    assert.equal(reset.body.design.formatting,undefined);assert.equal(reset.body.design.copy.title,"Our chapter");
    const restored=await call("PATCH",{...request,expected_draft:reset.body.expected_draft,formatting:{title:doc()}});
    const changed=await call("PATCH",{...request,expected_draft:restored.body.expected_draft,copy:{title:"Plain replacement"}});
    assert.equal(changed.status,200,JSON.stringify(changed.body));
    assert.equal(changed.body.design.formatting,undefined,"plain-text replacement cannot retain a mismatched document");
  }finally{await pg.close();}
});
