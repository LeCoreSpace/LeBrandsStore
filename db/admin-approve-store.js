import postgres from "postgres";
import { clearPgEnvironment, logDatabaseFailure, printConnectionTarget, validateSupabaseUrl } from "./connection.js";
import { registeredSupplierErrors } from "../src/public/commerce-rules.js";
import { approvalInput, APPROVAL_USAGE } from "./admin-approval-input.js";

clearPgEnvironment();
let input;
try { input = approvalInput(process.argv.slice(2)); }
catch { console.error(APPROVAL_USAGE); process.exit(1); }

let sql;
try {
  printConnectionTarget(validateSupabaseUrl(process.env.SUPABASE_DB_URL));
  sql = postgres(process.env.SUPABASE_DB_URL, { ssl: "require", max: 1 });
  const action = await sql.begin(async tx => {
    // The Worker APP connection, brand owners and brand admins cannot use this.
    const [role] = await tx`SELECT current_user AS role, rolbypassrls FROM pg_catalog.pg_roles
      WHERE rolname = current_user`;
    if (role?.role !== "postgres" || !role.rolbypassrls) throw new Error("The postgres administrative role is required.");
    const [store] = await tx`SELECT store_id,status,approved_at,approval_revoked_at
      FROM public.stores WHERE store_id = ${input.storeId} FOR UPDATE`;
    if (!store) throw new Error("Store not found; no approval fields were changed.");
    if (input.revoke) {
      if (store.status !== "live" || !store.approved_at || store.approval_revoked_at) {
        throw new Error("Only an approved live store can be revoked.");
      }
      await tx`UPDATE public.stores SET status = 'draft',approval_revoked_at = now(),
        approval_revocation_note = ${input.note} WHERE store_id = ${input.storeId}`;
      await tx`INSERT INTO public.audit_log (store_id,actor_type,action,entity_type,entity_id,metadata)
        VALUES (${input.storeId},'platform_admin','store.approval_revoked','store',${input.storeId},
          ${tx.json({ approved_by: input.approvedBy, note: input.note })})`;
      return "revoked";
    }
    if (store.status !== "awaiting_approval") throw new Error("The store must be awaiting approval.");
    const [setup] = await tx`SELECT settings FROM public.store_setup WHERE store_id = ${input.storeId}`;
    if (!setup || Object.keys(registeredSupplierErrors(setup.settings)).length) {
      throw new Error("A complete registered business address and valid state-matched GSTIN are required.");
    }
    const [publication] = await tx`SELECT store_id FROM public.store_publications WHERE store_id = ${input.storeId}`;
    if (!publication) throw new Error("The store has not completed the publish checklist.");
    const [latest] = await tx`SELECT state, gstin, verified_at, normalized
      FROM public.store_gstin_verifications WHERE store_id = ${input.storeId}
      ORDER BY created_at DESC,id DESC LIMIT 1`;
    const addresses = [latest?.normalized?.principal_address, ...(Array.isArray(latest?.normalized?.additional_addresses)
      ? latest.normalized.additional_addresses : [])];
    const matchesAddress = addresses.some(address => address?.line1 === setup.settings.business_line1 &&
      address?.line2 === (setup.settings.business_line2 || "") &&
      address?.city === setup.settings.business_city &&
      address?.pin === setup.settings.business_pincode &&
      address?.state_code === setup.settings.business_state);
    const verified = latest?.state === "verified" && latest.gstin === setup.settings.gstin &&
      latest.normalized?.status === "Active" && latest.normalized?.taxpayer_type === "Regular" &&
      latest.normalized?.legal_name === setup.settings.legal_name && matchesAddress &&
      new Date(latest.verified_at).getTime() >= Date.now() - 30 * 86400000;
    if (!verified && !input.manualReview) {
      throw new Error("A current, active Regular GSTIN verification is required. Use --manual-review with a note only for a documented manual review.");
    }
    if (latest?.state === "blocked" || latest?.normalized?.status && latest.normalized.status !== "Active" ||
      latest?.normalized?.taxpayer_type && latest.normalized.taxpayer_type !== "Regular") {
      throw new Error("An inactive or Composition registration cannot be approved.");
    }
    await tx`UPDATE public.stores SET status = 'live', approved_at = now(),
      approved_by = ${input.approvedBy}, approval_note = ${input.note},
      approval_revoked_at = NULL, approval_revocation_note = NULL WHERE store_id = ${input.storeId}`;
    await tx`UPDATE public.store_publications
      SET snapshot = jsonb_set(snapshot,'{store,status}','"live"'::jsonb)
      WHERE store_id = ${input.storeId}`;
    await tx`INSERT INTO public.audit_log (store_id,actor_type,action,entity_type,entity_id,metadata)
      VALUES (${input.storeId},'platform_admin','store.approved','store',${input.storeId},
        ${tx.json({ approved_by: input.approvedBy, manual_review: input.manualReview, note: input.note })})`;
    return input.manualReview ? "approved after documented manual review" : "approved after provider verification";
  });
  console.info(`Store ${input.storeId}: ${action}.`);
} catch (error) {
  logDatabaseFailure("Store approval failed", error, process.env.SUPABASE_DB_URL);
  process.exitCode = 1;
} finally {
  if (sql) await sql.end({ timeout: 5 }).catch(() => {
    console.error("Database connection cleanup failed.");
    process.exitCode = 1;
  });
}
