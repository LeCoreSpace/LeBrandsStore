import test from "node:test";
import assert from "node:assert/strict";
import { setupAnnFixtureDatabase, annFixtureAdapter } from "../src/ann-preview-fixture.js";
import { handleBusinessDocumentRoutes, validateBusinessFile, isBusinessDocumentRoute } from "../src/store/business-document-routes.js";
import { migrationSelection } from "../db/migration-selection.js";
import { readFile } from "node:fs/promises";

const store = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const root = `https://app.lebrands.store/api/stores/${store}/business-verification`;
const owner = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
const editor = { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" };
const ownerHash = "a".repeat(64), editorHash = "b".repeat(64);
const pdf = new TextEncoder().encode("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n");
const storage = () => {
  const files = new Map(), deleted = [];
  return {
    files, deleted,
    async put(key, bytes) { files.set(key, new Uint8Array(bytes)); },
    async get(key) { const body = files.get(key); return body ? { body } : null; },
    async head(key) { return files.has(key) ? { size: files.get(key).length } : null; },
    async delete(key) { deleted.push(key); files.delete(key); },
  };
};
const envFor = bucket => ({
  BUSINESS_DOCUMENTS: bucket,
  BUSINESS_DOCUMENT_SCANNER: { async fetch() { return Response.json({ clean: true, engine: "configured" }); } },
});
const request = (url, method, values, file) => {
  if (method !== "POST") return new Request(url, { method });
  const form = new FormData();
  form.set("details", JSON.stringify(values));
  if (file) form.set("file", new Blob([file.bytes], { type: file.type || "application/pdf" }), file.name || "proof.pdf");
  return new Request(url, { method, headers: { origin: "https://app.lebrands.store" }, body: form });
};
const handle = (pg, env, req, actor = owner, hash = ownerHash) =>
  handleBusinessDocumentRoutes(req, env, annFixtureAdapter(pg), actor, hash);

test("private modal owns its native fields rather than redirecting sensitive values to Ann's composer", async () => {
  const [ui, replies] = await Promise.all([
    readFile(new URL("../src/public/ann-business-documents-ui.js", import.meta.url), "utf8"),
    readFile(new URL("../src/public/ann-reply-fields.js", import.meta.url), "utf8"),
  ]);
  assert.match(ui, /setAttribute\("data-ann-native-fields", ""\)/);
  assert.match(replies, /n\.closest\("[^"]*\[data-ann-native-fields\]"\)/);
  assert.doesNotMatch(ui, /window\.confirm|window\.alert/);
});

test("document file sniffing rejects type mismatch, oversized, empty and malformed files", () => {
  assert.equal(validateBusinessFile({ type: "application/pdf" }, pdf), "application/pdf");
  for (const [type, bytes] of [
    ["application/pdf", new TextEncoder().encode("<script>alert(1)</script>")],
    ["image/png", pdf], ["image/jpeg", pdf], ["text/plain", pdf],
    ["application/pdf", new Uint8Array()],
    ["application/pdf", new Uint8Array(3000001)],
    ["application/pdf", new Uint8Array(5242881)],
  ]) assert.throws(() => validateBusinessFile({ type }, bytes), /PDF, JPEG or PNG|contents must match/);
  assert.equal(isBusinessDocumentRoute(new URL(root).pathname), true);
  assert.equal(isBusinessDocumentRoute("/api/stores/not-a-uuid/business-verification"), false);
  assert.deepEqual(migrationSelection(["--staged-business-documents"]), {
    staged: true, filename: "0031_business_documents.sql", requires: "0030_registration_contact.sql",
  });
});

test("isolated Ann business-document journey is tenant-checked, screened, revisioned and never public", async () => {
  const pg = await setupAnnFixtureDatabase({ verifiedBusiness: true, businessDocuments: true });
  const bucket = storage();
  const env = envFor(bucket);
  try {
    const response = await handle(pg, env, request(root, "GET"));
    assert.equal(response.status, 200);
    const initial = await response.json();
    assert.equal(initial.account_country, "IN");
    assert.equal(initial.gst.verified, true);
    assert.equal(initial.gst.address_confirmed, true);
    assert.ok(initial.gst.gstin);
    assert.ok(initial.gst.legal_name);
    assert.equal(initial.uploads_available, true);
    assert.equal(initial.max_file_bytes,3000000);
    assert.equal(initial.retention.key,"subscription_lifetime_v1");
    assert.equal(initial.retention.automatic_deletion,false);
    assert.equal(initial.retention_days,undefined);
    assert.equal(initial.verification, null);
    assert.deepEqual(initial.requirements.map(r => r.country_code).sort(), ["*", "IN"]);
    assert.doesNotMatch(JSON.stringify(initial), /object_key|business-verifications\/aaaaaaaa/);

    const forbidden = await handle(pg, env, request(root, "GET"), editor, editorHash);
    assert.equal(forbidden.status, 403);
    const invalidOrigin = await handle(pg, env,
      new Request(root, { method: "POST", headers: { origin: "https://evil.example" }, body: new FormData() }));
    assert.equal(invalidOrigin.status, 403);
    const india = { expected_revision: 0, country_code: "IN", legal_name: initial.gst.legal_name,
      registration_type: "gst_registered", registration_number: initial.gst.gstin,
      explanation: "", document_type: "gst_certificate" };
    const wrong = await handle(pg, env, request(root, "POST", { ...india, registration_number: "WRONG" }, { bytes: pdf }));
    assert.equal(wrong.status, 400);
    assert.equal(bucket.files.size, 0);
    const mismatch = await handle(pg, env, request(root, "POST", india, { bytes: pdf, type: "image/jpeg" }));
    assert.equal(mismatch.status, 400);
    assert.equal(bucket.files.size, 0);
    const blocked = await handle(pg, { ...env, BUSINESS_DOCUMENT_SCANNER: { async fetch() { return Response.json({ clean: false, engine: "configured" }); } } },
      request(root, "POST", india, { bytes: pdf }));
    assert.equal(blocked.status, 400);
    assert.equal(bucket.files.size, 0);
    const created = await handle(pg, env, request(root, "POST", india, { bytes: pdf }));
    assert.equal(created.status, 201, await created.clone().text());
    const saved = await created.json();
    assert.equal(saved.verification.status, "pending_review");
    assert.equal(saved.verification.revision, 1);
    assert.equal(saved.verification.documents.length, 1);
    assert.equal(bucket.files.size, 1);
    assert.ok([...bucket.files.keys()][0].startsWith(`business-verifications/${store}/`));
    assert.doesNotMatch(JSON.stringify(saved), /object_key|sha256|business-verifications\/aaaaaaaa/);
    const docUrl = `https://app.lebrands.store${saved.verification.documents[0].download_url}`;
    const retrieved = await handle(pg, env, request(docUrl, "GET"));
    assert.equal(retrieved.status, 200);
    assert.equal(retrieved.headers.get("content-disposition"), 'attachment; filename="business-document"');
    assert.equal(retrieved.headers.get("content-type"), "application/octet-stream");
    assert.equal(retrieved.headers.get("cache-control"), "no-store");
    assert.deepEqual(new Uint8Array(await retrieved.arrayBuffer()), pdf);
    assert.equal((await handle(pg, env, request(docUrl, "GET"), editor, editorHash)).status, 403);
    const stale = await handle(pg, env, request(root, "POST", india, { bytes: pdf }));
    assert.equal(stale.status, 409);
    assert.equal(bucket.files.size, 1, "stale saved file is cleaned up");
    assert.equal(bucket.deleted.length, 0, "stale requests are rejected before upload");
    const base = annFixtureAdapter(pg);
    let calls = 0;
    const raced = await handleBusinessDocumentRoutes(request(root, "POST", { ...india, expected_revision: 1 }, { bytes: pdf }),
      env, { withMemberStore: (...args) => {
        if (++calls === 2) throw Object.assign(new Error("Concurrent submission"), { code: "40001" });
        return base.withMemberStore(...args);
      } }, owner, ownerHash);
    assert.equal(raced.status, 409);
    assert.equal(bucket.files.size, 1);
    assert.equal(bucket.deleted.length, 1, "failed database commit removes the new orphan, not prior evidence");

    const exception = { ...india, expected_revision: 1, country_code: "GB",
      legal_name: "Example British Business", registration_type: "not_registered",
      registration_number: "", document_type: "", explanation: "Local registration is not applicable to this example business; please assess manually." };
    const exceptionResult = await handle(pg, {},
      request(root, "POST", exception));
    assert.equal(exceptionResult.status, 201, await exceptionResult.clone().text());
    const exceptBody = await exceptionResult.json();
    assert.equal(exceptBody.verification.country_code, "GB");
    assert.equal(exceptBody.verification.revision, 2);
    assert.equal(exceptBody.verification.documents.length, 0);
    assert.equal((await handle(pg, env, request(docUrl, "GET"))).status, 404, "old evidence is no longer downloadable");
    const storedOld = (await pg.query("SELECT count(*)::int AS count FROM public.store_business_documents")).rows[0];
    assert.equal(storedOld.count, 1, "history is retained for future authorised reviewers");
    const events = (await pg.query("SELECT event_type FROM public.store_business_verification_events ORDER BY id")).rows.map(r => r.event_type);
    assert.deepEqual(events, ["submitted", "resubmitted"]);
    await pg.exec("SET ROLE lebrands_app");
    await assert.rejects(pg.query("UPDATE public.store_business_verifications SET status='approved'"), /permission denied/);
    await assert.rejects(pg.query("SELECT * FROM public.store_business_documents"), /permission denied/);
    await pg.exec("RESET ROLE");
    await pg.exec("SET ROLE anon");
    await assert.rejects(pg.query("SELECT public.business_document_state($1,$2)", [store, ownerHash]), /permission denied/);
    await pg.exec("RESET ROLE");
  } finally { await pg.close(); }
});

test("Settings recovery stays available on paused stores and replacements preserve evidence without approving or reinstating", async () => {
  const pg=await setupAnnFixtureDatabase({verifiedBusiness:true,businessDocuments:true});
  const bucket=storage(),env=envFor(bucket);
  try {
    const initial=await (await handle(pg,env,request(root,"GET"))).json();
    const details={expected_revision:0,country_code:"IN",legal_name:initial.gst.legal_name,
      registration_type:"gst_registered",registration_number:initial.gst.gstin,document_type:"gst_certificate",explanation:""};
    const first=await handle(pg,env,request(root,"POST",details,{bytes:pdf}));
    assert.equal(first.status,201);
    const old=(await first.json()).verification.documents[0];
    // Simulate the future staff decision with a fixture administrator only.
    await pg.query("UPDATE public.store_business_verifications SET status='changes_requested',feedback='Upload a legible certificate',revision=revision+1 WHERE store_id=$1",[store]);
    await pg.query("UPDATE public.stores SET status='paused' WHERE store_id=$1",[store]);
    const rejected=await handle(pg,env,request(root,"GET"));
    assert.equal(rejected.status,200);
    const current=await rejected.json();
    assert.equal(current.verification.feedback,"Upload a legible certificate");
    assert.equal(current.verification.status,"changes_requested");
    const replaced=await handle(pg,env,request(root,"POST",{...details,expected_revision:current.verification.revision},{bytes:pdf,name:"corrected.pdf"}));
    assert.equal(replaced.status,201,await replaced.clone().text());
    const saved=(await replaced.json()).verification;
    assert.equal(saved.status,"pending_review");
    assert.equal(saved.feedback,"");
    assert.equal(saved.documents.length,1);
    assert.equal(saved.documents[0].filename,"corrected.pdf");
    assert.notEqual(saved.documents[0].id,old.id);
    assert.equal(bucket.files.size,2,"original and replacement private files remain retained");
    assert.equal((await pg.query("SELECT status FROM public.stores WHERE store_id=$1",[store])).rows[0].status,"paused");
    assert.equal((await handle(pg,env,request(`https://app.lebrands.store${old.download_url}`,"GET"))).status,404);
    const reloaded=await (await handle(pg,env,request(root,"GET"))).json();
    assert.equal(reloaded.verification.documents[0].filename,"corrected.pdf");
    await pg.query("UPDATE public.store_business_verifications SET status='approved',revision=revision+1 WHERE store_id=$1",[store]);
    const approved=await (await handle(pg,env,request(root,"GET"))).json();
    const blocked=await handle(pg,env,request(root,"POST",{...details,expected_revision:approved.verification.revision},{bytes:pdf}));
    assert.equal(blocked.status,409,"merchant cannot replace an approved record");
    assert.equal(bucket.files.size,2);
    assert.equal((await handle(pg,env,request(root,"GET"),editor,editorHash)).status,403);
  } finally {await pg.close();}
});
