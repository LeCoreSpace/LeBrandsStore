import test from "node:test";
import assert from "node:assert/strict";
import {productDetailRows,productFeatureRows,storefrontProduct} from "../src/public/product-details.js";
import {syncPublishedProducts} from "../src/dashboard/repository.js";
import {serveStorefront} from "../src/store/live.js";
import {readFile} from "node:fs/promises";

const STORE="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",PRODUCT="11111111-1111-4111-8111-111111111111";
const classified=(prefix="Published")=>({
  id:PRODUCT,title:"Cotton shirt",slug:"cotton-shirt",description:"A considered cotton shirt.",price_paise:150000,stock:4,sku:"SHIRT-1",
  classification:{expected_revision:1,descriptors:[
    {descriptor_id:1,text_value:`${prefix} cotton`},
    {descriptor_id:2,value_ids:[22,21]},
    {descriptor_id:3,number_value:0},
    {descriptor_id:4,boolean_value:false},
  ]},
  classification_reference:{descriptors:[
    {id:1,name:"Material",input_type:"text",values:[]},
    {id:2,name:"Occasion",input_type:"multi_select",values:[{id:21,value:"Work"},{id:22,value:"Casual"},{id:23,value:"Unselected"}]},
    {id:3,name:"Weight",input_type:"number",unit:"g",values:[]},
    {id:4,name:"Assembly required",input_type:"boolean",values:[]},
  ]},catalogue_revision:1,
});
test("project selected descriptor labels/values only, preserving zero, false, units and enum order",()=>{
  const p=classified();
  assert.deepEqual(productDetailRows(p),[
    {label:"Material",value:"Published cotton"},{label:"Occasion",value:"Casual, Work"},
    {label:"Weight",value:"0 g"},{label:"Assembly required",value:"No"},
  ]);
  p.classification.descriptors.push({descriptor_id:99,text_value:"Unknown"});assert.equal(productDetailRows(p).length,4);
  p.classification_reference.descriptors.push({id:100,name:"Unset",input_type:"boolean"});
  p.classification.descriptors.push({descriptor_id:100});assert.equal(productDetailRows(p).length,4);
  assert.deepEqual(productDetailRows({}),[]);
});
test("explicit frozen facts take precedence over draft classification, including an explicit empty list",()=>{
  const p={...classified("Unpublished"),product_details:[{label:"Origin",value:"Published origin"}]};
  assert.deepEqual(productDetailRows(p),p.product_details);
  assert.deepEqual(productDetailRows({...p,product_details:[]}),[]);
  assert.deepEqual(productDetailRows({...p,product_details:[{label:"",value:"Hidden"},{label:"Missing value"}]}),[]);
});
test("all selected enum labels remain visible even when their combined length exceeds a text field",()=>{
  const values=Array.from({length:30},(_,i)=>({id:i+1,value:`Value ${i} ${"x".repeat(180)}`}));
  const p={classification:{descriptors:[{descriptor_id:1,value_ids:values.map(v=>v.id)}]},
    classification_reference:{descriptors:[{id:1,name:"Contents",input_type:"multi_select",values}]}};
  assert.equal(productDetailRows(p)[0].value,values.map(v=>v.value).join(", "));
});
test("selected facts replace contradictory same-label theme features, retaining unrelated copy",()=>{
  const p={...classified(),content:{features:[{label:" material ",value:"Stale copy"},{label:"Story",value:"Hand finished"}]}};
  const rows=productFeatureRows(p);
  assert.deepEqual(rows[0],{label:"Story",value:"Hand finished"});
  assert.equal(rows.filter(r=>r.label.toLowerCase()==="material").length,1);
  assert.ok(!JSON.stringify(rows).includes("Stale copy"));
});
test("public products freeze plain facts and omit internal classification IDs, references and revisions",()=>{
  const raw=classified(),before=structuredClone(raw),result=storefrontProduct(raw);
  assert.deepEqual(raw,before);
  for(const field of ["classification","classification_reference","catalogue_revision"])assert.ok(!(field in result));
  assert.equal(result.product_details.length,4);
  raw.classification_reference.descriptors[0].name="Changed master";
  raw.classification.descriptors[0].text_value="Changed draft";
  assert.deepEqual(productDetailRows(result)[0],{label:"Material",value:"Published cotton"});
});

test("operational updates retain frozen or legacy-published facts; explicit catalogue saves update only the target",async t=>{
  for(const mode of ["frozen","legacy","clear","explicit","archive","draft-store"]){
    await t.test(mode,async()=>{
      const published=mode==="legacy"?classified():storefrontProduct(classified());
      if(mode==="clear")published.product_details=[];
      published.content={features:[{label:"Theme",value:"Published theme copy"}]};
      published.collection_ids=["published-collection"];
      const other={id:"22222222-2222-4222-8222-222222222222",product_details:[{label:"Other product",value:"Must stay unchanged"}]};
      const draft=classified("UNPUBLISHED SECRET");
      draft.status=mode==="archive"?"archived":"active";
      draft.content={features:[{label:"Theme",value:"DRAFT theme copy"}]};
      const before=structuredClone(published);
      let saved=null;
      const tx=async(parts,...values)=>{
        const sql=parts.join("?").replace(/\s+/g," ").trim();
        if(sql.startsWith("SELECT status FROM public.stores"))return[{status:mode==="draft-store"?"draft":"live"}];
        if(sql.startsWith("UPDATE public.products"))return[];
        if(sql.startsWith("SELECT snapshot FROM public.store_publications"))return[{snapshot:{products:[published,other]}}];
        if(sql.startsWith("SELECT store_id, name, subdomain"))return[{store_id:STORE,name:"Store",subdomain:"store",status:"live"}];
        if(sql.includes("FROM public.store_setup"))return[];
        if(sql.startsWith("SELECT EXISTS"))return[{locked:false}];
        if(sql.startsWith("SELECT *, to_json(tags)"))return mode==="archive"?[]:[{
          ...draft,catalogue:{},track_inventory:true,created_at:"2026-01-01",id:PRODUCT,
        }];
        if(sql.includes("FROM public.product_media")||sql.includes("FROM public.policy_pages")||sql.includes("FROM public.product_options"))return[];
        if(sql.includes("information_schema.columns"))return[{enabled:false}];
        if(sql.includes("to_regprocedure('public.catalogue_write_product"))return[{enabled:true}];
        if(sql.includes("to_regclass")||sql.includes("to_regprocedure"))return[{enabled:false,pages_enabled:false}];
        if(sql.includes("selection_json")&&sql.includes("reference_json"))return[{
          id:PRODUCT,catalogue_revision:2,selection_json:JSON.stringify(draft.classification),
          reference_json:JSON.stringify(draft.classification_reference),
        }];
        if(sql.startsWith("UPDATE public.store_publications")){
          assert.equal(values.at(-1),STORE,"Updates must target the current store");
          saved=values[0];return[];
        }
        throw Error(`Unexpected fixture query: ${sql}`);
      };
      tx.json=structuredClone;
      await syncPublishedProducts(tx,STORE,PRODUCT,mode==="explicit");
      if(mode==="draft-store"){assert.equal(saved,null);return;}
      assert.deepEqual(saved.find(p=>p.id===other.id),other);
      if(mode==="archive"){assert.ok(!saved.find(p=>p.id===PRODUCT));return;}
      const updated=saved.find(p=>p.id===PRODUCT);
      assert.ok(!("classification" in updated));
      assert.deepEqual(updated.content,published.content);
      assert.deepEqual(updated.collection_ids,published.collection_ids);
      assert.deepEqual(productDetailRows(updated),mode==="explicit"?productDetailRows(draft):productDetailRows(before));
      assert.equal(updated.product_details.some(d=>d.value.includes("UNPUBLISHED SECRET")),mode==="explicit");
    });
  }
});

test("live response reads the tenant publication only, not draft products or current master data",async()=>{
  const products=[storefrontProduct(classified())],snapshot={settings:{brand_name:"Published store"},store:{store_id:STORE},products};
  let publicationReads=0;
  const db={withStore:async(id,callback)=>{
    assert.equal(id,STORE);
    return callback(async(parts,...values)=>{
      const sql=parts.join("?").replace(/\s+/g," ").trim();
      if(sql.includes("SELECT p.snapshot")){
        assert.equal(values[0],STORE);assert.match(sql,/s.status = 'live'/);publicationReads++;
        return[{snapshot:structuredClone(snapshot)}];
      }
      if(sql.includes("information_schema.columns"))return[{enabled:false}];
      if(sql.includes("to_regclass"))return[{pages_enabled:false}];
      throw Error(`Live storefront must not read draft or master data: ${sql}`);
    });
  }};
  const response=await serveStorefront(new Request("https://published.lebrands.store/products/cotton-shirt"),db,{store_id:STORE,subdomain:"published",name:"Published store"});
  assert.equal(response.status,200);assert.equal(publicationReads,1);
  const html=await response.text();
  assert.ok(html.includes("Published cotton"));
  assert.ok(!html.includes("UNPUBLISHED SECRET"));
  const unavailable=await serveStorefront(new Request("https://published.lebrands.store/products/cotton-shirt"),
    {withStore:async(_id,cb)=>cb(async(parts)=>parts.join("").includes("information_schema")?[{enabled:false}]:[])},
    {store_id:STORE,subdomain:"published"});
  assert.equal(unavailable,null);
});
test("all store publication writes use the public projection before persisting the snapshot",async()=>{
  const source=await readFile(new URL("../src/store/repository.js",import.meta.url),"utf8");
  assert.match(source,/publicationData\.products = publicationData\.products\.map\(product=>storefrontProduct\(product\)\)/);
  assert.ok(source.indexOf("publicationData.products =")<source.indexOf("INSERT INTO public.store_publications"));
});
