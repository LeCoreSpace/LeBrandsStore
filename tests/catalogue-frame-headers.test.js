import test from "node:test";
import assert from "node:assert/strict";
import {catalogueFrameHeaders} from "../src/dashboard/catalogue-frame-headers.js";
import {SECURITY_HEADERS} from "../src/auth/security.js";

test("only opted-in same-site catalogue forms can be framed; global protection is unchanged",()=>{
  const url="https://app.lebrands.store/stores/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/products/new";
  for(const view of ["product-new","product","collection-new","collection"]){
    const headers=catalogueFrameHeaders(new Request(`${url}?ann_modal=1`),view);
    assert.equal(headers["x-frame-options"],"SAMEORIGIN");
    assert.match(headers["content-security-policy"],/frame-ancestors 'self'$/);
    assert.doesNotMatch(headers["content-security-policy"],/frame-ancestors \*/);
    assert.match(headers["content-security-policy"],/frame-src 'self' blob:/);
  }
  for(const [request,view] of [
    [new Request(url),"product-new"],
    [new Request(`${url}?ann_modal=1`),"orders"],
    [new Request(`${url}?ann_modal=1`),"settings"],
    [new Request(`${url}?ann_modal=1`,{method:"POST"}),"product-new"],
    [new Request(`${url}?ann_modal=1&ann_modal=1`),"product-new"],
  ])assert.deepEqual(catalogueFrameHeaders(request,view),SECURITY_HEADERS);
  assert.equal(SECURITY_HEADERS["x-frame-options"],"DENY");
  assert.match(SECURITY_HEADERS["content-security-policy"],/frame-ancestors 'none'$/);
});
