# Invoice prefix write-path audit after 0009

## Exact checkout isolation failures

Both `checkout.order.own-transaction` and `checkout.order.cross-product`
called the same `prepare(tx, a)` helper in `db/checkout-isolation.js`.
Its **second SQL statement** was:

```sql
UPDATE public.store_publications SET snapshot = $1 WHERE store_id = $2;
```

The replacement snapshot contained `settings: {gstin: "27ABCDE1234F1Z5"}`
but no `invoice_prefix`. Setup had already created a current-FY invoice and
the publication's explicit `RLS` prefix. The guard rejected **key removal**
(`old prefix IS NOT NULL AND new prefix IS NULL`) with **42501**. This was
not a publication re-insert or a different explicit prefix. Even when the
implicit default is also `RLS`, removing the pinned key must remain denied.
Failure occurred before checkout pricing or tenant-product lookup.

The shared preparation helper now reads the existing publication and merges
its settings, store metadata and top-level snapshot fields while replacing
only the fixture's products and its intended GSTIN field. It retains the
explicit prefix, policies and fixture marker.

## Every production writer

| Path | Before this fix | Current behavior |
| --- | --- | --- |
| `ensureSetup()` in `src/store/repository.js` | Safe | INSERT with `ON CONFLICT DO NOTHING`; never replaces an existing settings row. |
| Wizard autosave, Continue, logo upload and other PATCH `/api/stores/:id/setup` calls | Safe | `settingsPatch()` allows provided fields only; `saveSetup()` uses `settings = settings || patch`. An omitted prefix remains stored. Null/empty/invalid explicit prefixes are rejected by input validation. |
| Settings business/GST form in `src/public/dashboard.js` | Safe | Uses the same PATCH endpoint and `saveSetup()` merge. The prefix input is initialized from the saved value and is readonly when locked, not disabled, so FormData submits the unchanged prefix. Any explicit changed prefix still reaches the DB guard. |
| Settings signature changes | Safe | Use the same `saveSetup()` patch; changing `signature_media_id` does not remove the prefix. |
| Wizard publish/republish in `src/store/repository.js` | Safe for normal complete drafts; whole-snapshot construction depended on the draft retaining all settings | Hardened: merges the existing published settings with full server-loaded draft settings **before** INSERT/ON CONFLICT. Published keys omitted by a legacy/incomplete draft survive. Explicit draft values win, so a changed or null prefix is not hidden from the strict guard. Other snapshot sections intentionally publish their reviewed draft content. |
| Product edits/archive/stock-related publication synchronization via `syncPublishedProducts()` | Safe | Updates only `snapshot.products` with `jsonb_set`; published settings are untouched. |
| Staged platform approval script `db/admin-approve-store.js` | Safe; not an active Worker endpoint | Updates only `snapshot.store.status` with `jsonb_set`; prefix unchanged. Revocation does not rewrite the publication. |
| `issue_invoice()` / `cancel_invoice()` in applied 0009 | Safe | Read and lock draft/publication rows but do not write their settings. Numbering reads the published prefix. |
| 0009 default backfills | Safe initialization, already applied | Populate missing draft and published prefixes before creating prefix guards. No changes were made to applied migration SQL. |

Other `store_setup` updates change `step`, `completed` or `logo_media_id`
only, not `settings`. There are no other production settings/publication
writers in the Worker source or administrative JavaScript scripts.

## Strictness and regression verification

No SQL function, guard, GRANT, policy or schema was changed. No new migration
is needed, and the applied 0009 is unchanged.

The real administrative/APP isolation runner reports **91 PASS, 0 FAIL**.
All writes were limited to marked `rls-test-*` fixtures; APP probes rolled
back and cleanup passed. Regressions exercise the real `saveSetup()` and
`publish()` repositories after a current-FY invoice, with complete/reviewed
publication data:

- Non-prefix Settings changes, including a brand rename, retain `RLS` and
  successfully republish.
- Changing either draft or published prefix still raises **42501**.
- An earlier different draft candidate is denied on upsert/republish.
- Removing the key from either settings document still raises **42501**.
- Unchanged-prefix upsert/republish succeeds.
- Both original checkout checks now reach their intended checkout paths.

Offline regressions also cover the real wizard PATCH route, JSONB settings
merge, fixture preservation, and publication merge behavior, including
intentional changed-prefix rejection. No migration or deployment was run.
