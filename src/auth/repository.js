// All account data goes through the narrowly exposed SECURITY DEFINER API.
export function accountRepository(db) {
  return {
    getPassword: (email) => db.account(async (tx) => {
      const [record] = await tx`SELECT * FROM public.get_password_record(${email})`;
      return record ?? null;
    }),
    register: (email, name, record) => db.account((tx) => tx`
      SELECT public.register_user(${email}, ${name}, ${record.password_hash},
        ${record.password_algo}, ${record.password_iterations}, ${record.password_salt})
    `),
    // Serialize per-email AND per-IP attempts, not just a racy pre-check.
    login: (email, ip, attempt) => db.account(async (tx) => {
      for (const key of [`email:${email}`, `ip:${ip}`].sort()) {
        await tx`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
      }
      const [row] = await tx`SELECT public.is_login_locked(${email}, ${ip}) AS locked`;
      if (row.locked) return null;
      const [record] = await tx`SELECT * FROM public.get_password_record(${email})`;
      const result = await attempt(record ?? null);
      await tx`SELECT public.record_login_attempt(${email}, ${ip}, ${Boolean(result)})`;
      if (result) {
        await tx`SELECT public.create_session(${result.userId}, ${result.tokenHash}, ${result.userAgent})`;
      }
      return result;
    }),
    session: (hash) => db.account(async (tx) => {
      const [row] = await tx`SELECT * FROM public.get_session(${hash})`;
      return row ?? null;
    }),
    revoke: (hash) => db.account((tx) => tx`SELECT public.revoke_session(${hash})`),
    availability: (name) => db.account(async (tx) => {
      const [row] = await tx`SELECT public.check_subdomain(${name}) AS available`;
      return Boolean(row.available);
    }),
    createStore: (userId, name, subdomain, hash) => db.account(async (tx) => {
      await tx`SELECT set_config('app.account_session_hash', ${hash}, true)`;
      const [row] = await tx`
        SELECT public.create_brand_and_store(${userId}, ${name}, ${subdomain}) AS store_id
      `;
      return row.store_id;
    }),
    changePassword: (hash, record) => db.account(async (tx) => {
      const [row] = await tx`
        SELECT public.change_password(${hash}, ${record.password_hash}, ${record.password_algo},
          ${record.password_iterations}, ${record.password_salt}) AS changed
      `;
      return row.changed;
    }),
  };
}
