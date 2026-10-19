# LeBrands.Store platform administration

## Entry point

`https://app.lebrands.store/admin/login` is a separate username/password entry
point. `/admin` lists stores; `/admin/stores/<uuid>` shows a store's health.
It is not a merchant role or a public registration option.

The console uses live, narrowly scoped PostgreSQL functions. No Worker admin
database connection or hard-coded password is introduced. Existing merchant
accounts cannot grant themselves platform access.

## Operator setup

1. Apply and review the existing business-document review and platform billing
   migrations first.
2. Apply the additive migration:

   ```sh
   pnpm run db:migrate -- --staged-platform-admin
   ```

   This does not enrol an administrator, suspend a store or enable charges.
3. Add `PLATFORM_ADMIN_USERNAME` and `PLATFORM_ADMIN_PASSWORD` through Replit
   Secrets. Choose your own username and a strong, unique password. Do not put
   credentials in chat, SQL, commands, documentation or source control.
4. Provision the dedicated account from the operator shell:

   ```sh
   node db/admin-platform-access.js create
   ```

   The script uses the existing administrative database Secret and password
   pepper, stores only the established peppered password hash, and prints no
   password. No merchant membership is created. The same dedicated staff
   account receives access to the existing private business-document review.
5. Publish the Worker through the established manual release process:

   ```sh
   pnpm run deploy
   ```

The dedicated credential Secrets are provisioning inputs, not Worker runtime
passwords. The Worker continues using its existing application database role
and password/session configuration. Cloudflare does not need a second plaintext
admin password binding.

## Included controls

- Store list, search, status filters, pagination, order and product counts.
- Registration review, GST verification and confirmed invoice-identity flags.
- Custom domains and payment/delivery integration states.
- Subscription, Free expiry, billing interval and latest payment evidence.
- Explicit test/live financial modes. A captured test payment never creates a
  live paid subscription or tax invoice.
- Store suspension, restoration and immutable application-visible audit history.

Summaries are platform-wide; filters apply to the store list. Integration status
reflects the stored connection state, not a real-time probe or payment guarantee.
No provider credentials, private document contents or customer order/address
data are returned in the overview.

## Suspension safeguards

An administrator must type the exact store subdomain, enter a 10-1000 character
reason and explicitly confirm the in-app dialog. The database validates the
live administrator session, locks the store and checks the controls revision.
Suspension pauses the store and blocks re-publication at the database boundary.
Restoration clears the suspension and returns the store to **draft**, never
automatically live. It does not override business approval, GST, billing or
publication checks. Products, orders, customers and billing history are retained.

Administrators cannot suspend or restore stores they belong to as merchants.
No refunds, charges, subscription activation, deletion or impersonation control
is included.

## Rotation and revocation

Update the chosen credential Secrets, then run:

```sh
node db/admin-platform-access.js reset-password
```

To remove platform access:

```sh
node db/admin-platform-access.js revoke
```

Both operations end existing sessions. Revocation removes the dedicated staff
account's business-review access as well. A revoked platform administrator does
not retain access through a stale browser tab.
