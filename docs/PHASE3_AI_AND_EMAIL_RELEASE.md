# AI builder and transactional email release

No migrations or deployment were run by the implementation agent.

## Operator setup

Run staged migrations yourself, in order:

```sh
node db/migrate.js --staged-ai
node db/migrate.js --staged-email
```

These require the already-applied Aura migration 0012. They do not apply GSTIN migration 0011.
Existing published layouts are not changed by the AI migration or draft builder.

Before deployment, create the shared queue if it does not already exist:

```sh
pnpm exec wrangler queues create lebrands-ai-build
```

Configure `OPENAI_API_KEY` and `RESEND_WEBHOOK_SECRET` through the secrets flow.
The user has uploaded `RESEND_API_KEY` to the production Worker already.
For example, the operator can enter each value directly in Wrangler's interactive
prompt; do not paste values into code, command arguments or a chat:

```sh
pnpm exec wrangler secret put OPENAI_API_KEY
pnpm exec wrangler secret put RESEND_WEBHOOK_SECRET
```
The production Worker also needs its existing Hyperdrive database, R2 `MEDIA`,
Cloudflare `IMAGES`, `PASSWORD_PEPPER` and `SESSION_SECRET` bindings.
The AI builder cannot generate or upload without its storage and image bindings.

Verify `notify.lebrands.store` in Resend. Configure delivered, bounced and complained
webhooks at `https://app.lebrands.store/webhooks/resend`. Copy the signing secret
into `RESEND_WEBHOOK_SECRET`; never place it in source or browser code.

## Behaviour and safety

- Email verification precedes generation.
- One completed draft build consumes a store allowance. Failed/cancelled jobs do not.
- Each page and section is generated and approved sequentially.
- Product image regeneration is restricted to approval, at most twice per image.
- Six extra section images maximum, four generated product images per product.
- Layouts and products are saved transactionally as a draft; no automatic publication.
- Legal/registration information is not invented. Missing legal details remain
  a publication prerequisite, and existing registered addresses are preserved.
- Historical GST rates remain unchanged for selected existing products.
- The $20 monthly AI cap uses reservations and recorded estimated provider costs,
  not a live provider invoice. Set an OpenAI project budget as an additional safeguard.
- Support may grant an extra build using `db/admin/grant-ai-build.js`.
- Order events enqueue a tenant outbox in the order transaction. Provider sends
  happen afterward, never inside checkout/status transactions.
- Emails use stable idempotency keys and persist the exact rendered payload before
  retrying. Ambiguous sends older than 23 hours stop instead of risking a duplicate
  after the provider's idempotency window.
- The five-minute scheduler recovers pending store and private platform jobs.
  Platform delivery capabilities are derived with a server-only signing key.
- Reset requests have identical public responses, account cooldown and per-IP limits.
  Reset links expire after 30 minutes, are single-use, and revoke prior sessions.
- Staff invitations expire after seven days, are single-use and require the
  matching signed-in email address. Owner/admin permission is required to invite.
- Customer bounce/complaint flags suppress further customer sends.
- Refund emails do not claim that money was refunded unless an actual refund
  amount is provided. A GST credit note is not represented as a cash refund.

## Preview and checks

Read-only fictional previews, with no live data writes:

- `/__ai-builder-preview`
- `/__ai-builder-preview?mode=review`
- `/__email-preview?type=confirmed` (also shipped, delivered, cancelled, refunded,
  new_order, reset, invite, verification)

After migrations and resource configuration, the operator can run:

```sh
pnpm run test:offline
```

Live provider delivery and production AI generation still require an operator
smoke test after deployment; offline tests do not prove DNS, queue provisioning,
API credentials or production storage readiness.
The read-only fixture previews work without those credentials. The development
Worker currently uses a local R2 bucket while its database connection can reach
live Supabase; never use the fixture or a browser test to write live merchant data.
