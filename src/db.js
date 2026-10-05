import postgres from "postgres";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function assertAppRole(sql) {
  const [role] = await sql`SELECT current_user AS database_role`;
  if (role?.database_role !== "lebrands_app") {
    throw Object.assign(new Error("Hyperdrive must connect as lebrands_app."), {
      code: "INVALID_DATABASE_ROLE",
    });
  }
}

// Construct inside fetch, never globally: Worker sockets cannot cross requests.
export function createDb(env) {
  if (!env?.HYPERDRIVE?.connectionString) {
    throw Object.assign(new Error("The HYPERDRIVE binding is not configured."), {
      code: "MISSING_HYPERDRIVE_BINDING",
    });
  }
  const sql = postgres(env.HYPERDRIVE.connectionString, {
    fetch_types: false,
    max: 2,
    prepare: true,
    connect_timeout: 10,
    idle_timeout: 20,
  });

  return {
    async account(fn) {
      return sql.begin(async (tx) => {
        await assertAppRole(tx);
        return fn(tx);
      });
    },
    async resolveStore(hostname) {
      await assertAppRole(sql);
      const [store] = await sql`
        SELECT store_id, subdomain, name, status FROM public.resolve_store(${hostname})
      `;
      return store ?? null;
    },
    async withStore(storeId, fn) {
      if (!UUID_PATTERN.test(storeId)) throw new TypeError("storeId must be a UUID.");
      if (typeof fn !== "function") throw new TypeError("fn must be a function.");
      return sql.begin(async (tx) => {
        await assertAppRole(tx);
        await tx`SELECT set_config('app.store_id', ${storeId}, true)`;
        // Use only this transaction client; the outer client has no tenant context.
        return fn(tx);
      });
    },
    async withMemberStore(storeId, tokenHash, fn) {
      if (!UUID_PATTERN.test(storeId) || !/^[0-9a-f]{64}$/.test(tokenHash ?? "")) {
        throw Object.assign(new Error("Store not found."), { status: 404 });
      }
      return sql.begin(async (tx) => {
        await assertAppRole(tx);
        const [access] = await tx`SELECT public.authorize_store_session(${tokenHash}, ${storeId}) AS allowed`;
        if (!access?.allowed) throw Object.assign(new Error("You do not have access to this store."), { status: 403 });
        await tx`SELECT set_config('app.store_id', ${storeId}, true)`;
        // Every wizard mutation and publication serializes on the store row.
        const [store] = await tx`SELECT store_id FROM public.stores WHERE store_id = ${storeId} FOR UPDATE`;
        if (!store) throw Object.assign(new Error("Store not found."), { status: 404 });
        return fn(tx);
      });
    },
    close() {
      return sql.end({ timeout: 5 });
    },
  };
}