import test from "node:test";
import assert from "node:assert/strict";
import { renderCatalogueOrganisation, renderCatalogueOptions, renderSearchPreview, cataloguePrerequisiteNotice } from "../src/ui/catalogue-forms.js";
import { readFile } from "node:fs/promises";

test("disabled catalogue shows prerequisite and omits new fields", () => {
  const html = renderCatalogueOrganisation({ enabled: false });
  assert.equal(html, cataloguePrerequisiteNotice());
  assert.equal(renderCatalogueOptions({ enabled: false }), "");
});
test("organisation lists collections and escapes values", () => {
  const html = renderCatalogueOrganisation({ enabled: true, product: { collection_ids: ["a"], catalogue: { vendor: '"><b>' } }, collections: [{ id: "a", title: "One" }, { id: "b", title: "<i>Two" }] });
  assert.match(html, /value="a" checked/);
  assert.doesNotMatch(html, /<b>|<i>/);
});
test("search preview shows trusted host, limits and escaped text", () => {
  const html = renderSearchPreview({ kind: "collection", slug: "summer", seoTitle: "<script>", storeSubdomain: "aari", });
  assert.match(html, /aari\.lebrands\.store\/collections\/summer/);
  assert.match(html, /maxlength="70"/); assert.match(html, /maxlength="160"/); assert.match(html, /maxlength="80"/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /data-slug-auto="false"/);
  assert.match(renderSearchPreview({ kind: "product", storeSubdomain: "bad host" }), /your-store\/products\//);
});
test("options render with initial data and limits", () => {
  const html = renderCatalogueOptions({ enabled: true, product: { catalogue: { axes: [{ name: "Size", values: ["S"] }] } } });
  assert.match(html, /data-max-variants="200"/); assert.match(html, /lb-matrix-scroll/);
});
test("css covers matrix scrolling", async () => {
  assert.match(await readFile("src/public/dashboard.css", "utf8"), /\.lb-matrix-scroll\s*{[^}]*overflow-x:auto/);
});
