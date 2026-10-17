import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {catalogueFormURL,isCatalogueMessage,attachAnnCatalogue} from "../src/public/catalogue-modal.js";

test("modal destinations stay on the current store's existing form routes",()=>{
  const origin="https://example.invalid",root="/stores/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  assert.equal(catalogueFormURL(root,"products","new",origin).href,`${origin}${root}/products/new?ann_modal=1`);
  const id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  assert.equal(catalogueFormURL(root,"collections",id,origin).pathname,`${root}/collections/${id}`);
  assert.equal(catalogueFormURL("/__ann-builder-preview/catalogue","products","new",origin).origin,origin);
  const context={category_id:1,subcategory_id:2};
  const url=catalogueFormURL(root,"products","new",origin,context);
  assert.equal(url.searchParams.get("ann_category_id"),"1");
  assert.equal(url.searchParams.get("ann_subcategory_id"),"2");
  assert.equal(catalogueFormURL(root,"products",id,origin,context).searchParams.has("ann_subcategory_id"),false);
  assert.equal(catalogueFormURL(root,"collections","new",origin,context).searchParams.has("ann_subcategory_id"),false);
  for(const invalid of ["https://foreign.invalid","//foreign.invalid","/../other","/x/%2e%2e","/x/./other"]){
    assert.throws(()=>catalogueFormURL(invalid,"products","new",origin));
  }
  for(const invalid of ["../new","?other=1","------------------------------------"]){
    assert.throws(()=>catalogueFormURL(root,"products",invalid,origin));
  }
  assert.throws(()=>catalogueFormURL(root,"orders","new",origin));
});

test("only the active same-origin form can refresh or close Ann's modal",()=>{
  const source={},frame={contentWindow:source},origin="https://example.invalid";
  const event={origin,source,data:{type:"lebrands:ann-catalogue",action:"saved"}};
  assert.equal(isCatalogueMessage(event,frame,origin),true);
  assert.equal(isCatalogueMessage({...event,origin:"https://foreign.invalid"},frame,origin),false);
  assert.equal(isCatalogueMessage({...event,source:{}},frame,origin),false);
  assert.equal(isCatalogueMessage(event,null,origin),false);
  assert.equal(isCatalogueMessage({...event,data:{type:event.data.type,action:"publish"}},frame,origin),false);
});

test("catalogue controls show actual shared records, escape names and respect read-only mode",()=>{
  const oldWindow=globalThis.window,oldDocument=globalThis.document;
  globalThis.window={addEventListener(){}};
  globalThis.document={addEventListener(){}};
  try{
    const ui=attachAnnCatalogue({root:"/stores/example",readOnly:true,getDraft:()=>({
      collections:[{id:"c",title:"<script>Bad</script>"}],
      products:[{id:"p",title:"Actual serum",status:"draft"},{id:"a",title:"Archived",status:"archived"}],
    })});
    assert.equal(ui.open("products"),false);
    const products=ui.html("products");
    assert.match(products,/Actual serum/);assert.doesNotMatch(products,/Archived/);
    assert.match(products,/data-ann-catalogue-open="products" disabled/);
    assert.match(ui.html("collections"),/&lt;script&gt;Bad&lt;\/script&gt;/);
    assert.equal(ui.html("orders"),"");
  }finally{globalThis.window=oldWindow;globalThis.document=oldDocument;}
});

test("Ann uses shared dashboard forms and refreshes without hydrating or resetting design edits",()=>{
  const dashboard=readFileSync("src/public/dashboard.js","utf8");
  assert.match(dashboard,/catalogueEmbed=attachCatalogueEmbed\(\{root,storeRoot\}\)/);
  assert.equal((dashboard.match(/if\(catalogueEmbed\)\{catalogueEmbed\.saved\(\);return;\}/g)||[]).length,5);
  const ann=readFileSync("src/public/ann-builder.js","utf8");
  assert.match(ann,/catalogueUI\.html\(p\.step\)/);
  assert.match(ann,/refreshAnnDraft\(await designUI\.refreshCatalogue\(\)\)/);
  const design=readFileSync("src/public/ann-design-ui.js","utf8");
  const refresh=design.slice(design.indexOf("async refreshCatalogue()"),design.indexOf("/** The design to preview"));
  assert.match(refresh,/stable\(body\.design\)!==stable\(design\)/);
  assert.doesNotMatch(refresh,/\bingest\(|undoStack\s*=|model\s*=/);
  assert.match(readFileSync("src/index.js","utf8"),/"catalogue-modal\.js"/);
});
