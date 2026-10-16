import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {renderWizard} from "../src/ui/wizard.js";
import {registrationForDisplay,supplierPatch,supplierMatches} from "../src/gstin/service.js";

const source=readFileSync(new URL("../src/public/wizard.js",import.meta.url),"utf8");
test("publication handoff stays on review before and after setup reload",()=>{
  const html=renderWizard({store:{store_id:"fixture"},settings:{}},{name:"Example"},{reviewOnly:true});
  assert.match(html,/data-review-only="true"/);
  assert.match(html,/Review your store before publishing/);
  assert.equal((source.match(/step\s*=\s*reviewOnly\s*\?\s*4\s*:\s*resumeStep\(data\)/g)||[]).length,2);
  assert.match(source,/async function goStep\(next\)\{\s*if\(reviewOnly\)return/);
  assert.match(source,/Back to theme editor/);
});

test("review shows saved business details and read-only policy text, never onboarding inputs",()=>{
  const settings={brand_name:"Example <brand>",legal_name:"Example Limited",gstin:"Verified value",address:"First building line\nSecond road\nCity",business_state:"27",support_email:"help@example.test"};
  const context=vm.createContext({
    data:{store:{name:"Example"},policies:[{kind:"privacy",title:"Privacy",body:"<script>untrusted</script>",reviewed:false}]},
    currentSettings:()=>settings,reviewGST:null,reviewGSTError:"",checklistItems:()=>[{label:"Missing support phone",complete:false}],
    businessGSTINErrors:()=>({}),formErrors:{},registeredBusinessState:()=> "27",
    INDIAN_STATES:[{code:"27",name:"Maharashtra"}],storeId:"fixture",
    POLICY_KINDS:["privacy"],POLICY_NAMES:{privacy:"Privacy"},busy:false,uploadBusy:false,visualOnly:false,reviewOnly:true,
    esc:value=>String(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;"),
    shellStep:(_a,_b,_c,html)=>html,encodeURIComponent,
  });
  vm.runInContext(source.slice(source.indexOf("function renderReview(){"),source.indexOf("function renderPanel(){")),context);
  const html=vm.runInContext("renderReview()",context);
  assert.doesNotMatch(html,/<(?:input|textarea|select)\b/);
  assert.match(html,/First building line\nSecond road\nCity/);
  assert.match(html,/Example &lt;brand&gt;/);
  assert.match(html,/&lt;script&gt;untrusted&lt;\/script&gt;/);
  assert.match(html,/Missing support phone/,"Incomplete requirements remain visible rather than being bypassed");
  assert.match(html,/data-review-policy="privacy"/,"Legal review is still explicit");
});

test("full GST address is recovered from old cached evidence without changing confirmed invoice fields",()=>{
  const normalized={gstin:"fixture",legal_name:"Example",trade_name:"Example",principal_address:{line1:"0, Example Building",line2:"Example Road",city:"Example City",pin:"400001",state:"Maharashtra",state_code:"27"},additional_addresses:[]};
  const row={normalized,raw_response:{data:{pradr:{adr:"Full provider prefix, Example Building, Example Road, Example City, Maharashtra, 400001"}}}};
  const before=structuredClone(row),patch=supplierPatch(normalized);
  const display=registrationForDisplay(row);
  assert.equal(display.principal_address.formatted_address,row.raw_response.data.pradr.adr);
  assert.equal(display.principal_address.line1,normalized.principal_address.line1);
  assert.deepEqual(supplierPatch(display),patch,"Presentation enrichment cannot rewrite a confirmed invoice address");
  assert.equal(supplierMatches(patch,display),true);
  assert.deepEqual(row,before,"Cached verification evidence stays untouched");
  assert.equal(registrationForDisplay({normalized,raw_response:null}),normalized);
});
