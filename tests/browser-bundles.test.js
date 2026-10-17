import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import worker from "../src/index.js";
import {buildBrowserAssets} from "../scripts/build-browser-assets.mjs";
import {BROWSER_JS_ENTRIES,BROWSER_CSS_ENTRIES,isBrowserBundle} from "../src/browser-assets.js";

test("built browser graphs pass the actual Worker gate, reduce requests, and cache only fingerprinted public files",async()=>{
  const outdir=await mkdtemp(path.join(tmpdir(),"lebrands-browser-"));
  try{
    const built=await buildBrowserAssets({outdir,copyStatic:false,quiet:true});
    function environment(directory){
      return {ASSETS:{async fetch(request){
        const filename=new URL(request.url).pathname.slice(1);
        const text=await readFile(path.join(directory,filename),"utf8");
        return new Response(text,{headers:{"content-type":filename.endsWith(".css")?"text/css":"application/javascript"}});
      }}};
    }
    const generated=environment(outdir),original=environment(new URL("../src/public/",import.meta.url).pathname);
    async function graph(entry,env){
      const pending=[`https://app.lebrands.store/assets/${entry}.js`],visited=new Set();
      let bytes=0;
      while(pending.length){
        const url=pending.shift();
        if(visited.has(url))continue;
        visited.add(url);assert.ok(visited.size<200);
        const response=await worker.fetch(new Request(url),env,{});
        assert.equal(response.status,200,url);
        assert.match(response.headers.get("content-type"),/javascript/);
        assert.equal(response.headers.get("cache-control"),url.includes("/bundles/")?"public, max-age=31536000, immutable":"no-cache");
        const source=await response.text();bytes+=Buffer.byteLength(source);
        for(const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*)["']([^"']+\.js)["']/g)){
          const next=new URL(match[1],url);
          assert.equal(next.origin,"https://app.lebrands.store");
          assert.ok(next.pathname.startsWith("/assets/"));
          pending.push(next.href);
        }
      }
      return {requests:visited.size,bytes};
    }
    for(const entry of BROWSER_JS_ENTRIES){
      const before=await graph(entry,original),after=await graph(entry,generated);
      console.log("Browser graph:",entry,{before,after});
      if(["ann-builder","editor","dashboard","aura"].includes(entry))
        assert.ok(after.requests<before.requests,entry);
      // Small optional screens may share more chunks than their original
      // source count, but still use bounded, immutable cached dependencies.
      assert.ok(after.requests<=12,entry);
    }
    for(const entry of BROWSER_CSS_ENTRIES){
      const filename=built.manifest[`${entry}.css`];
      assert.ok(isBrowserBundle(filename));
      const css=await worker.fetch(new Request(`https://app.lebrands.store/assets/${filename}`),generated,{});
      assert.equal(css.status,200);
      assert.match(css.headers.get("cache-control"),/immutable/);
      assert.equal(css.headers.get("content-type"),"text/css");
    }
    for(const filename of ["bundles/server-AAAAAAAA.js","bundles/chunk-AAAAAAAA.css","browser-build.json"]){
      const response=await worker.fetch(new Request(`https://app.lebrands.store/assets/${filename}`),generated,{});
      assert.equal(response.status,404);
    }
    const missing=await worker.fetch(new Request("https://app.lebrands.store/assets/bundles/chunk-ZZZZZZZZ.js"),{
      ASSETS:{fetch:async()=>new Response("Not found",{status:404})},
    },{});
    assert.equal(missing.status,404);
    assert.equal(missing.headers.get("cache-control"),"no-cache","missing chunks must never be cached immutably");
    const legacy="bundles/chunk-AAAAAAAA.js";
    await writeFile(path.join(outdir,legacy),"export const previousBuild=true;");
    const second=await buildBrowserAssets({outdir,copyStatic:false,quiet:true});
    const entries=[...BROWSER_JS_ENTRIES.map(name=>`${name}.js`),...BROWSER_CSS_ENTRIES.map(name=>`${name}.css`)].sort();
    assert.deepEqual(Object.keys(built.manifest).sort(),entries,"internal chunk metadata must not replace original public modules");
    assert.deepEqual(Object.keys(second.manifest).sort(),entries);
    assert.ok(Object.values(second.manifest).every(isBrowserBundle));
    assert.match(await readFile(path.join(outdir,legacy),"utf8"),/previousBuild/);
    assert.ok(Object.values(built.metafile.outputs).every(meta=>meta.imports.every(item=>item.kind!=="dynamic-import")));
  }finally{await rm(outdir,{recursive:true,force:true});}
});
