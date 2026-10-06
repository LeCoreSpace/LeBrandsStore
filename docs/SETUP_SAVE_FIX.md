# Wizard setup save failure

## Cause and fix

The Worker deliberately uses `postgres({ fetch_types: false })`. In the installed
driver, this disables discovery of PostgreSQL array types, including `integer[]`
and `text[]`. Without a registered parser, `store_setup.completed` arrives as a
string such as `"{}"`. `loadDraft()` called `.filter()` on that value through
`completion()`, raising a JavaScript TypeError before any setup save could finish.
Logo uploads insert media directly and do not call `loadDraft()`, so they could
still succeed. This failure is reproduced offline against the installed driver's
actual parser configuration; it has not been checked against the live Worker.

Setup progress and product tags now cross the SQL/JavaScript boundary as JSON.
JSON types have built-in parsers even with type discovery disabled. Writes use
JSON parameters converted to native arrays inside SQL, avoiding the missing
array serializers as well. The stored column types and RLS remain unchanged.

## Validation and diagnostics

- Empty and partial text drafts remain allowed. Multiline addresses are preserved.
  Completeness checks still apply when continuing/publishing.
- Non-empty invalid GSTIN, email, phone and category inputs return HTTP 400 with
  field-specific `errors`. The existing wizard renders these beside the inputs;
  editing a field removes its stale error without clearing its draft.
- GSTIN is normalized to uppercase and its format checked before setup writes.
- Failure logs contain SQLSTATE, constraint/table/column/function/routine names,
  method and allowlisted request field names. Unknown field names are replaced
  with markers so arbitrary keys cannot inject personal information into logs.
- Error messages are SQLSTATE-normalized and value-free. Raw Postgres messages,
  detail, SQL, parameters, context and stacks are deliberately not logged because
  they can contain email, phone, GSTIN, addresses or tokens.
- Input-related SQLSTATEs return a safe HTTP 400 instead of a service error.
  Missing schema or permissions still return a safe service error with diagnostics.

Migration 0005 stores these draft contact/text fields in JSONB; it does not impose
individual NOT NULL or format constraints on them. Membership authorization,
transaction-local tenant context, function grants and the composite logo foreign
key remain in place. **No schema change or new migration is needed for this fix.**
The live database's installed migration state and grants have not been inspected.

## Changed files

- `src/store/repository.js`
- `src/store/input.js`
- `src/store/routes.js`
- `src/store/diagnostics.js`
- `src/public/wizard.js`
- `tests/setup-save.test.js`
- `tests/wizard.test.js`
- `docs/SETUP_SAVE_FIX.md`

No new secrets. No migrations, deployment or remote configuration were executed.

Verification: all 75 offline tests passed, syntax and whitespace checks passed,
and the root production config's dry-run bundle succeeded. The local workflow
started cleanly and the mobile read-only wizard screenshot rendered correctly.
These checks do not establish signed-in persistence on the live database.

## Commands

Run from the project root:

```sh
pnpm run test:offline
pnpm exec wrangler deploy --config ./wrangler.jsonc --dry-run --outdir /tmp/lebrands-setup-save-check
```

The second command bundles locally only; it does not deploy. No database command
is required. Production deployment, when separately authorized, must use only the
root `wrangler.jsonc`. `wrangler.preview.jsonc` is strictly for local preview.
The running preview cannot verify signed-in persistence because it has no database
binding; the live Worker will not receive the fix until separately deployed.
