import test from "node:test";
import assert from "node:assert/strict";
import {renderBusinessDocumentStatus,mountSettingsBusinessDocuments} from "../src/public/settings-business-documents.js";
import {renderDashboard} from "../src/ui/dashboard.js";
import {localDashboardFixture} from "../src/local-dashboard-fixture.js";

const context={api:"/api/stores/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/business-verification",storeRoot:"/stores/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"};
const base={business_country:"IN",countries:[{code:"IN",name:"India"}],retention:{configured:true},uploads_available:true};
test("Settings status covers initial, pending, changes requested and approved without changing financial status",()=>{
  assert.match(renderBusinessDocumentStatus(base,context),/Not submitted/);
  assert.match(renderBusinessDocumentStatus(base,context),/Submit business documents/);
  for(const [status,label]of Object.entries({pending_review:"Pending review",changes_requested:"Changes requested",approved:"Approved"})){
    const html=renderBusinessDocumentStatus({...base,verification:{status,legal_name:"Example",feedback:'Upload <clear> evidence'}},context);
    assert.ok(html.includes(label));assert.match(html,/Upload &lt;clear&gt; evidence/);
    assert.doesNotMatch(html,/<clear>/);
    if(status==="approved"){assert.match(html,/read only/);assert.match(html,/View business documents/);}
    if(status==="changes_requested")assert.match(html,/does not automatically reinstate/);
    if(status==="pending_review")assert.match(html,/continue building/);
  }
  assert.match(renderBusinessDocumentStatus({...base,uploads_available:false,upload_message:"Scanner unavailable"},context),/Scanner unavailable/);
});
test("only current clean same-store download URLs are linked, and markup is escaped",()=>{
  const id="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const doc={filename:'<script>alert(1)</script>',scan_status:"clean",download_url:`${context.api}/documents/${id}`};
  const render=d=>renderBusinessDocumentStatus({...base,verification:{status:"pending_review",documents:[d]}},context);
  assert.match(render(doc),/download>Download/);
  assert.match(render(doc),/&lt;script&gt;/);
  for(const download_url of ["https://evil.example","//evil.example",`/api/stores/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/business-verification/documents/${id}`,`${context.api}/documents/${id}?other=1`]){
    assert.doesNotMatch(render({...doc,download_url}),/download>Download/);
  }
  assert.doesNotMatch(render({...doc,scan_status:"blocked"}),/download>Download/);
});
test("Settings and sidebar expose private controls only to owner/admin; read-only samples never fetch private data",()=>{
  for(const role of ["owner","admin","editor"]){
    const html=renderDashboard("settings",{...localDashboardFixture(),role},{name:"Example"});
    assert.match(html,/id="business-documents"/);
    if(role==="editor")assert.doesNotMatch(html,/data-business-documents-panel/);
    else {assert.match(html,/data-business-documents-panel/);assert.match(html,/ann-business-documents\.css/);}
  }
  const panel={setAttribute(){},innerHTML:""};
  mountSettingsBusinessDocuments({root:{dataset:{preview:"true"},querySelector:()=>panel},role:"owner",...context});
  assert.match(panel.innerHTML,/read-only sample/);
});
