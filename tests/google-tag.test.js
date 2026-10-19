import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import worker from "../src/index.js";
import { GOOGLE_TAG_HEAD, GOOGLE_TAG_ID, googleTagCsp } from "../src/ui/google-tag.js";
import { SECURITY_HEADERS } from "../src/auth/security.js";

const execute = (hostname, navigator = {}) => {
  const scripts = [];
  const window = { location: { hostname, origin: `https://${hostname}`, pathname: "/pricing", search: "?email=private@example.invalid", hash: "#private" } };
  const document = { referrer: "https://example.invalid/start?email=private@example.invalid#private", createElement: () => ({}), head: { appendChild: script => scripts.push(script) } };
  vm.runInNewContext(GOOGLE_TAG_HEAD.replace(/^<script>|<\/script>$/g, ""), { window, navigator, document, URL });
  return { window, scripts };
};

test("Google tag loads asynchronously only on the production public host and respects privacy preferences", () => {
  for (const hostname of ["lebrands.store", "www.lebrands.store"]) {
    const { window, scripts } = execute(hostname);
    assert.equal(scripts.length, 1);
    assert.equal(scripts[0].async, true);
    assert.equal(scripts[0].src, `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_TAG_ID}`);
    const config = Array.from(window.dataLayer[1]);
    assert.equal(config[0], "config");
    assert.equal(config[2].page_location, `https://${hostname}/pricing`);
    assert.equal(config[2].page_referrer, "https://example.invalid/start");
    assert.equal(config[2].allow_google_signals, false);
  }
  for (const hostname of ["localhost", "app.lebrands.store", "brand.lebrands.store", "example.replit.dev"]) assert.equal(execute(hostname).scripts.length, 0);
  for (const preference of [{ globalPrivacyControl: true }, { doNotTrack: "1" }]) assert.equal(execute("lebrands.store", preference).scripts.length, 0);
});

test("Worker serves one tag per public platform page and leaves the shared private CSP unchanged", async () => {
  for (const path of ["/", "/pricing", "/compare", "/privacy", "/terms", "/support", "/contact"]) {
    const response = await worker.fetch(new Request(`https://lebrands.store${path}`), {});
    assert.equal(response.status, 200);
    assert.equal((await response.text()).split('window.gtag("config"').length - 1, 1);
    assert.match(response.headers.get("content-security-policy"), /script-src[^;]*https:\/\/www.googletagmanager.com/);
  }
  assert.doesNotMatch(SECURITY_HEADERS["content-security-policy"], /google-analytics|googletagmanager/);
  assert.match(googleTagCsp(SECURITY_HEADERS["content-security-policy"]), /connect-src[^;]*google-analytics/);
  const missing = await worker.fetch(new Request("https://lebrands.store/not-a-page"), {});
  assert.doesNotMatch(await missing.text(), /G-E8407V71QH/);
});
