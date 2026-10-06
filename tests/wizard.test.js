import assert from "node:assert/strict";
import { test } from "node:test";
import { renderAura, renderDescription } from "../src/public/aura.js";
import { renderWizard } from "../src/ui/wizard.js";
import { DEFAULT_SETTINGS, saveSetup } from "../src/store/repository.js";
import { CATEGORIES, contrastColor, validateBasics, validateTheme, validateProduct, publishChecklist, resumeStep } from "../src/public/validation.js";
import { settingsPatch, productPatch, readBody } from "../src/store/input.js";
import { validateUpload, serveMedia, MEDIA_KEY, mediaUrl } from "../src/store/media.js";
import { generatePolicies } from "../src/store/policies.js";
import { storefrontPage } from "../src/store/live.js";
import { handleStoreRoutes } from "../src/store/routes.js";
import { handleAccounts } from "../src/auth/routes.js";
import { accountHeader, brandMark } from "../src/ui/layout.js";

const ID = "11111111-1111-4111-8111-111111111111";
const MEDIA_ID = "22222222-2222-4222-8222-222222222222";
const PRODUCT_ID = "33333333-3333-4333-8333-333333333333";
const KEY = `stores/${ID}/${MEDIA_ID}.png`;
function fixture() {
  const data = {
    store: { store_id: ID, name: "A thoughtful brand", subdomain: "thoughtful", status: "draft" },
    settings: { ...DEFAULT_SETTINGS, brand_name: "A thoughtful brand", subdomain: "thoughtful",
      logo_media_id: MEDIA_ID, logo_url: mediaUrl(KEY),
      description: "Handmade essentials for everyday living, thoughtfully made in small batches.",
      legal_name: "Thoughtful Products Private Limited", address: "10 Sample Street, Mumbai, Maharashtra, 400001",
      support_email: "support@example.invalid", support_phone: "+91 90000 00000", category: "home-decor" },
    products: [{ id: PRODUCT_ID, title: "Handmade cotton tote", description: "A thoughtfully handmade everyday cotton tote for carrying your essentials.",
      price_paise: 129900, compare_at_paise: 149900, tags: ["cotton"], sku: "TEST-1", stock: null,
      hsn_code: "4202", gst_rate: 18, images: [{ id: MEDIA_ID, url: mediaUrl(KEY), alt: "Natural cotton tote" }] }],
    policies: [], progress: { step: 1, completed: [] },
  };
  data.policies = generatePolicies(data);
  return data;
}
function png() {
  const bytes = new Uint8Array(32);
  bytes.set([137,80,78,71,13,10,26,10]);
  bytes.set([73,72,68,82], 12);
  const view = new DataView(bytes.buffer); view.setUint32(16, 2); view.setUint32(20, 3);
  return bytes;
}
test("wizard basics, theme and product rules match requested boundaries", () => {
  const data = fixture();
  assert.deepEqual(validateBasics(data.settings), {});
  assert.deepEqual(validateTheme(data.settings), {});
  assert.deepEqual(validateProduct(data.products[0]), {});
  assert.equal(CATEGORIES.length, 10);
  assert.ok(validateBasics({ ...data.settings, description: "too short", logo_media_id: null }).description);
  assert.ok(validateBasics({ ...data.settings, brand_name: "x" }).brand_name);
  assert.ok(validateBasics({ ...data.settings, subdomain: "app" }).subdomain);
  assert.ok(validateTheme({ ...data.settings, theme: "bazaar" }).theme);
  assert.ok(validateTheme({ ...data.settings, accent_color: "red; background:url(javascript:1)" }).accent_color);
  const product = data.products[0];
  for (const value of [0, -100, 1.1, Number.MAX_SAFE_INTEGER]) assert.ok(validateProduct({ ...product, price_paise: value }).price_paise);
  assert.ok(validateProduct({ ...product, compare_at_paise: 100 }).compare_at_paise);
  assert.ok(validateProduct({ ...product, images: [] }).images);
  assert.ok(validateProduct({ ...product, stock: -1 }).stock);
  assert.ok(validateProduct({ ...product, hsn_code: "12345" }).hsn_code);
  assert.ok(validateProduct({ ...product, gst_rate: 99 }).gst_rate);
  assert.ok(validateProduct({ ...product, tags: Array(11).fill("tag") }).tags);
});
test("publish requires every product and every generated policy to be reviewed", () => {
  const data = fixture();
  assert.equal(publishChecklist(data).at(-1).complete, false);
  data.policies.forEach((p) => { p.reviewed = true; });
  assert.ok(publishChecklist(data).every((v) => v.complete));
  data.products.push({ ...data.products[0], title: "" });
  assert.equal(publishChecklist(data)[2].complete, false);
  assert.equal(generatePolicies(data).length, 6);
  assert.ok(generatePolicies(data).every((p) => p.reviewed === false && p.body.includes(data.settings.legal_name)));
});
test("resume chooses the first unfinished step and address drafts remain ineligible", () => {
  const data = fixture();
  data.progress = { step: 1, completed: [1, 2, 3] };
  assert.equal(resumeStep(data), 4);
  data.progress.completed = [1, 2, 4];
  assert.equal(resumeStep(data), 3);
  data.progress.completed = [1, 2, 3, 4];
  assert.equal(resumeStep(data), 4);
  data.settings.subdomain = "unconfirmed";
  assert.equal(publishChecklist(data)[0].complete, false);
});
test("draft input is strictly allowlisted and prices are integer paise", () => {
  assert.deepEqual(settingsPatch({ description: "", subdomain: "a", logo_media_id: null }), { description: "", subdomain: "a", logo_media_id: null });
  assert.throws(() => settingsPatch({ owner_id: ID }));
  assert.throws(() => settingsPatch({ logo_url: "javascript:alert(1)" }));
  assert.throws(() => productPatch({ price_paise: 99.99 }));
  assert.throws(() => productPatch({ store_id: ID }));
  assert.throws(() => productPatch({ images: [{ id: MEDIA_ID, key: KEY }] }));
  assert.throws(() => productPatch({ images: [{ id: MEDIA_ID }, { id: MEDIA_ID }] }));
  assert.deepEqual(productPatch({ images: [{ id: MEDIA_ID, alt: "cotton" }], stock: null }), { images: [{ id: MEDIA_ID, alt: "cotton" }], stock: null });
});
test("autosaved address is confirmed by a progress-only Continue, never while typing", async () => {
  for (const [step, settings, rename] of [[1, { subdomain: "new-brand" }, false], [2, undefined, true]]) {
    const queries = [];
    const data = fixture();
    const tx = async (strings, ...values) => {
      const query = strings.join("?"); queries.push(query);
      if (query.includes("SELECT store_id, name")) return [data.store];
      if (query.includes("FROM public.store_setup")) return [{
        settings: { ...data.settings, subdomain: "new-brand" }, logo_media_id: MEDIA_ID, step: 1, completed: [],
      }];
      if (query.includes("SELECT * FROM public.media")) return [{ id: MEDIA_ID, object_key: KEY }];
      if (query.includes("store_address_available")) return [{ available: true }];
      return [];
    };
    tx.json = (v) => v;
    await saveSetup(tx, ID, settings, { step, completed: [] });
    assert.equal(queries.some((q) => q.includes("SET subdomain =")), rename);
    assert.equal(queries.some((q) => q.includes("INSERT INTO public.store_address_history")), rename);
  }
});
test("shared Aura renders every requested page, logo, gallery, SEO and disabled checkout", () => {
  const data = fixture();
  for (const page of ["home", "collection", "product", "about", "contact", "policy", "404"]) {
    const html = renderAura(data, { page, productId: PRODUCT_ID, policyKind: "privacy" });
    assert.match(html, /<!doctype html>/i);
    assert.match(html, /meta name="description"/);
    assert.match(html, /og:title/);
    assert.match(html, /policies\/cancellation-refund/);
    assert.ok(html.includes(mediaUrl(KEY)), "Uploaded logo must render");
  }
  const product = renderAura(data, { page: "product", productId: PRODUCT_ID });
  assert.match(product, /<del>/);
  assert.match(product, /disabled/);
  assert.match(product, /Checkout opening soon/);
  assert.match(product, /alt="Natural cotton tote"/);
  assert.match(renderAura(data), /aura-hero-spotlight/);
  data.products = [];
  assert.match(renderAura(data, { page: "collection", preview: true }), /collection is taking shape/);
  data.products = Array(3).fill(fixture().products[0]);
  assert.ok(!renderAura(data).includes('class="aura-hero aura-hero-spotlight"'));
});
test("Aura and wizard escape hostile content and disallow unsafe image URLs", () => {
  const data = fixture();
  data.settings.brand_name = '</script><script>alert("x")</script>';
  data.settings.logo_url = "javascript:alert(1)";
  data.products[0].description = '<img src=x onerror="alert(1)">';
  data.policies[0].body = "<script>bad</script>";
  for (const page of ["home", "product", "policy"]) {
    const html = renderAura(data, { page, policyKind: "privacy" });
    assert.ok(!html.includes('<script>alert("x")</script>'));
    assert.ok(!html.includes('src="javascript:'));
    assert.ok(!html.includes("<script>bad</script>"));
  }
  const wizard = renderWizard(data, { name: "<script>owner</script>" });
  assert.ok(!wizard.includes("<script>owner</script>"));
  assert.match(wizard, /\\u003c\/script>/);
});
test("basic product rich text formats safely without allowing user HTML", () => {
  const html = renderDescription('**Cotton** and *handmade*\n- Durable\n- <img src=x onerror="alert(1)">');
  assert.match(html, /<strong>Cotton<\/strong>/);
  assert.match(html, /<em>handmade<\/em>/);
  assert.match(html, /<ul><li>Durable<\/li>/);
  assert.ok(!html.includes("<img"));
  assert.match(html, /&lt;img/);
});
test("accent button text passes WCAG AA for light, dark and mid-tone colours", () => {
  for (const color of ["#ffffff", "#000000", "#777777", "#ffff00", "#214a3d"]) {
    const ink = contrastColor(color);
    assert.ok(["#ffffff", "#000000"].includes(ink));
    const channels = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
      .map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    const l = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
    assert.ok((ink === "#000000" ? (l + .05) / .05 : 1.05 / (l + .05)) >= 4.5);
  }
});
test("magic-byte validation returns PNG/JPEG/WebP metadata without trusting filenames", () => {
  assert.deepEqual(validateUpload(png(), "image"), { ext: "png", contentType: "image/png", width: 2, height: 3 });
  const jpeg = Uint8Array.from([255,216,255,192,0,8,8,0,3,0,2,1,255,217]);
  assert.deepEqual(validateUpload(jpeg, "image"), { ext: "jpg", contentType: "image/jpeg", width: 2, height: 3 });
  const webp = new Uint8Array(30);
  webp.set([82,73,70,70]); new DataView(webp.buffer).setUint32(4, 22, true);
  webp.set([87,69,66,80,86,80,56,88], 8); webp[24] = 1; webp[27] = 2;
  assert.deepEqual(validateUpload(webp, "image"), { ext: "webp", contentType: "image/webp", width: 2, height: 3 });
  assert.throws(() => validateUpload(new TextEncoder().encode("<html>not an image</html>"), "image"));
  const large = new Uint8Array(5 * 1024 * 1024 + 1); large.set(png());
  assert.throws(() => validateUpload(large, "logo"), /5 MB/);
  assert.throws(() => validateUpload(new Uint8Array(10 * 1024 * 1024 + 1), "image"), /10 MB/);
  const bomb = png(); new DataView(bomb.buffer).setUint32(16, 20001);
  assert.throws(() => validateUpload(bomb, "image"), /dimensions/);
});
test("SVG logos reject scripts, handlers, entities, external images and CSS", () => {
  const encode = (s) => new TextEncoder().encode(s);
  const safe = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 30"><path d="M0 0h20v30z" fill="#222"/></svg>';
  assert.equal(validateUpload(encode(safe), "logo").ext, "svg");
  assert.equal(validateUpload(encode(safe), "logo").width, 20);
  assert.throws(() => validateUpload(encode(safe), "image"));
  for (const inner of [
    "<script>alert(1)</script>", '<path onload="alert(1)"/>',
    '<foreignObject><iframe/></foreignObject>', '<image href="https://evil.invalid/a"/>',
    '<path style="fill:url(https://evil.invalid)"/>', "<!DOCTYPE svg>",
    '<path fill="url(https://evil.invalid)"/>', '<use href="&#106;avascript:1"/>',
    '<animate attributeName="href"/>',
  ]) assert.throws(() => validateUpload(encode(`<svg viewBox="0 0 20 30">${inner}</svg>`), "logo"));
});
test("media delivery has immutable caching, nosniff and etags; path traversal is denied", async () => {
  const env = { MEDIA: { get: async () => ({
    body: png(), size: 32, httpEtag: '"immutable"', writeHttpMetadata: () => {},
  }) } };
  const response = await serveMedia(new Request(mediaUrl(KEY)), env);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /31536000.*immutable/);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal((await serveMedia(new Request(mediaUrl(KEY), { headers: { "if-none-match": '"immutable"' } }), env)).status, 304);
  assert.equal(MEDIA_KEY.test(`stores/${ID}/../secret.txt`), false);
  assert.equal((await serveMedia(new Request("https://media.lebrands.store/unknown"), env)).status, 404);
});
test("store mutations require origin, session and membership before any R2 write", async (context) => {
  context.mock.method(console, "error", () => {});
  let connects = 0, writes = 0;
  const noOrigin = await handleAccounts(new Request(`https://app.lebrands.store/api/stores/${ID}/setup`, {
    method: "PATCH", headers: { origin: "https://evil.invalid" },
  }), {}, null, { createDb: () => { connects++; } });
  assert.equal(noOrigin.status, 403); assert.equal(connects, 0);
  const noSession = await handleAccounts(new Request(`https://app.lebrands.store/api/stores/${ID}/setup`), {});
  assert.equal(noSession.status, 401);
  const env = { MEDIA: { put: async () => { writes++; } } };
  const denied = await handleStoreRoutes(new Request(`https://app.lebrands.store/api/stores/${ID}/media`, { method: "POST" }), env, {
    withMemberStore: async () => { throw Object.assign(new Error("No access"), { status: 403 }); },
  }, { id: PRODUCT_ID }, "a".repeat(64));
  assert.equal(denied.status, 403); assert.equal(writes, 0);
});
test("upload records use tenant-prefixed UUID keys and failed commits delete the object", async (context) => {
  context.mock.method(console, "error", () => {});
  for (const commitFails of [false, true]) {
    const puts = [], deletes = [];
    const env = { MEDIA: {
      put: async (key, bytes) => { puts.push({ key, bytes }); },
      delete: async (key) => { deletes.push(key); },
    } };
    const tx = async (strings, ...values) => {
      assert.match(strings.join("?"), /INSERT INTO public.media/);
      return [{ id: MEDIA_ID, store_id: values[0], object_key: values[1], upload_type: values[2],
        content_type: values[3], size_bytes: values[4], width: values[5], height: values[6], alt_text: values[7] }];
    };
    const db = { withMemberStore: async (id, hash, fn) => {
      assert.equal(id, ID);
      const result = await fn(tx);
      if (commitFails) throw new Error("Synthetic commit failure");
      return result;
    } };
    const form = new FormData();
    form.set("file", new Blob([png()], { type: "text/plain" }), "wrong.txt");
    form.set("type", "logo"); form.set("alt", "Brand logo");
    const response = await handleStoreRoutes(new Request(`https://app.lebrands.store/api/stores/${ID}/media`, {
      method: "POST", body: form,
    }), env, db, { id: PRODUCT_ID, name: "Brand Owner" }, "a".repeat(64));
    assert.equal(response.status, commitFails ? 503 : 200);
    assert.ok(MEDIA_KEY.test(puts[0].key)); assert.ok(puts[0].key.startsWith(`stores/${ID}/`));
    assert.equal(deletes.length, commitFails ? 1 : 0);
    if (!commitFails) assert.equal((await response.json()).media.type, "logo");
  }
});
test("stream limits do not trust Content-Length", async () => {
  const request = new Request("https://app.lebrands.store/x", { method: "POST", body: "x".repeat(200) });
  await assert.rejects(readBody(request, 10), /too large/);
});
test("live routing returns real product/policy pages and branded 404 for missing items", () => {
  const data = fixture();
  assert.equal(storefrontPage(`/products/${PRODUCT_ID}`, data).status, 200);
  assert.equal(storefrontPage(`/products/${ID}`, data).status, 404);
  assert.equal(storefrontPage("/policies/privacy", data).status, 200);
  assert.equal(storefrontPage("/checkout", data).status, 404);
});
test("signed-in headers escape the user's name and show Sign out, not Sign in; mark is L", () => {
  const html = accountHeader({ name: '<img src=x onerror="x">' });
  assert.match(html, /Sign out/); assert.ok(!html.includes("Sign in"));
  assert.ok(!html.includes("<img")); assert.match(html, /&lt;img/);
  assert.match(brandMark(), /M14 14h6v15h15v6H14z/);
});
