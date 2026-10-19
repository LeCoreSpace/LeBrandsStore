import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {renderDashboard} from "../src/ui/dashboard.js";
import {localDashboardFixture} from "../src/local-dashboard-fixture.js";
import {renderAnnBuilder} from "../src/ui/ann-builder.js";
import {renderAnnThemeEditor} from "../src/ui/ann-theme-editor.js";
import {renderEditor} from "../src/ui/editor.js";
import {renderCheckoutSettings} from "../src/ui/checkout.js";

test("all implemented dashboard destinations inherit the shared ticket workspace",()=>{
  const data={...localDashboardFixture(),role:"owner"};
  for(const view of ["overview","products","product","product-new","collections","collection-new","inventory","cogs","offers","orders","order","customers","invoices","analytics","settings","billing"]){
    const html=renderDashboard(view,data,{name:"Preview owner"});
    assert.match(html,/class="lb-app"/,view);
    assert.match(html,/\/assets\/dashboard\.css/,view);
    assert.match(html,/<main class="lb-main">/,view);
  }
});

test("custom stock, cost and analytics bodies have scoped ticket styling",async()=>{
  for(const [file,selectors] of [
    ["inventory",[".lb-app .lbi-summary",".lb-app .lbi-table",".lb-app .lbi-dialog"]],
    ["cogs",[".lb-app .lbc-bar",".lb-app .lbc-note"]],
    ["analytics",[".lb-app .lba-"]]
  ]){
    const css=await readFile(`src/public/${file}.css`,"utf8");
    for(const selector of selectors)assert.ok(css.includes(selector),`${file}: ${selector}`);
  }
  const css=await readFile("src/public/dashboard.css","utf8");
  for(const selector of [".lb-app .lb-page-heading",".lb-app .lb-card",".lb-app .lb-table-wrap",".lb-app .pb-card",".lb-app .lb-panel"]){
    assert.ok(css.includes(selector),selector);
  }
  assert.match(css,/\.lb-app \[hidden\]\s*\{\s*display:\s*none\s*!important/);
});

test("Ann and both theme editor shells retain their own assets and preview boundaries",async()=>{
  const fixture=localDashboardFixture();
  const data={...fixture,settings:fixture.draft?.settings||{},role:"owner"};
  const ann=renderAnnBuilder(data,{name:"Preview owner"},{readOnly:true});
  assert.match(ann,/\/assets\/ann-builder\.css/);
  assert.match(ann,/\/assets\/ann-workspace\.css/);
  assert.match(ann,/"canWrite":false/);
  const theme=renderAnnThemeEditor(data,{name:"Preview owner"});
  assert.match(theme,/class="ann-app"/);
  assert.match(theme,/sandbox="allow-same-origin"/);
  assert.match(theme,/\/assets\/ann-workspace\.css/);
  const editor=renderEditor(data,{name:"Preview owner"});
  assert.match(editor,/\/assets\/editor\.css/);
  assert.match(editor,/class="ed"/);
  const css=await readFile("src/public/ann-builder.css","utf8");
  assert.match(css,/:root\{--a:#6b1735;--tk:/);
  assert.match(css,/color:#fff!important/);
  assert.match(css,/\.ann-app \.ae-tools/);
  assert.doesNotMatch(css.slice(css.indexOf("/* Ticket language:")),/iframe\s+[\w.*#]/);
});

test("standalone checkout settings receive ticket treatment without changing form contract",()=>{
  const html=renderCheckoutSettings({store:localDashboardFixture().store,settings:{delivery_mode:"free"}},{name:"Preview owner"});
  assert.match(html,/\.checkout-settings \.settings-card\{border:1px solid #e3dadd/);
  assert.match(html,/name="delivery_mode"/);
  assert.match(html,/data-delivery-field="flat"[^>]*hidden/);
});
