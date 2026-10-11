# Store approval, staged 0010 work

**Do not apply this staged SQL yet.** `db/staged/0010_gstin_approval.sql` is
deliberately outside `db/migrations/`. The current `db:migrate` runner applies
every pending migration together. First review, manually migrate, test and
deploy 0009. Finish the rest of the GSTIN verification flow and review 0010
before copying its finished SQL into `db/migrations/`.

No migrations, provider calls or deployments were run during this work.
0009 and the Wrangler configs were not modified.

## Approval boundary

- After 0010, first publish saves the publication snapshot but sets
  `stores.status = 'awaiting_approval'`. The existing public router serves
  its not-found page until the store has become `live`.
- The authenticated wizard and Settings/other dashboard pages explain
  the awaiting state. A revoked store is offline and shows the platform
  revocation reason. Store data and prior documents remain unchanged.
- No brand role can approve or revoke, including owners and brand admins.
  There is no Worker approval endpoint or approval UI. The database trigger
  rejects any APP change to `approved_at`, `approved_by`, `approval_note`,
  `approval_revoked_at` or `approval_revocation_note` with SQLSTATE **42501**.
  The same guard rejects a transition to live without valid approval.
- The platform-only script uses `SUPABASE_DB_URL` and requires the `postgres`
  administrative role; it locks the store row, changes state and writes a
  `platform_admin` audit event in the **same transaction**. With no
  `--manual-review` flag, approval requires a current verified, Active,
  Regular GSTIN and exact match of the selected registered address and legal
  name. A manual override requires both the explicit flag and a note;
  blocked/inactive/Composition registrations cannot be approved. Manual
  review **does not verify the GSTIN** or bypass the invoice gate.
- `--revoke` requires a reason, puts an approved live store back into draft,
  records the reviewer, revocation reason and timestamp, and leaves data
  intact. Resubmitting goes back to awaiting approval, not directly live.
- Existing live stores are grandfathered in the migration with
  `approved_by = 'migration-0010'`, an approval timestamp/note and a system
  audit event. They are **not** taken offline. The migration does not
  retroactively claim their GSTIN was provider verified.
- Before 0010, the application retains the 0009-era publication behavior
  because the new status/columns do not yet exist.

## Script, only after the finished 0010 migration is manually applied

```text
node db/admin-approve-store.js --store-id STORE_UUID --approved-by STAFF_ID
node db/admin-approve-store.js --store-id STORE_UUID --approved-by STAFF_ID --manual-review --note "Review reason"
node db/admin-approve-store.js --store-id STORE_UUID --approved-by STAFF_ID --revoke --note "Revocation reason"
```

No approval script has been run. Keep notes factual; they are shown to a
brand after revocation. The script never prints the note or a database URL.

## Staged schema and security review

The SQL adds store approval columns and `awaiting_approval` to the
status constraint. It also creates a store-scoped verification-evidence
table with `created_at`/`updated_at`, forced RLS, APP **SELECT/INSERT own
rows only** and no APP UPDATE/DELETE. `PUBLIC`, `anon`, `authenticated`
and `service_role` have no access. A new invoker trigger function protects
all approval fields; it is postgres-owned and is not executable by APP or
API roles. The existing invoice supplier helper is replaced to require
the **latest** Active/Regular verified evidence from the last 30 days, a
matching selected address and a live store before issuing a *new* invoice.
There is no change to historic invoice data or to the 0009 financial
EXECUTE grants. Isolation probes for APP self-approval, going live without
approval, and evidence isolation are conditional on the staged schema
existing; they expect **42501** and roll back all probes.

## Work still needed before 0010 rollout

The Worker has a tested provider adapter but **no live verification route or
automated provider call**. A browser cannot yet confirm an address, store
the raw response, run 30-day rechecks, or display all provider outcomes.
The current script will therefore require a documented manual review for
stores without evidence. Do not apply this staged 0010 foundation as the
finished feature: existing live stores would remain public, but its new
invoice gate would block new invoices until live evidence is stored.
Complete the original verification prompt, including UI, retries, rate
limits, cache, signed-in ownership and financial gate, then review/test
the complete migration and deploy in the requested order.
