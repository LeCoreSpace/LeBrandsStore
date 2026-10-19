import test from "node:test";
import vm from "node:vm";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderSidebarNav, navigationModel, storeStatus } from "../src/ui/dashboard-navigation.js";
import { renderDashboard } from "../src/ui/dashboard.js";
import { localDashboardFixture } from "../src/local-dashboard-fixture.js";
import worker from "../src/index.js";

const ID = "11111111-1111-4111-8111-111111111111";
const nav = (o = {}) => renderSidebarNav({ storeId: ID, subdomain: "demo", role: "owner", ...o });

test("eight groups plus Today with offers separate from Catalogue", () => {
  const html = nav();
  for (const g of ["Catalogue", "Order desk", "Money &amp; records", "Store studio", "Brand reach", "Business pulse", "Settings"]) assert.match(html, new RegExp(`<span class="lbn-label">${g}</span>`));
  assert.equal((html.match(/data-nav-group=/g) || []).length, 8);
  const model=navigationModel(`/stores/${ID}`,{role:"owner"});
  assert.equal(model.groups.find(g=>g.label==="Catalogue").items.some(i=>i.label==="Offers & codes"),false);
  assert.ok(model.groups.some(g=>g.label==="Offers & codes"));
  for (const l of ["Products","Collections","Stock &amp; SKUs","Vendors","Offers &amp; codes","Media library","Order queue","Dispatch &amp; tracking","COD &amp; returns","Customer directory","Payments &amp; settlements","Refunds","Invoices &amp; credit notes","GST summaries","Build with Ann","Theme editor","Menus &amp; links","Pages &amp; policies","Browser preview","Email campaigns","WhatsApp messages","Social campaigns","Sales performance","Product performance","Customer insights","Shopping journey","Business &amp; invoice identity","Store address &amp; domains","Payment connections","Delivery connections","Email &amp; messaging connections","Marketing connections","Dispatch preferences","People &amp; access","Plan &amp; billing","Activity history","Data exports"]) assert.ok(html.includes(`<span>${l}</span>`), l);
  assert.doesNotMatch(html, /Growth|Sales channels|Apps|—|sparkle/i);
});
test("live routes map to real pages and planned items have no href", () => {
  const m = navigationModel(`/stores/${ID}`, { subdomain: "demo", role: "owner" });
  const all = m.groups.flatMap(g => g.items);
  const byLabel = Object.fromEntries(all.map(i => [i.label, i]));
  const r = `/stores/${ID}`;
  assert.equal(byLabel["Products"].href, `${r}/products`);
  assert.equal(byLabel["Theme editor"].href, `${r}/editor`);
  assert.equal(byLabel["Build with Ann"].href, `${r}/build/ann`);
  assert.equal(byLabel["People & access"].href, `${r}/team`);
  assert.equal(byLabel["Dispatch preferences"].href, `${r}/settings/checkout`);
  assert.equal(byLabel["Pages & policies"].href, `${r}/settings#policies`);
  assert.equal(byLabel["Payment connections"].href, `${r}/settings?connection=payments`);
  assert.equal(byLabel["Delivery connections"].href, `${r}/settings?connection=delivery`);
  assert.equal(byLabel["Store address & domains"].href, `${r}/settings?connection=domain`);
  assert.equal(byLabel["Refunds"].hint, "In orders");
  assert.equal(byLabel["Stock & SKUs"].href, `${r}/inventory`);
  for (const i of all.filter(i => i.kind === "planned")) assert.equal(i.href, null);
  const html = nav();
  assert.equal((html.match(/is-planned/g) || []).length, all.filter(i => i.kind === "planned").length);
  assert.doesNotMatch(html, /<span class="lbn-leaf is-planned"[^>]*href/);
  assert.match(html, /<small>Planned<\/small>/);
  for (const [, href] of html.matchAll(/<a [^>]*href="([^"]*)"/g)) assert.ok(href.startsWith(r) || href.startsWith("https://demo.lebrands.store"), href);
});
test("current matching works on child views and opens the owning group", () => {
  const cases = [["overview","Today"],["order","Order queue"],["product","Products"],["product-new","Products"],["collection","Collections"],["customer","Customer directory"],["invoices","Invoices &amp; credit notes"]];
  for (const [view, label] of cases) {
    const html = nav({ view });
    const marks = [...html.matchAll(/aria-current="page"/g)];
    assert.equal(marks.length, 1, view);
    assert.match(html, new RegExp(`aria-current="page"[^>]*>(?:<svg[^]*?</svg>)?<span[^>]*>${label}</span>`), view);
  }
  const html = nav({ view: "order" });
  assert.match(html, /data-nav-group="orders" data-current>[^]*?aria-expanded="true"/);
  assert.match(html, /data-nav-group="catalogue">[^]*?aria-expanded="false"/);
});
test("legacy Ann connection links redirect to Settings without changing saved progress", async () => {
  const source=await readFile("src/public/ann-builder.js","utf8");
  const entry=source.match(/const launchStep =[\s\S]*?let step =[\s\S]*?;\n/)[0];
  for(const [query,expected] of [["?launch=1","domain"],["?launch=2","payments"],["?launch=3","delivery"],["?launch=__proto__",null],["?launch=unknown",null],["?logo=1&launch=2","payments"],["",null]]){
    const session={current_step:"review"};
    let redirected=null;
    const actual=vm.runInNewContext(`${entry}\nstep;`,{URL,location:{href:`https://example.invalid/build/ann${query}`,replace:href=>{redirected=href;}},session,UI_STEPS:[["review"]],boot:{store:{store_id:ID}},connectionHref:(id,kind)=>`/stores/${id}/settings?connection=${kind}`});
    assert.equal(redirected,expected?`/stores/${ID}/settings?connection=${expected}`:null,query);
    assert.equal(actual,query.includes("logo=1")?"story":"review");
    assert.equal(session.current_step,"review");
  }
});
test("Settings is an expandable group, open by default, with owner-only exports", () => {
  const html = nav({ view: "overview" });
  assert.match(html, /data-nav-group="settings"[^>]*>\s*<h2[^>]*><button[^>]*aria-expanded="true"[^>]*aria-controls="lbn-settings"/);
  assert.match(nav({ view: "settings" }), /data-nav-group="settings" data-current/);
  assert.match(html, /href="[^"]*settings#exports"/);
  const editor = nav({ role: "editor" });
  assert.match(editor, /is-disabled" aria-disabled="true"><span>Data exports<\/span><small>Owner only/);
  assert.doesNotMatch(editor, /settings#exports/);
});
test("escaping of store id, subdomain and status", () => {
  const html = renderSidebarNav({ storeId: '"><script>x</script>', subdomain: '"><img src=x>', role: "owner" });
  assert.doesNotMatch(html, /<script>|<img/);
  assert.equal(storeStatus({ status: "live" }).label, "Live");
  assert.equal(storeStatus({ status: "live", approval_revoked_at: "2026-10-17" }).tone, "off");
  assert.equal(storeStatus({ status: "draft" }).label, "Not published");
  assert.equal(storeStatus({ status: "awaiting_approval" }).tone, "pending");
});
test("shell keeps desktop collapse, mobile drawer, help and logo; module is served and safe", async () => {
  const html = renderDashboard("orders", localDashboardFixture(), { name: "Owner" });
  for (const a of ["data-sidebar-collapse", "data-menu-toggle", "data-drawer-close", "data-open-order-count", "data-sidebar-help", "data-global-search", "lb-logo", "lb-mark"]) assert.ok(html.includes(a), a);
  assert.match(html, /lbn-status/);
  const dash = await readFile("src/public/dashboard.js", "utf8");
  assert.match(dash, /dashboard-navigation\.js/);
  assert.match(dash, /Tab" && sidebar\?\.classList\.contains\("is-open"\)/);
  const mod = await readFile("src/public/dashboard-navigation.js", "utf8");
  assert.match(mod, /try \{[^]*localStorage/);
  let path = "";
  const res = await worker.fetch(new Request("https://app.lebrands.store/assets/dashboard-navigation.js"), { ASSETS: { fetch: async r => { path = new URL(r.url).pathname; return new Response("export{};", { headers: { "content-type": "text/javascript" } }); } } }, {});
  assert.equal(res.status, 200);
  assert.equal(path, "/dashboard-navigation.js");
});
