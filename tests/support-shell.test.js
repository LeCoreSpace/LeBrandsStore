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

test("support list, creation and conversation use flat dashboard ticket surfaces",async()=>{
 const list=renderSupport("list",{tickets:[],categories:[],filters:{}});
 assert.match(list,/class="sp-ticket sp-list"/);
 const form=renderSupport("new",{stores:[],categories:[]});
 assert.match(form,/class="sp-form sp-ticket sp-new" data-new-form/);
 const detail=renderSupport("detail",{ticket:{subject:"Help with my store",status:"created"}});
 assert.match(detail,/class="sp-main sp-ticket"><h2 class="sp-ticket-title">Conversation/);
 assert.match(detail,/data-reply-form/);
 assert.match(detail,/data-workflow-form/);
 const css=await readFile("src/public/support.css","utf8");
 assert.match(css,/\.sp-list \.sp-tablewrap\{border:0\}/);
 assert.match(css,/border-bottom:1px dashed var\(--sp-rule\)/);
});

test("support releases its save guard before redirect and filters absent metadata",async()=>{
 const source=await readFile("src/public/support.js","utf8");
 assert.ok(source.indexOf("finally{lock(newForm,false);}")<source.indexOf("if(createdId)location.assign"));
 assert.match(source,/if\(meta\)meta\.replaceChildren\(\.\.\.\[[^\n]+\.filter\(Boolean\)\)/);
});
