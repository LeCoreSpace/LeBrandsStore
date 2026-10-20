import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
test("only already-public allowlisted fonts permit anonymous opaque-sandbox CORS",async()=>{
  const env={ASSETS:{fetch:async()=>new Response("public asset")}};
  for(const filename of ["instrument-sans-latin.woff2","aura-editorial.ttf","aura-classic.ttf"]){
    for(const method of ["GET","HEAD"]){
      const res=await worker.fetch(new Request(`https://app.lebrands.store/assets/${filename}`,{method,headers:{origin:"null"}}),env,{});
      assert.equal(res.status,200);
      assert.equal(res.headers.get("access-control-allow-origin"),"*");
      assert.equal(res.headers.get("access-control-allow-credentials"),null);
      assert.equal(res.headers.get("cache-control"),"no-cache");
    }
  }
  const js=await worker.fetch(new Request("https://app.lebrands.store/assets/section-layout-preview.js"),env,{});
  assert.equal(js.headers.get("access-control-allow-origin"),null);
  const denied=await worker.fetch(new Request("https://app.lebrands.store/assets/private.woff2"),env,{});
  assert.equal(denied.status,404);
  assert.equal(denied.headers.get("access-control-allow-origin"),null);
});
