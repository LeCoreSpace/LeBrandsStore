import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";

const source=readFileSync("src/public/ann-builder.js","utf8");
const initialization=source.slice(source.indexOf("let setupStepsLocked"),source.indexOf("let revision"));
const navigation=source.slice(source.indexOf("async function toPrompt("),source.indexOf("function go("));
function harness(currentStep){
  const questions=[{id:"store_name",step:"business"},{id:"gstin",step:"business"},{id:"logo",step:"business"},{id:"included_address",step:"selling"},{id:"style",step:"style"},{id:"bg",step:"palette"}];
  const current=questions.find(p=>p.step===currentStep);
  let c;
  c=vm.createContext({
    UI_STEPS:[["business"],["selling"],["style"],["palette"]],
    session:currentStep?{current_step:currentStep}:null,
    promptId:current?.id||"store_name",step:currentStep||"business",
    reached:current?.id||"store_name",navigating:false,editing:null,detail:false,
    readOnly:false,obDone:{gst:true},conflict:false,autosavePaused:false,
    prompts:()=>questions,curIdx:ps=>ps.findIndex(p=>p.id===c.promptId),
    answers:{},STEP_PAGE:{},page:"home",notice:"",app:{dataset:{}},
    say:message=>{c.message=message;},draw(){},renderPreview(){},syncSwitch(){},
    def:()=>({q:"Next question"}),save:async()=>{},loadAttrs(){},
  });
  vm.runInContext(initialization+navigation,c);
  return c;
}
test("Business and Store address stay available until Style, then all setup prompts are blocked",async()=>{
  const c=harness();
  await vm.runInContext('toPrompt("included_address")',c);
  assert.equal(c.step,"selling");
  assert.equal(vm.runInContext("setupStepsLocked",c),false);
  await vm.runInContext('toPrompt("style")',c);
  assert.equal(vm.runInContext("setupStepsLocked",c),true);
  for(const id of ["store_name","gstin","logo","included_address"]){
    await vm.runInContext(`toPrompt("${id}")`,c);
    assert.equal(c.promptId,"style");
  }
  await vm.runInContext('toPrompt("bg")',c);
  assert.equal(c.step,"palette");
  await vm.runInContext('toPrompt("style")',c);
  assert.equal(c.step,"style","later editable steps remain navigable");
});
test("saved Style and later sessions restore setup locks on reload",async()=>{
  for(const step of ["style","palette"]){
    const c=harness(step);
    assert.equal(vm.runInContext("setupStepsLocked",c),true);
    await vm.runInContext('toPrompt("included_address")',c);
    assert.equal(c.step,step);
  }
});
test("GST verification still blocks entering Style and does not prematurely lock setup",async()=>{
  const c=harness("selling");c.obDone.gst=false;
  await vm.runInContext('toPrompt("style")',c);
  assert.equal(c.promptId,"gstin");
  assert.equal(vm.runInContext("setupStepsLocked",c),false);
});
test("locked steps disable rail, transcript edits, Back and logo deep-link entry",()=>{
  assert.match(source,/disabled aria-disabled="true" title="Completed\. Setup is locked/);
  assert.match(source,/readOnly \|\| isSetupStepLocked\(p\.step\)/);
  assert.match(source,/data-back \$\{i === 0 \|\| isSetupStepLocked/);
  assert.match(source,/!setupStepsLocked && new URL\(location\.href\)/);
  assert.match(source,/logoButton\.disabled = isSetupStepLocked\("business"\)/);
});
