# Restricted business document review

This phase adds the platform-only document review workspace at
`/admin/business-reviews` on the account host. `/admin` redirects there.
It is not the brand's team administration screen.

## Operator rollout

The agent does not run these against the live database or publish the Worker.

1. Deploy the prepared Worker/assets using the existing deployment process
   **before applying the review migration**. Until the migration is installed,
   the new review screen explicitly reports unavailable; existing publishing
   rules remain in effect.
2. Ensure private R2, Cloudmersive screening and prior staged migrations are
   configured. The review migration requires both editor-access migration 0032
   and scanning migration 0034, including its retention prerequisite.
3. Apply the staged migration yourself:

   ```sh
   pnpm run db:migrate -- --staged-business-document-review
   ```

   **This immediately gates new live-status transitions and every publication
   snapshot write on business approval, including legacy Worker writes.**
   Existing live stores are not taken offline, relabelled or auto-approved.
   They need business approval before their next publication update.
4. Enroll a designated existing account as a platform reviewer using the
   administrative connection, not the Worker application connection:

   ```sh
   node db/admin-business-reviewer.js grant <existing-account-uuid>
   ```

   No account is chosen automatically. Do not enroll arbitrary brand admins.
   A reviewer cannot review a store where they hold any brand membership.
   Give reviewers the account-host review path directly. There is no merchant
   role-management or self-enrollment endpoint.
5. Sign in as that reviewer. Examine the current registration and supporting
   files, choose Approve or Request changes, and enter a 10–1000 character note.
   The note is visible to the brand. Confirm that the review was performed.
6. To remove reviewer access:

   ```sh
   node db/admin-business-reviewer.js revoke <existing-account-uuid>
   ```

   The live-session/database check applies to every queue, detail, decision and
   download request; revocation does not wait for login cookies to expire.

## Boundaries

- Private files remain in `BUSINESS_DOCUMENTS`, never the public media bucket.
  Downloads use authenticated attachments with no-store, nosniff and sandbox
  headers. Authorized reviewers can inspect earlier submission files.
- Review and merchant replacement use the same store lock and revision counter.
  Stale decisions fail with 409, preserve the note and require examining the
  latest submission. Status, reviewer, timestamp, revision and append-only event
  are committed atomically. Replacements clear current-review attribution,
  preserve prior events/files and return to pending review.
- Approved submissions are read only in this phase. Approval never publishes a
  store, resumes a paused/revoked store, changes GST provider state, grants tax
  invoice permissions, connects payments or enables subscriptions.
- New document approval replaces the obsolete separate first-go-live approval
  flag after migration. The old trigger function identity, approval metadata
  protections and independent revocation guard remain intact.
- Pending merchants can build drafts. Ann/editor/wizard publish checklists show
  the business approval requirement; server checks and database triggers remain
  authoritative even if a client bypasses those controls.
- Queue pages contain 30 submissions. Detail shows the most recent 100 files
  and 100 events; all earlier evidence/events remain retained in private storage
  and the database. No automatic deletion is introduced.
- Rejection-triggered store suspension, notification delivery and controlled
  reinstatement remain the following phase, not implied by Request changes.

## Verification without live data

`tests/business-review.test.js` applies real foundational and staged DDL in an
isolated PGlite database and exercises role/session checks, self-review denial,
revision conflicts, protected downloads, retained replacements, review history,
publishing denials and legacy revocation.

The development-only `/__business-review-preview` route uses a separate
in-memory database, synthetic evidence and mock screening. It never connects to
the real database, R2 or Cloudmersive. This route is not part of the production
Worker.
