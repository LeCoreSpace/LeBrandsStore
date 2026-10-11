import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import preview from "../src/preview.js";
const ID="00000000-0000-4000-8000-000000000000";
const noEnvironment=new Proxy({}, {get(){throw new Error("Display previews must not access database or account bindings");}});
const request=(path,method="GET")=>preview.fetch(new Request(`https://local.invalid${path}`,{method}),noEnvironment,{});

test("local dashboard preview renders all requested pages without a database or account",async()=>{
  for(const view of ["overview","orders","order","product","settings"]){
    const response=await request(`/__step4-preview?view=${view}`);
    assert.equal(response.status,200);
    const html=await response.text();
    assert.match(html,/Read-only local preview with synthetic sample data/);
    assert.match(html,/data-preview="true"/);
    assert.match(html,/\/assets\/dashboard.js/);
    assert.equal(response.headers.get("cache-control"),"no-store");
    assert.doesNotMatch(html,/href="\/stores\/00000000/);
    if(view==="order") assert.match(html,/LB-1042/);
    if(view==="product") assert.match(html,/Everyday cotton tote/);
  }
});
test("synthetic preview read APIs filter existing fixture data and reject every mutation",async()=>{
  let response=await request(`/api/stores/${ID}/orders?search=1041`);
  let data=await response.json();
  assert.equal(data.orders.length,1);
  assert.equal(data.orders[0].order_number,"LB-1041");
  response=await request(`/api/stores/${ID}/orders?from=2026-10-10&to=2026-10-11&status=confirmed_cod`);
  data=await response.json();
  assert.equal(data.orders.length,1);
  assert.equal(data.orders[0].status,"confirmed_cod");
  const filteredHtml=await (await request("/__step4-preview?view=orders&status=cancelled")).text();
  assert.match(filteredHtml,/LB-1040/);
  assert.doesNotMatch(filteredHtml,/LB-1041|LB-1042/);
  for(const method of ["POST","PATCH","PUT","DELETE"]){
    const rejected=await request(`/api/stores/${ID}/setup`,method);
    assert.equal(rejected.status,403);
    assert.match((await rejected.json()).error,/Read-only local preview/);
  }
});
test("root production Worker imports neither preview adapter nor synthetic display data",async()=>{
  const prod=JSON.parse((await readFile("wrangler.jsonc","utf8")).replace(/^\s*\/\/.*$/gm,"").replace(/,\s*([}\]])/g,"$1"));
  const local=JSON.parse(await readFile("wrangler.preview.jsonc","utf8"));
  assert.equal(prod.main,"src/index.js");
  assert.equal(local.main,"src/preview.js");
  const visited=new Set();
  async function walk(file){
    file=resolve(file);
    if(visited.has(file))return;
    visited.add(file);
    const source=await readFile(file,"utf8");
    for(const match of source.matchAll(/(?:import|export)\s[\s\S]*?\bfrom\s*["'](\.[^"']+)["']/g)){
      await walk(resolve(dirname(file),match[1]));
    }
  }
  await walk(prod.main);
  assert.ok(!visited.has(resolve("src/preview.js")));
  assert.ok(!visited.has(resolve("src/local-dashboard-fixture.js")));
});
