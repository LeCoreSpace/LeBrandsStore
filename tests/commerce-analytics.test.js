import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {analyticsFilters,readAnalytics} from "../src/dashboard/analytics.js";
import {analyticsExport} from "../src/dashboard/analytics-export.js";
import {createAnalyticsFixture} from "../src/analytics-preview-fixture.js";
import {handleDashboard,isDashboardPath} from "../src/dashboard/routes.js";
import {migrationSelection} from "../db/migration-selection.js";

test("date presets, leap year, country-local midnight and invalid inputs",()=>{
  const filters=(p,now="2026-02-15T00:00:00Z")=>analyticsFilters(new URLSearchParams(p),"INR",new Date(now));
  assert.equal(filters("preset=financial_year").from,"2025-04-01");
  assert.equal(filters("preset=this_quarter").from,"2026-01-01");
  assert.equal(filters("preset=last_30_days").from,"2026-01-17");
  assert.equal(filters("","2026-01-31T18:30:00Z").from,"2026-02-01");
  assert.equal(filters("timezone=America%2FNew_York","2026-02-01T01:00:00Z").to,"2026-01-31");
  assert.equal(filters("preset=custom&from=2024-01-01&to=2024-12-31").to,"2024-12-31");
  for(const q of [
    "preset=custom&from=2026-02-30&to=2026-03-01","preset=custom&from=2026-03-01&to=2026-02-01",
    "preset=custom&from=2024-01-01&to=2025-01-01","preset=custom&from=2026-01-01",
    "timezone=Bad%2FZone","currency=inr","report=profit","offset=-1","limit=101","limit=1.1",
    "preset=custom&from=0000-01-01&to=0000-01-02",
  ])assert.throws(()=>filters(q),undefined,q);
  assert.equal(migrationSelection(["--staged-commerce-analytics"]).requires,"0041_catalogue_cogs.sql");
  assert.ok(isDashboardPath("/stores/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/analytics"));
});

test("exports reject oversize reports and unsafe integer money instead of truncating or rounding",async()=>{
  const filters=analyticsFilters(new URLSearchParams());
  const mock=result=>async parts=>parts.join("").includes("to_regprocedure")?[{enabled:true}]:[{result:JSON.stringify(result)}];
  await assert.rejects(()=>readAnalytics(mock({available:true,table:{total:10001}}),"id","token",filters,{exporting:true}),e=>e.status===409);
  await assert.rejects(()=>readAnalytics(mock({available:true,summary:{booked_order_value_paise:9007199254740992}}),"id","token",filters),e=>e.status===409);
});

test("real foundational DDL, order creation, captured costs, reports, exports and tenant permissions",async t=>{
  const f=await createAnalyticsFixture({now:new Date("2026-02-15T00:00:00Z")});
  t.after(()=>f.pg.close());
  const params=new URLSearchParams("preset=custom&from=2026-02-01&to=2026-02-28");
  const filters=analyticsFilters(params,"INR");
  const report=changes=>f.member.withMemberStore(f.id,f.token,tx=>readAnalytics(tx,f.id,f.token,{...filters,...changes}));
  const all=await report({});
  await t.test("inclusive IST boundaries, zero-filled dates and exclusions",()=>{
    assert.equal(all.summary.orders,5);
    assert.equal(all.summary.all_orders,8);
    assert.equal(all.daily.length,28);
    assert.equal(all.daily[0].date,"2026-02-01");
    assert.equal(all.daily[0].orders,1);
    assert.equal(all.daily[27].orders,0);
    assert.equal(all.other_currency_orders,1);
    assert.equal(all.summary.units,5);
    assert.equal(all.summary.discounts_paise,100);
    assert.equal(all.summary.gross_merchandise_paise-all.summary.discounts_paise-all.summary.reversals_paise,all.summary.net_merchandise_paise);
    assert.equal(all.daily.reduce((n,r)=>n+r.booked_order_value_paise,0),all.summary.booked_order_value_paise);
    assert.equal(all.daily.reduce((n,r)=>n+r.net_merchandise_paise,0),all.summary.net_merchandise_paise);
    assert.equal(all.summary.aov_paise,Math.round(all.summary.booked_order_value_paise/5));
  });
  await t.test("historical unknown, known zero and discounted margin exclusion",async()=>{
    assert.equal(all.costs.known_units,4);
    assert.equal(all.costs.total_units,5);
    assert.equal(all.costs.comparable_units,3);
    assert.equal(all.costs.coverage_percent,80);
    const lines=await report({report:"orders"});
    const line=kind=>lines.table.rows.find(l=>l.order_id===f.orders.find(o=>o.kind===kind).id);
    assert.equal(line("historical").unit_cost_paise,null);
    assert.equal(line("historical").estimated_margin_paise,null);
    assert.equal(line("zero").unit_cost_paise,0);
    assert.equal(line("zero").estimated_margin_paise,line("zero").taxable_paise);
    assert.equal(line("discounted").unit_cost_paise,3200);
    assert.equal(line("discounted").estimated_margin_paise,null);
    assert.equal(line("known").estimated_margin_paise,line("known").taxable_paise-3200);
    assert.equal(line("returned").eligible,false);
    assert.equal(line("pending").eligible,false);
    assert.equal(line("cancelled").estimated_margin_paise,null);
    assert.equal(all.costs.estimated_margin_paise,lines.table.rows.reduce((n,l)=>n+(l.estimated_margin_paise??0),0));
    assert.match(line("known").variant_label,/Size: S/);
  });
  await t.test("product grouping, pagination and current-cost independence",async()=>{
    const products=await report({report:"products",limit:1});
    assert.equal(products.table.total,2);
    assert.equal(products.table.rows.length,1);
    assert.equal(products.table.rows[0].units,4);
    const next=await report({report:"products",limit:1,offset:1});
    assert.equal(next.table.rows[0].units,1);
    assert.equal(next.table.rows[0].estimated_margin_paise,next.table.rows[0].comparable_revenue_paise);
    await f.member.withMemberStore(f.id,f.token,async tx=>{
      await tx`SELECT public.catalogue_cost_set(${f.id},${f.token},${f.product.id},${null}::uuid,9000,1)`;
    });
    assert.deepEqual((await report({})).costs,all.costs);
  });
  await t.test("currency separation, not converted totals",async()=>{
    const usd=await report({currency:"USD",report:"orders"});
    assert.equal(usd.summary.orders,1);
    assert.equal(usd.table.rows[0].cost_status,"currency_mismatch");
    assert.equal(usd.table.rows[0].unit_cost_paise,null);
    assert.equal(usd.costs.coverage_percent,0);
    assert.equal(usd.costs.estimated_margin_paise,null);
  });
  await t.test("empty data is not a fictional margin",async()=>{
    const empty=await report({currency:"EUR"});
    assert.equal(empty.summary.orders,0);
    assert.equal(empty.costs.coverage_percent,null);
    assert.equal(empty.costs.estimated_margin_paise,null);
  });
  await t.test("known costs do not imply a margin when historical tax values do not reconcile",async()=>{
    const order=f.orders.find(o=>o.kind==="known");
    await f.pg.query("UPDATE public.order_items SET taxable_paise=taxable_paise+1 WHERE store_id=$1 AND order_id=$2",[f.id,order.id]);
    const changed=await report({});
    assert.equal(changed.costs.known_units,all.costs.known_units);
    assert.equal(changed.costs.comparable_units,all.costs.comparable_units-1);
    const lines=await report({report:"orders"});
    assert.equal(lines.table.rows.find(l=>l.order_id===order.id).estimated_margin_paise,null);
  });
  await t.test("APP cannot bypass owner/session or tenant isolation",async()=>{
    await assert.rejects(()=>f.member.withMemberStore(f.id,"b".repeat(64),tx=>readAnalytics(tx,f.id,"b".repeat(64),filters)),e=>e.status===403);
    await assert.rejects(()=>f.member.withMemberStore(f.id,f.token,tx=>readAnalytics(tx,"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",f.token,filters)),e=>e.status===403);
    await assert.rejects(()=>f.member.withMemberStore(f.id,f.token,tx=>tx`SELECT * FROM public.order_item_costs`),e=>e.code==="42501");
  });
  await t.test("real routes, no-store downloads and editor export denial",async()=>{
    const url=`https://accounts.lebrands.store/api/stores/${f.id}/analytics`;
    const user={id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"};
    const api=await handleDashboard(new Request(`${url}?${params}`),f.member,user,f.token);
    assert.equal(api.status,200);
    assert.equal(api.headers.get("cache-control"),"no-store");
    assert.equal((await api.json()).analytics.summary.orders,5);
    const html=await handleDashboard(new Request(`https://accounts.lebrands.store/stores/${f.id}/analytics?${params}`),f.member,user,f.token);
    assert.equal(html.status,200);
    const page=await html.text();
    assert.match(page,/id="analytics-data"/);
    const boot=JSON.parse(page.match(/id="analytics-data">([\s\S]*?)<\/script>/)[1]);
    assert.equal(boot.analytics.available,true);
    assert.equal(boot.analytics.summary.orders,5);
    assert.match(page,/\/assets\/analytics\.js/);
    const denied=await handleDashboard(new Request(`${url}/export?${params}`),f.member,{id:"cccccccc-cccc-4ccc-8ccc-cccccccccccc"},"b".repeat(64));
    assert.equal(denied.status,403);
    const signedOut=await handleDashboard(new Request(url),f.member,null,f.token);
    assert.equal(signedOut.status,401);
    for(const format of ["csv","xlsx"]){
      const file=await handleDashboard(new Request(`${url}/export?${params}&report=orders&format=${format}`),f.member,user,f.token);
      assert.equal(file.status,200);
      assert.match(file.headers.get("content-disposition"),new RegExp(`\\.${format}"$`));
      assert.equal(file.headers.get("cache-control"),"no-store");
      if(format==="csv")assert.match(await file.text(),/do not sum across lines/);
      else assert.equal(new Uint8Array(await file.arrayBuffer())[0],0x50);
    }
    const post=await handleDashboard(new Request(url,{method:"POST"}),f.member,user,f.token);
    assert.equal(post.status,405);
    assert.equal((await handleDashboard(new Request(`${url}?preset=custom&from=bad&to=bad`),f.member,user,f.token)).status,400);
  });
  await t.test("CSV injection protection and genuine Excel XML/ZIP package",async()=>{
    const source=await report({report:"orders"});
    source.table.rows[0].title=" \t=HYPERLINK(\"https://invalid.test\",\"click\")";
    source.table.rows[1].title="नमस्ते & <Cotton>";
    source.table.rows[2].estimated_margin_paise=-123;
    const csv=analyticsExport(source,"csv");
    assert.match(csv.body,/' \t=HYPERLINK/);
    assert.match(csv.body,/"-1.23"/);
    const xlsx=analyticsExport(source,"xlsx");
    const check=spawnSync("python3",["-c",`
import sys,io,zipfile,xml.etree.ElementTree as E
z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))
assert z.testzip() is None
for n in z.namelist(): E.fromstring(z.read(n))
s=z.read('xl/worksheets/sheet1.xml').decode()
assert 'नमस्ते &amp; &lt;Cotton&gt;' in s
assert '<f>' not in s
assert '<v>-1.23</v>' in s
assert 'Summary and definitions' in z.read('xl/workbook.xml').decode()
`],{input:xlsx.body});
    assert.equal(check.status,0,check.stderr?.toString());
  });
  await t.test("unapplied analytics function is unavailable, not fabricated zeros",async()=>{
    await f.pg.exec("DROP FUNCTION public.commerce_analytics_read(uuid,text,date,date,text,text,text,integer,integer)");
    const unavailable=await report({});
    assert.equal(unavailable.available,false);
    assert.equal(unavailable.summary,undefined);
  });
});
