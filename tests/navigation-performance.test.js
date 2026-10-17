import test from "node:test";
import assert from "node:assert/strict";
import {setupAnnFixtureDatabase,annFixtureAdapter} from "../src/ann-preview-fixture.js";
import {loadDraft} from "../src/store/repository.js";

test("operational dashboard reads omit editor layouts while retaining catalogue and setup information",async()=>{
  const pg=await setupAnnFixtureDatabase({sampleCatalogue:true,catalogueApi:true,sampleClassification:true});
  try{
    const db=annFixtureAdapter(pg),store="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",token="a".repeat(64);
    async function read(includeDesign){
      const queries=[];
      const data=await db.withMemberStore(store,token,tx=>{
        const traced=new Proxy(tx,{apply(target,self,args){queries.push(args[0].join("?"));return Reflect.apply(target,self,args);}});
        return loadDraft(traced,store,{includeDesign});
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
  }finally{await pg.close();}
});
