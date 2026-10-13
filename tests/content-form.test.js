import test from "node:test";
import assert from "node:assert/strict";
import { richToText, textToRich, cleanRows, slugify } from "../src/public/content-form.js";
test("rich text round trip is escaped", () => {
  const html = textToRich("Soft <b>cotton</b>\n\n- Wash cold\n- Dry flat");
  assert.equal(html, "<p>Soft &lt;b&gt;cotton&lt;/b&gt;</p><ul><li>Wash cold</li><li>Dry flat</li></ul>");
  assert.equal(richToText(html), "Soft <b>cotton</b>\n\n- Wash cold\n- Dry flat");
  assert.equal(textToRich(""), "");
});
test("cleanRows drops empties and flags incomplete rows", () => {
  const r = cleanRows([{ a: " x ", b: "1" }, { a: "", b: "" }, { a: "", b: "2" }], ["a", "b"], ["a"]);
  assert.deepEqual(r.rows, [{ a: "x", b: "1" }]);
  assert.equal(r.errors.length, 1);
});
test("slugify is lowercase hyphen", () => assert.equal(slugify(" Summer Kurtas! "), "summer-kurtas"));
