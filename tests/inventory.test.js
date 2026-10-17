import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createSkuCheckoutFixture} from "../src/sku-checkout-fixture-data.js";
import {inventoryInput,inventoryFilters,listInventory,bulkInventory,inventoryCanEdit} from "../src/dashboard/inventory.js";
import {isDashboardPath,handleDashboard} from "../src/dashboard/routes.js";
import {renderDashboard} from "../src/ui/dashboard.js";
import {renderTodayStock} from "../src/public/today-stock.js";
const user={id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"},origin="https://accounts.lebrands.store";
const single="11111111-1111-4111-8111-111111111111",untracked="22222222-2222-4222-8222-222222222222";
const stamp="2026-10-17 14:30:01.123456+00";
test("inventory input rejects ambiguous, negative, oversized, duplicate and malformed updates",()=>{
  const line={product_id:single,stock:5,expected_stock:2,expected_revision:stamp};
  assert.equal(inventoryInput({reason:"Counted stock",items:[line]}).items[0].expected_revision,stamp);
  for(const patch of [{stock:-1},{stock:1.5},{stock:2147483648},{stock:"5"},{expected_stock:null},{expected_revision:"invalid"},{product_option_id:"forged"},{surprise:true}]){
    assert.throws(()=>inventoryInput({reason:"Counted stock",items:[{...line,...patch}]}),e=>e.status===400);
  }
  assert.throws(()=>inventoryInput({reason:"ok",items:[line]}));
  assert.throws(()=>inventoryInput({reason:"Count",items:[line,line]}));
  assert.throws(()=>inventoryInput({reason:"Count",items:Array.from({length:101},()=>line)}));
  for(const query of ["page=0","page=-1","page=1.5","availability=fake","status=archived",`search=${"a".repeat(121)}`])assert.throws(()=>inventoryFilters(new URLSearchParams(query)));
  assert.equal(inventoryCanEdit("editor"),true);assert.equal(inventoryCanEdit("viewer"),false);
  assert.equal(isDashboardPath(`/stores/${single}/inventory`),true);
  assert.equal(isDashboardPath(`/api/stores/${single}/inventory/bulk`,"POST"),true);
});
test("inventory real-schema listing, atomic updates, stock-only publication, races and authorization",async t=>{
  const f=await createSkuCheckoutFixture(),{pg,id,member,token,product}=f;
  const run=fn=>member.withMemberStore(id,token,fn);
  const filters=q=>inventoryFilters(new URLSearchParams(q));
  const listing=q=>run(tx=>listInventory(tx,id,filters(q),"owner"));
  const save=(rows,reason="Physical stock count")=>run(tx=>bulkInventory(tx,id,user.id,{reason,items:rows}));
  const edit=(row,stock)=>({product_id:row.product_id,product_option_id:row.product_option_id,expected_stock:row.stock,expected_revision:row.revision,stock});
  const api=(method,path,body,actor=user,hash=token,requestOrigin=origin)=>handleDashboard(new Request(`${origin}/api/stores/${id}/inventory${path}`,{
    method,headers:{origin:requestOrigin,"content-type":"application/json"},...(body?{body:JSON.stringify(body)}:{})
  }),member,actor,hash);
  try{
    await run(async tx=>{
      for(const [productId,sku,tracked,stock] of [[single,"SIMPLE-SKU",true,5],[untracked,"UNTRACKED-SKU",false,0]]){
        await tx`INSERT INTO products(id,store_id,title,description,slug,sku,price_paise,hsn_code,gst_rate,track_inventory,stock)
          VALUES(${productId},${id},${sku},'A synthetic product for isolated inventory testing.',${sku.toLowerCase()},${sku},10000,'6204',5,${tracked},${stock})`;
      }
    });
    await t.test("lists actual SKU rows and single products without a duplicate parent total",async()=>{
      const page=await listing("");assert.equal(page.total,6);
      assert.deepEqual(page.summary,{tracked_skus:5,in_stock_skus:4,low_stock_skus:4,out_of_stock_skus:1,untracked_skus:1});
      assert.equal(page.rows.filter(r=>r.product_id===product.id).length,4);
      assert.equal(page.rows.find(r=>r.product_option_id===product.variants[0].id).option_values[1].value,"Black");
      assert.equal((await listing("availability=out")).total,1);
      assert.equal((await listing("availability=untracked")).rows[0].stock,null);
      assert.equal((await listing("search=white")).total,2);
      assert.equal((await listing("search=%25")).total,0,"search is literal, not SQL wildcard");
      assert.equal((await listing("page=2")).rows.length,0);
    });
    await t.test("API authenticates, enforces origin and rejects missing/foreign records",async()=>{
      assert.equal((await api("GET","",null,null)).status,401);
      assert.equal((await api("GET","",null,{id:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"})).status,403);
      assert.equal((await api("GET","",null,user,"z".repeat(64))).status,403);
      assert.equal((await api("POST","/bulk",{reason:"Counted stock",items:[]},user,token,"https://evil.example")).status,403);
      assert.equal((await api("GET","/bulk")).status,405);
      const filtered=await api("GET","?availability=all&status=all&page=1");
      assert.equal(filtered.status,200);assert.equal((await filtered.json()).rows.length,6);
      const row=(await listing("")).rows.find(r=>r.product_option_id);
      await assert.rejects(save([{...edit(row,3),product_id:untracked}]),e=>e.status===404);
      await assert.rejects(save([{...edit(row,3),product_id:"99999999-9999-4999-8999-999999999999"}]),e=>e.status===404);
    });
    await t.test("existing editor inventory permission is preserved with its own session",async()=>{
      const editor={id:"cccccccc-cccc-4ccc-8ccc-cccccccccccc"},hash="b".repeat(64);
      const response=await api("GET","",null,editor,hash);assert.equal(response.status,200);
      const page=await response.json();assert.equal(page.can_edit,true);
      const row=page.rows.find(r=>r.product_option_id);
      const saved=await api("POST","/bulk",{reason:"Editor stock count",items:[edit(row,row.stock)]},editor,hash);
      assert.equal(saved.status,200);assert.equal((await saved.json()).updated,0);
    });
    await t.test("Today alerts count each SKU, prioritise sold-out variants, and link to filtered inventory",async()=>{
      const response=await api("GET","/alerts");
      assert.equal(response.status,200);const alerts=await response.json();
      assert.deepEqual(alerts.summary,{tracked_skus:5,low_stock_skus:4,out_of_stock_skus:1});
      assert.equal(alerts.rows.length,5);assert.equal(alerts.rows[0].sku,"SKU-M-BLACK");assert.equal(alerts.rows[0].stock,0);
      assert.ok(!alerts.rows.some(r=>!r.product_option_id&&r.product_id===product.id),"parent total is never another SKU");
      assert.ok(!alerts.rows.some(r=>r.product_id===untracked));
      const html=renderTodayStock(alerts,`/stores/${id}`);
      assert.match(html,/1 sold-out SKU/);assert.match(html,/4 low-stock SKUs/);
      assert.match(html,/Size: M/);assert.match(html,/Colour: Black/);
      assert.match(html,/availability=out&amp;search=SKU-M-BLACK/);
      assert.equal((await api("POST","/alerts",{})).status,405);
      assert.equal((await api("GET","/alerts",null,null)).status,401);
      assert.equal((await api("GET","/alerts",null,{id:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"})).status,403);
      const page=renderDashboard("overview",{store:f.data.store,role:"owner",overview:{},stockAlerts:alerts},user);
      assert.match(page,/data-today-stock/);assert.match(page,/Stock warnings/);
    });
    await t.test("bulk saves different variants and a base SKU together, updates totals, and only publishes stock",async()=>{
      const before=(await pg.query("SELECT snapshot FROM store_publications WHERE store_id=$1",[id])).rows[0].snapshot;
      await pg.query("UPDATE products SET title='Unpublished product name',price_paise=99999 WHERE id=$1",[product.id]);
      await pg.query("UPDATE product_options SET sku='UNPUBLISHED-SKU',price_paise=88888 WHERE id=$1",[product.variants[1].id]);
      const page=await listing(""),black=page.rows.find(r=>r.product_option_id===product.variants[0].id),white=page.rows.find(r=>r.product_option_id===product.variants[1].id),base=page.rows.find(r=>r.product_id===single);
      const response=await api("POST","/bulk",{reason:"Received a shipment",items:[edit(black,8),edit(white,0),edit(base,6)]});
      const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.updated,3);
      assert.deepEqual(body.rows.map(r=>r.stock).sort((a,b)=>a-b),[0,6,8]);
      const aggregate=(await pg.query("SELECT stock FROM products WHERE id=$1",[product.id])).rows[0].stock;assert.equal(aggregate,9);
      const after=(await pg.query("SELECT snapshot FROM store_publications WHERE store_id=$1",[id])).rows[0].snapshot;
      const clean=p=>({...p,stock:0,variants:p.variants?.map(v=>({...v,stock:0}))});
      assert.deepEqual(after.products.map(clean),before.products.map(clean),"no draft prices, titles, SKU labels, new listings or descriptors are published");
      assert.equal(after.products[0].stock,9);assert.equal(after.products[0].variants[1].stock,0);
      const audit=(await pg.query("SELECT metadata FROM audit_log WHERE action='inventory.bulk_adjusted'")).rows;
      assert.equal(audit.length,1);assert.equal(audit[0].metadata.reason,"Received a shipment");assert.equal(audit[0].metadata.items.length,3);
      assert.notEqual(body.rows.find(r=>r.product_option_id===black.product_option_id).revision,black.revision);
      const refreshed=await(await api("GET","/alerts")).json();
      assert.equal(refreshed.summary.out_of_stock_skus,2);
      assert.equal(refreshed.summary.low_stock_skus,1);
      assert.ok(!refreshed.rows.some(r=>r.product_option_id===black.product_option_id),"restocked variants leave low-stock warnings");
      const stale=await api("POST","/bulk",{reason:"Retry old request",items:[edit(black,8)]});assert.equal(stale.status,409);
    });
    await t.test("any stale row rejects the entire batch and cannot overwrite a checkout/restock ABA change",async()=>{
      const rows=(await listing("")).rows,black=rows.find(r=>r.product_option_id===product.variants[0].id),base=rows.find(r=>r.product_id===single);
      await pg.query("UPDATE product_options SET stock=stock-1 WHERE id=$1",[black.product_option_id]);
      await pg.query("UPDATE product_options SET stock=stock+1 WHERE id=$1",[black.product_option_id]);
      await assert.rejects(save([edit(base,100),edit(black,100)]),e=>e.status===409);
      assert.equal((await pg.query("SELECT stock FROM products WHERE id=$1",[single])).rows[0].stock,6);
      assert.equal((await pg.query("SELECT count(*)::int n FROM audit_log WHERE action='inventory.bulk_adjusted'")).rows[0].n,1);
    });
    await t.test("mid-batch failures roll back earlier SKU writes, publications and audit records",async()=>{
      const rows=(await listing("")).rows.filter(r=>r.product_option_id).slice(0,2),values=rows.map(r=>edit(r,r.stock+1));
      await assert.rejects(run(tx=>{
        let updates=0;
        const wrapped=async(parts,...args)=>{
          if(parts.join("").includes("UPDATE public.product_options SET stock=")&&++updates===2)throw Error("Injected second write failure");
          return tx(parts,...args);
        };
        wrapped.json=tx.json;wrapped.unsafe=tx.unsafe;
        return bulkInventory(wrapped,id,user.id,{reason:"Atomic rollback test",items:values});
      }),/Injected second write failure/);
      const fresh=await listing("");
      for(const row of rows)assert.equal(fresh.rows.find(r=>r.key===row.key).stock,row.stock);
      assert.equal((await pg.query("SELECT count(*)::int n FROM audit_log WHERE action='inventory.bulk_adjusted'")).rows[0].n,1);
    });
    await t.test("untracked and parent aggregate edits are rejected; zero and no-op saves are explicit",async()=>{
      const page=await listing(""),base=page.rows.find(r=>r.product_id===single),free=page.rows.find(r=>r.product_id===untracked);
      await assert.rejects(save([{...edit(free,5),expected_stock:0}]),e=>e.status===409);
      const [parent]=(await pg.query("SELECT stock,updated_at::text revision FROM products WHERE id=$1",[product.id])).rows;
      await assert.rejects(save([{product_id:product.id,expected_stock:parent.stock,expected_revision:parent.revision,stock:999}]),e=>e.status===409);
      assert.equal((await save([edit(base,base.stock)])).updated,0);
      assert.equal((await save([edit(base,0)])).rows[0].stock,0);
    });
    await t.test("unpublished SKU quantities cannot inflate a published product's aggregate",async()=>{
      const {updateAggregateStock}=await import("../src/checkout/sku-inventory.js");
      const newId=crypto.randomUUID();
      const before=(await pg.query("SELECT snapshot FROM store_publications WHERE store_id=$1",[id])).rows[0].snapshot.products[0];
      await run(async tx=>{
        await tx`INSERT INTO product_options(id,store_id,product_id,name,value,attributes,sku,stock,sort_order)
          VALUES(${newId},${id},${product.id},'Unpublished size','XL',${tx.json(["XL","Black"])},'UNPUBLISHED-EXTRA-SKU',100,99)`;
        await updateAggregateStock(tx,id,product.id);
      });
      const row=(await listing("search=UNPUBLISHED-EXTRA-SKU")).rows[0];
      await save([edit(row,101)]);
      const after=(await pg.query("SELECT snapshot FROM store_publications WHERE store_id=$1",[id])).rows[0].snapshot.products[0];
      assert.equal(after.variants.length,before.variants.length);
      assert.equal(after.stock,before.stock);
      assert.ok(!after.variants.some(v=>v.id===newId));
    });
    await t.test("page uses real shell, stock navigation, safe JSON and registered browser assets",async()=>{
      const response=await handleDashboard(new Request(`${origin}/stores/${id}/inventory`),member,user,token);
      assert.equal(response.status,200);const html=await response.text();
      assert.match(html,/inventory-data/);assert.match(html,/\/assets\/inventory.js/);assert.match(html,/\/assets\/inventory.css/);
      assert.match(html,new RegExp(`/stores/${id}/inventory`));
      const page=await listing("");const unsafe={...page,rows:[{...page.rows[0],title:'</script><script>alert("bad")</script>'}]};
      const rendered=renderDashboard("inventory",{store:f.data.store,role:"owner",inventory:unsafe},user);
      assert.ok(!rendered.includes('</script><script>alert("bad")'));
      const worker=await readFile(new URL("../src/index.js",import.meta.url),"utf8");
      assert.match(worker,/"inventory.js","inventory.css"/);
    });
    await t.test("aggregate overflow and archived records cannot change any inventory",async()=>{
      const page=await listing(""),black=page.rows.find(r=>r.product_option_id===product.variants[0].id);
      await assert.rejects(save([edit(black,2147483647)]),e=>e.status===400);
      assert.equal((await listing("")).rows.find(r=>r.key===black.key).stock,black.stock);
      const base=page.rows.find(r=>r.product_id===single);
      await pg.query("UPDATE products SET status='archived' WHERE id=$1",[single]);
      assert.equal((await listing("search=SIMPLE-SKU")).total,0);
      const alerts=await(await api("GET","/alerts")).json();
      assert.ok(!alerts.rows.some(r=>r.product_id===single));
      await assert.rejects(save([edit(base,3)]),e=>e.status===404);
    });
    await t.test("large listings paginate in SQL with stable unique SKU rows",async()=>{
      await run(async tx=>{
        const rows=Array.from({length:51},(_,i)=>({id:crypto.randomUUID(),title:`Paged fixture ${i}`,sku:`PAGE-${i}`,slug:`page-${i}`}));
        await tx`INSERT INTO products(id,store_id,title,description,slug,sku,price_paise,hsn_code,gst_rate,track_inventory,stock)
          SELECT x.id::uuid,${id},x.title,'Synthetic product for pagination coverage.',x.slug,x.sku,10000,'6204',5,true,1
          FROM jsonb_to_recordset(${tx.json(rows)}::jsonb) AS x(id text,title text,sku text,slug text)`;
      });
      const first=await listing("search=Paged+fixture"),last=await listing("search=Paged+fixture&page=2");
      assert.equal(first.total,51);assert.equal(first.rows.length,50);assert.equal(last.rows.length,1);
      assert.equal(new Set([...first.rows,...last.rows].map(r=>r.key)).size,51);
    });
  }finally{await pg.close();}
});
test("Today stock warning empty, unavailable, long and unsafe text states are truthful and escaped",()=>{
  assert.match(renderTodayStock(null,"/stores/example"),/unavailable/);
  const data={summary:{tracked_skus:0,low_stock_skus:0,out_of_stock_skus:0},rows:[],low_stock_threshold:5};
  assert.match(renderTodayStock(data,"/stores/example"),/No tracked SKUs yet/);
  assert.match(renderTodayStock({...data,summary:{...data.summary,tracked_skus:2}},"/stores/example"),/No stock warnings/);
  const html=renderTodayStock({...data,rows:[{title:'<img src=x onerror="bad()">',sku:'quote"sku',stock:0,option_values:[{name:"Size",value:"<script>bad</script>"}]}]},"/stores/example");
  assert.ok(!html.includes("<img"));assert.ok(!html.includes("<script>"));
  assert.match(html,/&lt;img/);assert.match(html,/quote%22sku/);
});
