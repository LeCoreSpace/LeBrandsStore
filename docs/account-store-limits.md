# Account store limits and legacy Free transition

## Rules

- An account may own two stores. Staff memberships in someone else's store do
  not consume an ownership slot.
- At most one owned store may be live at a time.
- With no owned stores, show **Create a store**. With one owned store, show
  **Create a draft store**. With two or more owned stores, hide creation and
  reject direct creation attempts at the database boundary.
- Existing accounts with multiple live stores choose which currently live store
  to retain on the account page. Confirmation moves their other live stores to
  draft; it does not delete orders, products, publications or billing history.
- Publishing a replacement requires moving the current live store to draft
  first. No automatic cross-store publication or suspension override is added.

## Operator commands

Run from the workspace root, using the existing administrative Supabase Secret:

```sh
pnpm run db:migrate -- --staged-account-store-limits
node db/transition-account-stores.js
```

The second command is a read-only assessment by default. `--apply` enables the
explicit, transactional data transition. An approved selection can be supplied as
`--draft=<subdomain> --keep-live=<subdomain>`; both stores must share an owner,
and the retained store must already be live. All account-owned stores are
assessed for Free assignment; the named selection only controls store status.
Stores without any account owner are not enrolled.

An absent original publication record is reported, not replaced with today or
the latest snapshot's publication date. After obtaining an authoritative date,
supply `--first-publication=<subdomain>:<ISO-timestamp>`. Publication audit
evidence takes precedence over an operator date.

Existing Free subscriptions and their started clocks are never reset. Live paid
subscriptions in active/grace/paused state are preserved. Conflicting non-Free
records require review rather than a silent downgrade.

New platform assignments copy the approved Free catalogue entitlements,
including 100 published products and 1,000 published SKUs. They are marked as
legacy concessions and recorded as `free.platform_assigned` events, not forged
merchant acceptance. The required existing acceptance timestamp records the
assignment transaction; the event explicitly states merchant acceptance was not
collected. No charge or recurring mandate is created.

The historical Free period remains 720 hours from first publication, including
time after an already-published store returns to draft. A never-published store
stays in building state until successful publication. This change does not add
scheduled expiry or catalogue-limit enforcement; those require separate work.

## Release

The database guard and approved transition were applied on 19 October 2026.
The remaining legacy store was enrolled after the user confirmed its recorded
6 October publication timestamp; its Free period ends on 5 November 2026.
The account UI and publication error messages still require manual Worker
publication with `pnpm run deploy`. Deployment is not a migration.
