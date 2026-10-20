import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {designToolsMarkup} from "../src/public/ann-design-ui.js";
const ui=readFileSync("src/public/ann-design-ui.js","utf8"),shell=readFileSync("src/ui/ann-builder.js","utf8");
test("Ann save and publish live in the top header only",()=>{
  assert.match(shell,/id="ann-top-actions"/);
  assert.match(ui,/Publish store/);
  assert.equal((ui.match(/data-design-act="save"/g)||[]).length,1);
  assert.equal((ui.match(/data-design-act="publish"/g)||[]).length,1);
  assert.doesNotMatch(ui,/Open theme editor|Saved to your draft|Your design: /);
});
test("empty design tools leave no card above the page navigation",()=>{
  assert.equal(designToolsMarkup(""),"");
  assert.equal(designToolsMarkup(" \n  "),"");
  for(const content of ['<p role="alert">Verification required</p>','<button>Editing on</button>','<p data-design-state></p>']){
    assert.match(designToolsMarkup(content),/class="ann-design-card ann-design-compact"/);
    assert.ok(designToolsMarkup(content).includes(content));
  }
  assert.match(ui,/el\.hidden = !el\.innerHTML\.trim\(\)/);
});
test("initial design loading reserves no placeholder space, while failures reach the error UI",()=>{
  const initialBranch=ui.match(/function body\(\) \{\n([^\n]+)/)[1];
  const renderInitial=new Function("loaded","loadError",`${initialBranch}\nreturn "continue";`);
  assert.equal(renderInitial(false,""),"");
  assert.equal(renderInitial(false,"Request failed"),"continue");
  assert.equal(renderInitial(true,""),"continue");
  assert.match(ui,/if \(loadError\) return[^]*?role="alert"[^]*?data-design-act="retry"/);
});
