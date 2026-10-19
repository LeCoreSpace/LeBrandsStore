import test from "node:test";
import assert from "node:assert/strict";
import {renderCheckoutSettings} from "../src/ui/checkout.js";
import {renderSidebarNav} from "../src/ui/dashboard-navigation.js";
import {checkoutSettingsPreview} from "../src/checkout-settings-preview-fixture.js";

const id = "11111111-1111-4111-8111-111111111111";
test("checkout settings retains its form inside the real dashboard shell", () => {
  const html = renderCheckoutSettings({store:{store_id:id,name:'A <brand>'},
    settings:{delivery_mode:"free_above",flat_paise:6000,free_above_paise:99900,cod_enabled:true,store_state:"33"}}, {});
  assert.match(html, /class="lb-sidebar"/);
  assert.match(html, /<main class="lb-main">/);
  assert.match(html, /A &lt;brand&gt;/);
  assert.match(html, /href="\/stores\/11111111-1111-4111-8111-111111111111\/settings\/checkout"[^>]*aria-current="page"/);
  assert.match(html, /name="flat_rupees"[^>]*value="60.00"/);
  assert.match(html, /name="free_above_rupees"[^>]*value="999.00"/);
  assert.match(html, /data-checkout-settings data-store-id=/);
  assert.match(html, /checkout-settings \[hidden\]\{display:none!important\}/);
  assert.match(html, /assets\/commerce.js/);
  assert.doesNotMatch(html, /Back to your stores/);
});
test("checkout settings navigation respects the existing owner-only endpoint", () => {
  const nav = renderSidebarNav({storeId:id,role:"editor"});
  assert.match(nav, /Checkout settings/);
  assert.doesNotMatch(nav, /href="[^"]*settings\/checkout"/);
});
test("checkout settings preview is local, read-only and disables saving", async () => {
  const res = {setHeader(){},end(body){this.body=body;}};
  assert.equal(await checkoutSettingsPreview({url:"/__checkout-settings-preview",method:"GET"},res),true);
  assert.match(res.body, /type="submit" disabled/);
  assert.doesNotMatch(res.body, / data-checkout-settings/);
  await checkoutSettingsPreview({url:"/__checkout-settings-preview",method:"POST"},res);
  assert.equal(res.statusCode,405);
});
