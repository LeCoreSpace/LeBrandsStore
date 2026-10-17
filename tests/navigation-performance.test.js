import test from "node:test";
import assert from "node:assert/strict";
import {setupAnnFixtureDatabase,annFixtureAdapter} from "../src/ann-preview-fixture.js";
import {loadDraft,loadStoreContext} from "../src/store/repository.js";
import {openingChecks} from "../src/ui/store-setup-progress.js";
import {documentPage} from "../src/ui/dashboard.js";

test("operational dashboard reads omit editor layouts while retaining catalogue and setup information",async()=>{
  const pg=await setupAnnFixtureDatabase({sampleCatalogue:true,catalogueApi:true,sampleClassification:true});
  try{
    const db=annFixtureAdapter(pg),store="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",token="a".repeat(64);
    async function read(includeDesign,options={}){
      const queries=[];
      const data=await db.withMemberStore(store,token,tx=>{
        const traced=new Proxy(tx,{apply(target,self,args){queries.push(args[0].join("?"));return Reflect.apply(target,self,args);}});
        return loadDraft(traced,store,{includeDesign,...options});
      });
      return {data,queries};
    }
    const full=await read(true),operational=await read(false);
    assert.ok(full.data.layouts&&full.data.page_versions);
    assert.equal(operational.data.layouts,undefined);
    assert.equal(operational.data.page_versions,undefined);
    for(const key of ["store","settings","products","collections","policies","progress","catalogue_forms_enabled","aura_skeleton_enabled"])
      assert.deepEqual(operational.data[key],full.data[key],`${key} must not change with lighter presentation reads`);
    assert.ok(operational.queries.length<full.queries.length);
    console.log("Draft statement counts:",{editor:full.queries.length,operational:operational.queries.length});
    const contextQueries=[];
    const context=await db.withMemberStore(store,token,tx=>loadStoreContext(new Proxy(tx,{
      apply(target,self,args){contextQueries.push(args[0].join("?"));return Reflect.apply(target,self,args);},
    }),store));
    assert.deepEqual(context.store,full.data.store);
    assert.deepEqual(context.gstinVerification,full.data.gstinVerification);
    assert.equal(context.draft,undefined,"operational context is not an editable partial draft");
    assert.ok(!contextQueries.some(q=>/public\.(products|product_options|product_media|collections|policy_pages)\b/.test(q)));
    assert.ok(contextQueries.length<operational.queries.length);
    const today=await read(false,{includeClassifications:false});
    assert.deepEqual(openingChecks({store:full.data.store,draft:today.data}),openingChecks({store:full.data.store,draft:full.data}),"Today publication checks must stay accurate");
    const user={id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",name:"Example"};
    for(const view of ["overview","orders","customers","invoices","inventory"]){
      const html=documentPage(view,{...context,draft:full.data,role:"owner"},user,"<main>Operational page</main>");
      const boot=JSON.parse(html.match(/id="dashboard-data">([\s\S]*?)<\/script>/)[1]);
      assert.equal(boot.draft,undefined,`${view} must not ship the full catalogue to the browser`);
    }
    const form=documentPage("product-new",{store:full.data.store,draft:full.data,role:"owner"},user,"<main>Edit form</main>");
    assert.ok(JSON.parse(form.match(/id="dashboard-data">([\s\S]*?)<\/script>/)[1]).draft,"edit forms retain their complete draft");
    console.log("Store context statements:",contextQueries.length,"Today statements:",today.queries.length);
  }finally{await pg.close();}
});
