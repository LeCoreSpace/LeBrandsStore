# GSTIN public-search response mapping

Implemented in `src/gstin/provider.js`. The supplied real fixture remains
unchanged. Tests use fictional fixtures for active, cancelled, Composition,
not-found, malformed and mixed valid/invalid additional-address responses;
they never print the real taxpayer details.

## Contract

Only HTTP **200** and top-level boolean `flag: true` can produce a normalized
result. `flag: false` fails verification. HTTP 404 is not-found, 429 is
rate-limited, and all other non-200 responses are provider errors.
Invalid JSON, incorrect types, invalid GSTIN/checksum, mismatched requested
GSTIN, impossible dates, invalid principal-address PIN or mismatched registered
state fail closed. Malformed additional addresses are skipped with warnings.
Provider error text and raw responses are not included in exceptions.

| Normalized field | Observed provider field |
| --- | --- |
| `gstin` | `data.gstin` |
| `legal_name` | `data.lgnm` |
| `trade_name` | `data.tradeNam` |
| `status` | `data.sts` |
| `taxpayer_type` | `data.dty` |
| `constitution` | `data.ctb` |
| `registration_date` | `data.rgdt` |
| `cancellation_date` | `data.cxdt` |
| `nature_of_business` | `data.nba` |
| `principal_address.line1` | Nonempty `data.pradr.addr.bno`, `bnm`, `flno`, joined with commas |
| `principal_address.line2` | Nonempty `data.pradr.addr.st` (street/local address component) and `loc`, joined with commas |
| `principal_address.city` | First nonempty field: `data.pradr.addr.city`, then `loc`, then `dst` |
| `principal_address.district` | `data.pradr.addr.dst` |
| `principal_address.state` | `data.pradr.addr.stcd` (state name, not a numeric code) |
| `principal_address.state_code` | Resolve the supplied state name through the existing Indian state list, then match it against the GSTIN prefix |
| `principal_address.pin` | `data.pradr.addr.pncd` |
| `additional_addresses` | Parse each `data.adadr` entry with the same `addr` parser as `pradr`; skip invalid entries and record warnings |
| `warnings` | Safe messages and original array indices for skipped additional entries; no raw provider values |

Dates retain their provider `DD/MM/YYYY` format. The empty cancellation date
stays empty. City/town fallback is explicit selection from provider fields,
not invention. `stcd` is a state name, not a two-digit GST code.
Raw provider JSON is returned separately for server-side persistence, with
all original fields unchanged, including the original blank city.

The user confirmed that additional entries have the same `addr` shape as
`pradr`, with `ntr` business activity. `ntr` stays in the raw response.
Invalid entries, or an invalid additional-address list, never invalidate
an otherwise valid principal registration. They produce warnings.

Cancelled and Composition responses are mapped faithfully, not rewritten to
Active or Regular. A normalized response is **not** an authorization to publish
or issue invoices.

## Live transport contract

`lookupGSTIN(env, gstin)` uses HTTP GET to the provider's confirmed endpoint,
`https://sheet.gstincheck.co.in/check/{KEY}/{GSTIN}`. The key is exclusively
`env.GSTIN_KEY`. There are no headers or body. The credential-bearing URL is
constructed only inside `src/gstin/provider.js`. Redirects are not followed.

An eight-second deadline covers the request, response body reading and mapping;
the request is aborted when time runs out. Before fetching, the adapter checks
GSTIN format/checksum and secret availability. Caller-facing errors use new,
fixed messages and stacks without the original exception or cause. No request
URL, key, raw response or transport exception is logged.

The return shape is `{ registration, raw_response }`. The raw response must
remain server-side; future store-scoped persistence must use forced RLS.
Offline tests inject fictional credentials and mocked fetch implementations.
No paid/live provider calls were made.

## Still pending for 0010

Wizard/Settings integration, verification persistence, quotas, cache, retries,
30-day rechecks, admin approval and invoice verification gates are not yet
implemented. Admin approval needs an explicit authorization and override
policy; it was not in the originally attached verification prompt.
Existing schema, grants, policies, Wrangler configs and migrations are unchanged.
0009 must be separately reviewed, migrated and deployed before applying 0010.
The current migration runner applies every pending migration in one transaction;
do not put 0010 in the active migrations folder before the 0009 rollout.
Do not run migrations or deploy automatically.
