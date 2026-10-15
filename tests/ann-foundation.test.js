import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { parseCsv, cleanAnnReferences, annReferenceSeed } from "../db/ann-reference-seed.js";
import { preparePageMigration } from "../db/page-schema-migration.js";
import { migrationSelection } from "../db/migration-selection.js";
import { TAXONOMY } from "../src/public/aura-taxonomy-data.js";
import { validateAnnSave, mergeAnnAnswers, validateAnnAnswers } from "../src/store/ann-input.js";
import { annPreviewConfiguration } from "../src/public/ann-config.js";
import { handleAnnRoutes } from "../src/store/ann-routes.js";
import { ANN_WORKFLOW_READY } from "../src/store/builder-routes.js";
import { STYLE_IDS } from "../src/public/aura-styles.js";
const store = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222";
const owner = "33333333-3333-4333-8333-333333333333", staff = "44444444-4444-4444-8444-444444444444";
const token = "a".repeat(64), staffToken = "b".repeat(64);
const reference = {
  categories: [{ category_id: 1 },{ category_id: 2 }],
  subcategories: [{ subcategory_id: 1, category_id: 1 },{ subcategory_id: 2, category_id: 2 }],
  attributes: [{ id: 1, subcategory_id: 1, values: [{ id: 1 }] }],
};

test("CSV cleanup normalises quoted text, removes non-product rows and merges duplicates by stable IDs", () => {
  assert.deepEqual(parseCsv('id,name\r\n1,"Soft, ""quiet"""\r\n'), [{ id:"1",name:'Soft, "quiet"' }]);
  assert.throws(() => parseCsv('id,name\n1,"broken'), /Unterminated/);
  const cleaned = cleanAnnReferences(
    [{id:"2",subcategory_id:"1",name:" material ",sort_order:"2"}, {id:"1",subcategory_id:"1",name:"Material",sort_order:"1"},
      {id:"3",subcategory_id:"2",name:"Size",sort_order:"1"}, {id:"4",subcategory_id:"1",name:"<script>",sort_order:"1"}],
    [{id:"2",niche_category_id:"2",value:" Cotton ",sort_order:"2"}, {id:"1",niche_category_id:"1",value:"cotton",sort_order:"1"},
      {id:"3",niche_category_id:"3",value:"Large",sort_order:"1"}], [1]);
  assert.equal(cleaned.attributes.length,1); assert.equal(cleaned.attributes[0].id,1);
  assert.deepEqual(cleaned.values,[{id:1,attribute_id:1,value:"cotton",sort_order:1}]);
  assert.equal(cleaned.report.duplicate_attributes,1);assert.equal(cleaned.report.duplicate_values,1);
  assert.equal(cleaned.report.excluded_attributes,2);
});

test("actual source import is deterministic, product-only and preserves source IDs without merchant assignments", async () => {
  const a=await annReferenceSeed(),b=await annReferenceSeed();
  assert.equal(a.sql,b.sql);assert.ok(a.attributes.length>1000);assert.ok(a.values.length>9000);
  const productIds=new Set(TAXONOMY.subcategories.map(s=>s.id));
  assert.ok(a.attributes.every(row=>productIds.has(row.subcategory_id)));
  const ids=new Set(a.attributes.map(row=>row.id));assert.ok(a.values.every(row=>ids.has(row.attribute_id)));
  assert.doesNotMatch(a.sql,/ad_card|store_setup|UPDATE public\.products/);
  const selection=migrationSelection(["--staged-ann"]);
  assert.equal(selection.filename,"0016_ann_foundation.sql");assert.equal(selection.requires,"0015_aura_starter_library.sql");
});

test("answers accept five styles and collection ideas but reject protected fields, markup, mismatched taxonomy and foreign attributes", () => {
  const answers={category_id:1,subcategory_id:1,style_preset:"vintage",store_name:"Example",collections:[{key:"shirts",name:"Shirts"}],
    product_ideas:[{key:"shirt-one",collection_key:"shirts",name:"Shirt",attributes:[{attribute_id:1,value_ids:[1]}]}]};
  validateAnnSave({expected_revision:0,current_step:"category",answers});validateAnnAnswers(answers,reference);
  for(const patch of [{gst_rate:0},{published:true},{price_paise:50},{store_name:"<script>bad</script>"},{category_id:2,subcategory_id:1},
    {style_preset:"untrusted"},{section_options:{checkout:["payment"]}}]){
    assert.throws(()=>validateAnnAnswers({...answers,...patch},reference));
  }
  const invalid=structuredClone(answers);invalid.product_ideas[0].attributes[0].value_ids=[999];
  assert.throws(()=>validateAnnAnswers(invalid,reference),/attribute values/);
  assert.throws(()=>validateAnnSave({expected_revision:-1,current_step:"style",answers:{}}),/revision/);
});

test("earlier answers can be edited without discarding descriptions or silently retaining incompatible choices", () => {
  const original={category_id:1,subcategory_id:1,description:"Original",collections:[{key:"shirts",name:"Shirts"}],
    product_ideas:[{key:"shirt",collection_key:"shirts",name:"Shirt",attributes:[{attribute_id:1,value_ids:[1]}]}]};
  const merged=mergeAnnAnswers(original,{category_id:2});
  assert.equal(merged.answers.subcategory_id,undefined);assert.equal(merged.answers.description,"Original");
  assert.deepEqual(merged.answers.product_ideas[0].attributes,[]);assert.equal(original.product_ideas[0].attributes.length,1);
  validateAnnAnswers(merged.answers,reference);
  assert.deepEqual(mergeAnnAnswers(original,{description:null}).answers.description,undefined);
});

test("preview configuration is deterministic and never applies settings or creates products", () => {
  const saved={style_preset:"editorial",color_preset:"white",font_preset:"serif"},copy=structuredClone(saved);
  const answers={style_preset:"vintage",color_preset:"midnight",font_preset:"modern",accent_color:"#123456",store_name:"New idea"};
  const preview=annPreviewConfiguration(answers,saved);
  assert.equal(preview.preview_only,true);assert.equal(preview.theme.style_preset,"vintage");
  assert.equal(preview.theme.color_preset,"midnight");assert.equal(preview.theme.font_preset,"modern");
  assert.equal(preview.brand.store_name,"New idea");assert.deepEqual(saved,copy);assert.deepEqual(preview.product_ideas,[]);
  assert.equal(ANN_WORKFLOW_READY,true);
});

function fakeDb({role="owner",ready=true,session=null,settings={}}={}){
  const state={role,ready,session,settings,writes:0,queries:[]};
  const tx=async(strings,...args)=>{
    const sql=strings.join("?");state.queries.push(sql);
    if(sql.includes("FROM public.store_members"))return [{role:state.role}];
    if(sql.includes("to_regclass"))return [{ready:state.ready}];
    if(sql.includes("FROM public.ann_builder_sessions"))return state.session?[{...state.session,answers_json:JSON.stringify(state.session.answers)}]:[];
    if(sql.includes("FROM public.store_setup"))return [{settings_json:JSON.stringify(settings)}];
    if(sql.includes("FROM public.aura_library_categories"))return reference.categories;
    if(sql.includes("FROM public.aura_library_subcategories"))return reference.subcategories;
    if(sql.includes("FROM public.ann_reference_attributes"))return reference.attributes.map(a=>({...a,values_json:JSON.stringify(a.values)}));
    if(sql.includes("ann_save_session")){
      state.writes++;state.session={revision:args[2]+1,current_step:args[3],reference_version:"ann-v1",answers:JSON.parse(args[4])};return [{revision:state.session.revision}];
    }
    throw new Error("Unexpected query.");
  };
  return {state,withMemberStore:async(id,hash,fn)=>fn(tx)};
}
const request=(method="GET",body,origin="https://app.lebrands.store",action="session")=>new Request(`https://app.lebrands.store/api/stores/${store}/ann/${action}`,{
  method,headers:{"content-type":"application/json",origin},...(body?{body:JSON.stringify(body)}:{})});
test("authenticated session API creates, resumes and edits planning progress with conflicts and no content writes", async () => {
  const db=fakeDb(),user={id:owner};
  let response=await handleAnnRoutes(request(),{},db,user,token);
  assert.equal((await response.json()).session,null);assert.equal(db.state.writes,0);
  response=await handleAnnRoutes(request("PATCH",{expected_revision:0,current_step:"style",answers:{category_id:1,subcategory_id:1,style_preset:"vintage"}}),{},db,user,token);
  assert.equal(response.status,200);assert.equal((await response.json()).session.revision,1);
  response=await handleAnnRoutes(request(),{},db,user,token);
  assert.equal((await response.json()).session.answers.style_preset,"vintage");
  response=await handleAnnRoutes(request("PATCH",{expected_revision:1,current_step:"fonts",answers:{font_preset:"modern"}}),{},db,user,token);
  assert.equal((await response.json()).session.revision,2);
  response=await handleAnnRoutes(request("PATCH",{expected_revision:1,current_step:"palette",answers:{color_preset:"stone"}}),{},db,user,token);
  assert.equal(response.status,409);assert.equal(db.state.writes,2);
  assert.ok(db.state.queries.every(sql=>!/\b(?:INSERT|UPDATE|DELETE)\b/.test(sql)));
  const ref=await handleAnnRoutes(request("GET",null,undefined,"reference"),{},db,user,token);
  assert.deepEqual((await ref.json()).styles.map(style => style.id), STYLE_IDS);
});
test("API rejects anonymous/staff/foreign-origin writes and fails explicitly before migration", async () => {
  const body={expected_revision:0,current_step:"style",answers:{style_preset:"minimal"}};
  const staffDb=fakeDb({role:"staff"});
  assert.equal((await handleAnnRoutes(request("PATCH",body),{},staffDb,{id:staff},staffToken)).status,403);
  assert.equal(staffDb.state.writes,0);
  assert.equal((await handleAnnRoutes(request(),{},fakeDb(),null,token)).status,401);
  assert.equal((await handleAnnRoutes(request("PATCH",body,"https://outsider.invalid"),{},fakeDb(),{id:owner},token)).status,403);
  assert.equal((await handleAnnRoutes(request(),{},fakeDb({ready:false}),{id:owner},token)).status,503);
  const malformed=fakeDb();
  assert.equal((await handleAnnRoutes(new Request(`https://app.lebrands.store/api/stores/${"a".repeat(36)}/ann/session`),{},malformed,{id:owner},token)).status,404);
  assert.equal(malformed.state.queries.length,0);
});

test("real offline SQL migration protects sessions, atomic revisions, tenant boundaries and reference writes", async () => {
  const pg=new PGlite();
  try{
    // Use the real foundation schema so a fixture cannot hide wrong FK columns.
    await pg.exec(await readFile(new URL("../db/migrations/0001_init.sql",import.meta.url),"utf8"));
    await pg.exec(`CREATE ROLE lebrands_app; GRANT USAGE ON SCHEMA public TO lebrands_app;
      ALTER TABLE users ADD COLUMN must_change_password boolean DEFAULT false;
      CREATE TABLE sessions(token_hash text,user_id uuid,revoked_at timestamptz,expires_at timestamptz);
      CREATE TABLE aura_library_subcategories(subcategory_id bigint PRIMARY KEY);
      INSERT INTO brands(id,name,legal_name) VALUES('${store}','Test brand','Test brand');
      INSERT INTO stores(store_id,brand_id,subdomain,name) VALUES('${store}','${store}','ann-test-one','Test store'),('${other}','${store}','ann-test-two','Other store');
      INSERT INTO users(id,name,email) VALUES('${owner}','Test owner','owner@example.invalid'),('${staff}','Test editor','editor@example.invalid');
      INSERT INTO store_members(store_id,user_id,role) VALUES('${store}','${owner}','owner'),('${store}','${staff}','editor');
      INSERT INTO sessions VALUES('${token}','${owner}',NULL,now()+interval '1 day'),('${staffToken}','${staff}',NULL,now()+interval '1 day');
      CREATE FUNCTION public.authorize_store_session(text,uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
        SELECT EXISTS(SELECT 1 FROM public.sessions s JOIN public.users u ON u.id=s.user_id
        JOIN public.store_members m ON m.user_id=s.user_id WHERE s.token_hash=$1 AND m.store_id=$2 AND s.revoked_at IS NULL AND s.expires_at>now() AND NOT u.must_change_password) $$;
      GRANT EXECUTE ON FUNCTION public.authorize_store_session(text,uuid) TO lebrands_app;`);
    const data=await annReferenceSeed();
    const ids=[...new Set(data.attributes.map(a=>a.subcategory_id))];
    await pg.exec(`INSERT INTO aura_library_subcategories VALUES ${ids.map(id=>`(${id})`).join(",")}`);
    const source=await readFile(new URL("../db/staged/0016_ann_foundation.sql",import.meta.url),"utf8");
    await pg.exec(await preparePageMigration("0016_ann_foundation.sql",source));
    assert.equal((await pg.query("SELECT count(*)::integer AS n FROM ann_reference_values")).rows[0].n,data.values.length);
    await pg.exec(`SET ROLE lebrands_app; SELECT set_config('app.store_id','${store}',false)`);
    const save=(hash,revision,answers={description:"One"})=>pg.query("SELECT public.ann_save_session($1::uuid,$2::text,$3::integer,$4::text,$5::jsonb) AS revision",[store,hash,revision,"story",JSON.stringify(answers)]);
    assert.equal((await save(token,0)).rows[0].revision,1);
    assert.equal((await save(token,1,{description:"Two"})).rows[0].revision,2);
    await assert.rejects(save(token,1),e=>e.code==="40001");
    await assert.rejects(save(staffToken,2),e=>e.code==="42501");
    await assert.rejects(pg.query("UPDATE ann_builder_sessions SET revision=4"),e=>e.code==="42501");
    await assert.rejects(pg.query("DELETE FROM ann_reference_values"),e=>e.code==="42501");
    await pg.exec(`SELECT set_config('app.store_id','${other}',false)`);
    assert.equal((await pg.query("SELECT * FROM ann_builder_sessions")).rows.length,0);
    await assert.rejects(save(token,2),e=>e.code==="42501");
    await pg.exec(`RESET ROLE`);
    assert.equal((await pg.query("SELECT answers->>'description' AS text FROM ann_builder_sessions")).rows[0].text,"Two");
  } finally {await pg.close();}
});
