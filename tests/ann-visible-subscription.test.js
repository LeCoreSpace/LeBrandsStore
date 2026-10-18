import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {annNavigationSteps,annNavigationKey} from "../src/public/ann-config.js";

test("subscription is a separate visible milestone immediately after store name",()=>{
  const original=[["business","Business"],["selling","Store address"],["style","Style"]];
  const steps=annNavigationSteps(original,true);
  assert.deepEqual(steps.map(([key])=>key),["store_name","subscription","business","selling","style"]);
  assert.equal(steps[1][1],"Subscription");
  assert.equal(annNavigationKey({id:"plan",step:"business"}),"subscription");
  assert.equal(annNavigationKey({id:"store_name",step:"business"}),"store_name");
  assert.equal(annNavigationKey({id:"logo",step:"business"}),"business");
  assert.deepEqual(original.map(([key])=>key),["business","selling","style"],
    "presentation milestones must not change persisted session step names");
});

test("saved-store history keeps logo upload and subscription review reachable without unlocking identity edits",async()=>{
  const source=await readFile(new URL("../src/public/ann-builder.js",import.meta.url),"utf8");
  assert.match(source,/else if\(d\.kind==="logo"\)out\+=.*Upload or change brand logo.*ann-branding-slot/);
  assert.match(source,/else if\(d\.kind==="plan"\)out\+=.*Choose or review subscription/);
  assert.match(source,/if\(next==="subscription"\)\{planUI\.open\(\);return;\}/);
  assert.match(source,/onContinue:\(\)=>\{if\(cur\(\)\.id==="logo"\)advance\(\);else drawKeep\(\);\}/,
    "saving a historical logo must not move the current conversation step");
  assert.match(source,/\["business", "selling"\]\.includes\(target\)/,
    "the logo correction must not remove existing identity/address locks");
  assert.doesNotMatch(source,/\$\("#ann-steps"\)\?\.toggleAttribute\("inert",planLocked\(\)\)/,
    "subscription review must remain clickable while onboarding is plan-gated");
});
