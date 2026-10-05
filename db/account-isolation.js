import assert from "node:assert/strict";

export function accountIsolationChecks(getFixtures, transaction, denied) {
  return [
    ...["users", "sessions", "login_attempts"].map((table) => ({
      name: `accounts.private.${table}`,
      reason: "APP has no direct access to the private account table.",
      fn: () => denied(null, (tx) => tx`SELECT * FROM public.${tx(table)}`),
    })),
    {
      name: "accounts.membership",
      reason: "Each session returns exactly its member stores, including its own draft, never another brand's store.",
      fn: async () => {
        const f = getFixtures();
        for (const [index, expected] of [[0, [f.a.storeId, f.draft.storeId]], [1, [f.b.storeId]]]) {
          await transaction(null, async (tx) => {
            const [session] = await tx`SELECT * FROM public.get_session(${f.accountUsers[index].tokenHash})`;
            assert.equal(session.user_id, f.accountUsers[index].id);
            assert.deepEqual(session.stores.map((store) => store.store_id).sort(), expected.sort());
          });
        }
      },
    },
    {
      name: "accounts.revoked",
      reason: "Revoked and random sessions return no rows; revocation probe rolls back.",
      fn: () => transaction(null, async (tx) => {
        const hash = getFixtures().accountUsers[0].tokenHash;
        await tx`SELECT public.revoke_session(${hash})`;
        assert.equal((await tx`SELECT * FROM public.get_session(${hash})`).length, 0);
        assert.equal((await tx`SELECT * FROM public.get_session(${"f".repeat(64)})`).length, 0);
      }),
    },
    {
      name: "accounts.expired",
      reason: "Expired marked fixture sessions are rejected.",
      fn: () => transaction(null, async (tx) => {
        const hash = getFixtures().expiredTokenHash;
        assert.equal((await tx`SELECT * FROM public.get_session(${hash})`).length, 0);
      }),
    },
    {
      name: "accounts.lockout",
      reason: "Ten failures lock the email and IP for 15 minutes, but nine failures do not; all attempts roll back.",
      fn: () => transaction(null, async (tx) => {
        const email = getFixtures().accountUsers[0].email;
        const ip = "a".repeat(64);
        const locked = async (mail, address) =>
          (await tx`SELECT public.is_login_locked(${mail}, ${address}) AS locked`)[0].locked;
        assert.equal(await locked(email, ip), false);
        for (let index = 0; index < 9; index++) await tx`SELECT public.record_login_attempt(${email}, ${ip}, false)`;
        assert.equal(await locked(email, ip), false);
        await tx`SELECT public.record_login_attempt(${email}, ${ip}, false)`;
        assert.equal(await locked(email, "b".repeat(64)), true);
        assert.equal(await locked("rls-test-unregistered@isolation.invalid", ip), true);
      }),
    },
    {
      name: "accounts.store-owner",
      reason: "A session cannot create a store owned by another account.",
      fn: () => denied(null, async (tx) => {
        const f = getFixtures();
        await tx`SELECT set_config('app.account_session_hash', ${f.accountUsers[0].tokenHash}, true)`;
        await tx`SELECT public.create_brand_and_store(${f.accountUsers[1].id}, 'RLS Test Forbidden', 'rls-test-forbidden')`;
      }),
    },
    {
      name: "accounts.subdomains",
      reason: "Reserved, invalid and existing addresses cannot be claimed.",
      fn: () => transaction(null, async (tx) => {
        for (const name of ["app", "www", "ab", "Uppercase", "rls-test-a"]) {
          const [row] = await tx`SELECT public.check_subdomain(${name}) AS available`;
          assert.equal(row.available, false);
        }
      }),
    },
  ];
}
