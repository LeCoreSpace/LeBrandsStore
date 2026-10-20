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
