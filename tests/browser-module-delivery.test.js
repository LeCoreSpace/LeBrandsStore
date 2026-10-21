import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import worker from "../src/index.js";

test("Ann, dashboard, storefront and editor static module dependencies pass the actual Worker asset gate",async()=>{
  const origin="https://accounts.lebrands.store";
  const pending=["ann-builder.js","dashboard.js","aura.js","editor.js","store-blog.js","store-discovery.js","media-library.js"].map(name=>`${origin}/assets/${name}`);
  const visited=new Set(),served=new Set();
  const env={ASSETS:{async fetch(request){
    const path=new URL(request.url).pathname;
    assert.ok(!path.includes(".."));
    const text=await readFile(new URL(`../src/public${path}`,import.meta.url),"utf8");
    served.add(path);
    return new Response(text,{headers:{"content-type":"application/javascript; charset=utf-8"}});
  }}};
  while(pending.length){
    const url=pending.shift();
    if(visited.has(url))continue;
    visited.add(url);
    assert.ok(visited.size<200,"Browser module graph exceeded its expected bound");
    const response=await worker.fetch(new Request(url),env,{});
    assert.equal(response.status,200,`Worker must serve browser dependency ${new URL(url).pathname}`);
    assert.match(response.headers.get("content-type"),/javascript/);
    const source=await response.text();
    for(const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*)["']([^"']+\.js)["']/g)){
      const dependency=new URL(match[1],url);
      assert.equal(dependency.origin,origin);
      assert.ok(dependency.pathname.startsWith("/assets/"));
      pending.push(dependency.href);
    }
  }
  assert.ok(served.has("/product-details.js"),"The transitive Ann product-details helper must be delivered");
  assert.ok(served.has("/collection-filters.js"),"The shared collection filter model must be delivered");
  assert.ok(served.has("/collection-filter-view.js"),"Ann's browser renderer needs the collection filter view");
  assert.ok(visited.size>50,"Check the transitive graph, not just the entry scripts");
  const denied=await worker.fetch(new Request(`${origin}/assets/not-public.js`),env,{});
  assert.equal(denied.status,404,"The regression fix must not open arbitrary files");
  assert.ok(!served.has("/not-public.js"));
});
