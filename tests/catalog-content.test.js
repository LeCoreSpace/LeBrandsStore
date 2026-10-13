import test from "node:test";
import assert from "node:assert/strict";
import { validateProductContent, validateCollectionPatch } from "../src/public/catalog-content.js";
import { productPatch } from "../src/store/input.js";
import { storefrontPage } from "../src/store/live.js";
import { migrationSelection } from "../db/migration-selection.js";

test("product-specific content validates bounded fields and limited rich text", () => {
  const content = { materials_care: "<p>Pure cotton. <strong>Cold wash.</strong></p>", features: [{ label: "Fit", value: "Relaxed" }], faq: [{ question: "How do I wash it?", answer: "<p>Cold wash.</p>" }] };
  assert.deepEqual(productPatch({ content }).content, content);
  for (const bad of [{ unknown: "x" }, { materials_care: '<img src=x onerror=alert(1)>' }, { materials_care: "<script>alert(1)</script>" }, { features: Array(21).fill({label:"x",value:"y"}) }, { size_note: "x".repeat(501) }]) assert.throws(() => validateProductContent(bad), error => error.status === 400);
  assert.deepEqual(validateProductContent({ materials_care: "", faq: [] }), { materials_care: "", faq: [] });
});
test("collection metadata rejects bad routes, foreign media and malformed references", () => {
  const a = "11111111-1111-4111-8111-111111111111", b = "22222222-2222-4222-8222-222222222222";
  assert.deepEqual(validateCollectionPatch({title:" Cotton ",slug:"daily-cotton",product_ids:[a],cover:null}), {title:"Cotton",slug:"daily-cotton",product_ids:[a],cover:null});
  for (const bad of [{slug:"all"}, {slug:"../login"}, {product_ids:[a,a]}, {product_ids:["other"]}, {cover:{url:`https://media.lebrands.store/stores/${b}/${a}.webp`,alt:"Cover"}}, {faq:[{question:"x",answer:"<iframe></iframe>"}]}]) assert.throws(() => validateCollectionPatch(bad,{storeId:a}), error=>error.status===400);
});
test("named collection routes use published collections, not guessed slugs", () => {
  const data = { collections: [{id:"owned",slug:"cotton"}] };
  assert.deepEqual(storefrontPage("/collections/cotton",data), {page:"collection",collectionId:"owned",status:200});
  assert.equal(storefrontPage("/collections/not-published",data).status,404);
  assert.equal(storefrontPage("/collections/all",data).status,200);
});
test("manual Aura migration command selects only 0012, never GSTIN or other pending migrations", () => {
  assert.deepEqual(migrationSelection(["--staged-aura"]), {staged:true,filename:"0012_aura_skeleton_sections.sql"});
  assert.deepEqual(migrationSelection([]),{staged:false});
  assert.throws(()=>migrationSelection(["--staged-aura","0011_gstin_approval.sql"]));
  assert.throws(()=>migrationSelection(["--unknown"]));
});
