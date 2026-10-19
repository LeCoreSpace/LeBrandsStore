import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {layout} from "../src/ui/layout.js";
import {renderHome,renderPricing,renderCompare} from "../src/ui/marketing.js";
import {renderAura} from "../src/public/aura.js";
import {STYLE_IDS} from "../src/public/aura-styles.js";
import worker from "../src/index.js";

const link=/<link rel="stylesheet" href="\/assets\/typography\.css">/;
test("platform layouts and every store style share the sans-serif typography layer",()=>{
 for(const html of [layout({title:"Account",description:"Account",canonical:"https://app.lebrands.store/account",body:"Account",noindex:true}),renderHome(),renderPricing(),renderCompare()])
  assert.match(html,link);
 for(const style of STYLE_IDS){
  for(const page of ["home","collection","product","cart","checkout","confirmation"]){
   const html=renderAura({
    store:{store_id:"11111111-1111-4111-8111-111111111111",name:"Typography fixture",subdomain:"type-fixture"},
    settings:{brand_name:"Typography fixture",style_preset:style,font_preset:"serif"},
    products:[],policies:[]
   },{page,commerce:true,noindex:true});
   assert.match(html,link,`${style}/${page}`);
  }
 }
});

test("shared typography and its font are delivered by the actual Worker asset gate",async()=>{
 const css=await readFile("src/public/typography.css","utf8");
 assert.match(css,/@font-face/);
 assert.match(css,/Instrument Sans/);
 assert.match(css,/:where\(body, body \*\)[^{]*\{[^}]*font-family:[^}]*!important/);
 assert.match(css,/code, pre, kbd, samp/);
 const env={ASSETS:{fetch:async req=>{
  const file=new URL(req.url).pathname.split("/").pop();
  return new Response(await readFile(`src/public/${file}`));
 }}};
 for(const name of ["typography.css","instrument-sans-latin.woff2"]){
  const response=await worker.fetch(new Request(`https://app.lebrands.store/assets/${name}`),env);
  assert.equal(response.status,200,name);
 }
});
