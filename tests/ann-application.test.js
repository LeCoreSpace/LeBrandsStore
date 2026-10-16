import test from "node:test";
import assert from "node:assert/strict";
import { setupAnnFixtureDatabase, annFixtureAdapter } from "../src/ann-preview-fixture.js";
import { handleAnnRoutes } from "../src/store/ann-routes.js";
import { applyAnnApplication, validateApplication, draftFingerprint } from "../src/store/ann-application.js";
import { annReference, loadAnnSession } from "../src/store/ann-repository.js";
import { rupeesToPaise, stockQuantity } from "../src/public/ann-application-ui.js";
import { loadDraft, saveProduct } from "../src/store/repository.js";
import { projectAnnPreview } from "../src/public/ann-projection.js";
import { annPreviewConfiguration } from "../src/public/ann-config.js";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", owner = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const hash = "a".repeat(64), other = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
test("Ann prices use exact INR paise and confirmation rejects guessed or protected values", async () => {
  assert.equal(rupeesToPaise("1299.09"),129909);
  assert.equal(rupeesToPaise("0.01"),1);
  for (const price of ["", "0", "1.999", "-1", "1e3", "1,299", "Infinity", "100000000.01"]) assert.throws(() => rupeesToPaise(price));
  assert.equal(rupeesToPaise("100000000.00"),10000000000);
  assert.equal(stockQuantity("0"),0);
  assert.equal(stockQuantity("7"),7);
  assert.equal(stockQuantity(""),null);
  for (const stock of ["-1","1.5","10000001","9".repeat(400),"Infinity"]) assert.throws(()=>stockQuantity(stock));
  const answers = { collections: [{key:"c"}], product_ideas:[{key:"p",collection_key:"c"}] };
  const base = { expected_revision:1, expected_draft:"f".repeat(64), confirm:true, pages:["home"],
    collections:[{key:"c",target:"new"}],products:[{key:"p",target:"new",price_paise:100,gst_rate:5,stock:null,media_id:null,hsn_code:""}] };
  assert.equal(validateApplication(structuredClone(base),answers).products[0].price_paise,100);
  for (const change of [
    {confirm:false},{pages:["privacy"]},{pages:["home","home"]},
    {products:[{...base.products[0],gst_rate:undefined}]},
    {products:[{...base.products[0],gst_rate:12}]},
    {products:[{...base.products[0],price_paise:0}]},
    {products:[{key:"p",target:other,price_paise:100}]},
  ]) assert.throws(() => validateApplication({...base,...change},answers));
  assert.equal(await draftFingerprint({settings:{a:1,b:2}}),await draftFingerprint({settings:{b:2,a:1}}));
});

test("Ann application uses real foundational DDL, atomic catalogue/page writes, conflict and replay safeguards", async () => {
  const pg = await setupAnnFixtureDatabase(), db = annFixtureAdapter(pg);
  const call = async (method, action, body, options = {}) => {
    const response = await handleAnnRoutes(new Request(`https://app.lebrands.store/api/stores/${id}/ann/${action}`, {
      method, headers:{"origin": options.origin || "https://app.lebrands.store","content-type":"application/json"},
      ...(body ? {body:JSON.stringify(body)} : {}),
    }),{},db,{id:options.editor ? "cccccccc-cccc-4ccc-8ccc-cccccccccccc" : owner},options.editor ? "b".repeat(64) : hash);
    return {status:response.status,body:await response.json()};
  };
  try {
    const {body:ref} = await call("GET","reference");
    const sub = ref.subcategories.find(s=>s.slug==="mens-clothing");
    assert.ok(sub);
    const answers = { store_name:"Confirmed Studio",category_id:sub.category_id,subcategory_id:sub.subcategory_id,
      style_preset:"vintage",collections:[{key:"essentials",name:"Everyday essentials",description:"Confirmed collection"}],
      product_ideas:[{key:"shirt",collection_key:"essentials",name:"Linen overshirt",description:"A real merchant description.",attributes:[]}] };
    const save = await call("PATCH","session",{expected_revision:0,current_step:"review",answers});
    assert.equal(save.status,200,JSON.stringify(save.body));
    const {body:prepared,status} = await call("GET","application");
    assert.equal(status,200,JSON.stringify(prepared));
    const body = { expected_revision:save.body.session.revision,expected_draft:prepared.expected_draft,confirm:true,
      pages:["home","collection","product","cart","checkout","about","contact"],collections:[{key:"essentials",target:"new"}],
      products:[{key:"shirt",target:"new",price_paise:129909,gst_rate:5,stock:7,media_id:null,hsn_code:"620520"}] };
    assert.equal((await call("POST","application",body,{origin:"https://other.invalid"})).status,403);
    assert.equal((await call("POST","application",body,{editor:true})).status,403);
    assert.equal((await call("POST","application",{...body,expected_draft:"0".repeat(64)})).status,409);
    assert.equal((await call("POST","application",{...body,products:[{key:"shirt",target:other}]})).status,400);
    const invalid = await call("POST","application",{...body,products:[{...body.products[0],media_id:other}]});
    assert.equal(invalid.status,400,JSON.stringify(invalid.body));
    assert.equal(Number((await pg.query("SELECT count(*) AS n FROM products")).rows[0].n),0,"failed image validation rolls back the product insert");
    assert.equal((await pg.query("SELECT name FROM stores WHERE store_id=$1",[id])).rows[0].name,"Example Studio");
    const result = await call("POST","application",body);
    if(result.status===503) {
      // Surface only isolated sample-schema errors instead of the production
      // API's deliberately generic failure message.
      await db.withMemberStore(id,hash,async tx=>applyAnnApplication(tx,id,hash,owner,await loadAnnSession(tx,id),await annReference(tx,sub.subcategory_id),body));
    }
    assert.equal(result.status,200,JSON.stringify(result.body));
    assert.equal(result.body.draft.store.name,"Confirmed Studio");
    assert.equal(result.body.draft.products.length,1);
    assert.equal(result.body.draft.products[0].price_paise,129909);
    assert.equal(result.body.draft.products[0].stock,7);
    assert.deepEqual(result.body.draft.products[0].images,[],"no demonstration product photo imported");
    assert.equal(result.body.draft.collections.length,1);
    assert.deepEqual(result.body.draft.collections[0].product_ids,[result.body.draft.products[0].id]);
    for (const page of prepared.pages) assert.ok(result.body.draft.page_versions[page.key].version > page.version);
    assert.ok(!result.body.application.pages.includes("privacy"),"legal policy pages are not replaced");
    assert.ok(result.body.checklist.some(c=>!c.complete));
    assert.equal(Number((await pg.query("SELECT count(*) AS n FROM store_publications")).rows[0].n),0);
    const replay = await call("POST","application",body);
    assert.equal(replay.status,200,JSON.stringify(replay.body));
    assert.equal(replay.body.replayed,true);
    assert.equal(Number((await pg.query("SELECT count(*) AS n FROM products")).rows[0].n),1);
    const actual = (await call("GET","application")).body.products[0];
    assert.equal(actual.price_paise,129909);
    assert.equal(actual.stock,7);
    assert.equal((await call("POST","application",{...body,pages:[]})).status,409);
    const projected = projectAnnPreview(result.body.draft,annPreviewConfiguration(answers,result.body.draft.settings)).data;
    assert.equal(projected.products.length,1,"applied idea does not become a duplicate preview product");
    assert.equal(projected.collections.length,1);
    await pg.query("INSERT INTO products(id,store_id,title,slug,price_paise,gst_rate,status) VALUES($1,$2,'Archived sample','archived-sample',100,5,'archived')",[other,id]);
    await pg.query("INSERT INTO collection_products(store_id,collection_id,product_id,sort_order) VALUES($1,$2,$3,1)",[id,result.body.draft.collections[0].id,other]);
    // A later plan can reuse the created catalogue, never resetting price/stock.
    const next = await call("PATCH","session",{expected_revision:1,current_step:"review",answers:{tagline:"A changed look"}});
    assert.equal((await call("POST","application",body)).status,409,"stale Ann revisions cannot be applied");
    const fresh = (await call("GET","application")).body;
    const second = await call("POST","application",{...body,expected_revision:next.body.session.revision,expected_draft:fresh.expected_draft,pages:[],
      products:[{key:"shirt",target:result.body.draft.products[0].id}],collections:[{key:"essentials",target:result.body.draft.collections[0].id}]});
    assert.equal(second.status,200,JSON.stringify(second.body));
    assert.equal(second.body.draft.products.length,1);
    assert.equal(second.body.draft.products[0].stock,7);
    assert.ok(second.body.draft.collections[0].product_ids.includes(other),"existing archived collection members are not removed");
    const draft = await db.withMemberStore(id,hash,tx=>loadDraft(tx,id));
    assert.equal(draft.settings.tagline,result.body.draft.settings.tagline,"catalogue-only confirmation cannot replace saved design text");
    const photo = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    await pg.query("INSERT INTO media(id,store_id,object_key,kind,content_type,size_bytes,upload_type,alt_text) VALUES($1,$2,$3,'image','image/webp',32,'image','Existing descriptive alt')",
      [photo,id,`stores/${id}/images/sample.webp`]);
    await db.withMemberStore(id,hash,tx=>saveProduct(tx,id,null,{
      title:"Another confirmed product",price_paise:10000,gst_rate:5,stock:null,images:[{id:photo,alt:"Do not replace shared alt"}],
    },{returnDraft:false,preserveMediaAlt:true}));
    assert.equal((await pg.query("SELECT alt_text FROM media WHERE id=$1",[photo])).rows[0].alt_text,"Existing descriptive alt");
  } finally { await pg.close(); }
});
