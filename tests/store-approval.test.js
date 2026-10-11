import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { approvalInput } from "../db/admin-approval-input.js";
import { renderWizard } from "../src/ui/wizard.js";
import { renderDashboard } from "../src/ui/dashboard.js";
import { DEFAULT_SETTINGS, publish } from "../src/store/repository.js";
import { generatePolicies } from "../src/store/policies.js";

const ID = "11111111-1111-4111-8111-111111111111";
const args = ["--store-id",ID,"--approved-by","platform-reviewer"];
const source = path => readFileSync(new URL(path, import.meta.url), "utf8");

test("only an explicit manual review with a note can bypass missing provider verification", () => {
  assert.deepEqual(approvalInput(args), {
    storeId:ID,approvedBy:"platform-reviewer",note:"",manualReview:false,revoke:false,
  });
  assert.equal(approvalInput([...args,"--manual-review","--note","Reviewed evidence"]).manualReview,true);
  assert.equal(approvalInput([...args,"--revoke","--note","Review withdrawn"]).revoke,true);
  for (const invalid of [
    [], ["--store-id","bad","--approved-by","staff"], [...args,"--manual-review"],
    [...args,"--revoke"], [...args,"--revoke","--manual-review","--note","reason"],
    [...args,"--approved-by","staff"], [...args,"--other"], [...args,"--note","x".repeat(1001)],
    ["--store-id",ID,"--approved-by","staff\nforged"],
  ]) assert.throws(() => approvalInput(invalid));
});

test("pending and revoked stores show clear, escaped offline notices, not approval buttons", () => {
  const store={store_id:ID,name:"Example",status:"awaiting_approval",subdomain:"example",approval_enabled:true};
  assert.match(renderWizard({store,settings:{}}, {name:"Staff"}),/Awaiting approval/);
  const dashboard=renderDashboard("overview",{store,role:"owner",overview:{},draft:{store,settings:{},products:[],policies:[]}},{});
  assert.match(dashboard,/Awaiting approval/);
  assert.doesNotMatch(dashboard,/data-approve-store/);
  const revoked={...store,status:"draft",approval_revoked_at:"2026-10-11T10:00:00Z",approval_revocation_note:"<script>no</script>"};
  const html=renderDashboard("overview",{store:revoked,role:"owner",overview:{},draft:{store:revoked,settings:{},products:[],policies:[]}},{});
  assert.match(html,/approval was revoked/);
  assert.doesNotMatch(html,/<script>no<\/script>/);
  assert.match(html,/&lt;script&gt;no&lt;\/script&gt;/);
  assert.match(renderWizard({store:revoked,settings:{}},{}),/approval was revoked/);
});

test("staged approval schema protects APP writes and legacy live stores", () => {
  const sql=source("../db/staged/0010_gstin_approval.sql");
  assert.match(sql,/WHERE status = 'live';/);
  assert.match(sql,/approved_by = 'migration-0010'/);
  assert.match(sql,/status IN \('draft','awaiting_approval','live','paused'\)/);
  assert.match(sql,/current_user <> 'postgres'/);
  assert.match(sql,/NEW\.approved_at IS DISTINCT FROM OLD\.approved_at/);
  assert.match(sql,/NEW\.approval_revoked_at IS DISTINCT FROM OLD\.approval_revoked_at/);
  assert.match(sql,/USING ERRCODE = 'insufficient_privilege'/);
  assert.match(sql,/store_gstin_verifications ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/store_gstin_verifications FORCE ROW LEVEL SECURITY/);
  assert.match(sql,/GRANT SELECT,INSERT ON TABLE public\.store_gstin_verifications TO lebrands_app/);
  assert.doesNotMatch(sql,/GRANT (?:ALL|UPDATE|DELETE) ON TABLE public\.store_gstin_verifications TO lebrands_app/);
  assert.match(sql,/ORDER BY created_at DESC,id DESC LIMIT 1/);
  assert.match(sql,/v\.verified_at >= now\(\) - interval '30 days'/);
  assert.match(source("../db/test-isolation.js"),/approval\.own-fields-immutable/);
  assert.match(source("../db/test-isolation.js"),/approval\.unapproved-cannot-go-live/);
  assert.match(source("../db/test-isolation.js"),/SQLSTATE 42501/);
  assert.doesNotMatch(source("../db/migrations/0009_required_gstin.sql"),/guard_store_approval/);
});

test("admin approval requires postgres and writes audit in the same transaction", () => {
  const script=source("../db/admin-approve-store.js");
  assert.match(script,/postgres\(process\.env\.SUPABASE_DB_URL, \{ ssl: "require", max: 1 \}\)/);
  assert.match(script,/sql\.begin\(async tx =>/);
  assert.match(script,/role\?\.role !== "postgres"/);
  assert.match(script,/store\.status !== "awaiting_approval"/);
  assert.match(script,/!verified && !input\.manualReview/);
  assert.match(script,/latest\?\.state === "blocked"/);
  assert.match(script,/action,entity_type,entity_id,metadata/);
  assert.match(script,/store\.approval_revoked/);
  assert.match(script,/status = 'draft',approval_revoked_at = now\(\)/);
  assert.doesNotMatch(source("../src/store/routes.js"),/admin-approve|approval\/approve/);
});

test("publication merging preserves locked prefixes and intentional edits, with approval rollout compatibility", async () => {
  for (const {enabled,oldPrefix,draftPrefix,locked} of [
    {enabled:false}, {enabled:true},
    {enabled:false,oldPrefix:"RLS",locked:true},
    {enabled:false,oldPrefix:"RLS",draftPrefix:"RLS",locked:true},
    {enabled:false,oldPrefix:"RLS",draftPrefix:"DIFF",locked:true},
  ]) {
    let status="draft", snapshot;
    const imageId="22222222-2222-4222-8222-222222222222";
    const media={id:imageId,store_id:ID,object_key:`stores/${ID}/${imageId}.png`,upload_type:"logo",
      kind:"image",size_bytes:100,width:1,height:1,alt_text:"Example"};
    const settings={...DEFAULT_SETTINGS,brand_name:"Example Brand",subdomain:"example-brand",
      logo_media_id:imageId,description:"Handmade goods and thoughtful essentials for daily living.",
      legal_name:"Example Business",address:"10 Example Street, Mumbai, Maharashtra, 400001",
      support_email:"hello@example.invalid",support_phone:"+919000000000",category:"home-decor",
      gstin:"27AAPFU0939F1ZV",business_state:"27"};
    if (draftPrefix) settings.invoice_prefix=draftPrefix;
    const product={id:"33333333-3333-4333-8333-333333333333",store_id:ID,title:"Example Cotton Tote",
      description:"A thoughtfully made reusable cotton tote for daily shopping and carrying essentials.",
      price_paise:10000,compare_at_price_paise:12000,tags:["cotton"],sku:"SYN-1",track_inventory:false,
      hsn_code:"4202",gst_rate:18,status:"draft"};
    const draft={store:{store_id:ID,name:"Example Brand",subdomain:"example-brand",status:"draft"},
      settings:{...settings,logo_url:`https://media.lebrands.store/${media.object_key}`},
      products:[{...product,compare_at_paise:12000,stock:null,images:[{id:imageId,url:`https://media.lebrands.store/${media.object_key}`,alt:"Example"}]}]};
    const policies=generatePolicies(draft).map(p=>({slug:p.kind,title:p.title,content:p.body,reviewed_at:new Date()}));
    const tx=async (strings,...params) => {
      const q=strings.join("?");
      if (q.includes("SELECT store_id, name, subdomain, status")) return [{
        ...draft.store,status,approval_enabled:enabled,approved_at:null,approval_revoked_at:null,
      }];
      if (q.includes("SELECT *, to_json(completed)")) return [{settings,logo_media_id:imageId,step:4,completed:[1,2,3,4]}];
      if (q.includes("SELECT * FROM public.media")) return [media];
      if (q.includes("SELECT EXISTS(SELECT 1 FROM public.invoices")) return [{locked:!!locked}];
      if (q.startsWith("SELECT snapshot FROM public.store_publications")) return oldPrefix
        ? [{snapshot:{settings:{invoice_prefix:oldPrefix,published_only:"retained"}}}] : [];
      if (q.includes("SELECT *, to_json(tags)")) return [product];
      if (q.includes("SELECT pm.product_id")) return [{...media,product_id:product.id}];
      if (q.includes("SELECT slug, title, content, reviewed_at")) return policies;
      if (q.includes("UPDATE public.stores SET status")) status=params[0];
      if (q.includes("INSERT INTO public.store_publications")) {
        snapshot=params[1];
        if (locked && snapshot.settings.invoice_prefix!==oldPrefix)
          throw Object.assign(new Error("Invoice prefix is locked until the next Indian financial year"),{code:"42501"});
      }
      return [];
    };
    tx.json=value=>value;
    if (locked && draftPrefix && draftPrefix!==oldPrefix) {
      await assert.rejects(publish(tx,ID,true),{code:"42501"});
      assert.equal(snapshot.settings.invoice_prefix,draftPrefix,"Explicit changes reach the guard, not a silent fallback");
      continue;
    }
    const result=await publish(tx,ID,true);
    assert.equal(status, enabled ? "awaiting_approval" : "live");
    assert.equal(result.store.status,status);
    assert.equal(snapshot.store.status,status);
    if (oldPrefix) {
      assert.equal(snapshot.settings.invoice_prefix,oldPrefix);
      assert.equal(snapshot.settings.published_only,"retained");
    }
  }
});
