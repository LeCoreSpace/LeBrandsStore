import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const ui=readFileSync("src/public/ann-design-ui.js","utf8"),shell=readFileSync("src/ui/ann-builder.js","utf8");
test("Ann save and publish live in the top header only",()=>{
  assert.match(shell,/id="ann-top-actions"/);
  assert.match(ui,/Publish store/);
  assert.equal((ui.match(/data-design-act="save"/g)||[]).length,1);
  assert.equal((ui.match(/data-design-act="publish"/g)||[]).length,1);
  assert.doesNotMatch(ui,/Open theme editor|Saved to your draft|Your design: /);
});
