import assert from "node:assert/strict";

const MARKER = "lebrands-rls-isolation-test";
const BRANDS = [
  { key: `${MARKER}-a`, name: "RLS Isolation Test A" },
  { key: `${MARKER}-b`, name: "RLS Isolation Test B" },
];
const STORES = [
  { subdomain: "rls-test-a", brand: 0, status: "live" },
  { subdomain: "rls-test-b", brand: 1, status: "live" },
  { subdomain: "rls-test-draft", brand: 0, status: "draft" },
];

// Children before parents; this covers all 25 tenant child tables.
const CLEANUP_TABLES = [
  "refunds", "invoices", "order_items", "shipments", "payments", "orders",
  "customer_addresses", "customers", "product_media", "collection_products",
  "product_options", "products", "collections", "media", "page_versions",
  "pages", "policy_pages", "invoice_sequences", "domains", "integrations",
  "otp_verifications", "email_log", "webhook_events", "audit_log", "store_members",
];

export async function assertCleanupPermission(admin) {
  await admin.begin(async (tx) => {
    const [role] = await tx`
      SELECT rolsuper, rolbypassrls FROM pg_catalog.pg_roles WHERE rolname = current_user
    `;
    assert.ok(role && (role.rolsuper || role.rolbypassrls),
      "ADMIN must have BYPASSRLS or superuser privileges.");
    const missing = await tx`
      SELECT table_name FROM unnest(${["brands", "stores", ...CLEANUP_TABLES]}::text[]) AS t(table_name)
      WHERE NOT has_table_privilege(current_user, 'public.' || table_name, 'SELECT')
         OR NOT has_table_privilege(current_user, 'public.' || table_name, 'DELETE')
    `;
    assert.equal(missing.length, 0, "ADMIN needs SELECT and DELETE privileges for fixture cleanup.");
    // Fail BEFORE creating fixtures if the admin cannot bypass history triggers.
    // This is local to this transaction/connection, never a global trigger change.
    await tx`SET LOCAL session_replication_role = replica`;
  });
}

async function ownedFixtures(tx) {
  const brands = await tx`
    SELECT id, external_brand_id, name, legal_name FROM public.brands
    WHERE external_brand_id = ANY(${BRANDS.map((brand) => brand.key)}::text[])
    FOR UPDATE
  `;
  for (const brand of brands) {
    const expected = BRANDS.find((entry) => entry.key === brand.external_brand_id);
    assert.ok(brand.name === expected.name && brand.legal_name === expected.name,
      "Reserved test brand marker collides with non-test data; refusing cleanup.");
  }
  const stores = await tx`
    SELECT s.store_id, s.brand_id, s.subdomain, s.settings, b.external_brand_id
    FROM public.stores s JOIN public.brands b ON b.id = s.brand_id
    WHERE s.subdomain = ANY(${STORES.map((store) => store.subdomain)}::text[])
    FOR UPDATE OF s
  `;
  for (const store of stores) {
    const expected = STORES.find((entry) => entry.subdomain === store.subdomain);
    assert.ok(store.settings?.rls_test_fixture === MARKER &&
      store.external_brand_id === BRANDS[expected.brand].key,
    "Reserved rls-test subdomain belongs to unmarked/non-test data; refusing cleanup.");
  }
  if (brands.length) {
    const [outside] = await tx`
      SELECT count(*)::integer AS count FROM public.stores
      WHERE brand_id = ANY(${brands.map((brand) => brand.id)}::uuid[])
        AND NOT (store_id = ANY(${stores.map((store) => store.store_id)}::uuid[]))
    `;
    assert.equal(outside.count, 0, "A test-marked brand has a non-test store; refusing cleanup.");
  }
  return { brands, stores };
}

export async function cleanupFixtures(admin) {
  await admin.begin(async (tx) => {
    const { brands, stores } = await ownedFixtures(tx);
    if (stores.length) {
      const ids = stores.map((store) => store.store_id);
      // Orders/invoices intentionally reject DELETE in normal operation.
      // Replica mode is session-local and automatically resets on commit/rollback.
      // Only verified, marked fixture stores are targeted; no global DDL is used.
      await tx`SET LOCAL session_replication_role = replica`;
      for (const table of CLEANUP_TABLES) {
        await tx`DELETE FROM public.${tx(table)} WHERE store_id = ANY(${ids}::uuid[])`;
      }
      await tx`DELETE FROM public.stores WHERE store_id = ANY(${ids}::uuid[])`;
    }
    if (brands.length) {
      await tx`DELETE FROM public.brands WHERE id = ANY(${brands.map((brand) => brand.id)}::uuid[])`;
    }
    const [remaining] = await tx`
      SELECT count(*)::integer AS count FROM public.stores
      WHERE subdomain = ANY(${STORES.map((store) => store.subdomain)}::text[])
    `;
    assert.equal(remaining.count, 0, "Fixture stores remain after cleanup.");
    const [remainingBrands] = await tx`
      SELECT count(*)::integer AS count FROM public.brands
      WHERE external_brand_id = ANY(${BRANDS.map((brand) => brand.key)}::text[])
    `;
    assert.equal(remainingBrands.count, 0, "Fixture brands remain after cleanup.");
  });
}

export async function setupFixtures(admin) {
  return admin.begin(async (tx) => {
    const brandIds = [];
    for (const brand of BRANDS) {
      const [row] = await tx`
        INSERT INTO public.brands (external_brand_id, name, legal_name)
        VALUES (${brand.key}, ${brand.name}, ${brand.name}) RETURNING id
      `;
      brandIds.push(row.id);
    }
    const stores = [];
    for (const store of STORES) {
      const [row] = await tx`
        INSERT INTO public.stores (brand_id, subdomain, name, status, settings)
        VALUES (${brandIds[store.brand]}, ${store.subdomain}, ${store.subdomain},
          ${store.status}, ${tx.json({ rls_test_fixture: MARKER })})
        RETURNING store_id
      `;
      stores.push({ storeId: row.store_id, subdomain: store.subdomain });
    }
    for (const store of stores.slice(0, 2)) {
      store.productIds = [];
      for (let index = 1; index <= 2; index++) {
        const [product] = await tx`
          INSERT INTO public.products (store_id, title, slug, price_paise, status)
          VALUES (${store.storeId}, ${`${store.subdomain} product ${index}`},
            ${`rls-test-product-${index}`}, 10000, 'active') RETURNING id
        `;
        store.productIds.push(product.id);
      }
      const [customer] = await tx`
        INSERT INTO public.customers (store_id, name, phone)
        VALUES (${store.storeId}, 'RLS Test Customer', 'rls-test-phone') RETURNING id
      `;
      store.customerId = customer.id;
      const [order] = await tx`
        INSERT INTO public.orders
          (store_id, customer_id, order_number, subtotal_paise, total_paise, shipping_address)
        VALUES (${store.storeId}, ${customer.id}, 'rls-test-order', 10000, 10000,
          ${tx.json({ fixture: MARKER })}) RETURNING id
      `;
      store.orderId = order.id;
      const [item] = await tx`
        INSERT INTO public.order_items
          (store_id, order_id, product_id, title, quantity, unit_price_paise, total_paise)
        VALUES (${store.storeId}, ${order.id}, ${store.productIds[0]},
          'RLS Test Item', 1, 10000, 10000) RETURNING id
      `;
      store.itemId = item.id;
    }
    return { a: stores[0], b: stores[1], draft: stores[2] };
  });
}