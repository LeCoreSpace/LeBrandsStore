# Checkout contact and email verification

## Shopper flow

1. Enter first name, optional last name, Indian mobile number and email.
2. Complete the security check and request an email code.
3. Enter the six-digit code. A verified checkout session lasts 30 minutes for
   that email and store, including a reload in the same browser tab.
4. Enter the six-digit Indian PIN code. City/town and state are filled from
   public postal-office data. Review them and correct the locality if needed.
5. Complete the delivery address, review payment and resolve any rejected
   discount code. Complete the refreshed security check before placing an order.

This is shopper email authentication for checkout, not a merchant account,
Clerk migration or marketing subscription. Changing the email removes the
browser's verification. The backend verifies the signed email/store/expiry
binding before creating a new order. A retry of an already-created order can
still recover that original order.

Email is now mandatory at the public order input boundary. Existing order and
customer records are not rewritten. Names are combined into the existing full
name field. Existing order-confirmation email queueing uses the captured
customer email; delivery itself remains dependent on the email provider.

## Security and delivery

- Uses the existing Resend provider and LeBrands.Store utility email template.
  The verification message includes the email-preferences link and explains
  that essential security messages cannot be disabled.
- CAPTCHA and the existing per-IP checkout attempt limit protect code requests.
  Verification is limited to five guesses per challenge. Wrong guesses commit
  their attempt count, including unsuccessful responses.
- Codes expire after ten minutes and are consumed once. Resend has a 60-second
  cooldown, three requests per email per 15 minutes and 200 per store per hour.
- The database stores a keyed code hash and email hash, not raw codes/emails.
  Failed delivery does not create a usable challenge. Synchronous delivery
  failures are explicit so the shopper can retry, not mistaken for success.
- Challenge rows older than a day are removed opportunistically on new
  requests for that store. This is not the business-document retention policy.
- The short-lived verification capability is signed with the existing session
  secret, scoped to one store/email, and kept in tab session storage. No code
  or verification capability is copied into orders, URLs or logs.

## Postal assistance

The server calls `api.postalpincode.in` with only the PIN, never the buyer's
name, email, phone or full address. A matching head post office is preferred
for the town name and its state is mapped to the existing state code.
Postal areas can include several localities; this is address assistance,
not proof of delivery availability. Failures explicitly allow manual entry.

## Release steps

Apply the new **manual** migration before publishing the Worker:

```bash
pnpm run db:migrate -- --staged-checkout-email-auth
pnpm run deploy
```

It depends on the existing commerce migration. The new verification path fails
closed until the table is installed. No historic orders change.

The configured Worker secret names were inspected with
`pnpm exec wrangler secret list`: `RESEND_API_KEY`, `SESSION_SECRET` and
`TURNSTILE_SECRET_KEY` are present. No values were read or printed.

## Development verification

```bash
node --experimental-test-module-mocks --test --test-concurrency=1 \
  tests/checkout-email-auth.test.js tests/checkout.test.js tests/sku-checkout.test.js
```

The Node-only `/__sku-checkout-preview/` fixture captures email into a synthetic
`/email-inbox` endpoint and supplies deterministic postal results. Neither is
imported into the production Worker. Production has no OTP bypass or test inbox.
