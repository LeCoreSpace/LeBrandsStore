import postgres from "postgres";
import { clearPgEnvironment, logDatabaseFailure, printConnectionTarget, validateSupabaseUrl } from "./connection.js";
import { hashPassword, randomToken } from "../src/auth/passwords.js";
import { normalizeEmail } from "../src/auth/security.js";

clearPgEnvironment();
const args = process.argv.slice(2).filter((value) => value !== "--");
const email = args.length === 1 ? normalizeEmail(args[0]) : null;
if (!email) {
  console.error("Usage: pnpm run db:admin-reset-password -- user@example.com");
  process.exit(1);
}
let sql;
try {
  printConnectionTarget(validateSupabaseUrl(process.env.SUPABASE_DB_URL));
  sql = postgres(process.env.SUPABASE_DB_URL, { ssl: "require", max: 1 });
  const temporary = randomToken().slice(0, 32);
  const record = await hashPassword(temporary);
  await sql.begin(async (tx) => {
    const [role] = await tx`SELECT rolsuper, rolbypassrls FROM pg_catalog.pg_roles WHERE rolname = current_user`;
    if (!role || (!role.rolsuper && !role.rolbypassrls)) throw new Error("Administrative BYPASSRLS role required.");
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${"email:" + email}, 0))`;
    const rows = await tx`
      UPDATE public.users SET password_hash = ${record.password_hash},
        password_algo = ${record.password_algo}, password_iterations = ${record.password_iterations},
        password_salt = ${record.password_salt}, must_change_password = true
      WHERE email = ${email} RETURNING id
    `;
    if (rows.length !== 1) throw new Error("No matching account; no password was changed.");
    await tx`UPDATE public.sessions SET revoked_at = now() WHERE user_id = ${rows[0].id} AND revoked_at IS NULL`;
  });
  // Explicitly requested one-time output, only after successful commit.
  console.info(`Temporary password (shown once): ${temporary}`);
  console.info("Deliver it privately. The account must change it after signing in.");
} catch (error) {
  logDatabaseFailure("Password reset failed", error, process.env.SUPABASE_DB_URL);
  process.exitCode = 1;
} finally {
  if (sql) await sql.end({ timeout: 5 }).catch(() => { console.error("Connection cleanup failed."); process.exitCode = 1; });
}
