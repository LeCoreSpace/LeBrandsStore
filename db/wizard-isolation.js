import assert from "node:assert/strict";

// All mutations are run through the runner's rollback-only APP transactions.
export function wizardIsolationChecks(getFixtures, appTransaction, denied) {
  const tables = ["store_setup", "store_publications", "store_address_history", "media"];
  return [
    ...tables.map((table) => ({
      name: `wizard.${table}.no-context`, reason: "Missing context reveals no wizard/media rows.",
      fn: () => appTransaction(null, async (tx) => {
        const rows = await tx`SELECT store_id FROM public.${tx(table)}`;
        assert.equal(rows.length, 0);
      }),
    })),
    ...tables.map((table) => ({
      name: `wizard.${table}.own-context`, reason: "Own context reveals only that store's marked fixture row.",
      fn: () => {
        const { a } = getFixtures();
        return appTransaction(a.storeId, async (tx) => {
          const rows = await tx`SELECT store_id FROM public.${tx(table)}`;
          assert.equal(rows.length, 1);
          assert.equal(rows[0].store_id, a.storeId);
        });
      },
    })),
    ...tables.map((table) => ({
      name: `wizard.${table}.cross-update`, reason: "Cross-store updates affect zero rows.",
      fn: () => {
        const { a, b } = getFixtures();
        return appTransaction(a.storeId, async (tx) => {
          const rows = await tx`UPDATE public.${tx(table)} SET updated_at = now()
            WHERE store_id = ${b.storeId} RETURNING store_id`;
          assert.equal(rows.length, 0);
        });
      },
    })),
    ...tables.map((table) => ({
      name: `wizard.${table}.cross-delete`, reason: "Cross-store deletes affect zero rows.",
      fn: () => {
        const { a, b } = getFixtures();
        return appTransaction(a.storeId, async (tx) => {
          const rows = await tx`DELETE FROM public.${tx(table)} WHERE store_id = ${b.storeId} RETURNING store_id`;
          assert.equal(rows.length, 0);
        });
      },
    })),
    ...[
      ["store_setup", (tx, id) => tx`INSERT INTO public.store_setup (store_id) VALUES (${id})`],
      ["store_publications", (tx, id) => tx`INSERT INTO public.store_publications (store_id, snapshot) VALUES (${id}, '{}'::jsonb)`],
      ["store_address_history", (tx, id) => tx`INSERT INTO public.store_address_history (store_id, subdomain) VALUES (${id}, 'rls-test-cross-alias')`],
      ["media", (tx, id) => tx`INSERT INTO public.media (store_id, object_key, kind, content_type, size_bytes)
        VALUES (${id}, ${`stores/${id}/00000000-0000-4000-8000-000000000002.png`}, 'image', 'image/png', 32)`],
    ].map(([table, query]) => ({
      name: `wizard.${table}.cross-insert`, reason: "RLS rejects cross-store inserts.",
      fn: () => {
        const { a, b } = getFixtures();
        return denied(a.storeId, (tx) => query(tx, b.storeId));
      },
    })),
    { name: "wizard.logo.composite-fk", reason: "A logo from another store cannot be attached, even by ID.",
      fn: async () => {
        const { a, b } = getFixtures();
        await assert.rejects(appTransaction(a.storeId, (tx) => tx`
          UPDATE public.store_setup SET logo_media_id = ${b.mediaId} WHERE store_id = ${a.storeId}
        `), { code: "23503" });
      } },
    { name: "wizard.membership", reason: "Store-session authorization denies other stores and expired sessions.",
      fn: () => {
        const { a, b, accountUsers, expiredTokenHash } = getFixtures();
        return appTransaction(null, async (tx) => {
          const [own] = await tx`SELECT public.authorize_store_session(${accountUsers[0].tokenHash}, ${a.storeId}) AS allowed`;
          const [other] = await tx`SELECT public.authorize_store_session(${accountUsers[0].tokenHash}, ${b.storeId}) AS allowed`;
          const [expired] = await tx`SELECT public.authorize_store_session(${expiredTokenHash}, ${a.storeId}) AS allowed`;
          assert.equal(own.allowed, true);
          assert.equal(other.allowed, false);
          assert.equal(expired.allowed, false);
        });
      } },
  ];
}
