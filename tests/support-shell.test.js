import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {renderSupport} from "../src/ui/support.js";
import {layout} from "../src/ui/layout.js";

test("private support nonces shared styles without a competing page-loader",()=>{
 const nonce="a".repeat(32);
 const html=renderSupport("list",{tickets:[],categories:[],filters:{},page:1,total:0},{name:"<script>not executable</script>"},nonce);
 assert.ok(html.includes(`<style nonce="${nonce}">`));
 assert.ok(html.includes("data-catalogue-confirm-style"));
 assert.ok(html.includes('src="/assets/support.js"'));
 assert.ok(!html.includes('id="lb-navigation"'));
 assert.ok(!html.includes("<script>not executable</script>"));
});

test("the shared layout retains navigation feedback for existing pages",()=>{
 const html=layout({title:"Existing page",description:"",canonical:"https://lebrands.store",body:"<main>Example</main>"});
 assert.ok(html.includes('id="lb-navigation"'));
 assert.ok(html.includes("Still loading."));
});

test("support releases its save guard before redirect and filters absent metadata",async()=>{
 const source=await readFile("src/public/support.js","utf8");
 assert.ok(source.indexOf("finally{lock(newForm,false);}")<source.indexOf("if(createdId)location.assign"));
 assert.match(source,/if\(meta\)meta\.replaceChildren\(\.\.\.\[[^\n]+\.filter\(Boolean\)\)/);
});
