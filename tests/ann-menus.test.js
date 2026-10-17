import test from "node:test";
import assert from "node:assert/strict";
import {validateDesignMenus,validateMenuUrl,defaultDesignMenus,renderDesignMenu} from "../src/public/ann-menu-model.js";
import {renderAura} from "../src/public/aura.js";
import {renderStylePreview,designPreviewData,stylePreviewData} from "../src/public/style-preview.js";
import {styleSettings,STYLE_IDS} from "../src/public/aura-styles.js";
import {browserPreviewLocation} from "../src/public/ann-preview-navigation.js";
import {setupAnnFixtureDatabase,annFixtureAdapter} from "../src/ann-preview-fixture.js";
import {handleAnnRoutes} from "../src/store/ann-routes.js";

const menus={header:[{label:"Our range",url:"/collections/all",children:[{label:"Daily serum",url:"/products/daily-serum"},{label:"Care guide",url:"/pages/about"}]},{label:"Our story",url:"/pages/about"}],footer:[{label:"Contact the studio",url:"/pages/contact"},{label:"Email us",url:"mailto:hello@example.invalid"}]};
test("menus accept only bounded plain data and safe destinations",()=>{
  assert.deepEqual(validateDesignMenus(menus),menus);
  for(const url of ["javascript:alert(1)","data:text/html,bad","//evil.invalid/","/%2fevil.invalid/","/foo%0a","https://user:password@example.invalid","https://example.invalid/a\\b","https://example.invalid/<b>","not a url"]){
    assert.throws(()=>validateMenuUrl(url),{status:400},url);
  }
  for(const url of ["/","/products/a-b","#reviews","https://example.invalid/","mailto:hello@example.invalid","tel:+919000000000"])assert.equal(validateMenuUrl(url),url);
  assert.throws(()=>validateDesignMenus({...menus,header:Array(13).fill(menus.header[0])}),/12/);
  assert.throws(()=>validateDesignMenus({...menus,header:[{label:"Bad",url:"/",children:[{label:"Bad child",url:"/",children:[]}]}]}),/supported/);
  assert.throws(()=>validateDesignMenus({...menus,header:[{label:"<script>",url:"/"}]}),/plain-text/);
  assert.throws(()=>validateDesignMenus({header:[{label:"Group",url:"/",children:Array(9).fill({label:"Child",url:"/"})}],footer:[]}),/eight/);
  const group={label:"Group",url:"/",children:Array(8).fill({label:"Child",url:"/"})};
  assert.throws(()=>validateDesignMenus({header:Array(7).fill(group),footer:[]}),/60/);
  assert.deepEqual(validateDesignMenus({header:[],footer:[]}),{header:[],footer:[]});
  assert.equal(defaultDesignMenus({policies:[{kind:"privacy",title:"Privacy"}]}).footer.at(-1).url,"/policies/privacy");
  assert.match(renderDesignMenu([{label:"A & B",url:"/collections/all"}]),/A &amp; B/);
});
const source={store:{store_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",subdomain:"example",name:"Example"},settings:{brand_name:"Example",style_preset:"boutique"},products:[{id:"ffffffff-ffff-4fff-8fff-ffffffffffff",slug:"daily-serum",title:"Daily serum",description:"Fictional daily serum product for preview.",price_paise:10000,stock:10,gst_rate:18,images:[]}],collections:[],policies:[]};
const design={version:1,style:"boutique",media_pack:"boutique",catalogue_mode:"own",plan:{style_preset:"boutique"},copy:{},media:{},sections:{},menus};
test("all saved styles render nested header and footer menus without replacing protected commerce controls",()=>{
  for(const style of STYLE_IDS){
    const data={...source,settings:{...source.settings,...styleSettings(style),ann_design:{...design,style,plan:{style_preset:style}}}};
    for(const page of ["home","product","cart","checkout","policy"]){
      const html=renderAura(data,{page,productId:source.products[0].id,policyKind:"privacy",commerce:true});
      assert.match(html.match(/<header\b[\s\S]*?<\/header>/)?.[0]||"",/Our range/,`${style}:${page}`);
      assert.match(html.match(/<footer\b[\s\S]*?<\/footer>/)?.[0]||"",/Contact the studio/,`${style}:${page}`);
      assert.match(html,/data-cart-open/,`${style}:${page}`);
      assert.match(html,/ann-menu-group/,`${style}:${page}`);
    }
  }
});
test("edited previews contain menus, public style showcases remain unchanged, and preview routes resolve handles",()=>{
  const data=designPreviewData(source,design),html=renderStylePreview(data,styleSettings("boutique"),{page:"home"});
  assert.match(html.match(/<header\b[\s\S]*?<\/header>/)?.[0]||"",/Our range/);
  const demo=stylePreviewData(data,{showcase:true});
  assert.doesNotMatch(renderStylePreview(demo,styleSettings("boutique"),{page:"home"}),/Our range/);
  assert.deepEqual(browserPreviewLocation("/products/daily-serum",source,"https://preview.example.invalid"),{page:"product",productId:source.products[0].id});
  assert.deepEqual(browserPreviewLocation("https://example.lebrands.store/products/daily-serum",source,"https://preview.example.invalid"),{page:"product",productId:source.products[0].id});
  assert.equal(browserPreviewLocation("https://other.invalid/products/daily-serum",source,"https://preview.example.invalid"),null);
});
test("menus save, reload, survive other edits and style changes, reject stale writes and retain tenant protections",async()=>{
  const pg=await setupAnnFixtureDatabase({sampleCatalogue:true});
  try{
    const db=annFixtureAdapter(pg),id=source.store.store_id;
    const call=async(method,body,editor=false)=>{
      const response=await handleAnnRoutes(new Request(`https://app.lebrands.store/api/stores/${id}/ann/design`,{method,headers:{origin:"https://app.lebrands.store","content-type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})}),{},db,{id:editor?"cccccccc-cccc-4ccc-8ccc-cccccccccccc":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"},(editor?"b":"a").repeat(64));
      return {status:response.status,body:await response.json()};
    };
    let state=(await call("GET")).body;
    let response=await call("POST",{expected_draft:state.expected_draft,confirm:true,catalogue_mode:"sample",answers:{style_preset:"boutique"}});
    assert.equal(response.status,200,JSON.stringify(response.body));state=response.body;
    const previous=state.expected_draft;
    response=await call("PATCH",{expected_draft:previous,confirm:true,menus});
    assert.equal(response.status,200,JSON.stringify(response.body));state=response.body;
    assert.deepEqual(state.design.menus,menus);
    assert.deepEqual((await call("GET")).body.design.menus,menus);
    assert.equal((await call("PATCH",{expected_draft:previous,confirm:true,menus:{header:[],footer:[]}})).status,409);
    assert.equal((await call("PATCH",{expected_draft:state.expected_draft,confirm:true,menus},true)).status,403);
    response=await call("PATCH",{expected_draft:state.expected_draft,confirm:true,copy:{title:"A merchant headline"}});
    assert.equal(response.status,200);state=response.body;assert.deepEqual(state.design.menus,menus);
    response=await call("POST",{expected_draft:state.expected_draft,confirm:true,catalogue_mode:"sample",answers:{style_preset:"editorial"}});
    assert.equal(response.status,200);state=response.body;assert.deepEqual(state.design.menus,menus);
    response=await call("PATCH",{expected_draft:state.expected_draft,confirm:true,menus:null});
    assert.equal(response.status,200);assert.equal(response.body.design.menus,undefined);
  }finally{await pg.close();}
});
