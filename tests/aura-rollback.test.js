import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { placeCodOrder } from "../src/checkout/repository.js";
import {
  preAuraDatabase, applyAura, schemaSnapshot, legacyDataSnapshot, asLegacyApp,
} from "./helpers/rollback-database.js";

const down = await readFile(new URL("../db/rollback/0010_down.sql", import.meta.url), "utf8");
const hash = "a".repeat(64);

async function account(pg) {
  const user = randomUUID();
  await pg.query("INSERT INTO public.users(id,name,email) VALUES($1,'Rollback owner',$2)",
    [user, `${user}@example.test`]);
  await pg.query(`INSERT INTO public.sessions(user_id,token_hash,expires_at)
    VALUES($1,$2,now()+interval '1 day')`, [user, hash]);
  return user;
}

// The pre-0010 Worker's SQL contract: no page tables, rendition column,
// approval metadata, GSTIN provider table or app.publish_pages flag.
// Actual 0001–0009 functions, RLS and the unchanged COD repository execute.
async function legacyStore(pg, user, subdomain) {
  const storeId = await asLegacyApp(pg, null, hash, async tx => {
    const [row] = await tx`SELECT public.create_brand_and_store(${user},'Rollback Brand',${subdomain}) AS id`;
    return row.id;
  });
  const imageId = randomUUID(), logoId = randomUUID(), productId = randomUUID();
  const settings = {
    brand_name: "Rollback Brand", subdomain, tagline: "Original merchant copy",
    description: "Real merchant content", legal_name: "Rollback Brand Private Limited",
    gstin: "27AAPFU0939F1ZV", business_state: "27",
    business_line1: "12 Test Road", business_line2: "", business_city: "Mumbai",
    business_pincode: "400001", address: "12 Test Road, Mumbai 400001",
    invoice_prefix: "RLB", theme: "aura", accent_color: "#214a3d", font_preset: "serif",
  };
  const image = { url: `https://media.lebrands.store/stores/${storeId}/${imageId}.webp`,
    alt: "Original merchant product", width: 1080, height: 1350 };
  const snapshot = { store: { store_id: storeId, name: "Rollback Brand", subdomain, status: "live" },
    settings, products: [{ id: productId, title: "Original product", price_paise: 99900,
      gst_rate: 5, hsn_code: "6109", images: [image] }], policies: [] };
  await asLegacyApp(pg, storeId, hash, async tx => {
    const [auth] = await tx`SELECT public.authorize_store_session(${hash},${storeId}) AS allowed`;
    assert.equal(auth.allowed, true);
    await tx`INSERT INTO public.store_setup(store_id,settings) VALUES(${storeId},${tx.json(settings)})`;
    // Wizard/Settings merge preserves the prefix, as in the legacy Worker.
    await tx`UPDATE public.store_setup SET settings=settings||${tx.json({ tagline: "Saved wizard copy" })}::jsonb
      WHERE store_id=${storeId}`;
    for (const [id, type] of [[imageId, "image"], [logoId, "logo"]]) {
      await tx`INSERT INTO public.media(id,store_id,object_key,kind,content_type,size_bytes,
        width,height,alt_text,upload_type)
        VALUES(${id},${storeId},${`stores/${storeId}/${id}.webp`},'image','image/webp',1000,
          1080,1350,'Merchant image',${type})`;
    }
    await tx`UPDATE public.store_setup SET logo_media_id=${logoId} WHERE store_id=${storeId}`;
    await tx`INSERT INTO public.products(id,store_id,title,slug,status,price_paise,gst_rate,hsn_code,stock)
      VALUES(${productId},${storeId},'Original product','original-product','active',99900,5,'6109',5)`;
    await tx`INSERT INTO public.product_media(store_id,product_id,media_id,sort_order)
      VALUES(${storeId},${productId},${imageId},0)`;
    await tx`INSERT INTO public.store_publications(store_id,snapshot)
      VALUES(${storeId},${tx.json(snapshot)}) ON CONFLICT(store_id) DO UPDATE SET snapshot=EXCLUDED.snapshot`;
    await tx`UPDATE public.stores SET status='live' WHERE store_id=${storeId}`;
    await tx`UPDATE public.store_publications SET snapshot=jsonb_set(snapshot,'{settings,tagline}','"Republished copy"'::jsonb)
      WHERE store_id=${storeId}`;
    const [publication] = await tx`SELECT snapshot FROM public.store_publications WHERE store_id=${storeId}`;
    assert.equal(publication.snapshot.settings.tagline, "Republished copy");
    assert.equal(publication.snapshot.products[0].images[0].url, image.url);
    const [setup] = await tx`SELECT settings FROM public.store_setup WHERE store_id=${storeId}`;
    assert.equal(setup.settings.invoice_prefix, "RLB");
  });
  const resolved = await asLegacyApp(pg, null, hash, tx =>
    tx`SELECT * FROM public.resolve_store(${`${subdomain}.lebrands.store`})`);
  assert.equal(resolved[0].store_id, storeId);
  return { storeId, productId };
}

async function legacyOrderAndInvoice(pg, { storeId, productId }) {
  await asLegacyApp(pg, storeId, hash, async tx => {
    const input = { items: [{ product_id: productId, quantity: 1 }],
      contact: { name: "Test customer", phone: "+919000000000", email: "" },
      address: { line1: "Test Road", line2: "", landmark: "", city: "Mumbai", state: "27", pincode: "400001" },
      idempotency_key: randomUUID(), receipt_token: "b".repeat(64) };
    const placed = await placeCodOrder(tx, storeId, input, "c".repeat(64), "d".repeat(64), "direct");
    const replay = await placeCodOrder(tx, storeId, input, "c".repeat(64), "d".repeat(64), "direct");
    assert.equal(replay.order_number, placed.order_number);
    assert.equal(replay.replayed, true);
    const [product] = await tx`SELECT stock FROM public.products WHERE id=${productId} AND store_id=${storeId}`;
    assert.equal(product.stock, 4, "Retry must not deduct inventory twice");
    const [order] = await tx`SELECT id FROM public.orders WHERE store_id=${storeId} AND order_number=${placed.order_number}`;
    await tx`UPDATE public.orders SET status='shipped' WHERE store_id=${storeId} AND id=${order.id}`;
    const [invoice] = await tx`SELECT * FROM public.issue_invoice(${order.id})`;
    assert.match(invoice.invoice_number, /^RLB\/\d{2}-\d{2}\/0001$/);
    const [again] = await tx`SELECT * FROM public.issue_invoice(${order.id})`;
    assert.equal(again.invoice_number, invoice.invoice_number);
    await tx`UPDATE public.orders SET status='cancelled' WHERE store_id=${storeId} AND id=${order.id}`;
    const [cancelled] = await tx`SELECT * FROM public.cancel_invoice(${order.id})`;
    assert.equal(cancelled.changed, true);
    assert.match(cancelled.credit_note_number, /^RLBC\/\d{2}-\d{2}\/0001$/);
    const [repeated] = await tx`SELECT * FROM public.cancel_invoice(${order.id})`;
    assert.equal(repeated.changed, false);
  });
}

async function rejectedVideo(pg, storeId) {
  const id = randomUUID();
  await assert.rejects(asLegacyApp(pg, storeId, hash, tx =>
    tx`INSERT INTO public.media(id,store_id,object_key,kind,content_type,size_bytes,upload_type)
      VALUES(${id},${storeId},${`stores/${storeId}/${id}.mp4`},'video','video/mp4',100,'video')`),
  error => error.code === "23514");
}

test("0010 down restores the complete 0009 schema, legacy data, grants and legacy Worker flows", async () => {
  const pg = await preAuraDatabase();
  try {
    const user = await account(pg);
    const beforeStore = await legacyStore(pg, user, "rollback-before");
    await legacyOrderAndInvoice(pg, beforeStore);
    await rejectedVideo(pg, beforeStore.storeId);
    const beforeSchema = await schemaSnapshot(pg), beforeData = await legacyDataSnapshot(pg);
    await applyAura(pg);
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM public.store_pages")).rows[0].n, 16);
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM public.store_page_versions")).rows[0].n, 16);
    // Simulate editor-only content to prove the down script removes it too.
    await pg.query(`UPDATE public.store_pages SET version=version+1,
      draft_layout=jsonb_set(draft_layout,'{2,settings,title}','"Editor draft"'::jsonb)
      WHERE store_id=$1 AND page_key='home'`, [beforeStore.storeId]);
    await pg.query(`INSERT INTO public.store_page_versions(store_id,page_key,version,layout)
      SELECT store_id,page_key,1,draft_layout FROM public.store_pages WHERE page_key='home'`);
    await pg.exec(down);
    assert.deepEqual(await schemaSnapshot(pg), beforeSchema,
      "All pre-0010 schema definitions, owners, privileges, RLS, policies and triggers must match");
    assert.deepEqual(await legacyDataSnapshot(pg), beforeData, "No legacy rows or earlier migration records may change");
    const afterStore = await legacyStore(pg, user, "rollback-after");
    await legacyOrderAndInvoice(pg, afterStore);
    await rejectedVideo(pg, afterStore.storeId);
    await asLegacyApp(pg, beforeStore.storeId, hash, async tx => {
      assert.equal((await tx`SELECT id FROM public.products WHERE store_id=${afterStore.storeId}`).length, 0);
    });
    await assert.rejects(asLegacyApp(pg, beforeStore.storeId, hash, tx =>
      tx`SELECT * FROM public.issue_invoice(${randomUUID()})`), error => error.code === "42501");
    await assert.rejects(asLegacyApp(pg, beforeStore.storeId, hash, tx =>
      tx`UPDATE public.store_setup SET settings=settings||'{"invoice_prefix":"NEW"}'::jsonb
        WHERE store_id=${beforeStore.storeId}`), error => error.code === "42501");
    assert.deepEqual(await schemaSnapshot(pg), beforeSchema, "Legacy flows must not recreate editor objects");
  } finally { await pg.close(); }
});

test("0010 down refuses new video media atomically instead of deleting or reclassifying it", async () => {
  const pg = await preAuraDatabase();
  try {
    const user = await account(pg), { storeId } = await legacyStore(pg, user, "rollback-video");
    await applyAura(pg);
    const id = randomUUID();
    await asLegacyApp(pg, storeId, hash, tx =>
      tx`INSERT INTO public.media(id,store_id,object_key,kind,content_type,size_bytes,upload_type)
        VALUES(${id},${storeId},${`stores/${storeId}/${id}.mp4`},'video','video/mp4',100,'video')`);
    const beforeSchema = await schemaSnapshot(pg), beforeData = await legacyDataSnapshot(pg);
    await assert.rejects(pg.exec(down), error => error.code === "23514" && /video media/.test(error.message));
    await pg.exec("ROLLBACK");
    assert.deepEqual(await schemaSnapshot(pg), beforeSchema, "A failed down must retain all 0010 objects");
    assert.deepEqual(await legacyDataSnapshot(pg), beforeData, "A failed down must retain media and migration bookkeeping");
  } finally { await pg.close(); }
});

test("0010 down rolls back earlier drops if an unexpected external dependency prevents completion", async () => {
  const pg = await preAuraDatabase();
  try {
    const user = await account(pg);
    await legacyStore(pg, user, "rollback-dependent");
    await applyAura(pg);
    await pg.exec("CREATE VIEW public.rollback_external_view AS SELECT store_id,page_key FROM public.store_pages");
    const beforeSchema = await schemaSnapshot(pg), beforeData = await legacyDataSnapshot(pg);
    await assert.rejects(pg.exec(down), error => error.code === "2BP01");
    await pg.exec("ROLLBACK");
    assert.deepEqual(await schemaSnapshot(pg), beforeSchema,
      "Six trigger drops, fifteen function drops and history-table drop must all roll back");
    assert.deepEqual(await legacyDataSnapshot(pg), beforeData);
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM public.store_page_versions")).rows[0].n, 16);
  } finally { await pg.close(); }
});
